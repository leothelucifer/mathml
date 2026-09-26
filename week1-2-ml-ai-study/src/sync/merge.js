// Three-way merge of one store's entries, used by the cloud sync. `base` holds a fingerprint of each
// entry as it was at the last sync, so we can tell which side changed an entry since then:
//   changed only here        keep this browser's version (it is uploaded)
//   changed only in the cloud take the cloud's version (another device changed or deleted it)
//   changed on both          combine them with the store's merge, or keep this browser's version
// Before the first sync the base is empty, so everything done while signed out is merged into the
// account rather than lost.

// JSON with sorted object keys, so the same value always gives the same text whatever the key order.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// A short fingerprint of an entry (FNV-1a over its canonical JSON), so the base stays small even for
// code edits.
export function fingerprint(value) {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}.${text.length.toString(36)}`;
}

// Returns { merged, upload, remove }: the entries this browser should now hold, and the cloud writes
// (keys to set, keys to delete) that bring the account to the same state.
export function threeWayMerge(local, remote, base, mergeEntry = (mine) => mine) {
  const merged = {};
  const keys = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)]);
  for (const key of keys) {
    const here = Object.hasOwn(local, key) ? local[key] : undefined;
    const there = Object.hasOwn(remote, key) ? remote[key] : undefined;
    const was = base[key];
    const changedHere = (here === undefined ? undefined : fingerprint(here)) !== was;
    const changedThere = (there === undefined ? undefined : fingerprint(there)) !== was;
    let value;
    if (changedHere && changedThere) value = here === undefined ? there : there === undefined ? here : mergeEntry(here, there);
    else if (changedHere) value = here;
    else value = there;
    if (value !== undefined) merged[key] = value;
  }
  const upload = Object.keys(merged).filter((key) => !Object.hasOwn(remote, key) || fingerprint(remote[key]) !== fingerprint(merged[key]));
  const remove = Object.keys(remote).filter((key) => !Object.hasOwn(merged, key));
  return { merged, upload, remove };
}

export function fingerprints(entries) {
  return Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, fingerprint(value)]));
}
