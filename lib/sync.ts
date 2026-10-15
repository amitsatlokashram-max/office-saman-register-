// Google Sheet + Drive me bhejne ki line (queue). Har badlav pehle is phone me yaad rehta hai,
// phir ek-ek karke Sheet me jata hai. Net na ho to baad me apne aap dobara koshish hoti hai.

import { delBillIfUnused, getBill } from './bills';
import { errCode } from './errors';
import { writeItem } from './firebase';
import { driveTrash, driveUpload, sheetDelete, sheetReplaceAll, sheetUpsert } from './google';
import { billFileName, billMonth } from './sheet';
import type { Bill, Item, Me } from './types';

type Job = { kind: 'upsert'; id: string } | { kind: 'delete'; id: string; driveIds: string[] } | { kind: 'trash'; driveId: string };
export type SyncState = { enabled: boolean; pending: number; running: boolean; lastOk: string; lastErr: string };

const QKEY = 'osr-google-queue';
const DKEY = 'osr-drive-map';

let enabled = false;
let getItem: (id: string) => Item | undefined = () => undefined;
let me: Me | null = null;
let notify: (msg: string) => void = () => {};
let onChange: (s: SyncState) => void = () => {};
let q: Job[] = [];
let running = false;
let lastOk = '';
let lastErr = '';
let shownErr = '';
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
const saveQ = () => writeJson(QKEY, q);
const emit = () => onChange({ enabled, pending: q.length, running, lastOk, lastErr });

export function syncMessage(code: string): string {
  if (code === 'bad_secret') return 'Google Sheet ka secret galat hai. Vercel me GOOGLE_SCRIPT_SECRET check karo.';
  if (code === 'script_access') return 'Google script tak pahunch nahi hui. Deploy karte waqt "Who has access: Anyone" chuno (README dekho).';
  if (code === 'network') return 'Google Sheet me abhi nahi gaya. Net aate hi apne aap chala jayega.';
  if (code === 'not_member') return 'Google Sheet ke liye dobara sign in karo.';
  if (code === 'not_configured') return 'Google Sheet abhi juda nahi hai.';
  return 'Google Sheet me abhi nahi gaya, thodi der me apne aap dobara koshish hogi.';
}

export function initSync(o: {
  enabled: boolean;
  getItem: (id: string) => Item | undefined;
  me: Me | null;
  notify: (msg: string) => void;
  onChange: (s: SyncState) => void;
}) {
  enabled = o.enabled;
  getItem = o.getItem;
  me = o.me;
  notify = o.notify;
  onChange = o.onChange;
  q = readJson<Job[]>(QKEY, []).filter((j) => j && typeof j === 'object' && 'kind' in j);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('online', () => kick());
  }
  emit();
  if (enabled) kick();
}

export function setSyncMe(m: Me | null) {
  me = m;
}

function kick(delay = 50) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(run, delay);
}

export function queueUpsert(id: string) {
  if (!enabled) return;
  const already = q.some((j, i) => j.kind === 'upsert' && j.id === id && !(i === 0 && running));
  if (!already) q.push({ kind: 'upsert', id });
  saveQ();
  emit();
  kick();
}

export function queueDelete(id: string, driveIds: string[]) {
  if (!enabled) return;
  q = q.filter((j, i) => !(j.kind === 'upsert' && j.id === id && !(i === 0 && running)));
  q.push({ kind: 'delete', id, driveIds });
  saveQ();
  emit();
  kick();
}

export function queueTrash(driveId: string) {
  if (!enabled || !driveId) return;
  q.push({ kind: 'trash', driveId });
  saveQ();
  emit();
  kick();
}

/** Bill hatao: app wali copy (agar koi aur entry use na kare) aur Drive wali file (Drive ke Trash me). */
export function removeBill(bill: Bill, items: Item[], exceptItemId: string | null) {
  const usedElsewhere = items.some((it) => it.id !== exceptItemId && it.bills.some((b) => b.id === bill.id));
  if (usedElsewhere) return;
  delBillIfUnused(bill.id, items, exceptItemId);
  if (bill.driveId) queueTrash(bill.driveId);
}

/** Entry delete: sheet ki line hatao aur us entry ke (kisi aur ke kaam na aane wale) bill Drive Trash me. */
export function queueEntryDelete(it: Item, items: Item[]) {
  const driveIds = it.bills
    .filter((b) => b.driveId && !items.some((o) => o.id !== it.id && o.bills.some((x) => x.id === b.id)))
    .map((b) => b.driveId);
  queueDelete(it.id, driveIds);
}

async function run() {
  if (running || !enabled) return;
  running = true;
  emit();
  try {
    while (q.length) {
      const job = q[0];
      try {
        await doJob(job);
        q.shift();
        saveQ();
        lastOk = new Date().toISOString();
        lastErr = '';
        shownErr = '';
        emit();
      } catch (e) {
        const c = errCode(e) || 'upstream';
        if (c === 'bad_request' || c === 'too_large') {
          q.shift(); // ye kabhi nahi jayega, chhod do
          saveQ();
          continue;
        }
        lastErr = c;
        if (shownErr !== c) {
          shownErr = c;
          notify(syncMessage(c));
        }
        break;
      }
    }
  } finally {
    running = false;
    emit();
    if (q.length && enabled) kick(60_000);
  }
}

async function doJob(job: Job) {
  if (job.kind === 'trash') {
    await driveTrash(job.driveId);
    return;
  }
  if (job.kind === 'delete') {
    await sheetDelete(job.id, job.driveIds);
    return;
  }
  const it = getItem(job.id);
  if (!it) return; // entry ab nahi hai
  await sheetUpsert(await ensureDrive(it));
}

/** Jin bills ki Drive copy nahi hai, unko Drive me daalo aur entry me Drive link save karo. */
async function ensureDrive(it: Item): Promise<Item> {
  const missing = it.bills.filter((b) => !b.driveId);
  if (!missing.length) return it;
  const map = readJson<Record<string, { driveId: string; driveUrl: string }>>(DKEY, {});
  const got: Record<string, { driveId: string; driveUrl: string }> = {};
  for (const b of missing) {
    if (map[b.id]) {
      got[b.id] = map[b.id]; // pehle upload ho chuka, dobara nahi
      continue;
    }
    let blob: Blob;
    try {
      blob = (await getBill(b.id)).blob;
    } catch (e) {
      if (errCode(e) === 'not-found') continue;
      throw e;
    }
    const idx = it.bills.indexOf(b);
    const r = await driveUpload(blob, { name: billFileName(it, idx, it.bills.length, b), type: b.type || blob.type, month: billMonth(it) });
    got[b.id] = r;
    map[b.id] = r;
    writeJson(DKEY, map);
  }
  if (!Object.keys(got).length) return it;
  const latest = getItem(it.id) || it;
  const updated: Item = { ...latest, bills: latest.bills.map((b) => (got[b.id] ? { ...b, ...got[b.id] } : b)) };
  await writeItem(updated, me);
  return updated;
}

/** Settings ka button: saari entries (aur bache hue bill) ek saath Sheet/Drive me. */
export async function resyncAll(items: Item[], progress: (msg: string) => void): Promise<number> {
  if (!enabled) throw { code: 'not_configured' };
  while (running) await new Promise((r) => setTimeout(r, 300));
  running = true;
  emit();
  try {
    const need = items.filter((i) => i.bills.some((b) => !b.driveId)).length;
    let n = 0;
    const list: Item[] = [];
    for (const it of items) {
      if (it.bills.some((b) => !b.driveId)) {
        progress('Bill Drive me ja rahe hai… (' + ++n + '/' + need + ')');
        list.push(await ensureDrive(it));
      } else list.push(it);
    }
    progress('Sheet likhi ja rahi hai…');
    await sheetReplaceAll(list);
    q = q.filter((j) => j.kind !== 'upsert'); // sab likh diya
    saveQ();
    lastOk = new Date().toISOString();
    lastErr = '';
    return list.length;
  } finally {
    running = false;
    emit();
    if (q.length) kick();
  }
}
