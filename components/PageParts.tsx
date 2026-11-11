'use client';

import { useState, type ChangeEvent, type ReactNode } from 'react';
import { FSHOW, PAY_LABEL, STATUS_LABEL, STOCK_LABEL, allIssues, distinct, fdate, filterSummary, filtersActive, mlabel, today } from '@/lib/calc';
import type { Filters, Tab } from '@/lib/types';
import { Icon } from './Icon';
import { useReg } from './context';

/* ---------- Shared page heading, export, print, and add actions ---------- */
export function PageHead({
  title,
  sub,
  className,
  csv,
  tab,
  print = true,
  add = true,
  children,
}: {
  title: string;
  sub?: ReactNode;
  className?: string;
  csv?: Tab;
  tab?: Tab;
  print?: boolean;
  add?: boolean;
  children?: ReactNode;
}) {
  const { me, items, f, exportCsv, printPage, newEntry } = useReg();
  const fs = tab ? filterSummary(f, tab) : '';
  return (
    <header className={'phead' + (className ? ' ' + className : '')}>
      <div className="phead-t">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="phead-a">
        {children}
        {csv && items.length > 0 && (
          <button className="btn" type="button" id="csvBtn" onClick={() => exportCsv(csv)} title="Export this list as a CSV file">
            <Icon name="dl" />
            <span className="bl">Excel</span>
          </button>
        )}
        {print && (
          <button className="btn" type="button" id="printBtn" onClick={printPage} title="Print this page or save it as a PDF">
            <Icon name="print" />
            <span className="bl">Print</span>
          </button>
        )}
        {add && (
          <button className="btn primary" type="button" id="newBtn" onClick={newEntry}>
            <Icon name="plus" />
            Add item
          </button>
        )}
      </div>
      {print && (
        <div className="print-head" aria-hidden="true">
          <div className="ph-brand">
            <b>Office Supplies Register</b>
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
      <h2>Your register is empty</h2>
      <p>
        Track office purchases such as hard drives, SDI or HDMI cables, and computer supplies. Add a receipt photo and AI can fill in the form.
        Keep order and delivery dates, supplier, cost, reimbursements, and issued items together in one place.
      </p>
      <button className="btn primary" type="button" onClick={onNew}>
        <Icon name="plus" />
        Add your first entry
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
      <p>{msg || 'No results found for these filters.'}</p>
      <button className="btn sm" type="button" onClick={onClear}>
        Clear filters
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
          <input id="q" type="search" placeholder="Search items, suppliers, people, serial numbers…" aria-label="Search" autoComplete="off" value={f.q} onChange={upd('q')} />
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
        <Select id="fMonth" label="Month" value={f.month} onChange={upd('month')} placeholder="All months" options={months.map((m) => ({ value: m, label: mlabel(m) }))} />
      )}
      {show('vendor') && (
        <Select id="fVendor" label="Supplier" value={f.vendor} onChange={upd('vendor')} placeholder="All suppliers / sites" options={vendors.map((v) => ({ value: v, label: v }))} />
      )}
      {show('status') && <Select id="fStatus" label="Status" value={f.status} onChange={upd('status')} placeholder="All statuses" options={asOpts(STATUS_LABEL)} />}
      {show('pay') && <Select id="fPay" label="Reimbursement" value={f.pay} onChange={upd('pay')} placeholder="All reimbursement statuses" options={asOpts(PAY_LABEL)} />}
      {show('stock') && <Select id="fStock" label="Stock" value={f.stock} onChange={upd('stock')} placeholder="All stock" options={asOpts(STOCK_LABEL)} />}
      {show('dept') && (
        <Select id="fDept" label="Department" value={f.dept} onChange={upd('dept')} placeholder="All departments" options={depts.map((d) => ({ value: d, label: d }))} />
      )}
      {show('sort') && (
        <select id="fSort" aria-label="Sort order" value={f.sort} onChange={upd('sort')}>
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="costly">Highest cost first</option>
          <option value="name">Name (A–Z)</option>
        </select>
      )}
      {filtersActive(f, tab) && (
        <button className="btn sm clearf" type="button" onClick={() => setF((p) => ({ ...p, q: '', month: '', vendor: '', status: '', pay: '', stock: '', dept: '' }))}>
          <Icon name="x" />
          Clear filters
        </button>
      )}
    </div>
  );
}
