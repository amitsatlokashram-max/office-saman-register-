'use client';

import { MOVE, fdate, inr, issuedQty, moveSum, myPay, num, regNos, remaining, today, warrantyState } from '@/lib/calc';
import type { Item, Me } from '@/lib/types';

/** Printable entry receipt for record keeping and issue signatures. */
export function EntryPrint({ it, items, me }: { it: Item; items: Item[]; me: Me | null }) {
  const no = String(regNos(items)[it.id] || 0).padStart(3, '0');
  const mp = myPay(it);
  const war = warrantyState(it);
  const issues = it.issues.slice().sort((a, b) => a.date.localeCompare(b.date));
  const moves = it.moves.slice().sort((a, b) => a.date.localeCompare(b.date));
  const rows: [string, string][] = [
    ['Order date', fdate(it.orderDate) || '—'],
    ['Received date', it.receivedDate ? fdate(it.receivedDate) : 'Not received'],
    ['Supplier', it.vendor || '—'],
    ['Brought by', it.broughtBy || '—'],
    ['Bill / Order no.', it.billNo || '—'],
    ['Category', it.category || '—'],
  ];
  if (it.warrantyTill) rows.push(['Warranty', fdate(it.warrantyTill) + (war && war.key !== 'ok' ? ' (' + war.label + ')' : '')]);
  rows.push(['Receipt attached', it.bills.length ? it.bills.length + ' (' + it.bills.map((b) => b.name).join(', ') + ')' : 'No']);

  return (
    <article className="slip" aria-label={'Entry #' + no + ' receipt'}>
      <header className="slip-h">
        <div>
          <b>Office Supplies Register</b>
          <span>Item receipt</span>
        </div>
        <div className="slip-no">
          <b>Entry #{no}</b>
          <span>Print: {fdate(today())}</span>
        </div>
      </header>

      <section className="slip-title">
        <h1>{it.item || '(Unnamed item)'}</h1>
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
          <dt>Reimbursement</dt>
          <dd>
            {mp.mine
              ? 'Paid ' + inr(mp.paid) + ', reimbursed ' + inr(mp.back) + (mp.due > 0 ? ', outstanding ' + inr(mp.due) : ', fully reimbursed')
              : 'Not paid personally (paid by supplier or carrier)'}
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
        <h2>Issued items</h2>
        {issues.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Issued to</th>
                <th>Department</th>
                <th className="num">Pcs</th>
                <th>Note</th>
                <th className="sigcol">Recipient signature</th>
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
          <p className="none">Nothing has been issued yet.</p>
        )}
      </section>

      {moves.length > 0 && (
        <section className="slip-sec">
          <h2>Returns and damaged items</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Action</th>
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
        Received {num(it.qty)} · Issued {issuedQty(it)} · Returned {moveSum(it, 'back')} · Damaged/vendor returns {moveSum(it, 'damaged') + moveSum(it, 'vendor')} ·{' '}
        <b>Remaining {Math.max(remaining(it), 0)}</b>
      </p>

      <footer className="slip-sign">
        <div>
          <span className="line" />
          <span>Issued by{me?.name ? ' (' + me.name + ')' : ''}</span>
        </div>
        <div>
          <span className="line" />
          <span>Received by</span>
        </div>
      </footer>
      <p className="slip-meta">
        Created by: {it.addedByName || '—'}
        {it.createdAt ? ', ' + fdate(it.createdAt.slice(0, 10)) : ''}
      </p>
    </article>
  );
}
