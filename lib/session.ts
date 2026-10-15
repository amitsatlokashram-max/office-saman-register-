// Login kab tak yaad rahe.
// Default: sirf is tab tak. Tab/browser band kiya to agli baar dobara login maangega.
// "Is device pe yaad rakho" chuna ho to us phone/computer pe login bana rehta hai.

const REMEMBER = 'osr-remember';
const HERE = 'osr-signed-here';

export function rememberChoice(): boolean {
  try {
    return localStorage.getItem(REMEMBER) === '1';
  } catch {
    return false;
  }
}

export function markSignIn(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER, remember ? '1' : '0');
    sessionStorage.setItem(HERE, '1');
  } catch {
    /* ignore */
  }
}

export function clearSignIn(): void {
  try {
    sessionStorage.removeItem(HERE);
  } catch {
    /* ignore */
  }
}

/** Is tab me abhi login kiya tha, ya is device pe "yaad rakho" chuna tha? Nahi to dobara login maango. */
export function sessionValid(): boolean {
  if (rememberChoice()) return true;
  try {
    return sessionStorage.getItem(HERE) === '1';
  } catch {
    return false;
  }
}
