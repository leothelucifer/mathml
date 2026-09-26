import React from 'react';
import { localChanged, registerStore } from './sync/registry.js';

// Homework progress, kept in this browser (and in the student's account when signed in, see sync/). For each part: the distinct answers checked, whether it
// is solved and how (tier), and how many clues were shown. For each problem: whether the full solution
// has been opened, and the student's note on where they were stuck.
//   tier 'own'      right on the first try, with no clue and before the solution
//   tier 'help'     solved after clues or after a wrong try (the feedback helped)
//   tier 'solution' solved after opening the full solution
const KEY = 'mathml-study:homework:v2';
const listeners = new Set();

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let state = typeof window === 'undefined' ? {} : read();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) {
      state = read();
      listeners.forEach((listener) => listener());
    }
  });
}

function save(next, fromSync = false) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Progress still shows for this visit; it just will not survive a reload.
  }
  listeners.forEach((listener) => listener());
  if (!fromSync) localChanged('homework');
}

// How far a problem has got, to pick between two versions changed on different devices.
function effort(entry) {
  return Object.values(entry?.parts ?? {}).reduce((sum, part) => sum + (part.solved ? 1000 : 0) + (part.tries ?? 0) + (part.clues ?? 0), entry?.solution ? 1 : 0);
}

registerStore('homework', {
  read: () => state,
  write: (entries) => save(entries, true),
  merge: (mine, theirs) => (effort(theirs) > effort(mine) ? theirs : mine),
});

const problemKey = (setKey, problemId) => `${setKey}#${problemId}`;
const emptyPart = { tries: 0, answers: [], solved: false, tier: null, clues: 0 };

export function partState(setKey, problemId, index) {
  return { ...emptyPart, ...state[problemKey(setKey, problemId)]?.parts?.[index] };
}

export function stuckNote(setKey, problemId) {
  return state[problemKey(setKey, problemId)]?.stuck ?? '';
}

export function solutionOpened(setKey, problemId) {
  return Boolean(state[problemKey(setKey, problemId)]?.solution);
}

function updateProblem(setKey, problemId, change) {
  const key = problemKey(setKey, problemId);
  const current = state[key] ?? { parts: {}, solution: false };
  save({ ...state, [key]: change(current) });
}

// Records a checked answer. Returns false (and records nothing) when this exact answer was tried before,
// so repeating an answer never counts towards unlocking clues or the solution.
export function recordAttempt(setKey, problemId, index, correct, key) {
  const before = partState(setKey, problemId, index);
  if (!correct && before.answers.includes(key)) return false;
  updateProblem(setKey, problemId, (current) => {
    const part = { ...emptyPart, ...current.parts[index] };
    const tries = part.tries + 1;
    const tier = current.solution ? 'solution' : part.clues > 0 || tries > 1 ? 'help' : 'own';
    return { ...current, parts: { ...current.parts, [index]: { ...part, tries, answers: [...part.answers, key], solved: part.solved || correct, tier: part.solved ? part.tier : correct ? tier : null } } };
  });
  return true;
}

export function recordClue(setKey, problemId, index) {
  updateProblem(setKey, problemId, (current) => {
    const part = { ...emptyPart, ...current.parts[index] };
    return { ...current, parts: { ...current.parts, [index]: { ...part, clues: part.clues + 1 } } };
  });
}

export function recordSolutionOpened(setKey, problemId, stuck = '') {
  updateProblem(setKey, problemId, (current) => ({ ...current, solution: true, stuck }));
}

export function resetProblem(setKey, problemId) {
  const next = { ...state };
  delete next[problemKey(setKey, problemId)];
  save(next);
}

// Totals for a homework set: parts solved, split by how they were solved, and all parts.
export function setSummary(setKey, set) {
  const summary = { solved: 0, own: 0, help: 0, solution: 0, total: 0 };
  for (const problem of set.problems) {
    problem.parts.forEach((_, index) => {
      const part = partState(setKey, problem.id, index);
      summary.total += 1;
      if (part.solved) {
        summary.solved += 1;
        summary[part.tier ?? 'own'] += 1;
      }
    });
  }
  return summary;
}

export function useHomeworkProgress() {
  const [, force] = React.useReducer((count) => count + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
}
