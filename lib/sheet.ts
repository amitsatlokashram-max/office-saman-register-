// Google Sheet me kaunsi line kaise likhi jaye. Script (google-apps-script/Code.gs) bas ye lines likh deta hai.

import { MOVE, billExtOf, issuedQty, moveSum, myPay, num, remaining, round2, today } from './calc';
import type { Bill, Item } from './types';

/** Ek cell: text, number, tareekh {d:'YYYY-MM-DD'} ya links {l:[[text,url],...]} */
export type Cell = string | number | { d: string } | { l: [string, string][] };

const TEXT = '@';
const MONEY = '₹#,##0';
const INT = '0';
const DATE = 'dd-mm-yyyy';

export const SAMAN_SHEET = 'Saman';
export const LOG_SHEET = 'Kisko diya';

export const SAMAN_COLS: [string, string][] = [
  ['Saman', TEXT],
  ['Category', TEXT],
  ['Pcs', INT],
  ['Rate (₹)', MONEY],
  ['Total (₹)', MONEY],
  ['Kab mangaya', DATE],
  ['Kab pahuncha', DATE],
  ['Kahan se', TEXT],
  ['Kisne laya', TEXT],
  ['Bill / Order no.', TEXT],
  ['Maine diye (₹)', MONEY],
  ['Wapas mile (₹)', MONEY],
  ['Mere baaki (₹)', MONEY],
  ['Diya (pcs)', INT],
  ['Bacha (pcs)', INT],
  ['Kisko diya', TEXT],
  ['Serial no.', TEXT],
  ['Warranty tak', DATE],
  ['Note', TEXT],
  ['Bill (Drive)', TEXT],
  ['Entry kisne ki', TEXT],
  ['Aakhri badlav', TEXT],
  ['ID', TEXT],
];

export const LOG_COLS: [string, string][] = [
  ['Kab', DATE],
  ['Saman', TEXT],
  ['Kya hua', TEXT],
  ['Pcs', INT],
  ['Kisko diya', TEXT],
  ['Department', TEXT],
  ['Keemat (₹)', MONEY],
  ['Note', TEXT],
  ['Entry ID', TEXT],
  ['ID', TEXT],
];

const d = (s: string): Cell => (s ? { d: s } : '');

function stamp(iso: string): string {
  const t = iso ? new Date(iso) : null;
  if (!t || isNaN(t.getTime())) return '';
  return t.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function itemRow(it: Item): Cell[] {
  const mp = myPay(it);
  const who = it.issues.map((i) => [i.person, i.dept].filter(Boolean).join(' / ') + ': ' + num(i.qty)).join('; ');
  const links: [string, string][] = it.bills
    .filter((b) => b.driveUrl)
    .map((b, i, arr) => [arr.length > 1 ? 'Bill ' + (i + 1) : 'Bill', b.driveUrl]);
  return [
    it.item,
    it.category,
    num(it.qty),
    num(it.rate),
    num(it.total),
    d(it.orderDate),
    d(it.receivedDate),
    it.vendor,
    it.broughtBy,
    it.billNo,
    mp.mine ? mp.paid : '',
    mp.mine ? mp.back : '',
    mp.mine ? mp.due : '',
    issuedQty(it),
    Math.max(remaining(it), 0),
    who,
    it.serials.replace(/\s*\n\s*/g, ', '),
    d(it.warrantyTill),
    it.note,
    links.length ? { l: links } : '',
    it.addedByName,
    stamp(it.updatedAt || new Date().toISOString()),
    it.id,
  ];
}

export function logRows(it: Item): Cell[][] {
  const rate = num(it.rate);
  const rows: Cell[][] = it.issues.map((i) => [
    d(i.date), it.item, 'Diya', num(i.qty), i.person, i.dept, round2(num(i.qty) * rate), i.note, it.id, i.id,
  ]);
  for (const m of it.moves) {
    rows.push([d(m.date), it.item, MOVE[m.type], m.type === 'back' ? num(m.qty) : -num(m.qty), '', '', round2(num(m.qty) * rate), m.note, it.id, m.id]);
  }
  return rows.sort((a, b) => String((a[0] as { d?: string }).d ?? '').localeCompare(String((b[0] as { d?: string }).d ?? '')));
}

const clean = (s: string) => s.replace(/[\\/:*?"<>|#\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** Drive me file ka naam: "2026-10-13 - INV-123 - Amazon (1).jpg" */
export function billFileName(it: Pick<Item, 'orderDate' | 'billNo' | 'item' | 'vendor'>, idx: number, count: number, bill: Pick<Bill, 'type' | 'name'>): string {
  const date = it.orderDate || today();
  const main = clean(it.billNo || it.item || bill.name.replace(/\.[^.]+$/, '') || 'bill');
  const vendor = clean(it.vendor);
  return date + ' - ' + main + (vendor ? ' - ' + vendor : '') + (count > 1 ? ' (' + (idx + 1) + ')' : '') + '.' + billExtOf(bill.type);
}

export const billMonth = (it: Pick<Item, 'orderDate'>) => (it.orderDate || today()).slice(0, 7);

/** Script ko ek entry ki saari jaankari ek saath. */
export function upsertPayload(it: Item) {
  const named = it.bills.filter((b) => b.driveId);
  return {
    action: 'upsert' as const,
    id: it.id,
    saman: { name: SAMAN_SHEET, headers: SAMAN_COLS.map((c) => c[0]), formats: SAMAN_COLS.map((c) => c[1]), row: itemRow(it) },
    log: { name: LOG_SHEET, headers: LOG_COLS.map((c) => c[0]), formats: LOG_COLS.map((c) => c[1]), rows: logRows(it) },
    bills: named.map((b, i) => ({ driveId: b.driveId, name: billFileName(it, i, named.length, b), month: billMonth(it) })),
  };
}

export function replaceAllPayload(items: Item[]) {
  const sorted = items.slice().sort((a, b) => (a.orderDate + a.createdAt).localeCompare(b.orderDate + b.createdAt));
  return {
    action: 'replaceAll' as const,
    saman: { name: SAMAN_SHEET, headers: SAMAN_COLS.map((c) => c[0]), formats: SAMAN_COLS.map((c) => c[1]), rows: sorted.map(itemRow) },
    log: { name: LOG_SHEET, headers: LOG_COLS.map((c) => c[0]), formats: LOG_COLS.map((c) => c[1]), rows: sorted.flatMap(logRows) },
  };
}
