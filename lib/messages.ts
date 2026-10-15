import { errCode } from './errors';

export const PERM_NOTICE =
  'Aapko is register me likhne ki permission nahi hai. Owner se kaho ki Settings → Team me aapka email jode.';

export function explain(e: unknown): string {
  const c = errCode(e);
  if (c === 'permission-denied') return 'Save nahi hua: aapko is register me likhne ki permission nahi hai.';
  if (c === 'resource-exhausted') return 'Firebase ki aaj ki free limit poori ho gayi. Kal dobara try karo.';
  if (c === 'invalid-argument') return 'Save nahi hua: entry bahut badi hai.';
  if (c === 'unavailable') return 'Internet nahi hai. Net aate hi save ho jayega.';
  return 'Save nahi hua. Internet check karke dobara try karo.';
}

export function explainUpload(e: unknown): string {
  const c = errCode(e);
  if (c === 'pdf_large') return 'Ye PDF 900 KB se badi hai. Uski photo ya screenshot lagao.';
  if (c === 'too_large') return 'Ye photo bahut badi hai. Thodi chhoti photo lagao.';
  if (c === 'unsupported_type') return 'Sirf photo (JPG, PNG) ya PDF bill lag sakta hai.';
  if (c === 'permission-denied') return 'Bill lagane ki permission nahi hai.';
  return 'Bill upload nahi hua. Dobara try karo.';
}

export function explainAi(e: unknown): string {
  const c = errCode(e);
  if (c === 'no_key') return 'AI abhi band hai. Vercel me AI_API_KEY daalo (README dekho).';
  if (c === 'not_member') return 'AI chalane ki permission nahi mili. Dobara sign in karke try karo.';
  if (c === 'bad_key') return 'Server pe daali AI key galat hai ya band hai. Vercel me AI_API_KEY check karo.';
  if (c === 'bad_model') return 'Ye AI model nahi mila. Vercel me AI_MODEL badlo ya khaali chhodo.';
  if (c === 'rate_limited') return 'AI ki limit abhi poori ho gayi. Thodi der baad dobara try karo.';
  if (c === 'network') return 'AI tak nahi pahunch paaye. Internet check karo.';
  if (c === 'bad_request') return 'Ye bill AI ko nahi bheja ja saka. Photo ya PDF dobara lagao.';
  if (c === 'not-found') return 'Bill nahi mila. Dobara lagao.';
  return 'Bill se details nahi nikal paayi. Dobara try karo ya form khud bhar lo.';
}

export function authMsg(e: unknown): string {
  const c = errCode(e);
  if (c === 'auth/unauthorized-domain') return 'Ye website Firebase me allow nahi hai. README ka "Authorized domains" wala step karo.';
  if (c === 'auth/network-request-failed') return 'Internet check karo.';
  if (c === 'auth/operation-not-allowed') return 'Firebase me Google sign-in chalu nahi hai. README ka Step 3 dekho.';
  return 'Sign in nahi hua. Dobara try karo.';
}
