'use client';

import { useState, type ReactNode } from 'react';
import {
  MOVE,
  allIssues,
  allMoves,
  fdate,
  filterLog,
  filteredIssues,
  filteredItems,
  filtersActive,
  initials,
  inr,
  mlabel,
  myPay,
  num,
  regNos,
  round2,
  status,
  sumTotal,
} from '@/lib/calc';
import type { Item, StockGroup } from '@/lib/types';
import { Icon } from './Icon';
import { EmptyState, FiltersBar, NoRes, PageHead } from './PageParts';
import { SettingsSections } from './Modals';
import { useReg } from './context';
import { DemandList } from './DemandList';

/* ====================== Saman ki list ====================== */
function subLine(it: Item) {
  return [it.category, it.billNo ? 'Bill: ' + it.billNo : ''].filter(Boolean).join(' · ');
}

function TRow({ it, no, onOpen }: { it: Item; no: number; onOpen: (id: string) => void }) {
  const st = status(it);
  const nb = it.bills.length;
  const mp = myPay(it);
  const sub = subLine(it);
  return (
    <tr className="row" onClick={() => onOpen(it.id)}>
      <td className="c-no">{String(no).padStart(3, '0')}</td>
      <td className="c-item">
        <button type="button" className="rowlink">
          {it.item || '(bina naam)'}
        </button>
        {sub && <small>{sub}</small>}
      </td>
      <td className="num">{num(it.qty)}</td>
      <td className="num">{num(it.rate) ? inr(it.rate) : '—'}</td>
      <td className="num c-total">{inr(it.total)}</td>
      <td className="nowrap">{fdate(it.orderDate) || '—'}</td>
      <td className="nowrap">{it.receivedDate ? fdate(it.receivedDate) : <em className="pend">Abhi nahi</em>}</td>
      <td className="c-src">
        {it.vendor || '—'}
        {it.broughtBy && <small>{it.broughtBy}</small>}
      </td>
      <td>
        <span className="pills">
          <span className={'stamp ' + st.cls}>{st.label}</span>
          {mp.due > 0 && <span className="stamp low">Mere {inr(mp.due)} baaki</span>}
        </span>
      </td>
      <td className="c-bill" title={nb ? nb + ' bill lage hai' : 'Bill nahi laga'}>
        {nb > 0 ? (
          <>
            <Icon name="clip" />
            {nb}
          </>
        ) : (
          <span className="nobill">—</span>
        )}
      </td>
    </tr>
  );
}

function Card({ it, no, onOpen }: { it: Item; no: number; onOpen: (id: string) => void }) {
  const st = status(it);
  const nb = it.bills.length;
  const mp = myPay(it);
  const sub = subLine(it);
  return (
    <li>
      <button type="button" className="lcard" onClick={() => onOpen(it.id)}>
        <span className="lc-top">
          <span className="lc-name">
            <strong>{it.item || '(bina naam)'}</strong>
            <small>
              #{String(no).padStart(3, '0')}
              {sub ? ' · ' + sub : ''}
            </small>
          </span>
          <span className={'stamp ' + st.cls}>{st.label}</span>
        </span>
        <span className="lc-mid">
          <span className="lc-eq">
            {num(it.qty)} pcs × {num(it.rate) ? inr(it.rate) : '—'}
          </span>
          <span className="lc-tot">{inr(it.total)}</span>
        </span>
        <span className="lc-bot">
          <span>
            <Icon name="cal" />
            {fdate(it.orderDate) || '—'}
          </span>
          <span>
            <Icon name="truck" />
            {it.receivedDate ? fdate(it.receivedDate) : <em className="pend">Abhi nahi aaya</em>}
          </span>
          {(it.vendor || it.broughtBy) && <span className="lc-src">{[it.vendor, it.broughtBy].filter(Boolean).join(', ')}</span>}
          {nb > 0 && (
            <span>
              <Icon name="clip" />
              {nb}
            </span>
          )}
        </span>
        {mp.due > 0 && <span className="stamp low">Mere {inr(mp.due)} baaki</span>}
      </button>
    </li>
  );
}

export function SamanPage() {
  const { items, f, openEntry, clearFilters, newEntry } = useReg();
  const list = filteredItems(items, f, 'items');
  const nos = regNos(items);
  const pcs = list.reduce((s, i) => s + num(i.qty), 0);
  const total = sumTotal(list);
  return (
    <>
      <PageHead title="Saman ki list" sub="Har entry: kya aaya, kitne ka, kahan se, kisne laya" csv="items" tab="items" />
      {!items.length ? (
        <EmptyState onNew={newEntry} />
      ) : (
        <>
          <FiltersBar tab="items" />
          {!list.length ? (
            <NoRes msg="Is filter me koi entry nahi mili." onClear={clearFilters} />
          ) : (
            <>
              <div className="sumbar" aria-live="polite">
                <span>
                  <b>{list.length}</b> entries
                </span>
                <span>
                  <b>{pcs}</b> pcs
                </span>
                <span className="sum-tot">
                  Kul jod <strong id="list-total">{inr(total)}</strong>
                </span>
              </div>
              <div className="tcard ltable-wrap">
                <table className="ltable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Saman</th>
                      <th className="num">Pcs</th>
                      <th className="num">Rate</th>
                      <th className="num">Total</th>
                      <th>Mangaya</th>
                      <th>Pahuncha</th>
                      <th>Kahan se / Kisne laya</th>
                      <th>Status</th>
                      <th className="c-bill">
                        <span className="sr">Bill</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((it) => (
                      <TRow key={it.id} it={it} no={nos[it.id]} onOpen={openEntry} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>{list.length} entries</td>
                      <td className="num">{pcs}</td>
                      <td />
                      <td className="num">{inr(total)}</td>
                      <td colSpan={5} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <ul className="lcards">
                {list.map((it) => (
                  <Card key={it.id} it={it} no={nos[it.id]} onOpen={openEntry} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ====================== Stock ====================== */
function MinInput({ g, onSave }: { g: StockGroup; onSave: (key: string, n: number) => void }) {
  const [val, setVal] = useState(g.min ? String(g.min) : '');
  const commit = () => {
    const n = Math.max(0, Math.round(num(val)));
    if (n !== g.min) onSave(g.key, n);
  };
  return (
    <input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      className="mininp"
      value={val}
      placeholder="—"
      aria-label={'Kam se kam stock: ' + g.name}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function StockPage() {
  const { items, groups, f, saveMin, goList, clearFilters, newEntry } = useReg();
  let gs = groups.slice();
  const q = f.q.trim().toLowerCase();
  if (q) gs = gs.filter((g) => (g.name + ' ' + g.category).toLowerCase().includes(q));
  if (f.stock === 'low') gs = gs.filter((g) => g.low);
  else if (f.stock === 'out') gs = gs.filter((g) => g.aaya > 0 && g.bacha === 0);
  gs.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name));
  const pcs = gs.reduce((s, g) => s + g.bacha, 0);
  const lowN = groups.filter((g) => g.low).length;

  let body: ReactNode;
  if (!items.length) body = <EmptyState onNew={newEntry} />;
  else if (!gs.length) body = <NoRes msg={f.stock === 'low' ? 'Abhi koi saman kam stock me nahi hai.' : undefined} onClear={clearFilters} />;
  else
    body = (
      <>
        <div className="sumbar">
          <span>
            <b>{gs.length}</b> tarah ka saman
          </span>
          {lowN > 0 && (
            <span className="sum-low">
              <b>{lowN}</b> kam stock me
            </span>
          )}
          <span className="sum-tot">
            Stock me kul <strong>{pcs} pcs</strong>
          </span>
        </div>
        <div className="tcard tscroll">
          <table className="itable stable-stock">
            <thead>
              <tr>
                <th>Saman</th>
                <th className="num">Kul aaya</th>
                <th className="num">Rasta me</th>
                <th className="num">Diya</th>
                <th className="num">Wapas</th>
                <th className="num">Kharab / return</th>
                <th className="num">Bacha</th>
                <th className="no-print">Kam se kam</th>
                <th>Status</th>
                <th className="no-print">
                  <span className="sr">Entries</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {gs.map((g) => (
                <tr key={g.key} className={g.low ? 'lowrow' : undefined}>
                  <td>
                    <strong>{g.name}</strong>
                    <small>{[g.category, g.entries + ' entries'].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td className="num">{g.aaya}</td>
                  <td className="num">{g.rasta || '—'}</td>
                  <td className="num">{g.diya}</td>
                  <td className="num">{g.wapas || '—'}</td>
                  <td className="num">{g.kharab || '—'}</td>
                  <td className="num bacha">{g.bacha}</td>
                  <td className="no-print">
                    <MinInput key={g.key + ':' + g.min} g={g} onSave={saveMin} />
                  </td>
                  <td>
                    <span className={'stamp ' + g.st.cls}>{g.st.label}</span>
                  </td>
                  <td className="no-print">
                    <button className="btn sm ghost" type="button" onClick={() => goList({ q: g.name })}>
                      Entries
                      <Icon name="chevR" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );

  return (
    <>
      <PageHead
        title="Stock"
        sub='Ek naam ke saman ka jod. "Kam se kam" me number daalo, stock usse kam hote hi laal ho jayega.'
        csv="stock"
        tab="stock"
      />
      {items.length > 0 && <FiltersBar tab="stock" />}
      {body}
    </>
  );
}

/* ====================== Kisko diya ====================== */
export function IssuesPage() {
  const { items, f, setF, openEntry, clearFilters, newEntry } = useReg();
  const all = allIssues(items);
  const mvAll = allMoves(items);
  const list = filteredIssues(items, f);
  const mv = filterLog(mvAll, f);
  const pcs = list.reduce((s, i) => s + i.qty, 0);
  const val = list.reduce((s, i) => s + i.qty * i.rate, 0);
  const showMoves = mv.length > 0 && !f.dept;

  // kisko sabse zyada diya (filter ke hisaab se)
  const pm = new Map<string, { name: string; pcs: number; n: number }>();
  for (const i of list) {
    const k = (i.person || '').trim();
    if (!k) continue;
    const r = pm.get(k.toLowerCase()) || { name: k, pcs: 0, n: 0 };
    r.pcs += i.qty;
    r.n++;
    pm.set(k.toLowerCase(), r);
  }
  const people = Array.from(pm.values()).sort((a, b) => b.pcs - a.pcs).slice(0, 8);

  let body: ReactNode;
  if (!items.length) body = <EmptyState onNew={newEntry} />;
  else if (!all.length && !mvAll.length)
    body = (
      <div className="nores">
        <span className="nores-ic">
          <Icon name="users" />
        </span>
        <p>Abhi tak kisi ko kuch nahi diya. Saman ki list me koi entry kholo aur &quot;Kisi ko do&quot; dabao.</p>
      </div>
    );
  else if (!list.length && !showMoves) body = <NoRes onClear={clearFilters} />;
  else
    body = (
      <>
        {people.length > 1 && (
          <div className="people no-print" aria-label="Kisko kitna diya">
            {people.map((p) => (
              <button key={p.name} type="button" className="person" onClick={() => setF((x) => ({ ...x, q: p.name }))} title={p.name + ' ki entries dikhao'}>
                <span className="avatar sm">{initials(p.name)}</span>
                <span>{p.name}</span>
                <b>{p.pcs} pcs</b>
              </button>
            ))}
          </div>
        )}
        {list.length > 0 ? (
          <>
            <div className="sumbar">
              <span>
                <b>{list.length}</b> baar diya
              </span>
              <span>
                <b>{pcs}</b> pcs
              </span>
              <span className="sum-tot">
                Kul keemat <strong>{inr(val)}</strong>
              </span>
            </div>
            <div className="tcard tscroll">
              <table className="itable">
                <thead>
                  <tr>
                    <th>Kab diya</th>
                    <th>Saman</th>
                    <th className="num">Pcs</th>
                    <th>Kisko diya</th>
                    <th>Department</th>
                    <th className="num">Keemat</th>
                    <th>Note</th>
                    <th className="pcol">Sign</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.itemId + i.id}>
                      <td className="nowrap">{fdate(i.date) || '—'}</td>
                      <td>
                        <button className="link" type="button" onClick={() => openEntry(i.itemId)}>
                          {i.itemName || '(bina naam)'}
                        </button>
                      </td>
                      <td className="num">{i.qty}</td>
                      <td>
                        <span className="who-cell">
                          <span className="avatar xs">{initials(i.person || '?')}</span>
                          {i.person || '—'}
                        </span>
                      </td>
                      <td>{i.dept ? <span className="tag">{i.dept}</span> : '—'}</td>
                      <td className="num">{i.rate ? inr(i.qty * i.rate) : '—'}</td>
                      <td>{i.note}</td>
                      <td className="pcol" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          all.length > 0 && <NoRes onClear={clearFilters} />
        )}
        {showMoves && (
          <>
            <h2 className="sub-h">Wapas aaya, kharab, return</h2>
            <div className="tcard tscroll">
              <table className="itable">
                <thead>
                  <tr>
                    <th>Kab</th>
                    <th>Saman</th>
                    <th>Kya hua</th>
                    <th className="num">Pcs</th>
                    <th className="num">Keemat</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {mv.map((m) => (
                    <tr key={m.itemId + m.id}>
                      <td className="nowrap">{fdate(m.date) || '—'}</td>
                      <td>
                        <button className="link" type="button" onClick={() => openEntry(m.itemId)}>
                          {m.itemName || '(bina naam)'}
                        </button>
                      </td>
                      <td>
                        <span className={'stamp ' + (m.type === 'back' ? 'ok' : m.type === 'damaged' ? 'low' : 'warn')}>{MOVE[m.type]}</span>
                      </td>
                      <td className="num">{m.qty}</td>
                      <td className="num">{m.rate ? inr(m.qty * m.rate) : '—'}</td>
                      <td>{m.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );

  return (
    <>
      <PageHead title="Kisko diya" sub="Kis bande ya department ko kab, kya, kitna diya" csv="issues" tab="issues" />
      {items.length > 0 && (all.length > 0 || mvAll.length > 0) && <FiltersBar tab="issues" />}
      {body}
    </>
  );
}

/* ====================== Hisaab ====================== */
type BRow = { name: string; n: number; pcs: number; amt: number };

function Block({ title, note, rows, cols, countKey, tone }: { title: string; note: string; rows: BRow[]; cols: [string, string]; countKey: 'n' | 'pcs'; tone?: 'gold' | 'red' }) {
  const max = Math.max(1, ...rows.map((r) => r.amt));
  let body: ReactNode = <p className="none">Abhi kuch nahi.</p>;
  if (rows.length) {
    body = (
      <div className="sx">
        <table className="stable">
          <thead>
            <tr>
              <th>{cols[0]}</th>
              <th className="num">{cols[1]}</th>
              <th className="num">Rupaye</th>
              <th className="barcol">
                <span className="sr">Bar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const w = r.amt > 0 ? Math.max(1.5, (r.amt / max) * 100) : 0;
              return (
                <tr key={i + ':' + r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r[countKey]}</td>
                  <td className="num">{inr(r.amt)}</td>
                  <td className="barcol">
                    <span className="track">
                      <span className="bar" style={{ width: w.toFixed(1) + '%' }} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <section className={'sblock' + (tone ? ' t-' + tone : '')}>
      <header>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </header>
      {body}
    </section>
  );
}

export function HisaabPage() {
  const { items, f, newEntry } = useReg();
  const list = filteredItems(items, f, 'summary');
  const group = (keyFn: (it: Item) => string): BRow[] => {
    const m = new Map<string, BRow>();
    for (const it of list) {
      const k = keyFn(it);
      const r = m.get(k) || { name: k, n: 0, pcs: 0, amt: 0 };
      r.n++;
      r.pcs += num(it.qty);
      r.amt += num(it.total);
      m.set(k, r);
    }
    return Array.from(m.values());
  };
  const months = group((it) => it.orderDate.slice(0, 7) || '—')
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((o) => ({ ...o, name: mlabel(o.name) }));
  const vendors = group((it) => it.vendor || 'Nahi likha').sort((a, b) => b.amt - a.amt);
  const cats = group((it) => it.category || 'Nahi likha').sort((a, b) => b.amt - a.amt);
  const dm = new Map<string, BRow>();
  for (const it of list) {
    for (const is of it.issues) {
      const k = is.dept || 'Department nahi likha';
      const r = dm.get(k) || { name: k, n: 0, pcs: 0, amt: 0 };
      r.pcs += num(is.qty);
      r.amt += num(is.qty) * num(it.rate);
      dm.set(k, r);
    }
  }
  const depts = Array.from(dm.values()).sort((a, b) => b.amt - a.amt);
  let myP = 0, myB = 0, nP = 0, nB = 0, nD = 0;
  for (const it of list) {
    const m = myPay(it);
    if (!m.mine) continue;
    nP++;
    myP += m.paid;
    myB += m.back;
    if (m.back > 0) nB++;
    if (m.due > 0) nD++;
  }
  const myRows: BRow[] = nP
    ? [
        { name: 'Maine diye', n: nP, pcs: 0, amt: myP },
        { name: 'Wapas mil gaye', n: nB, pcs: 0, amt: myB },
        { name: 'Abhi baaki', n: nD, pcs: 0, amt: Math.max(0, round2(myP - myB)) },
      ]
    : [];
  const dueRows: BRow[] = list
    .map((it) => {
      const m = myPay(it);
      return m.due > 0 ? { name: it.item + (it.orderDate ? ' · ' + fdate(it.orderDate) : ''), n: 1, pcs: num(it.qty), amt: m.due } : null;
    })
    .filter((r): r is BRow => !!r)
    .sort((a, b) => b.amt - a.amt);

  return (
    <>
      <PageHead title="Hisaab" sub="Mahine, dukaan, saman aur department ke hisaab se kharcha" csv="summary" tab="summary" />
      {!items.length ? (
        <EmptyState onNew={newEntry} />
      ) : (
        <>
          <FiltersBar tab="summary" />
          <div className="sumbar">
            <span>
              <b>{list.length}</b> entries ka kul kharcha
            </span>
            {filtersActive(f, 'summary') && <span className="muted">filter laga hai</span>}
            <span className="sum-tot">
              <strong>{inr(sumTotal(list))}</strong>
            </span>
          </div>
          <div className="sgrid">
            <Block title="Mahine ke hisaab se" note="Jis mahine mangaya, us mahine ka kharcha" rows={months} cols={['Mahina', 'Entries']} countKey="n" tone="gold" />
            <Block title="Kahan se mangaya" note="Har dukaan ya site se kitne ka saman aaya" rows={vendors} cols={['Dukaan / site', 'Entries']} countKey="n" />
            <Block title="Kis tarah ka saman" note="Category ke hisaab se kharcha" rows={cats} cols={['Saman', 'Pcs']} countKey="pcs" />
            <Block title="Department ko kitna diya" note="Jitne piece diye, unki keemat rate ke hisaab se" rows={depts} cols={['Department', 'Pcs']} countKey="pcs" />
            <Block title="Mera paisa" note="Jo aapne apni jeb se diye, kitne wapas mile, kitne baaki" rows={myRows} cols={['Hisaab', 'Entries']} countKey="n" tone="gold" />
            <Block title="Kis saman ke mere paise baaki" note="Jin entries ke paise abhi wapas milne hai" rows={dueRows} cols={['Saman', 'Pcs']} countKey="pcs" tone="red" />
          </div>
        </>
      )}
    </>
  );
}

/* ====================== Settings ====================== */
export function SettingsPage() {
  return (
    <>
      <PageHead title="Settings" sub="Aapka account, team, AI aur Google Sheet" print={false} add={false} />
      <SettingsSections />
    </>
  );
}

/* ====================== Demand List ====================== */
export function DemandPage() {
  return (
    <>
      <PageHead title="Demand List / Orders" sub="Naya saman order requirement, WhatsApp slip aur stock conversion" print={false} add={false} />
      <DemandList />
    </>
  );
}