import React from 'react';
import { Cloud, CloudOff, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { signIn, signOut, useAccount } from '../sync/account.js';

const SYNC_LABEL = { syncing: 'Saving…', saved: 'Saved to your account', error: 'Not synced', idle: '' };

// Google sign-in in the top bar. Hidden when the site was built without a Firebase config.
export function AccountMenu() {
  const account = useAccount();
  const [busy, setBusy] = React.useState(false);
  if (account.auth === 'off') return null;

  async function run(action) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  if (account.auth !== 'signed-in') {
    return (
      <div className="account">
        <button className="account-signin" onClick={() => run(signIn)} disabled={busy || account.auth === 'loading'} title="Sign in to keep your progress across devices">
          <LogIn size={16} />
          <span>{account.auth === 'loading' ? 'Loading…' : 'Sign in with Google'}</span>
        </button>
        {account.message && <p className="account-message" role="alert">{account.message}</p>}
      </div>
    );
  }

  const { user } = account;
  const SyncIcon = account.sync === 'error' ? CloudOff : account.sync === 'syncing' ? RefreshCw : Cloud;
  return (
    <details className="account">
      <summary aria-label={`Account: ${user.name}. ${SYNC_LABEL[account.sync]}`}>
        {user.photo ? <img src={user.photo} alt="" referrerPolicy="no-referrer" /> : <span className="account-initial" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>}
        <span className="account-name">{user.name.split(' ')[0]}</span>
        <SyncIcon size={15} className={`account-sync ${account.sync}`} aria-hidden="true" />
      </summary>
      <div className="account-panel">
        <strong>{user.name}</strong>
        {user.email && <span className="account-email">{user.email}</span>}
        <p className={`account-status ${account.sync}`} role="status">{SYNC_LABEL[account.sync]}</p>
        <p className="account-note">{account.message || 'Concepts done, quiz scores, homework and your code edits are saved to your account and follow you to any device you sign in on.'}</p>
        <button onClick={() => run(signOut)} disabled={busy}>
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
        <p className="account-note">Signing out removes your progress from this browser; it stays in your account.</p>
      </div>
    </details>
  );
}
