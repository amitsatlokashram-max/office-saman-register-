'use client';

import { useEffect, useState } from 'react';
import { rememberChoice } from '@/lib/session';
import { Icon } from './Icon';

export type GateKind = 'loading' | 'setup' | 'login' | 'denied';

export function Gate({
  kind,
  email,
  missingConfig = [],
  onSignIn,
  onSignOut,
}: {
  kind: GateKind;
  email?: string;
  missingConfig?: string[];
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
            <span style={{ fontSize: '12px', color: '#818cf8', fontWeight: '600', display: 'block', marginTop: '2px' }}>
              - Amit Das
            </span>
          </span>
        </div>
        {kind === 'loading' && (
          <p className="gate-wait">
            <span className="spin" />
            Khul raha hai…
          </p>
        )}
        {kind === 'setup' && (
          <>
            <h2>Setup Firebase</h2>
            <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#94a3b8' }}>
              Environment variables configure karne hain taaki app login aur data kaam kare.
            </p>
            {missingConfig.length > 0 && (
              <div style={{ width: '100%', textAlign: 'left', marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(15, 23, 42, 0.68)', border: '1px solid rgba(129, 140, 248, 0.35)' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '11px', color: '#c4b5fd', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Missing values
                </p>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#e2e8f0', fontSize: '12px', lineHeight: '1.6' }}>
                  {missingConfig.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
              </div>
            )}
            <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
              README me step-by-step setup follow karo, phir app ko redeploy kar do.
            </p>
          </>
        )}
        {kind === 'login' && (
          <>
            <h2>Welcome 🙏</h2>
            <p style={{ margin: '6px 0 18px 0', fontSize: '13px', color: '#94a3b8' }}>
              Access karne ke liye sign in karein.
            </p>
            <button type="button" className="btn primary gbtn" id="signinBtn" onClick={() => onSignIn(remember)}>
              Google se Sign In
            </button>
            <label className="check remember" htmlFor="g-remember" style={{ marginTop: '12px' }}>
              <input type="checkbox" id="g-remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Login yaad rakho
            </label>
            <p className="hint" style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
              Shared PC pe check na karein.
            </p>
          </>
        )}
        {kind === 'denied' && (
          <>
            <div className="art">
              <Icon name="lock" />
            </div>
            <h2>Access Not Allowed 🔒</h2>
            <p style={{ margin: '10px 0 18px 0', fontSize: '13px', color: '#94a3b8' }}>
              Yeh account authorized nahi hai.
            </p>
            <div className="inrow" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn primary" onClick={onSignOut}>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}