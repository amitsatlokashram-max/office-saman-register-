// Server pe chalta hai: app aur aapki Google Sheet ke script (google-apps-script/Code.gs) ke beech ka pul.
// Script ka URL aur secret sirf server pe rehte hai. Sirf register ke member (owner + team) ise chala sakte hai.

import { bearer, json, memberCheck } from '@/lib/server/member';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ACTIONS = new Set(['ping', 'upsert', 'delete', 'uploadBill', 'trashBill', 'replaceAll']);
const MAX_BODY = 4_000_000;

function cfg() {
  return {
    url: (process.env.GOOGLE_SCRIPT_URL || '').trim(),
    secret: (process.env.GOOGLE_SCRIPT_SECRET || '').trim(),
  };
}

/** App batata hai ki Google Sheet/Drive juda hai ya nahi. */
export async function GET() {
  const c = cfg();
  return json({ enabled: !!(c.url && c.secret) });
}

export async function POST(req: Request) {
  const c = cfg();
  if (!c.url || !c.secret) return json({ error: 'not_configured' }, 503);

  const token = bearer(req);
  if (!token) return json({ error: 'not_member' }, 401);
  const member = await memberCheck(token);
  if (member === 'no') return json({ error: 'not_member' }, 403);
  if (member === 'error') return json({ error: 'upstream' }, 502);

  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) return json({ error: 'too_large' }, 413);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!body || typeof body !== 'object' || !ACTIONS.has(String(body.action))) return json({ error: 'bad_request' }, 400);

  let r: Response;
  try {
    r = await fetch(c.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, secret: c.secret }),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return json({ error: 'network' }, 502);
  }
  const text = await r.text().catch(() => '');
  if (text.trim().startsWith('<')) return json({ error: 'script_access' }, 502); // Google ka login/HTML page: deploy me "Anyone" nahi chuna
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    return json({ error: 'script_error' }, 502);
  }
  if (j.ok !== true) {
    const error = j.error === 'bad_secret' ? 'bad_secret' : j.error === 'bad_request' ? 'bad_request' : 'script_error';
    return json({ error, message: typeof j.message === 'string' ? j.message.slice(0, 300) : undefined }, 502);
  }
  const { ok: _ok, ...rest } = j;
  return json({ ok: true, ...rest });
}
