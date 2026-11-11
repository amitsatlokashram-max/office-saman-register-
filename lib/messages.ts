import { errCode } from './errors';

export const PERM_NOTICE =
  'You do not have permission to edit this register. Ask the owner to add your email under Settings → Team.';

export function explain(e: unknown): string {
  const c = errCode(e);
  if (c === 'permission-denied') return 'Could not save: you do not have permission to edit this register.';
  if (c === 'resource-exhausted') return 'Today’s Firebase free usage limit has been reached. Try again tomorrow.';
  if (c === 'invalid-argument') return 'Could not save: this entry is too large.';
  if (c === 'unavailable') return 'You are offline. Changes will sync when you reconnect.';
  return 'Could not save. Check your internet connection and try again.';
}

export function explainUpload(e: unknown): string {
  const c = errCode(e);
  if (c === 'pdf_large') return 'This PDF is larger than 900 KB. Upload a photo or screenshot instead.';
  if (c === 'too_large') return 'This photo is too large. Upload a smaller image.';
  if (c === 'unsupported_type') return 'Upload a receipt photo (JPG or PNG) or a PDF.';
  if (c === 'permission-denied') return 'You do not have permission to upload receipts.';
  return 'Receipt upload failed. Try again.';
}

export function explainAi(e: unknown): string {
  const c = errCode(e);
  if (c === 'no_key') return 'AI is not configured. Add AI_API_KEY in Vercel (see the README).';
  if (c === 'not_member') return 'You are not authorized to use AI. Sign in again and retry.';
  if (c === 'bad_key') return 'The AI key configured on the server is invalid or disabled. Check AI_API_KEY in Vercel.';
  if (c === 'bad_model') return 'The configured AI model was not found. Update AI_MODEL in Vercel or leave it blank.';
  if (c === 'rate_limited') return 'The AI usage limit has been reached. Try again shortly.';
  if (c === 'network') return 'Could not reach the AI service. Check your internet connection.';
  if (c === 'bad_request') return 'The receipt could not be sent to AI. Upload the photo or PDF again.';
  if (c === 'not-found') return 'Receipt not found. Upload it again.';
  return 'Could not read the receipt. Try again or fill in the form manually.';
}

export function authMsg(e: unknown): string {
  const c = errCode(e);
  if (c === 'auth/unauthorized-domain') return 'This website is not authorized in Firebase. Follow the "Authorized domains" step in the README.';
  if (c === 'auth/network-request-failed') return 'Check your internet connection.';
  if (c === 'auth/operation-not-allowed') return 'Google sign-in is not enabled in Firebase. See Step 3 in the README.';
  return 'Sign-in failed. Try again.';
}
