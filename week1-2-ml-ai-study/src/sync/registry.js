// The progress stores (concepts done, quiz scores, homework, code edits) each keep their state in this
// browser. They register here so the cloud sync can read and replace that state as a flat map of
// entries, key -> JSON value, and hear about local changes. This file loads no Firebase code.
//   read()        the store's entries as a plain object
//   write(map)    replace all entries (used when progress arrives from another device, or on sign-out)
//   merge(a, b)   combine two versions of one entry changed on both sides (optional; default keeps a)

const stores = new Map();
const changeListeners = new Set();

export function registerStore(name, adapter) {
  stores.set(name, adapter);
}

export function registeredStores() {
  return stores;
}

// Stores call this after every local save.
export function localChanged(name) {
  changeListeners.forEach((listener) => listener(name));
}

export function onLocalChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}
