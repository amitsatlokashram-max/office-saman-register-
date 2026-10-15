import { deleteBillDoc, putBillDoc, readBillDoc } from './firebase';
import type { Bill, Item, Me } from './types';

/** Firestore me ek document 1 MB tak ho sakta hai, isliye har bill 900 KB tak. */
export const MAX_BILL = 900 * 1024;

type Cached = { url: string; blob: Blob; type: string; name: string };
const cache = new Map<string, Cached>();
const pending = new Map<string, Promise<Cached>>();

export function cachedBill(id: string): Cached | undefined {
  return cache.get(id);
}

export function getBill(id: string): Promise<Cached> {
  const c = cache.get(id);
  if (c) return Promise.resolve(c);
  let p = pending.get(id);
  if (!p) {
    p = readBillDoc(id).then(
      (d) => {
        const blob = new Blob([new Uint8Array(d.bytes)], { type: d.type });
        const v: Cached = { url: URL.createObjectURL(blob), blob, type: d.type, name: d.name };
        cache.set(id, v);
        pending.delete(id);
        return v;
      },
      (e) => {
        pending.delete(id);
        throw e;
      },
    );
    pending.set(id, p);
  }
  return p;
}

const OK_IMG = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

async function drawJpeg(bmp: ImageBitmap, max: number, q: number): Promise<Blob | null> {
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * sc);
  c.height = Math.round(bmp.height * sc);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', q));
}

/** Photo ko chhota karke 900 KB ke andar laata hai. PDF waisi hi jaati hai. */
async function prepFile(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  const t = (file.type || '').toLowerCase();
  const name = file.name || 'bill';
  if (t === 'application/pdf' || /\.pdf$/i.test(name)) {
    if (file.size > MAX_BILL) throw { code: 'pdf_large' };
    return { blob: file, type: 'application/pdf', name };
  }
  const isImg = t.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
  if (!isImg) throw { code: 'unsupported_type' };
  if (OK_IMG.includes(t) && file.size <= 800 * 1024) return { blob: file, type: t, name };
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    bmp = null;
  }
  if (!bmp) throw { code: 'unsupported_type' };
  let out: Blob | null = null;
  for (const [max, q] of [[1800, 0.82], [1400, 0.72], [1100, 0.62], [900, 0.55]] as const) {
    out = await drawJpeg(bmp, max, q);
    if (out && out.size <= MAX_BILL) break;
  }
  bmp.close();
  if (!out || out.size > MAX_BILL) throw { code: 'too_large' };
  return { blob: out, type: 'image/jpeg', name: name.replace(/\.[^.]+$/, '') + '.jpg' };
}

export async function uploadBill(file: File, me: Me | null): Promise<{ bill: Bill; blob: Blob }> {
  const p = await prepFile(file);
  const bytes = new Uint8Array(await p.blob.arrayBuffer());
  const id = await putBillDoc(bytes, { type: p.type, name: p.name }, me);
  cache.set(id, { url: URL.createObjectURL(p.blob), blob: p.blob, type: p.type, name: p.name });
  return { bill: { id, name: p.name, type: p.type, size: bytes.length, driveId: '', driveUrl: '' }, blob: p.blob };
}

export function delBill(id: string): void {
  if (!id) return;
  deleteBillDoc(id).catch(() => {});
  const c = cache.get(id);
  if (c) {
    URL.revokeObjectURL(c.url);
    cache.delete(id);
  }
}

/** Bill tabhi hatao jab koi aur entry use na kar rahi ho (AI se kai entries ek hi bill share karti hai). */
export function delBillIfUnused(id: string, items: Item[], exceptItemId: string | null): void {
  const used = items.some((it) => it.id !== exceptItemId && it.bills.some((b) => b.id === id));
  if (!used) delBill(id);
}

export { billExtOf as billExt } from './calc';

export function saveFile(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
