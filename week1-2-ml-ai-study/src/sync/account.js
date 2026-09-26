import React from 'react';

// Sign-in state for the whole app. Firebase is only loaded (from cloud.js) when the site was built
// with a Firebase config; without one the site keeps progress in this browser only, as before.
const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const cloudConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId);

//   auth  'off' (not configured) | 'loading' | 'signed-out' | 'signed-in'
//   sync  'idle' | 'syncing' | 'saved' | 'error'
let account = { auth: cloudConfigured ? 'loading' : 'off', user: null, sync: 'idle', message: '' };
const listeners = new Set();

export function setAccount(change) {
  account = { ...account, ...change };
  listeners.forEach((listener) => listener());
}

let cloud = null;
function loadCloud() {
  cloud ??= import('./cloud.js').then((module) => {
    module.start();
    return module;
  });
  return cloud;
}

if (cloudConfigured && typeof window !== 'undefined') {
  loadCloud().catch(() => setAccount({ auth: 'signed-out', sync: 'error', message: 'Could not load sign-in. Progress is saved in this browser.' }));
}

export async function signIn() {
  const module = await loadCloud();
  return module.signIn();
}

export async function signOut() {
  const module = await loadCloud();
  return module.signOut();
}

export function useAccount() {
  const [, force] = React.useReducer((count) => count + 1, 0);
  React.useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return account;
}
