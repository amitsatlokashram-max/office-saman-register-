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
            Office Register
            <br />
            <span style={{ fontSize: '13px', color: '#818cf8', fontWeight: '600', display: 'block', marginTop: '2px' }}>
              - Amit Das
            </span>
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
            <h2>Welcome 🙏</h2>
            <p>Register kholne aur access karne ke liye apne Google account se sign in karein.</p>
            <button type="button" className="btn primary gbtn" id="signinBtn" onClick={() => onSignIn(remember)}>
              Google se sign in karo
            </button>
            <label className="check remember" htmlFor="g-remember">
              <input type="checkbox" id="g-remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Is phone/computer pe login yaad rakho
            </label>
            <p className="hint">Office ke saajhe computer pe tick mat karna. Bina tick ke, browser band karte hi logout ho jayega.</p>
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