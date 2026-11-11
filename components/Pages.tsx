
'use client';

import { useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
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
  round2,
  status,
  sumTotal,
  today,
} from '@/lib/calc';
import { saveFile } from '@/lib/bills';
import type { Item, StockGroup, TripExpense } from '@/lib/types';
import { Icon } from './Icon';
import { EmptyState, FiltersBar, NoRes, PageHead } from './PageParts';
import { SettingsSections } from './Modals';
import { useReg } from './context';

const DemandListLazy = dynamic(
  () => import('./DemandList').then((m) => m.DemandList),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 20, color: '#94a3b8' }}>
        Loading Demand List...
      </div>
    ),
  },
);

/* ====================== Saman ki list ====================== */

function subLine(it: Item) {
  return [
    it.arrivalNo || '',
    it.category,
    it.billNo ? 'Bill: ' + it.billNo : '',
  ].filter(Boolean).join(' · ');
}

function TRow({
  it,
  no,
  onOpen,
}: {
  it: Item;
  no: number;
  onOpen: (id: string) => void;
}) {
  const st = status(it);
  const nb = it.bills.length;
  const mp = myPay(it);
  const sub = subLine(it);

  return (
    <tr className="row" onClick={() => onOpen(it.id)}>
      <td className="c-no">
        {String(no).padStart(3, '0')}
      </td>
      <td className="c-item">
        <button type="button" className="rowlink">
          {it.item || '(Unnamed item)'}
        </button>
        {sub && <small>{sub}</small>}
      </td>
      <td className="num">{num(it.qty)}</td>
      <td className="num">{num(it.rate) ? inr(it.rate) : '—'}</td>
      <td className="num c-total">{inr(it.total)}</td>
      <td className="nowrap">{fdate(it.orderDate) || '—'}</td>
      <td className="nowrap">
        {it.receivedDate ? (
          fdate(it.receivedDate)
        ) : (
          <em className="pend">Not received</em>
        )}
      </td>
      <td className="c-src">
        {it.vendor || '—'}
        {it.broughtBy && <small>{it.broughtBy}</small>}
      </td>
      <td>
        <span className="pills">
          <span className={'stamp ' + st.cls}>{st.label}</span>
          {mp.due > 0 && (
            <span className="stamp low">
              {inr(mp.due)} reimbursement due
            </span>
          )}
        </span>
      </td>
      <td
        className="c-bill"
        title={nb ? nb + ' receipt(s) attached' : 'No receipt attached'}
      >
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

function Card({
  it,
  no,
  onOpen,
}: {
  it: Item;
  no: number;
  onOpen: (id: string) => void;
}) {
  const st = status(it);
  const nb = it.bills.length;
  const mp = myPay(it);
  const sub = subLine(it);

  return (
    <li>
      <button
        type="button"
        className="lcard"
        onClick={() => onOpen(it.id)}
      >
        <span className="lc-top">
          <span className="lc-name">
            <strong>{it.item || '(Unnamed item)'}</strong>
            <small>
              #{String(no).padStart(3, '0')}
              {sub ? ' · ' + sub : ''}
            </small>
          </span>
          <span className={'stamp ' + st.cls}>{st.label}</span>
        </span>

        <span className="lc-mid">
          <span className="lc-eq">
            {num(it.qty)} pcs ×{' '}
            {num(it.rate) ? inr(it.rate) : '—'}
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
            {it.receivedDate ? (
              fdate(it.receivedDate)
            ) : (
              <em className="pend">Not received</em>
            )}
          </span>
          {(it.vendor || it.broughtBy) && (
            <span className="lc-src">
              {[it.vendor, it.broughtBy].filter(Boolean).join(', ')}
            </span>
          )}
          {nb > 0 && (
            <span>
              <Icon name="clip" />
              {nb}
            </span>
          )}
        </span>

        {mp.due > 0 && (
          <span className="stamp low">
            {inr(mp.due)} reimbursement due
          </span>
        )}
      </button>
    </li>
  );
}

export function SamanPage() {
  const {
    items,
    f,
    openEntry,
    clearFilters,
    newEntry,
  } = useReg();

  // Pehle existing search, month, vendor aur status
  // filters apply honge.
  const filtered = filteredItems(items, f, 'items');

  // Ab createdAt ke hisaab se
  // sabse nayi createdAt sabse upar.
  // Jiska receivedDate nahi hai, wo sabse neeche.
  const list = [...filtered].sort((a, b) => {
    const aCreated = a.createdAt || '';
    const bCreated = b.createdAt || '';

    const dateCompare = bCreated.localeCompare(aCreated);
    if (dateCompare !== 0) return dateCompare;

    // Same createdAt par receivedDate ke hisaab se.
    const aReceived = a.receivedDate || '';
    const bReceived = b.receivedDate || '';

    if (!aReceived && bReceived) return 1;
    if (aReceived && !bReceived) return -1;

    const receivedCompare = bReceived.localeCompare(aReceived);
    if (receivedCompare !== 0) return receivedCompare;

    // Same received date par original filtered order.
    return 0;
  });

  // Display serial numbers, Firebase IDs nahi badlenge.
  const getSerial = (index: number) => list.length - index;

  const pcs = list.reduce(
    (sum, item) => sum + num(item.qty),
    0,
  );

  const total = sumTotal(list);

  return (
    <>
      <PageHead
        title="Items"
        sub="Every purchase, cost, supplier, and delivery in one place"
        csv="items"
        tab="items"
        add={false}
      />

      {!items.length ? (
        <EmptyState onNew={newEntry} />
      ) : (
        <>
          <FiltersBar tab="items" />

          {!list.length ? (
            <NoRes
              msg="No entries match these filters."
              onClear={clearFilters}
            />
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
                  Total{' '}
                  <strong id="list-total">{inr(total)}</strong>
                </span>
              </div>

              <div className="tcard ltable-wrap">
                <table className="ltable">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th className="num">Pcs</th>
                      <th className="num">Rate</th>
                      <th className="num">Total</th>
                      <th>Ordered</th>
                      <th>Received</th>
                      <th>Supplier / Brought by</th>
                      <th>Status</th>
                      <th className="c-bill">
                        <span className="sr">Bill</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {list.map((it, index) => (
                      <TRow
                        key={it.id}
                        it={it}
                        no={getSerial(index)}
                        onOpen={openEntry}
                      />
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
                {list.map((it, index) => (
                  <Card
                    key={it.id}
                    it={it}
                    no={getSerial(index)}
                    onOpen={openEntry}
                  />
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

function MinInput({
  g,
  onSave,
}: {
  g: StockGroup;
  onSave: (key: string, n: number) => void;
}) {
  const [val, setVal] = useState(
    g.min ? String(g.min) : '',
  );

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
      aria-label={'Minimum stock: ' + g.name}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function StockPage() {
  const {
    items,
    groups,
    f,
    saveMin,
    goList,
    clearFilters,
    newEntry,
  } = useReg();

  let gs = groups.slice();
  const q = f.q.trim().toLowerCase();

  if (q) {
    gs = gs.filter((g) =>
      (g.name + ' ' + g.category)
        .toLowerCase()
        .includes(q),
    );
  }

  if (f.stock === 'low') {
    gs = gs.filter((g) => g.low);
  } else if (f.stock === 'out') {
    gs = gs.filter((g) => g.aaya > 0 && g.bacha === 0);
  }

  gs.sort(
    (a, b) =>
      Number(b.low) - Number(a.low) ||
      a.name.localeCompare(b.name),
  );

  const pcs = gs.reduce((s, g) => s + g.bacha, 0);
  const lowN = groups.filter((g) => g.low).length;

  let body: ReactNode;

  if (!items.length) {
    body = <EmptyState onNew={newEntry} />;
  } else if (!gs.length) {
    body = (
      <NoRes
        msg={
          f.stock === 'low'
            ? 'There are no low-stock items.'
            : undefined
        }
        onClear={clearFilters}
      />
    );
  } else {
    body = (
      <>
        <div className="sumbar">
          <span>
            <b>{gs.length}</b> item types
          </span>
          {lowN > 0 && (
            <span className="sum-low">
              <b>{lowN}</b> low-stock items
            </span>
          )}
          <span className="sum-tot">
            Total stock <strong>{pcs} pcs</strong>
          </span>
        </div>

        <div className="tcard tscroll">
          <table className="itable stable-stock">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Received</th>
                <th className="num">In transit</th>
                <th className="num">Issued</th>
                <th className="num">Returned</th>
                <th className="num">Damaged / vendor return</th>
                <th className="num">Remaining</th>
                <th className="no-print">Minimum stock</th>
                <th>Status</th>
                <th className="no-print">
                  <span className="sr">Entries</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {gs.map((g) => (
                <tr
                  key={g.key}
                  className={g.low ? 'lowrow' : undefined}
                >
                  <td>
                    <strong>{g.name}</strong>
                    <small>
                      {[
                        g.category,
                        g.entries + ' entries',
                      ].filter(Boolean).join(' · ')}
                    </small>
                  </td>
                  <td className="num">{g.aaya}</td>
                  <td className="num">{g.rasta || '—'}</td>
                  <td className="num">{g.diya}</td>
                  <td className="num">{g.wapas || '—'}</td>
                  <td className="num">{g.kharab || '—'}</td>
                  <td className="num bacha">{g.bacha}</td>
                  <td className="no-print">
                    <MinInput
                      key={g.key + ':' + g.min}
                      g={g}
                      onSave={saveMin}
                    />
                  </td>
                  <td>
                    <span className={'stamp ' + g.st.cls}>
                      {g.st.label}
                    </span>
                  </td>
                  <td className="no-print">
                    <button
                      className="btn sm ghost"
                      type="button"
                      onClick={() => goList({ q: g.name })}
                    >
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
  }

  return (
    <>
      <PageHead
        title="Stock"
        sub='Totals by item. Set a "Minimum stock" level to highlight items that run low.'
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
  const {
    items,
    f,
    setF,
    openEntry,
    clearFilters,
    newEntry,
  } = useReg();

  const all = allIssues(items);
  const mvAll = allMoves(items);
  const list = filteredIssues(items, f);
  const mv = filterLog(mvAll, f);
  const pcs = list.reduce((s, i) => s + i.qty, 0);
  const val = list.reduce((s, i) => s + i.qty * i.rate, 0);
  const showMoves = mv.length > 0 && !f.dept;

  const pm = new Map<
    string,
    { name: string; pcs: number; n: number }
  >();

  for (const i of list) {
    const k = (i.person || '').trim();
    if (!k) continue;

    const r = pm.get(k.toLowerCase()) || {
      name: k,
      pcs: 0,
      n: 0,
    };

    r.pcs += i.qty;
    r.n++;
    pm.set(k.toLowerCase(), r);
  }

  const people = Array.from(pm.values())
    .sort((a, b) => b.pcs - a.pcs)
    .slice(0, 8);

  let body: ReactNode;

  if (!items.length) {
    body = <EmptyState onNew={newEntry} />;
  } else if (!all.length && !mvAll.length) {
    body = (
      <div className="nores">
        <span className="nores-ic">
          <Icon name="users" />
        </span>
        <p>
          No items have been issued yet. Open an item in the register and select &quot;Issue item&quot;.
        </p>
      </div>
    );
  } else if (!list.length && !showMoves) {
    body = <NoRes onClear={clearFilters} />;
  } else {
    body = (
      <>
        {people.length > 1 && (
          <div
            className="people no-print"
            aria-label="Issued items by person"
          >
            {people.map((p) => (
              <button
                key={p.name}
                type="button"
                className="person"
                onClick={() =>
                  setF((x) => ({ ...x, q: p.name }))
                }
                title={'Show entries for ' + p.name}
              >
                <span className="avatar sm">
                  {initials(p.name)}
                </span>
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
                <b>{list.length}</b> issues
              </span>
              <span>
                <b>{pcs}</b> pcs
              </span>
              <span className="sum-tot">
                Total value <strong>{inr(val)}</strong>
              </span>
            </div>

            <div className="tcard tscroll">
              <table className="itable">
                <thead>
                  <tr>
                    <th>Date issued</th>
                    <th>Item</th>
                    <th className="num">Pcs</th>
                    <th>Issued to</th>
                    <th>Department</th>
                    <th className="num">Keemat</th>
                    <th>Note</th>
                    <th className="pcol">Sign</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.itemId + i.id}>
                      <td className="nowrap">
                        {fdate(i.date) || '—'}
                      </td>
                      <td>
                        <button
                          className="link"
                          type="button"
                          onClick={() => openEntry(i.itemId)}
                        >
                          {i.itemName || '(Unnamed item)'}
                        </button>
                      </td>
                      <td className="num">{i.qty}</td>
                      <td>
                        <span className="who-cell">
                          <span className="avatar xs">
                            {initials(i.person || '?')}
                          </span>
                          {i.person || '—'}
                        </span>
                      </td>
                      <td>
                        {i.dept ? (
                          <span className="tag">{i.dept}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num">
                        {i.rate ? inr(i.qty * i.rate) : '—'}
                      </td>
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
            <h2 className="sub-h">
              Returns and damaged items
            </h2>
            <div className="tcard tscroll">
              <table className="itable">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Item</th>
                    <th>Action</th>
                    <th className="num">Pcs</th>
                    <th className="num">Keemat</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {mv.map((m) => (
                    <tr key={m.itemId + m.id}>
                      <td className="nowrap">
                        {fdate(m.date) || '—'}
                      </td>
                      <td>
                        <button
                          className="link"
                          type="button"
                          onClick={() => openEntry(m.itemId)}
                        >
                          {m.itemName || '(Unnamed item)'}
                        </button>
                      </td>
                      <td>
                        <span
                          className={
                            'stamp ' +
                            (m.type === 'back'
                              ? 'ok'
                              : m.type === 'damaged'
                                ? 'low'
                                : 'warn')
                          }
                        >
                          {MOVE[m.type]}
                        </span>
                      </td>
                      <td className="num">{m.qty}</td>
                      <td className="num">
                        {m.rate ? inr(m.qty * m.rate) : '—'}
                      </td>
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
  }

  return (
    <>
      <PageHead
        title="Issued items"
        sub="Track what was issued, when, and to whom"
        csv="issues"
        tab="issues"
      />
      {items.length > 0 &&
        (all.length > 0 || mvAll.length > 0) && (
          <FiltersBar tab="issues" />
        )}
      {body}
    </>
  );
}

/* ====================== Hisaab ====================== */

type BRow = {
  name: string;
  n: number;
  pcs: number;
  amt: number;
};

function Block({
  title,
  note,
  rows,
  cols,
  countKey,
  tone,
}: {
  title: string;
  note: string;
  rows: BRow[];
  cols: [string, string];
  countKey: 'n' | 'pcs';
  tone?: 'gold' | 'red';
}) {
  const max = Math.max(1, ...rows.map((r) => r.amt));
  let body: ReactNode = <p className="none">Nothing to show yet.</p>;

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
              const w =
                r.amt > 0
                  ? Math.max(1.5, (r.amt / max) * 100)
                  : 0;

              return (
                <tr key={i + ':' + r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r[countKey]}</td>
                  <td className="num">{inr(r.amt)}</td>
                  <td className="barcol">
                    <span className="track">
                      <span
                        className="bar"
                        style={{ width: w.toFixed(1) + '%' }}
                      />
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

type DeliveryReportGroup = {
  key: string;
  arrivalNo: string;
  date: string;
  time: string;
  items: Item[];
  expenses: (TripExpense & { broughtBy: string })[];
  itemTotal: number;
  expenseTotal: number;
};

function ArrivalPurchaseReport({ items }: { items: Item[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const inRange = (date: string) => !!date && (!from || date >= from) && (!to || date <= to);
  const grouped = new Map<string, DeliveryReportGroup>();
  for (const item of items) {
    if (!item.arrivalNo) continue;
    const expenses = item.tripExpenses ?? (num(item.arrivalTravelCost) > 0 ? [{
      id: 'legacy-' + item.id,
      date: item.receivedDate,
      type: 'Other' as const,
      description: 'Purana trip expense',
      amount: num(item.arrivalTravelCost),
    }] : []);
    const selectedItems = inRange(item.receivedDate);
    const selectedExpenses = expenses.filter((expense) => inRange(expense.date));
    if (!selectedItems && !selectedExpenses.length) continue;
    const key = item.arrivalNo;
    const group = grouped.get(key) || {
      key,
      arrivalNo: item.arrivalNo,
      date: selectedItems ? item.receivedDate : selectedExpenses[0]?.date || item.receivedDate,
      time: item.arrivalTime,
      items: [],
      expenses: [],
      itemTotal: 0,
      expenseTotal: 0,
    };
    if (selectedItems) {
      group.items.push(item);
      group.itemTotal += num(item.total);
      if (!group.date || item.receivedDate < group.date) group.date = item.receivedDate;
      if (!group.time && item.arrivalTime) group.time = item.arrivalTime;
    }
    for (const expense of selectedExpenses) {
      group.expenses.push({ ...expense, broughtBy: item.broughtBy });
      group.expenseTotal += num(expense.amount);
    }
    grouped.set(key, group);
  }
  const deliveries = Array.from(grouped.values()).sort(
    (a, b) => b.date.localeCompare(a.date) || b.arrivalNo.localeCompare(a.arrivalNo),
  );
  const itemTotal = deliveries.reduce((sum, delivery) => sum + delivery.itemTotal, 0);
  const expenseTotal = deliveries.reduce((sum, delivery) => sum + delivery.expenseTotal, 0);
  const grandTotal = itemTotal + expenseTotal;

  const exportExcel = () => {
    const escape = (value: string | number) => {
      let text = String(value ?? '');
      if (/^[=+@]/.test(text)) text = "'" + text;
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const rows: (string | number)[][] = [
      ['Date', 'Delivery No.', 'Record Type', 'Time', 'Item / Expense Type', 'Received Qty', 'Online Price / Piece', 'Actual Rate / Piece', 'Item Amount', 'Brought by', 'Expense Details', 'Trip Expense'],
    ];
    for (const delivery of deliveries) {
      delivery.items.forEach((item) => rows.push([
        item.receivedDate,
        delivery.arrivalNo,
        'Purchase',
        item.arrivalTime || delivery.time,
        item.item,
        num(item.qty),
        item.onlineRate > 0 ? num(item.onlineRate) : '',
        num(item.rate),
        num(item.total),
        item.broughtBy,
        '',
        '',
      ]));
      delivery.expenses.forEach((expense) => rows.push([
        expense.date,
        delivery.arrivalNo,
        'Trip Expense',
        '',
        expense.type,
        '',
        '',
        '',
        '',
        expense.broughtBy,
        expense.description,
        num(expense.amount),
      ]));
    }
    rows.push(
      [],
      ['Selected Dates Item Purchase Total', '', '', '', '', '', '', '', itemTotal],
      ['Selected Dates Trip Expense Total', '', '', '', '', '', '', '', '', '', '', expenseTotal],
      ['Grand Total', '', '', '', '', '', '', '', grandTotal],
    );
    saveFile(
      'office-purchase-expense-report-' + today() + '.csv',
      new Blob(['\uFEFF' + rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }),
    );
  };

  const printReport = () => {
    const root = document.documentElement;
    const cleanup = () => root.classList.remove('delivery-report-print');
    root.classList.add('delivery-report-print');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  };

  return (
    <section className="card delivery-report" id="delivery-report-print">
      <header className="card-h">
        <div>
          <h2>Purchase and Trip Expense Report</h2>
          <p className="muted small">Purchases and trip expenses grouped by their dates and delivery numbers</p>
        </div>
        <div className="delivery-report-actions no-print">
          <button type="button" className="btn sm" onClick={exportExcel}>
            <Icon name="dl" /> Excel
          </button>
          <button type="button" className="btn sm" onClick={printReport}>
            <Icon name="print" /> PDF / Print
          </button>
        </div>
      </header>

      <div className="delivery-report-filters no-print">
        <label className="field">
          <span>Start date</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>End date</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) && (
          <button type="button" className="btn sm" onClick={() => { setFrom(''); setTo(''); }}>
            <Icon name="x" /> Clear dates
          </button>
        )}
      </div>

      <div className="sumbar delivery-report-total">
        <span><b>{deliveries.length}</b> deliveries</span>
        <span>Item Purchase Total <b>{inr(itemTotal)}</b></span>
        <span>Trip Expense Total <b>{inr(expenseTotal)}</b></span>
        <span className="sum-tot">Grand Total <strong>{inr(grandTotal)}</strong></span>
      </div>

      {deliveries.length ? (
        deliveries.map((delivery) => (
          <section className="delivery-report-group" key={delivery.key}>
            <header className="delivery-report-heading">
              <h3>{delivery.items.length ? fdate(delivery.date) : 'Expense Date ' + fdate(delivery.date)} · {delivery.arrivalNo}</h3>
              <span>{delivery.time || 'Time not recorded'} · {delivery.items.length} purchase lines · {delivery.expenses.length} expenses</span>
            </header>
            {delivery.items.length > 0 && (
              <>
                <h4>Purchase Details</h4>
                <div className="tscroll">
                  <table className="itable delivery-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="num">Received qty</th>
                        <th className="num">Online Price / Piece</th>
                        <th className="num">Actual Rate</th>
                        <th className="num">Item Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivery.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.item}</td>
                          <td className="num">{num(item.qty)}</td>
                          <td className="num">{item.onlineRate > 0 ? inr(num(item.onlineRate)) : '—'}</td>
                          <td className="num">{inr(num(item.rate))}</td>
                          <td className="num">{inr(num(item.total))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {delivery.expenses.length > 0 && (
              <>
                <h4>Trip Expense Details</h4>
                <div className="tscroll">
                  <table className="itable delivery-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Brought by</th>
                        <th>Expense Type</th>
                        <th>Details</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delivery.expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{fdate(expense.date)}</td>
                          <td>{expense.broughtBy || '—'}</td>
                          <td>{expense.type}</td>
                          <td>{expense.description || '—'}</td>
                          <td className="num">{inr(num(expense.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="delivery-report-subtotal">
              <span>Item Purchase Total <b>{inr(delivery.itemTotal)}</b></span>
              <span>Trip Expense Total <b>{inr(delivery.expenseTotal)}</b></span>
              <span>Grand Total <b>{inr(delivery.itemTotal + delivery.expenseTotal)}</b></span>
            </div>
          </section>
        ))
      ) : (
        <p className="none">No purchase delivery records found for the selected dates.</p>
      )}
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
      const r = m.get(k) || {
        name: k,
        n: 0,
        pcs: 0,
        amt: 0,
      };
      r.n++;
      r.pcs += num(it.qty);
      r.amt += num(it.total);
      m.set(k, r);
    }
    return Array.from(m.values());
  };

  const months = group(
    (it) => it.orderDate.slice(0, 7) || '—',
  )
    .sort((a, b) => b.name.localeCompare(a.name))
    .map((o) => ({ ...o, name: mlabel(o.name) }));

  const vendors = group(
    (it) => it.vendor || 'Not specified',
  ).sort((a, b) => b.amt - a.amt);

  const cats = group(
    (it) => it.category || 'Not specified',
  ).sort((a, b) => b.amt - a.amt);

  const dm = new Map<string, BRow>();

  for (const it of list) {
    for (const is of it.issues) {
      const k = is.dept || 'Department not specified';
      const r = dm.get(k) || {
        name: k,
        n: 0,
        pcs: 0,
        amt: 0,
      };
      r.pcs += num(is.qty);
      r.amt += num(is.qty) * num(it.rate);
      dm.set(k, r);
    }
  }

  const depts = Array.from(dm.values())
    .sort((a, b) => b.amt - a.amt);

  let myP = 0;
  let myB = 0;
  let nP = 0;
  let nB = 0;
  let nD = 0;

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
        {
          name: 'Paid by me',
          n: nP,
          pcs: 0,
          amt: myP,
        },
        {
          name: 'Reimbursed',
          n: nB,
          pcs: 0,
          amt: myB,
        },
        {
          name: 'Outstanding',
          n: nD,
          pcs: 0,
          amt: Math.max(0, round2(myP - myB)),
        },
      ]
    : [];

  const dueRows: BRow[] = list
    .map((it) => {
      const m = myPay(it);
      return m.due > 0
        ? {
            name:
              it.item +
              (it.orderDate ? ' · ' + fdate(it.orderDate) : ''),
            n: 1,
            pcs: num(it.qty),
            amt: m.due,
          }
        : null;
    })
    .filter((r): r is BRow => !!r)
    .sort((a, b) => b.amt - a.amt);

  return (
    <>
      <PageHead
        title="Reports"
        sub="Expenses by month, supplier, item, and department"
        csv="summary"
        tab="summary"
      />

      {!items.length ? (
        <EmptyState onNew={newEntry} />
      ) : (
        <>
          <FiltersBar tab="summary" />

          <div className="sumbar">
            <span>
              <b>{list.length}</b> entries · total expenses
            </span>
            {filtersActive(f, 'summary') && (
              <span className="muted">Filters applied</span>
            )}
            <span className="sum-tot">
              <strong>{inr(sumTotal(list))}</strong>
            </span>
          </div>

          <div className="sgrid">
            <Block
              title="By month"
              note="Expenses grouped by order month"
              rows={months}
              cols={['Month', 'Entries']}
              countKey="n"
              tone="gold"
            />
            <Block
              title="By supplier"
              note="Purchases from each supplier or site"
              rows={vendors}
              cols={['Supplier / site', 'Entries']}
              countKey="n"
            />
            <Block
              title="By category"
              note="Expenses grouped by category"
              rows={cats}
              cols={['Category', 'Pcs']}
              countKey="pcs"
            />
            <Block
              title="By department"
              note="Value of items issued to each department"
              rows={depts}
              cols={['Department', 'Pcs']}
              countKey="pcs"
            />
            <Block
              title="Reimbursements"
              note="Track amounts paid personally, reimbursed, and outstanding"
              rows={myRows}
              cols={['Status', 'Entries']}
              countKey="n"
              tone="gold"
            />
            <Block
              title="Outstanding reimbursements"
              note="Entries that still need to be reimbursed"
              rows={dueRows}
              cols={['Item', 'Pcs']}
              countKey="pcs"
              tone="red"
            />
          </div>
          <ArrivalPurchaseReport items={items} />
        </>
      )}
    </>
  );
}

/* ====================== Settings ====================== */

export function SettingsPage() {
  return (
    <>
      <PageHead
        title="Settings"
        sub="Manage your account, team, AI, and Google Sheets"
        print={false}
        add={false}
      />
      <SettingsSections />
    </>
  );
}

/* ====================== Demand List ====================== */

export function DemandPage() {
  return (
    <>
      <PageHead
        title="Demand List / Orders"
        sub="Manage item requests, share order slips, and receive items into stock"
        print={false}
        add={false}
      />
      <DemandListLazy />
    </>
  );
}
