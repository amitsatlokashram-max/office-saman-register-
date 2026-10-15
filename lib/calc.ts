import type { Filters, IssueRow, Item, Me, MinMap, MoveRow, MoveType, StockGroup, Tab } from './types';

/* ---------- constants ---------- */
export const FSHOW: Record<Tab, (keyof Filters)[]> = {
  items: ['q', 'month', 'vendor', 'status', 'pay', 'sort'],
  stock: ['q', 'stock'],
  issues: ['q', 'month', 'dept'],
  summary: ['month', 'vendor'],
};

export const EMPTY_FILTERS: Filters = { q: '', month: '', vendor: '', status: '', pay: '', stock: '', dept: '', sort: 'new' };

export const DEF = {
  category: ['Hard Disk', 'SSD', 'Pen Drive', 'SDI Cable', 'HDMI Cable', 'Computer Parts', 'Live Setup Saman', 'Other'],
  vendor: ['Amazon', 'Flipkart', 'Nehru Place', 'Local Dukaan'],
  brought: ['Kapil Das', 'Courier / Delivery'],
  dept: ['Live Setup', 'Computer', 'Office'],
};

export const MOVE: Record<MoveType, string> = {
  back: 'Wapas aaya (stock me)',
  damaged: 'Kharab ho gaya',
  vendor: 'Dukaan ko return',
};

/* ---------- numbers, dates, text ---------- */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const inr = (n: number) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const validDate = (d: unknown): d is string => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ''));
export function fdate(d?: string): string {
  if (!d) return '';
  const p = d.split('-').map(Number);
  if (!p[0] || !p[1] || !p[2]) return d;
  return p[2] + ' ' + MON[p[1] - 1] + ' ' + p[0];
}
export function ddmmyyyy(d?: string): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? p[2] + '-' + p[1] + '-' + p[0] : d;
}
export function mlabel(k: string): string {
  const p = k.split('-').map(Number);
  return p[0] && p[1] ? MON[p[1] - 1] + ' ' + p[0] : 'Tareekh nahi';
}
const z2 = (n: number) => String(n).padStart(2, '0');
export function today(): string {
  const t = new Date();
  return t.getFullYear() + '-' + z2(t.getMonth() + 1) + '-' + z2(t.getDate());
}
export function addYears(d: string, y: number): string {
  const p = d.split('-').map(Number);
  const t = new Date(p[0] + y, p[1] - 1, p[2]);
  return t.getFullYear() + '-' + z2(t.getMonth() + 1) + '-' + z2(t.getDate());
}
export function daysTo(d: string): number | null {
  if (!validDate(d)) return null;
  const p = d.split('-').map(Number);
  const t = new Date();
  return Math.round((Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export const mkey = (s: string) => encodeURIComponent(norm(s));
export function distinct(vals: (string | undefined | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of vals) {
    const v = String(raw ?? '').trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}
export function billExtOf(type: string): string {
  if (type === 'application/pdf') return 'pdf';
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  return 'jpg';
}
export function initials(s?: string): string {
  const p = String(s || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

/* ---------- one entry ---------- */
export const issuedQty = (it: Item) => it.issues.reduce((s, i) => s + num(i.qty), 0);
export const moveSum = (it: Item, type: MoveType) => it.moves.reduce((s, m) => s + (m.type === type ? num(m.qty) : 0), 0);
export const remaining = (it: Item) =>
  num(it.qty) - issuedQty(it) + moveSum(it, 'back') - moveSum(it, 'damaged') - moveSum(it, 'vendor');
export const sumTotal = (list: Item[]) => list.reduce((s, i) => s + num(i.total), 0);

export type MyPay = { mine: boolean; paid: number; back: number; due: number };
export function myPay(it: Pick<Item, 'iPaid' | 'myPaid' | 'myBack'>): MyPay {
  if (!it.iPaid) return { mine: false, paid: 0, back: 0, due: 0 };
  const paid = round2(num(it.myPaid));
  const back = Math.min(round2(num(it.myBack)), paid);
  return { mine: true, paid, back, due: Math.max(0, round2(paid - back)) };
}

export type Status = { key: 'pending' | 'stock' | 'done'; label: string; cls: string };
export function status(it: Item): Status {
  if (!it.receivedDate) return { key: 'pending', label: 'Nahi aaya', cls: 'pending' };
  const r = remaining(it);
  if (r > 0) return { key: 'stock', label: 'Stock: ' + r, cls: 'stock' };
  if (issuedQty(it) - moveSum(it, 'back') > 0) return { key: 'done', label: 'Sab de diya', cls: 'done' };
  return { key: 'done', label: 'Stock khatam', cls: 'out' };
}

export type Warranty = { key: 'over' | 'soon' | 'ok'; label: string; cls: string; n: number } | null;
export function warrantyState(it: Item): Warranty {
  const n = daysTo(it.warrantyTill);
  if (n === null) return null;
  if (n < 0) return { key: 'over', label: 'Warranty khatam', cls: 'out', n };
  if (n <= 30) return { key: 'soon', label: 'Warranty ' + n + ' din baaki', cls: 'warn', n };
  return { key: 'ok', label: 'Warranty ' + fdate(it.warrantyTill) + ' tak', cls: 'ok', n };
}

export function blankItem(id: string, me: Me | null): Item {
  return {
    id,
    item: '', category: '', qty: 1, rate: 0, total: 0,
    orderDate: today(), receivedDate: '', vendor: '', broughtBy: '', billNo: '', note: '',
    serials: '', warrantyTill: '',
    iPaid: false, myPaid: 0, myBack: 0, myBackDate: '',
    bills: [], issues: [], moves: [],
    addedBy: me ? me.uid : '', addedByName: me ? me.name : '',
    updatedBy: '', updatedByName: '',
    createdAt: new Date().toISOString(), updatedAt: '',
  };
}

/** Firestore se aaya data, jisme kuch fields na ho to bhi app na toote. */
export function normalizeItem(id: string, d: Record<string, unknown>): Item {
  const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
  const arr = (k: string) =>
    Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
  const ss = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const mt = (t: string): MoveType => (t === 'back' || t === 'vendor' ? t : 'damaged');
  return {
    id,
    item: s('item'), category: s('category'), qty: num(d.qty), rate: num(d.rate), total: num(d.total),
    orderDate: s('orderDate'), receivedDate: s('receivedDate'), vendor: s('vendor'), broughtBy: s('broughtBy'),
    billNo: s('billNo'), note: s('note'), serials: s('serials'), warrantyTill: s('warrantyTill'),
    iPaid: d.iPaid === true, myPaid: num(d.myPaid), myBack: num(d.myBack), myBackDate: s('myBackDate'),
    bills: arr('bills')
      .map((b) => ({
        id: ss(b, 'id'), name: ss(b, 'name') || 'bill', type: ss(b, 'type'), size: num(b.size),
        driveId: ss(b, 'driveId'), driveUrl: ss(b, 'driveUrl'),
      }))
      .filter((b) => b.id),
    issues: arr('issues').map((i, n) => ({
      id: ss(i, 'id') || 'i' + n, date: ss(i, 'date'), qty: num(i.qty), person: ss(i, 'person'), dept: ss(i, 'dept'),
      note: ss(i, 'note'), by: ss(i, 'by'), byName: ss(i, 'byName'),
    })),
    moves: arr('moves').map((m, n) => ({
      id: ss(m, 'id') || 'm' + n, date: ss(m, 'date'), qty: num(m.qty), type: mt(ss(m, 'type')), note: ss(m, 'note'), by: ss(m, 'by'),
    })),
    addedBy: s('addedBy'), addedByName: s('addedByName'), updatedBy: s('updatedBy'), updatedByName: s('updatedByName'),
    createdAt: s('createdAt'), updatedAt: s('updatedAt'),
  };
}

/* ---------- lists ---------- */
export function stockGroups(items: Item[], minMap: MinMap): StockGroup[] {
  type Base = Omit<StockGroup, 'min' | 'low' | 'st'>;
  const m: Record<string, Base> = {};
  const order: string[] = [];
  for (const it of items) {
    const k = mkey(it.item);
    if (!k) continue;
    if (!m[k]) {
      m[k] = { key: k, name: it.item, category: it.category, aaya: 0, rasta: 0, diya: 0, wapas: 0, kharab: 0, bacha: 0, entries: 0, last: '' };
      order.push(k);
    }
    const g = m[k];
    g.entries++;
    if (it.orderDate >= g.last) {
      g.last = it.orderDate;
      g.name = it.item;
      if (it.category) g.category = it.category;
    }
    if (it.receivedDate) {
      g.aaya += num(it.qty);
      g.bacha += Math.max(remaining(it), 0);
    } else g.rasta += num(it.qty);
    g.diya += issuedQty(it);
    g.wapas += moveSum(it, 'back');
    g.kharab += moveSum(it, 'damaged') + moveSum(it, 'vendor');
  }
  return order.map((k) => {
    const g = m[k];
    const min = num(minMap[k]);
    const low = min > 0 && g.bacha <= min;
    const st = low
      ? { cls: 'low', label: 'Kam hai' }
      : g.aaya > 0 && g.bacha === 0
        ? { cls: 'out', label: 'Khatam' }
        : g.aaya === 0
          ? { cls: 'pending', label: 'Aana baaki' }
          : { cls: 'stock', label: 'Theek hai' };
    return { ...g, min, low, st };
  });
}

function matchQ(it: Item, q: string): boolean {
  const hay = [it.item, it.category, it.vendor, it.broughtBy, it.billNo, it.note, it.serials, it.addedByName]
    .concat(it.issues.flatMap((i) => [i.person, i.dept, i.note]))
    .concat(it.moves.map((mv) => mv.note))
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function filteredItems(items: Item[], f: Filters, mode: Tab): Item[] {
  const use = FSHOW[mode];
  let a = items.slice();
  const q = f.q.trim().toLowerCase();
  if (use.includes('q') && q) a = a.filter((it) => matchQ(it, q));
  if (use.includes('month') && f.month) a = a.filter((it) => it.orderDate.startsWith(f.month));
  if (use.includes('vendor') && f.vendor) a = a.filter((it) => it.vendor === f.vendor);
  if (use.includes('status') && f.status) {
    if (f.status === 'warranty') a = a.filter((it) => { const w = warrantyState(it); return !!w && (w.key === 'soon' || w.key === 'over'); });
    else if (f.status === 'nobill') a = a.filter((it) => !it.bills.length);
    else a = a.filter((it) => status(it).key === f.status);
  }
  if (use.includes('pay') && f.pay) {
    a = a.filter((it) => {
      const m = myPay(it);
      if (f.pay === 'baaki') return m.due > 0;
      if (f.pay === 'mine') return m.mine;
      if (f.pay === 'back') return m.mine && m.due === 0;
      return true;
    });
  }
  const key = (it: Item) => it.orderDate + '|' + it.createdAt;
  a.sort((x, y) => {
    if (f.sort === 'old') return key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0;
    if (f.sort === 'costly') return num(y.total) - num(x.total);
    if (f.sort === 'name') return x.item.localeCompare(y.item);
    return key(x) < key(y) ? 1 : key(x) > key(y) ? -1 : 0;
  });
  return a;
}

/** Entry number: sabse purani entry #001. */
export function regNos(items: Item[]): Record<string, number> {
  const m: Record<string, number> = {};
  items
    .slice()
    .sort((x, y) => {
      const kx = (x.orderDate || '9') + '|' + x.createdAt;
      const ky = (y.orderDate || '9') + '|' + y.createdAt;
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    })
    .forEach((it, i) => { m[it.id] = i + 1; });
  return m;
}

export function allIssues(items: Item[]): IssueRow[] {
  return items.flatMap((it) =>
    it.issues.map((is) => ({
      id: is.id, date: is.date, qty: num(is.qty), person: is.person, dept: is.dept, note: is.note,
      itemId: it.id, itemName: it.item, rate: num(it.rate),
    })),
  );
}

export function allMoves(items: Item[]): MoveRow[] {
  return items.flatMap((it) =>
    it.moves.map((mv) => ({
      id: mv.id, date: mv.date, qty: num(mv.qty), type: mv.type, note: mv.note,
      itemId: it.id, itemName: it.item, rate: num(it.rate),
    })),
  );
}

export function filterLog<T extends { date: string; note: string; itemName: string; person?: string; dept?: string }>(
  rows: T[],
  f: Filters,
): T[] {
  let a = rows.slice();
  const q = f.q.trim().toLowerCase();
  if (q) a = a.filter((i) => [i.person, i.dept, i.note, i.itemName].join(' ').toLowerCase().includes(q));
  if (f.month) a = a.filter((i) => i.date.startsWith(f.month));
  a.sort((x, y) => y.date.localeCompare(x.date));
  return a;
}

export function filteredIssues(items: Item[], f: Filters): IssueRow[] {
  const a = filterLog(allIssues(items), f);
  return f.dept ? a.filter((i) => i.dept === f.dept) : a;
}

export const filtersActive = (f: Filters, tab: Tab) => FSHOW[tab].some((k) => k !== 'sort' && !!f[k].trim());

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Nahi aaya',
  stock: 'Stock me hai',
  done: 'Sab de diya / khatam',
  warranty: 'Warranty khatam / 30 din me',
  nobill: 'Bill nahi laga',
};
export const PAY_LABEL: Record<string, string> = { baaki: 'Mere paise baaki', mine: 'Maine paise diye', back: 'Paise mil gaye' };
export const STOCK_LABEL: Record<string, string> = { low: 'Sirf kam stock', out: 'Khatam ho gaya' };

/** Print pe likhne ke liye: kaun sa filter laga hai. */
export function filterSummary(f: Filters, tab: Tab): string {
  const use = FSHOW[tab];
  const out: string[] = [];
  if (use.includes('q') && f.q.trim()) out.push('"' + f.q.trim() + '"');
  if (use.includes('month') && f.month) out.push(mlabel(f.month));
  if (use.includes('vendor') && f.vendor) out.push(f.vendor);
  if (use.includes('status') && f.status) out.push(STATUS_LABEL[f.status] || f.status);
  if (use.includes('pay') && f.pay) out.push(PAY_LABEL[f.pay] || f.pay);
  if (use.includes('stock') && f.stock) out.push(STOCK_LABEL[f.stock] || f.stock);
  if (use.includes('dept') && f.dept) out.push(f.dept);
  return out.join(', ');
}

/** ₹64.7k, ₹1.5L, ₹2Cr: chart ke upar chhota likhne ke liye */
export function inrShort(n: number): string {
  const v = Math.abs(Number(n) || 0);
  const s = n < 0 ? '-' : '';
  const f = (x: number) => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString();
  if (v >= 1e7) return s + '₹' + f(v / 1e7) + 'Cr';
  if (v >= 1e5) return s + '₹' + f(v / 1e5) + 'L';
  if (v >= 1e3) return s + '₹' + f(v / 1e3) + 'k';
  return s + '₹' + Math.round(v);
}

/** Aaj se pichhle n mahine (purana pehle): ['2026-05', … '2026-10'] */
export function lastMonths(n: number): string[] {
  const t = new Date();
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t.getFullYear(), t.getMonth() - i, 1);
    out.push(d.getFullYear() + '-' + z2(d.getMonth() + 1));
  }
  return out;
}

const DAYS = ['Ravivaar', 'Somvaar', 'Mangalvaar', 'Budhvaar', 'Guruvaar', 'Shukravaar', 'Shanivaar'];
export function dayLong(): string {
  const t = new Date();
  return DAYS[t.getDay()] + ', ' + fdate(today());
}
export const monShort = (k: string) => {
  const p = k.split('-').map(Number);
  return p[1] ? MON[p[1] - 1] : '';
};
