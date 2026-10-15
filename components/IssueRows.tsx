'use client';

import type { Dispatch, SetStateAction } from 'react';
import { num, uid } from '@/lib/calc';
import { Icon } from './Icon';

/** "Kisko diya" ki ek line: ek banda, uska department, kitne piece. */
export type IRow = { key: string; person: string; dept: string; qty: string };

export const newRow = (qty = '1', dept = ''): IRow => ({ key: uid(), person: '', dept, qty });

const pcs = (r: IRow) => Math.max(0, Math.round(num(r.qty)));
const used = (rows: IRow[]) => rows.filter((r) => r.person.trim() || r.dept.trim());
export const rowsTotal = (rows: IRow[]) => (used(rows).length ? used(rows) : rows).reduce((s, r) => s + pcs(r), 0);

export type RowsCheck =
  | { ok: true; rows: { person: string; dept: string; qty: number }[]; total: number }
  | { ok: false; msg: string; key?: string };

/** Khaali lines chhod do. Har line me banda ya department, kam se kam 1 piece, aur kul piece max se zyada nahi. */
export function checkRows(rows: IRow[], max: number): RowsCheck {
  const list = used(rows);
  if (!list.length) return { ok: false, msg: 'Kisko diya ya department, kam se kam ek likho.', key: rows[0]?.key };
  for (const r of list) {
    if (pcs(r) < 1) return { ok: false, msg: (r.person.trim() || r.dept.trim()) + ': kam se kam 1 piece likho.', key: r.key };
  }
  const total = list.reduce((s, r) => s + pcs(r), 0);
  if (total > max) return { ok: false, msg: 'Kul ' + total + ' pcs ho gaye, par sirf ' + max + ' pcs hai.' };
  return { ok: true, rows: list.map((r) => ({ person: r.person.trim(), dept: r.dept.trim(), qty: pcs(r) })), total };
}

/** Kai bande ek saath: har bande ki alag line. */
export function IssueRowsEditor({
  rows,
  setRows,
  max,
  idPrefix,
  badKey,
}: {
  rows: IRow[];
  setRows: Dispatch<SetStateAction<IRow[]>>;
  max: number;
  idPrefix: string;
  badKey?: string;
}) {
  const total = rowsTotal(rows);
  const upd = (key: string, patch: Partial<IRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () =>
    setRows((rs) => {
      const left = max - rowsTotal(rs);
      const last = rs[rs.length - 1];
      return [...rs, newRow(String(left > 0 ? left : 1), last ? last.dept : '')];
    });
  const del = (key: string) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));

  return (
    <div className="irows">
      <div className="irow ihead" aria-hidden="true">
        <span>Kisko diya (banda)</span>
        <span>Department / kahan use hoga</span>
        <span>Pcs</span>
        <span />
      </div>
      {rows.map((r, i) => {
        const n = i + 1;
        const bad = badKey === r.key ? ' bad' : '';
        return (
          <div className={'irow' + bad} key={r.key} data-row={n}>
            <input
              id={i === 0 ? idPrefix + '-person' : undefined}
              aria-label={'Banda ' + n}
              list="dl-person"
              placeholder="Banda ka naam"
              autoComplete="off"
              value={r.person}
              onChange={(e) => upd(r.key, { person: e.target.value })}
            />
            <input
              id={i === 0 ? idPrefix + '-dept' : undefined}
              aria-label={'Department ' + n}
              list="dl-dept"
              placeholder="Live Setup, Office…"
              autoComplete="off"
              value={r.dept}
              onChange={(e) => upd(r.key, { dept: e.target.value })}
            />
            <input
              id={i === 0 ? idPrefix + '-qty' : undefined}
              aria-label={'Piece ' + n}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={r.qty}
              onChange={(e) => upd(r.key, { qty: e.target.value })}
            />
            <button type="button" className="iconbtn sm" onClick={() => del(r.key)} disabled={rows.length === 1} aria-label={'Line ' + n + ' hatao'} title="Ye line hatao">
              <Icon name="x" />
            </button>
          </div>
        );
      })}
      <div className="irow-foot">
        <button type="button" className="btn sm" onClick={add} id={idPrefix + '-add'}>
          <Icon name="plus" />
          Aur banda jodo
        </button>
        <span className={total > max ? 'err' : 'hint'} id={idPrefix + '-total'}>
          Kul {total} pcs · {max} me se
        </span>
      </div>
    </div>
  );
}
