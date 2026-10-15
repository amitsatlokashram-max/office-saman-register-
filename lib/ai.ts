// Browser wala hissa: bill ko apne server (/api/read-bill) pe bhejta hai. AI key server pe hi rehti hai.

import { getBill } from './bills';
import { DEF, norm, num, round2 } from './calc';
import { idToken } from './firebase';
import type { AiLine, AiResult, Bill } from './types';

export type AiStatus = { enabled: boolean; provider: '' | 'gemini' | 'claude' };

export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const r = await fetch('/api/read-bill', { cache: 'no-store' });
    if (!r.ok) return { enabled: false, provider: '' };
    const j = (await r.json()) as { enabled?: unknown; provider?: unknown };
    const provider = j.provider === 'claude' ? 'claude' : j.provider === 'gemini' ? 'gemini' : '';
    return { enabled: j.enabled === true, provider };
  } catch {
    return { enabled: false, provider: '' };
  }
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej({ code: 'bad_request' });
    r.readAsDataURL(blob);
  });
}

export async function readBillWithAi(bill: Bill, blob: Blob | undefined, signal?: AbortSignal): Promise<AiResult> {
  const b = blob || (await getBill(bill.id)).blob;
  const data = await blobToB64(b);
  const token = await idToken();
  if (!token) throw { code: 'not_member' };
  let r: Response;
  try {
    r = await fetch('/api/read-bill', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ data, type: bill.type || b.type || 'image/jpeg' }),
    });
  } catch (e) {
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') throw { code: 'cancelled' };
    throw { code: 'network' };
  }
  let j: { error?: unknown; result?: unknown } = {};
  try {
    j = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok) throw { code: typeof j.error === 'string' ? j.error : 'upstream' };
  return j.result && typeof j.result === 'object' ? (j.result as AiResult) : {};
}

export function matchCategory(c: unknown): string {
  const n = norm(String(c ?? ''));
  if (!n) return '';
  return DEF.category.find((d) => norm(d) === n) || String(c).trim();
}

export function parseAiLines(lines: unknown): AiLine[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object' && !!String((l as Record<string, unknown>).item ?? '').trim())
    .map((l) => {
      const qty = Math.max(1, Math.round(num(l.qty)) || 1);
      let rate = round2(num(l.rate));
      let total = round2(num(l.total));
      if (!total && rate) total = round2(rate * qty);
      if (!rate && total) rate = round2(total / qty);
      return { item: String(l.item).trim().slice(0, 140), category: matchCategory(l.category), qty, rate, total };
    });
}
