// Server pe chalta hai: bill ki photo/PDF AI ko bhej ke bill no., saman, rate, total nikalta hai.
// AI ki key (AI_API_KEY) sirf server pe rehti hai. Sirf register ke member (owner + team) ise chala sakte hai.

import { bearer, json, memberCheck } from '@/lib/server/member';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROMPT =
  'You are reading a purchase bill / invoice / online order (India, amounts in rupees) for an office that buys hard disks, SDI and HDMI cables, computer parts and live-streaming equipment.\n' +
  'Extract the purchased items. Reply with ONLY one JSON object of this exact shape, no other text:\n' +
  '{"vendor": "shop or website name, e.g. Amazon, Flipkart, or the shop name", "billNo": "invoice / bill / order number", "date": "YYYY-MM-DD (invoice or order date)", "lines": [{"item": "short clear product name, e.g. Seagate Hard Disk 2TB", "category": "one of: Hard Disk, SSD, Pen Drive, SDI Cable, HDMI Cable, Computer Parts, Live Setup Saman, Other", "qty": 1, "rate": 0, "total": 0}], "grandTotal": 0}\n' +
  "Rules: rate is the price of ONE piece including tax (if tax is listed separately, add each line's share of tax into its rate); total = qty x rate for that line; numbers are plain numbers without the rupee sign or commas; do not create separate lines for delivery, shipping or handling charges; use \"\" or 0 for anything you cannot read; if the date is ambiguous assume Indian DD/MM/YYYY order.";

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
const MAX_B64 = 1_400_000; // ~1 MB file
const DEFAULT_MODEL = { gemini: 'gemini-3.8-flash', claude: 'claude-sonnet-5-5' } as const;

type Provider = 'gemini' | 'claude';

function aiKey(): string {
  return (process.env.AI_API_KEY || '').trim();
}
function providerOf(key: string): Provider {
  return key.startsWith('sk-ant-') ? 'claude' : 'gemini';
}
/** App batata hai ki AI chalu hai ya nahi (key kabhi bahar nahi jaati). */
export async function GET() {
  const key = aiKey();
  return json({ enabled: !!key, provider: key ? providerOf(key) : '' });
}

function parseJsonLoose(t: string): unknown {
  t = t.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    /* try more */
  }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* try more */
    }
  }
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* give up */
    }
  }
  return null;
}

async function callGemini(key: string, model: string, data: string, type: string): Promise<Response> {
  return fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PROMPT }, { inlineData: { mimeType: type, data } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
  });
}

async function callClaude(key: string, model: string, data: string, type: string): Promise<Response> {
  const part =
    type === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: type, data } };
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: [part, { type: 'text', text: PROMPT }] }] }),
  });
}

type GeminiReply = { candidates?: { content?: { parts?: { text?: string }[] } }[] };
type ClaudeReply = { content?: { type?: string; text?: string }[] };

export async function POST(req: Request) {
  const key = aiKey();
  if (!key) return json({ error: 'no_key' }, 503);

  const token = bearer(req);
  if (!token) return json({ error: 'not_member' }, 401);
  const member = await memberCheck(token);
  if (member === 'no') return json({ error: 'not_member' }, 403);
  if (member === 'error') return json({ error: 'upstream' }, 502);

  let body: { data?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const data = typeof body.data === 'string' ? body.data : '';
  const type = typeof body.type === 'string' ? body.type : '';
  if (!data || data.length > MAX_B64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || !TYPES.includes(type)) {
    return json({ error: 'bad_request' }, 400);
  }

  const provider = providerOf(key);
  const model = (process.env.AI_MODEL || '').trim() || DEFAULT_MODEL[provider];
  let r: Response;
  try {
    r = provider === 'gemini' ? await callGemini(key, model, data, type) : await callClaude(key, model, data, type);
  } catch {
    return json({ error: 'network' }, 502);
  }

  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const s = r.status;
    let code = 'upstream';
    if (s === 401 || s === 403 || /api[ _-]?key/i.test(txt)) code = 'bad_key';
    else if (s === 404 || (s === 400 && /model/i.test(txt))) code = 'bad_model';
    else if (s === 429 || s === 529) code = 'rate_limited';
    return json({ error: code }, code === 'rate_limited' ? 429 : 502);
  }

  let text = '';
  try {
    if (provider === 'gemini') {
      const j = (await r.json()) as GeminiReply;
      text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    } else {
      const j = (await r.json()) as ClaudeReply;
      text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join('');
    }
  } catch {
    return json({ error: 'upstream' }, 502);
  }

  const result = parseJsonLoose(text);
  if (!result || typeof result !== 'object' || Array.isArray(result)) return json({ error: 'invalid_json' }, 502);
  return json({ result });
}
