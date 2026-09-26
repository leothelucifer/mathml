// Google sign-in and cloud sync of progress, with Firebase Authentication and Cloud Firestore.
// Loaded on demand by account.js. Each progress entry is one document:
//   users/{uid}/{store}/{key}  { json, updatedAt }   store: done | quiz | homework | code
// The browser's own copy (localStorage) stays the working copy, so the site works offline and
// without an account; this module keeps it and the account in step with a three-way merge (merge.js).
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, connectFirestoreEmulator, doc, getFirestore, onSnapshot, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import '../progress.js';
import '../quizScores.js';
import '../homeworkProgress.js';
import '../python/codeStore.js';
import { firebaseConfig, setAccount } from './account.js';
import { canonical, fingerprints, threeWayMerge } from './merge.js';
import { onLocalChange, registeredStores } from './registry.js';

// Which account this browser's progress belongs to, and each entry's fingerprint at the last sync.
const META_KEY = 'mathml-study:sync:v1';
const PUSH_DELAY = 1200;
const BATCH_LIMIT = 400;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Checked through import.meta.env directly so normal builds drop this block entirely.
if (import.meta.env.VITE_FIREBASE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  // Emulator builds only: automated tests sign in as a made-up Google user without the popup.
  window.__mathmlTestSignIn = (sub, email, name) => signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, name, email_verified: true })));
}

function readMeta() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(META_KEY) ?? '{}');
    return { uid: parsed.uid ?? null, base: parsed.base ?? {} };
  } catch {
    return { uid: null, base: {} };
  }
}

function saveMeta() {
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Without storage the next visit simply merges again, which loses nothing.
  }
}

let meta = readMeta();
let session = null; // { uid, unsubscribes, remote: {store: entries}, queues, timers, pending, loaded }

const encodeKey = (key) => encodeURIComponent(key).replace(/\./g, '%2E');
const decodeKey = (id) => decodeURIComponent(id);

function report() {
  if (!session) return;
  const loading = session.loaded.size < registeredStores().size;
  if (session.failed) return;
  setAccount({ sync: loading || session.pending > 0 ? 'syncing' : 'saved', message: '' });
}

function fail(error) {
  if (session) session.failed = true;
  const offline = error?.code === 'unavailable';
  setAccount({ sync: 'error', message: offline ? 'Offline: progress is saved in this browser and will sync when you are back online.' : `Sync stopped (${error?.code ?? 'error'}). Progress is saved in this browser.` });
}

// Brings one store in step: this browser's entries, the account's entries and the last synced state.
async function reconcile(current, name) {
  if (session !== current || !current.remote[name]) return;
  const adapter = registeredStores().get(name);
  const local = adapter.read();
  const remote = current.remote[name];
  const { merged, upload, remove } = threeWayMerge(local, remote, meta.base[name] ?? {}, adapter.merge);
  if (canonical(merged) !== canonical(local)) adapter.write(merged);
  if (upload.length || remove.length) {
    current.pending += 1;
    report();
    try {
      const keys = [...upload.map((key) => ['set', key]), ...remove.map((key) => ['delete', key])];
      for (let start = 0; start < keys.length; start += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const [action, key] of keys.slice(start, start + BATCH_LIMIT)) {
          const ref = doc(db, 'users', current.uid, name, encodeKey(key));
          if (action === 'set') batch.set(ref, { json: JSON.stringify(merged[key]), updatedAt: serverTimestamp() });
          else batch.delete(ref);
        }
        await batch.commit();
      }
    } catch (error) {
      current.pending -= 1;
      fail(error);
      return;
    }
    current.pending -= 1;
    if (session !== current) return;
    current.remote[name] = { ...Object.fromEntries(Object.entries(remote).filter(([key]) => !remove.includes(key))), ...Object.fromEntries(upload.map((key) => [key, merged[key]])) };
  }
  // The base only moves once the account has the writes, so an edit made just before the tab
  // closed is uploaded on the next visit instead of being overwritten.
  meta.base[name] = fingerprints(merged);
  saveMeta();
  report();
}

// Reconciles of one store run one at a time.
function enqueue(current, name) {
  current.queues[name] = (current.queues[name] ?? Promise.resolve()).then(() => reconcile(current, name)).catch(fail);
  return current.queues[name];
}

function begin(user) {
  end();
  meta = readMeta(); // another tab may have signed out or in since this one loaded
  if (meta.uid !== user.uid) {
    // Progress left by a different account is not merged into this one.
    if (meta.uid) registeredStores().forEach((adapter) => adapter.write({}));
    meta = { uid: user.uid, base: {} };
    saveMeta();
  }
  const current = { uid: user.uid, remote: {}, queues: {}, timers: {}, pending: 0, loaded: new Set(), unsubscribes: [], failed: false };
  session = current;
  setAccount({ auth: 'signed-in', user: { name: user.displayName ?? user.email ?? 'Student', email: user.email ?? '', photo: user.photoURL ?? '' }, sync: 'syncing', message: '' });

  setDoc(doc(db, 'users', user.uid), { name: user.displayName ?? '', email: user.email ?? '', lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});

  for (const name of registeredStores().keys()) {
    current.unsubscribes.push(onSnapshot(collection(db, 'users', user.uid, name), (snapshot) => {
      // Our own writes come back first as pending; wait for the confirmed version.
      if (snapshot.metadata.hasPendingWrites || session !== current) return;
      const entries = {};
      snapshot.docs.forEach((item) => {
        try {
          entries[decodeKey(item.id)] = JSON.parse(item.data().json);
        } catch {
          // An unreadable entry is skipped rather than stopping the sync.
        }
      });
      current.remote[name] = entries;
      current.loaded.add(name);
      enqueue(current, name);
    }, fail));
  }
  current.unsubscribes.push(onLocalChange((name) => {
    if (session !== current) return;
    clearTimeout(current.timers[name]);
    setAccount({ sync: 'syncing' });
    current.timers[name] = setTimeout(() => enqueue(current, name), PUSH_DELAY);
  }));
}

function end() {
  if (!session) return;
  session.unsubscribes.forEach((unsubscribe) => unsubscribe());
  Object.values(session.timers).forEach(clearTimeout);
  session = null;
}

// Uploads changes still waiting for the push delay.
async function flush() {
  const current = session;
  if (!current) return;
  for (const [name, timer] of Object.entries(current.timers)) {
    clearTimeout(timer);
    enqueue(current, name);
  }
  await Promise.all(Object.values(current.queues));
}

export function start() {
  onAuthStateChanged(auth, (user) => {
    if (user) begin(user);
    else {
      end();
      setAccount({ auth: 'signed-out', user: null, sync: 'idle', message: '' });
    }
  });
  window.addEventListener('pagehide', () => { flush(); });
}

export async function signIn() {
  setAccount({ message: '' });
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') return;
    const message = error?.code === 'auth/popup-blocked'
      ? 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.'
      : error?.code === 'auth/unauthorized-domain'
        ? 'Sign-in is not enabled for this web address yet (add it to Firebase Authentication > Authorized domains).'
        : `Sign-in failed (${error?.code ?? 'error'}).`;
    setAccount({ message });
  }
}

// Signing out uploads anything unsaved, then removes this account's progress from the browser (it
// stays in the account), so the next person on a shared computer starts clean.
export async function signOut() {
  setAccount({ sync: 'syncing' });
  await flush();
  if (session?.failed && !window.confirm('Some progress has not reached your account yet (you may be offline). Sign out anyway and remove it from this browser?')) {
    setAccount({ sync: 'error' });
    return;
  }
  end();
  registeredStores().forEach((adapter) => adapter.write({}));
  meta = { uid: null, base: {} };
  saveMeta();
  await firebaseSignOut(auth);
}
