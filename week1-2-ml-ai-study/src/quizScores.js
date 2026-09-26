import React from 'react';
import { localChanged, registerStore } from './sync/registry.js';

// Best quiz score per concept or topic, kept in this browser (and in their account when signed in).
const KEY = 'mathml-study:quiz:v1';
const listeners = new Set();

function read() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let scores = read();

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) {
      scores = read();
      listeners.forEach((listener) => listener());
    }
  });
}

function save(next, fromSync = false) {
  scores = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(scores));
  } catch {
    // Scores still show for this visit; they just will not survive a reload.
  }
  listeners.forEach((listener) => listener());
  if (!fromSync) localChanged('quiz');
}

export function recordQuizScore(quizId, correct, total) {
  const previous = scores[quizId];
  const best = previous && previous.total === total ? Math.max(previous.best, correct) : correct;
  save({ ...scores, [quizId]: { best, total, last: correct } });
}

registerStore('quiz', {
  read: () => scores,
  write: (entries) => save(entries, true),
  // The same quiz taken on two devices: keep the better best score.
  merge: (mine, theirs) => (mine.total === theirs.total && theirs.best > mine.best ? { ...mine, best: theirs.best } : mine),
});

export function useQuizScores() {
  const [, force] = React.useReducer((count) => count + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return (quizId) => scores[quizId] ?? null;
}
