'use client';

import { createContext, useCallback, useContext, type Dispatch, type SetStateAction } from 'react';
import type { AiStatus } from '@/lib/ai';
import { errCode } from '@/lib/errors';
import { writeItem } from '@/lib/firebase';
import { PERM_NOTICE } from '@/lib/messages';
import { queueUpsert, type SyncState } from '@/lib/sync';
import type { Filters, Item, Me, StockGroup, Tab } from '@/lib/types';

export type Reg = {
  me: Me | null;
  items: Item[];
  /** Hamesha sabse taaza entry deta hai (await ke baad bhi) */
  getItem: (id: string) => Item | undefined;
  toast: (msg: string) => void;
  notice: (msg: string) => void;
  ai: AiStatus;
  /** Ek naam ke saman ka jod (Stock page) */
  groups: StockGroup[];
  f: Filters;
  setF: Dispatch<SetStateAction<Filters>>;
  clearFilters: () => void;
  /** Filter lagao aur us page pe jao (default: Saman ki list) */
  goList: (patch: Partial<Filters>, to?: string) => void;
  openEntry: (id: string) => void;
  newEntry: () => void;
  saveMin: (key: string, n: number) => void;
  exportCsv: (tab: Tab) => void;
  printPage: () => void;
  printEntry: (id: string) => void;
  /** Google Sheet + Drive chalu hai ya nahi, aur kitna bhejna baaki */
  google: { enabled: boolean; sync: SyncState };
  signOut: () => void;
};

export const RegContext = createContext<Reg | null>(null);

export function useReg(): Reg {
  const r = useContext(RegContext);
  if (!r) throw new Error('RegContext missing');
  return r;
}

/** Entry save karo (phir Google Sheet me bhi). Permission na ho to upar message dikhao, phir error aage bhejo. */
export function useSave() {
  const { me, notice } = useReg();
  return useCallback(
    async (it: Item) => {
      try {
        const r = await writeItem(it, me);
        queueUpsert(it.id); // Google Sheet me bhi
        return r;
      } catch (e) {
        if (errCode(e) === 'permission-denied') notice(PERM_NOTICE);
        throw e;
      }
    },
    [me, notice],
  );
}
