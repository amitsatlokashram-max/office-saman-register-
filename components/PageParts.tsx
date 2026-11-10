'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';
import { FSHOW, PAY_LABEL, STATUS_LABEL, STOCK_LABEL, allIssues, distinct, fdate, filterSummary, filtersActive, mlabel, today } from '@/lib/calc';
import type { Filters, Tab } from '@/lib/types';
import { Icon } from './Icon';
import { useReg } from './context';

/* ---------- har page ka sir: naam, Excel, Print, Naya saman ---------- */
export function PageHead({
  title,
  sub,
  csv,
  tab,
  print = true,
  add = true,
  children,
}: {
  title: string;
  sub?: ReactNode;
  csv?: Tab;
  tab?: Tab;
  print?: boolean;
  add?: boolean;
  children?: ReactNode;
}) {
  const { me, items, f, exportCsv, printPage, newEntry } = useReg();
  const fs = tab ? filterSummary(f, tab) : '';
  return (
    <header className="phead">
      <div className="phead-t">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="phead-a">
        {children}
        {csv && items.length > 0 && (
          <button className="btn" type="button" id="csvBtn" onClick={() => exportCsv(csv)} title="Ye list CSV file me nikalo (Excel me khulegi)">
            <Icon name="dl" />
            <span className="bl">Excel</span>
          </button>
        )}
        {print && (
          <button className="btn" type="button" id="printBtn" onClick={printPage} title="Ye page print karo ya PDF banao">
            <Icon name="print" />
            <span className="bl">Print</span>
          </button>
        )}
        {add && (
          <button className="btn primary" type="button" id="newBtn" onClick={newEntry}>
            <Icon name="plus" />
            Naya saman
          </button>
        )}
      </div>
      {print && (
        <div className="print-head" aria-hidden="true">
          <div className="ph-brand">
            <b>Office Saman Register</b>
            <span>{title}</span>
          </div>
          <div className="ph-meta">
            <span>
              Print: {fdate(today())}
              {me?.name ? ', ' + me.name : ''}
            </span>
            {fs && <span>Filter: {fs}</span>}
          </div>
        </div>
      )}
    </header>
  );
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="empty">
      <div className="art">
        <Icon name="box" />
      </div>
      <h2>Register abhi khaali hai</h2>
      <p>
        Office ke liye jo bhi mangao, hard disk, SDI ya HDMI cable, computer ka saman, uski entry yahan karo. Bill ki photo lagao to AI form khud
        bhar dega. Kab mangaya, kab aaya, kisne laya, kitne ka aaya, aapke paise aur kisko diya, sab ek jagah rahega.
      </p>
      <button className="btn primary" type="button" onClick={onNew}>
        <Icon name="plus" />
        Pehli entry jodo
      </button>
    </div>
  );
}

export function NoRes({ msg, onClear }: { msg?: string; onClear: () => void }) {
  return (
    <div className="nores">
      <span className="nores-ic">
        <Icon name="search" />
      </span>
      <p>{msg || 'Is filter me kuch nahi mila.'}</p>
      <button className="btn sm" type="button" onClick={onClear}>
        Filter hatao
      </button>
    </div>
  );
}

/* ---------- filters ---------- */
function Select({
  id,
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const opts = value && !options.some((o) => o.value === value) ? options.concat([{ value, label: value }]) : options;
  return (
    <select id={id} aria-label={label} value={value} onChange={onChange} className={value ? 'set' : undefined}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const asOpts = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

export function FiltersBar({ tab }: { tab: Tab }) {
  const { f, setF, items } = useReg();
  const [open, setOpen] = useState(false);
  const use = FSHOW[tab];
  const nSel = use.filter((k) => k !== 'q').length;
  const nActive = use.filter((k) => k !== 'q' && k !== 'sort' && !!f[k]).length;
  const toggle = use.includes('q') && nSel > 2;
  const show = (k: keyof Filters) => use.includes(k);
  const upd = (k: keyof Filters) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setF((p) => ({ ...p, [k]: val }));
  };
  const iss = allIssues(items);
  const mk = today().slice(0, 7);
  const months = distinct(items.map((i) => i.orderDate.slice(0, 7)).concat(iss.map((i) => i.date.slice(0, 7))))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
    .sort()
    .reverse();
  if (!months.includes(mk)) months.unshift(mk);
  const vendors = distinct(items.map((i) => i.vendor)).sort();
  const depts = distinct(iss.map((i) => i.dept)).sort();

  return (
    <div className={'filters' + (toggle ? ' has-toggle' : '') + (open ? ' open' : '')} role="search">
      {show('q') && (
        <div className="search">
          <Icon name="search" />
          <input id="q" type="search" placeholder="Dhundo: saman, dukaan, banda, serial no.…" aria-label="Dhundo" autoComplete="off" value={f.q} onChange={upd('q')} />
        </div>
      )}
      {toggle && (
        <button type="button" className="btn ftoggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="filter" />
          Filter
          {nActive > 0 && <span className="fcount">{nActive}</span>}
        </button>
      )}
      {show('month') && (
        <Select id="fMonth" label="Mahina" value={f.month} onChange={upd('month')} placeholder="Har mahina" options={months.map((m) => ({ value: m, label: mlabel(m) }))} />
      )}
      {show('vendor') && (
        <Select id="fVendor" label="Kahan se mangaya" value={f.vendor} onChange={upd('vendor')} placeholder="Har dukaan / site" options={vendors.map((v) => ({ value: v, label: v }))} />
      )}
      {show('status') && <Select id="fStatus" label="Status" value={f.status} onChange={upd('status')} placeholder="Har status" options={asOpts(STATUS_LABEL)} />}
      {show('pay') && <Select id="fPay" label="Mera paisa" value={f.pay} onChange={upd('pay')} placeholder="Mera paisa: sab" options={asOpts(PAY_LABEL)} />}
      {show('stock') && <Select id="fStock" label="Stock" value={f.stock} onChange={upd('stock')} placeholder="Saara saman" options={asOpts(STOCK_LABEL)} />}
      {show('dept') && (
        <Select id="fDept" label="Department" value={f.dept} onChange={upd('dept')} placeholder="Har department" options={depts.map((d) => ({ value: d, label: d }))} />
      )}
      {show('sort') && (
        <select id="fSort" aria-label="Kram" value={f.sort} onChange={upd('sort')}>
          <option value="new">Naya pehle</option>
          <option value="old">Purana pehle</option>
          <option value="costly">Mehenga pehle</option>
          <option value="name">Naam (A-Z)</option>
        </select>
      )}
      {filtersActive(f, tab) && (
        <button className="btn sm clearf" type="button" onClick={() => setF((p) => ({ ...p, q: '', month: '', vendor: '', status: '', pay: '', stock: '', dept: '' }))}>
          <Icon name="x" />
          Filter hatao
        </button>
      )}
    </div>
  );
}
