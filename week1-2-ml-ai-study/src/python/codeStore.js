// Per-concept code edits and saved versions, kept in this browser (and in the student's account when
// signed in, see sync/). Storage can be unavailable (private windows, blocked site data), so every
// access is guarded.
import { localChanged, registerStore } from '../sync/registry.js';

const PREFIX = 'mathml-study:code:v1:';
const MAX_VERSIONS = 10;

function read(conceptId) {
  try {
    const raw = window.localStorage.getItem(PREFIX + conceptId);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && (parsed.current === null || typeof parsed.current === 'string') && Array.isArray(parsed.versions)) return parsed;
  } catch {
    // Fall through to the empty state.
  }
  return null;
}

function write(conceptId, state) {
  try {
    window.localStorage.setItem(PREFIX + conceptId, JSON.stringify(state));
  } catch {
    // Edits still work for this visit; they just will not survive a reload.
  }
}

export function loadCode(conceptId, original) {
  const saved = read(conceptId);
  return { code: saved?.current ?? original, versions: saved?.versions ?? [] };
}

// `code` is null when the student has not edited the example.
function remove(conceptId) {
  try {
    window.localStorage.removeItem(PREFIX + conceptId);
  } catch {
    // Nothing stored or storage unavailable; either way there is nothing to clear.
  }
}

function storedIds() {
  try {
    return Object.keys(window.localStorage).filter((key) => key.startsWith(PREFIX)).map((key) => key.slice(PREFIX.length));
  } catch {
    return [];
  }
}

export function saveCurrent(conceptId, code, versions) {
  const before = JSON.stringify(read(conceptId));
  if (code === null && versions.length === 0) remove(conceptId);
  else write(conceptId, { current: code, versions });
  if (JSON.stringify(read(conceptId)) !== before) localChanged('code');
}

// Edits arriving from another device show the next time that page's editor opens.
registerStore('code', {
  read: () => Object.fromEntries(storedIds().map((id) => [id, read(id)]).filter(([, state]) => state)),
  write: (entries) => {
    storedIds().filter((id) => !Object.hasOwn(entries, id)).forEach(remove);
    Object.entries(entries).forEach(([id, state]) => write(id, state));
  },
  // Keep the newer current edit, and the saved versions from both devices.
  merge: (mine, theirs) => {
    const newest = (state) => state.versions[0]?.savedAt ?? 0;
    const current = newest(theirs) > newest(mine) ? theirs.current : mine.current;
    const seen = new Set();
    const versions = [...mine.versions, ...theirs.versions]
      .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
      .filter((version) => !seen.has(version.code) && seen.add(version.code))
      .slice(0, MAX_VERSIONS);
    return { current, versions };
  },
});

// Returns the new version list; identical consecutive snapshots are not duplicated.
export function addVersion(versions, code, label) {
  if (versions[0]?.code === code) return versions;
  return [{ code, label, savedAt: Date.now() }, ...versions].slice(0, MAX_VERSIONS);
}
