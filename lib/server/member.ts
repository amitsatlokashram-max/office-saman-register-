// SIRF SERVER: login karne wala register ka member (owner ya team) hai ya nahi.
// User ke apne login token se Firestore ka "config/access" padhte hai. Firestore rules wahi hai jo app ke,
// isliye owner/team ko hi ijaazat milti hai (document na ho tab bhi owner ko 404 milta hai, jo theek hai).

export type Member = 'yes' | 'no' | 'error';

export function bearer(req: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  return m ? m[1] : null;
}

export async function memberCheck(token: string): Promise<Member> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return 'error';
  const url =
    'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) + '/databases/(default)/documents/config/access';
  try {
    const r = await fetch(url, { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' });
    if (r.status === 200 || r.status === 404) return 'yes';
    if (r.status === 401 || r.status === 403) return 'no';
    return 'error';
  } catch {
    return 'error';
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
