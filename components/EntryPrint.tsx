'use client';

import { MOVE, fdate, inr, issuedQty, moveSum, myPay, num, regNos, remaining, today, warrantyState } from '@/lib/calc';
import type { Item, Me } from '@/lib/types';

/** Ek entry ki parchi: kagaz pe print karke file me rakhne ya saman dete waqt sign karwane ke liye. */
export function EntryPrint({ it, items, me }: { it: Item; items: Item[]; me: Me | null }) {
  const no = String(regNos(items)[it.id] || 0).padStart(3, '0');
  const mp = myPay(it);
  const war = warrantyState(it);
  const issues = it.issues.slice().sort((a, b) => a.date.localeCompare(b.date));
  const moves = it.moves.slice().sort((a, b) => a.date.localeCompare(b.date));
  const rows: [string, string][] = [
    ['Kab mangaya', fdate(it.orderDate) || '—'],
    ['Kab pahuncha', it.receivedDate ? fdate(it.receivedDate) : 'Abhi nahi aaya'],
    ['Kahan se mangaya', it.vendor || '—'],
    ['Kisne laya', it.broughtBy || '—'],
    ['Bill / Order no.', it.billNo || '—'],
    ['Category', it.category || '—'],
  ];
  if (it.warrantyTill) rows.push(['Warranty', fdate(it.warrantyTill) + (war && war.key !== 'ok' ? ' (' + war.label + ')' : '')]);
  rows.push(['Bill laga', it.bills.length ? it.bills.length + ' (' + it.bills.map((b) => b.name).join(', ') + ')' : 'Nahi']);

  return (
    <article className="slip" aria-label={'Entry #' + no + ' ki parchi'}>
      <header className="slip-h">
        <div>
          <b>Office Saman Register</b>
          <span>Saman ki parchi</span>
        </div>
        <div className="slip-no">
          <b>Entry #{no}</b>
          <span>Print: {fdate(today())}</span>
        </div>
      </header>

      <section className="slip-title">
        <h1>{it.item || '(bina naam)'}</h1>
        <p className="slip-eq">
          <span>
            {num(it.qty)} pcs × {num(it.rate) ? inr(it.rate) : '—'}
          </span>
          <strong>{inr(it.total)}</strong>
        </p>
      </section>

      <dl className="slip-facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        <div className="wide">
          <dt>Mera paisa</dt>
          <dd>
            {mp.mine
              ? 'Maine diye ' + inr(mp.paid) + ', wapas mile ' + inr(mp.back) + (mp.due > 0 ? ', baaki ' + inr(mp.due) : ', sab mil gaye')
              : 'Maine nahi diye (dukaan ya laane wale ne khud liye)'}
          </dd>
        </div>
        {it.serials && (
          <div className="wide">
            <dt>Serial no.</dt>
            <dd className="pre">{it.serials}</dd>
          </div>
        )}
        {it.note && (
          <div className="wide">
            <dt>Note</dt>
            <dd>{it.note}</dd>
          </div>
        )}
      </dl>

      <section className="slip-sec">
        <h2>Kisko diya</h2>
        {issues.length ? (
          <table>
            <thead>
              <tr>
                <th>Tareekh</th>
                <th>Kisko diya</th>
                <th>Department</th>
                <th className="num">Pcs</th>
                <th>Note</th>
                <th className="sigcol">Lene wale ka sign</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{fdate(i.date) || '—'}</td>
                  <td>{i.person || '—'}</td>
                  <td>{i.dept || '—'}</td>
                  <td className="num">{num(i.qty)}</td>
                  <td>{i.note}</td>
                  <td className="sigcol" />
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="none">Abhi kisi ko nahi diya.</p>
        )}
      </section>

      {moves.length > 0 && (
        <section className="slip-sec">
          <h2>Wapas aaya, kharab, return</h2>
          <table>
            <thead>
              <tr>
                <th>Tareekh</th>
                <th>Kya hua</th>
                <th className="num">Pcs</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{fdate(m.date) || '—'}</td>
                  <td>{MOVE[m.type]}</td>
                  <td className="num">{num(m.qty)}</td>
                  <td>{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="slip-stock">
        Aaya {num(it.qty)} · Diya {issuedQty(it)} · Wapas {moveSum(it, 'back')} · Kharab/return {moveSum(it, 'damaged') + moveSum(it, 'vendor')} ·{' '}
        <b>Bacha {Math.max(remaining(it), 0)}</b>
      </p>

      <footer className="slip-sign">
        <div>
          <span className="line" />
          <span>Dene wale ka sign{me?.name ? ' (' + me.name + ')' : ''}</span>
        </div>
        <div>
          <span className="line" />
          <span>Lene wale ka sign</span>
        </div>
      </footer>
      <p className="slip-meta">
        Entry ki: {it.addedByName || '—'}
        {it.createdAt ? ', ' + fdate(it.createdAt.slice(0, 10)) : ''}
      </p>
    </article>
  );
}
