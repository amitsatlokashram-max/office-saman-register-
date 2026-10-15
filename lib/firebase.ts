// Saari Firebase baat-cheet isi file me hai: login, entries, stock setting, team list aur bill files.
// Ye sirf browser me chalti hai (components ke useEffect / click se).

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  setPersistence,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { normalizeItem } from './calc';
import { errCode } from './errors';
import { clearSignIn, markSignIn, sessionValid } from './session';
import type { Item, Me, MinMap } from './types';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

export const configOK = !!(config.apiKey && config.projectId && config.authDomain && config.appId);

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

function fbApp(): FirebaseApp {
  if (!_app) _app = getApps().length ? getApp() : initializeApp(config);
  return _app;
}
function fbAuth(): Auth {
  if (!_auth) _auth = getAuth(fbApp());
  return _auth;
}
function fbDb(): Firestore {
  if (_db) return _db;
  try {
    // Net na ho tab bhi chale: data phone me bhi rehta hai
    _db = initializeFirestore(fbApp(), {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    try {
      _db = initializeFirestore(fbApp(), { ignoreUndefinedProperties: true, localCache: memoryLocalCache() });
    } catch {
      _db = getFirestore(fbApp());
    }
  }
  return _db;
}


/* ---------- write helpers ---------- */
type Notifier = { late: (e: unknown) => void; queued: () => void };
let notifier: Notifier = { late: () => {}, queued: () => {} };
export function setNotifier(n: Notifier) {
  notifier = n;
}

// 3 second me jawab na aaye (net nahi hai) to aage badh jao; Firestore write ko queue me rakh ke baad me bhej deta hai.
function settle<T>(p: Promise<T>): Promise<T | 'queued'> {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      if (typeof navigator !== 'undefined' && !navigator.onLine) notifier.queued();
      resolve('queued');
    }, 3000);
    p.then(
      (v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        if (done) notifier.late(e);
        else {
          done = true;
          reject(e);
        }
      },
    );
  });
}

/* ---------- login ---------- */
export function watchAuth(cb: (me: Me | null) => void, onAuthError: (e: unknown) => void): () => void {
  const a = fbAuth();
  getRedirectResult(a).catch(onAuthError);
  return onAuthStateChanged(a, (u) => {
    // Purana yaad rakha login (ya doosre tab ka) ho aur "yaad rakho" nahi chuna: dobara login maango
    if (u && !sessionValid()) {
      signOut(a).catch(() => {});
      cb(null);
      return;
    }
    cb(u ? { uid: u.uid, name: u.displayName || u.email || 'Koi', email: u.email || '' } : null);
  });
}

/** remember = true: is device pe login yaad rahe. false: tab band karte hi logout. */
export async function signInGoogle(remember: boolean): Promise<void> {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  try {
    await setPersistence(fbAuth(), remember ? browserLocalPersistence : browserSessionPersistence);
  } catch {
    /* purana browser: jo chal raha hai wahi */
  }
  markSignIn(remember);
  try {
    await signInWithPopup(fbAuth(), p);
  } catch (e) {
    const c = errCode(e);
    if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment' || c === 'auth/cancelled-popup-request') {
      await signInWithRedirect(fbAuth(), p);
      return;
    }
    if (c === 'auth/popup-closed-by-user') return;
    throw e;
  }
}

export function signOutUser(): Promise<void> {
  clearSignIn();
  return signOut(fbAuth());
}

export async function idToken(): Promise<string | null> {
  const u = fbAuth().currentUser;
  return u ? u.getIdToken() : null;
}

/* ---------- entries ---------- */
export function subscribeItems(next: (items: Item[]) => void, onError: (code: string) => void): () => void {
  return onSnapshot(
    collection(fbDb(), 'purchases'),
    (snap) => next(snap.docs.map((d) => normalizeItem(d.id, d.data()))),
    (e) => onError(errCode(e)),
  );
}

export function newItemId(): string {
  return doc(collection(fbDb(), 'purchases')).id;
}

const chain: Record<string, Promise<unknown>> = {};

export function writeItem(it: Item, me: Me | null): Promise<unknown> {
  const { id, ...rest } = it;
  const data = { ...rest, updatedAt: new Date().toISOString(), ...(me ? { updatedBy: me.uid, updatedByName: me.name } : {}) };
  const p = (chain[id] || Promise.resolve())
    .catch(() => {})
    .then(() => setDoc(doc(fbDb(), 'purchases', id), data));
  chain[id] = p;
  return settle(p);
}

export function deleteItemDoc(id: string): Promise<unknown> {
  return settle(deleteDoc(doc(fbDb(), 'purchases', id)));
}

/* ---------- kam se kam stock ---------- */
export function subscribeMin(next: (m: MinMap) => void): () => void {
  return onSnapshot(
    doc(fbDb(), 'settings', 'stock'),
    (s) => {
      const d = s.exists() ? s.data() : null;
      const m: MinMap = {};
      if (d && d.min && typeof d.min === 'object') {
        for (const [k, v] of Object.entries(d.min as Record<string, unknown>)) {
          const n = Number(v);
          if (n > 0) m[k] = n;
        }
      }
      next(m);
    },
    () => {},
  );
}

export function writeMin(m: MinMap): Promise<unknown> {
  const p = (chain.__min || Promise.resolve()).catch(() => {}).then(() => setDoc(doc(fbDb(), 'settings', 'stock'), { min: m }));
  chain.__min = p;
  return settle(p);
}

/* ---------- team ---------- */
export async function readTeam(): Promise<string[]> {
  const s = await getDoc(doc(fbDb(), 'config', 'access'));
  const e = s.exists() ? s.data().emails : null;
  return Array.isArray(e) ? e.filter((x): x is string => typeof x === 'string') : [];
}

export function writeTeam(list: string[], me: Me | null): Promise<void> {
  return setDoc(doc(fbDb(), 'config', 'access'), {
    emails: list,
    updatedAt: new Date().toISOString(),
    updatedBy: me ? me.email : '',
  });
}

/* ---------- bill files (Firestore ke andar, free plan ke liye) ---------- */
export async function putBillDoc(bytes: Uint8Array, meta: { type: string; name: string }, me: Me | null): Promise<string> {
  const ref = doc(collection(fbDb(), 'bills'));
  await settle(
    setDoc(ref, {
      data: Bytes.fromUint8Array(bytes),
      type: meta.type,
      name: meta.name,
      size: bytes.length,
      createdAt: new Date().toISOString(),
      by: me ? me.uid : '',
    }),
  );
  return ref.id;
}

export async function readBillDoc(id: string): Promise<{ bytes: Uint8Array; type: string; name: string }> {
  const s = await getDoc(doc(fbDb(), 'bills', id));
  if (!s.exists()) throw { code: 'not-found' };
  const d = s.data();
  return {
    bytes: (d.data as Bytes).toUint8Array(),
    type: typeof d.type === 'string' ? d.type : 'application/octet-stream',
    name: typeof d.name === 'string' ? d.name : 'bill',
  };
}

export function deleteBillDoc(id: string): Promise<void> {
  return deleteDoc(doc(fbDb(), 'bills', id));
}
