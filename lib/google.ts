// Browser wala hissa: apne server (/api/google) ke through Google Sheet aur Drive se baat.

import { idToken } from './firebase';
import { LOG_COLS, LOG_SHEET, SAMAN_COLS, SAMAN_SHEET, replaceAllPayload, upsertPayload } from './sheet';
import type { Item } from './types';

export async function fetchGoogleStatus(): Promise<boolean> {
  try {
    const r = await fetch('/api/google', { cache: 'no-store' });
    if (!r.ok) return false;
    const j = (await r.json()) as { enabled?: unknown };
    return j.enabled === true;
  } catch {
    return false;
  }
}

async function call<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const token = await idToken();
  if (!token) throw { code: 'not_member' };
  let r: Response;
  try {
    r = await fetch('/api/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: 'network' };
  }
  let j: Record<string, unknown> = {};
  try {
    j = await r.json();
  } catch {
    /* ignore */
  }
  if (!r.ok || j.ok !== true) throw { code: typeof j.error === 'string' ? j.error : 'upstream', message: j.message };
  return j as T;
}

function blobToB64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej({ code: 'bad_request' });
    r.readAsDataURL(blob);
  });
}

export async function driveUpload(blob: Blob, meta: { name: string; type: string; month: string }): Promise<{ driveId: string; driveUrl: string }> {
  const data = await blobToB64(blob);
  const j = await call<{ driveId?: string; driveUrl?: string }>({ action: 'uploadBill', data, type: meta.type, name: meta.name, month: meta.month });
  if (!j.driveId) throw { code: 'script_error' };
  return { driveId: j.driveId, driveUrl: j.driveUrl || 'https://drive.google.com/file/d/' + j.driveId + '/view' };
}

export const driveTrash = (driveId: string) => call({ action: 'trashBill', driveId });

export const sheetUpsert = (it: Item) => call(upsertPayload(it));

export const sheetDelete = (id: string, driveIds: string[]) =>
  call({
    action: 'delete',
    id,
    driveIds,
    saman: { name: SAMAN_SHEET, headers: SAMAN_COLS.map((c) => c[0]), formats: SAMAN_COLS.map((c) => c[1]) },
    log: { name: LOG_SHEET, headers: LOG_COLS.map((c) => c[0]), formats: LOG_COLS.map((c) => c[1]) },
  });

export const sheetReplaceAll = (items: Item[]) => call<{ rows?: number }>(replaceAllPayload(items));

export const googlePing = () => call<{ sheetUrl?: string; folderUrl?: string }>({ action: 'ping' });
