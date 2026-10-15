'use client';

import { useEffect, useState } from 'react';
import { rememberChoice } from '@/lib/session';
import { Icon } from './Icon';

export type GateKind = 'loading' | 'setup' | 'login' | 'denied';

export function Gate({
  kind,
  email,
  onSignIn,
  onSignOut,
}: {
  kind: GateKind;
  email?: string;
  onSignIn: (remember: boolean) => void;
  onSignOut: () => void;
}) {
  const [remember, setRemember] = useState(false);
  useEffect(() => setRemember(rememberChoice()), []);
  return (
    <div className={'gate g-' + kind}>
      <div className="gate-card" id="gateCard">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <Icon name="boxFull" />
          </span>
          <span className="brand-t">
            Office Saman
            <br />
            Register
          </span>
        </div>
        {kind === 'loading' && (
          <p className="gate-wait">
            <span className="spin" />
            Register khul raha hai…
          </p>
        )}
        {kind === 'setup' && (
          <>
            <h2>Pehle Firebase jodo</h2>
            <p>
              Is app ko chalane ke liye Vercel me (ya <code>.env.local</code> file me) apne Firebase project ki details daalni hai. Poora tareeka{' '}
              <code>README.md</code> me step by step likha hai.
            </p>
          </>
        )}
        {kind === 'login' && (
          <>
            <h2>Sign in karke register kholo</h2>
            <p>Sirf owner aur Team me jode gaye Gmail wale log andar aa sakte hai.</p>
            <ul className="gate-points" aria-label="Register me kya hai">
              <li>
                <Icon name="list" />
                Kya mangaya, kab aaya, kisne laya, kitne ka
              </li>
              <li>
                <Icon name="users" />
                Kisko diya, stock me kitna bacha
              </li>
              <li>
                <Icon name="wallet" />
                Mere paise, bill aur warranty
              </li>
            </ul>
            <button type="button" className="btn primary gbtn" id="signinBtn" onClick={() => onSignIn(remember)}>
              Google se sign in karo
            </button>
            <label className="check remember" htmlFor="g-remember">
              <input type="checkbox" id="g-remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Is phone/computer pe login yaad rakho
            </label>
            <p className="hint">Office ke saajhe computer pe tick mat karna. Bina tick ke, browser band karte hi logout ho jayega aur agli baar dobara login maangega.</p>
          </>
        )}
        {kind === 'denied' && (
          <>
            <div className="art">
              <Icon name="lock" />
            </div>
            <h2>Abhi access nahi hai</h2>
            <p>
              Aap <code>{email}</code> se sign in ho. Register ke owner se kaho ki Settings → Team me ye email jod de, phir &quot;Dobara try karo&quot; dabao.
            </p>
            <div className="inrow" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={() => window.location.reload()}>
                Dobara try karo
              </button>
              <button type="button" className="btn" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
