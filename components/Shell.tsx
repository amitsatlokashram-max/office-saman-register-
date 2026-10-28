
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { fetchAiStatus, type AiStatus } from '@/lib/ai';
import { saveFile } from '@/lib/bills';
import {
  DEF,
  EMPTY_FILTERS,
  allIssues,
  distinct,
  initials,
  stockGroups,
} from '@/lib/calc';
import { buildCsv } from '@/lib/csv';
import { fetchGoogleStatus } from '@/lib/google';
import {
  initSync,
  setSyncMe,
  type SyncState,
} from '@/lib/sync';
import {
  configOK,
  setNotifier,
  signInGoogle,
  signOutUser,
  subscribeItems,
  subscribeMin,
  watchAuth,
  writeMin,
} from '@/lib/firebase';
import { authMsg, explain } from '@/lib/messages';
import type {
  Filters,
  Item,
  Me,
  MinMap,
  Tab,
} from '@/lib/types';

import { RegContext, type Reg } from './context';
import { EntryDrawer } from './EntryDrawer';
import { EntryPrint } from './EntryPrint';
import { Gate, type GateKind } from './Gate';
import { Icon, type IconName } from './Icon';
import { ItemFormModal } from './ItemFormModal';
import {
  IssueModal,
  Lightbox,
  MoveModal,
} from './Modals';
import { useToast } from './Toast';

type Phase = GateKind | 'ready';

/* ---------- THEME CONFIGURATION ---------- */

const THEME_MODE_KEY = 'office-theme-mode';
const THEME_COLOR_KEY = 'office-theme-color';

const THEME_COLORS = [
  'purple',
  'blue',
  'green',
  'red',
  'orange',
  'pink',
  'cyan',
] as const;

function applySavedTheme() {
  if (typeof window === 'undefined') return;

  const root = document.documentElement;

  try {
    const savedMode = window.localStorage.getItem(
      THEME_MODE_KEY
    );

    const savedColor = window.localStorage.getItem(
      THEME_COLOR_KEY
    );

    const mode =
      savedMode === 'light' ? 'light' : 'dark';

    const color =
      savedColor &&
      THEME_COLORS.some((c) => c === savedColor)
        ? savedColor
        : 'purple';

    root.dataset.theme = mode;
    root.dataset.color = color;
  } catch {
    root.dataset.theme = 'dark';
    root.dataset.color = 'purple';
  }
}

/* ---------- PAGES ---------- */

export const PAGES: {
  href: string;
  label: string;
  icon: IconName;
  id: string;
  count?: 'items' | 'stock' | 'issues';
}[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: 'grid',
    id: 'nav-dashboard',
  },
  {
    href: '/saman',
    label: 'Saman',
    icon: 'list',
    id: 'nav-saman',
    count: 'items',
  },
  {
    href: '/stock',
    label: 'Stock',
    icon: 'layers',
    id: 'nav-stock',
    count: 'stock',
  },
  {
    href: '/kisko-diya',
    label: 'Kisko diya',
    icon: 'users',
    id: 'nav-kisko-diya',
    count: 'issues',
  },
  {
    href: '/demand',
    label: 'Demand List',
    icon: 'list',
    id: 'nav-demand',
  },
  {
    href: '/hisaab',
    label: 'Hisaab',
    icon: 'chart',
    id: 'nav-hisaab',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'gear',
    id: 'nav-settings',
  },
];

export default function Shell({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const path = usePathname() || '/';

  const [phase, setPhase] = useState<Phase>(
    configOK ? 'loading' : 'setup'
  );

  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [minMap, setMinMap] = useState<MinMap>({});
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [noticeMsg, setNoticeMsg] = useState('');

  const [ai, setAi] = useState<AiStatus>({
    enabled: false,
    provider: '',
  });

  const [googleOn, setGoogleOn] = useState(false);

  const [sync, setSync] = useState<SyncState>({
    enabled: false,
    pending: 0,
    running: false,
    lastOk: '',
    lastErr: '',
  });

  const [openId, setOpenId] =
    useState<string | null>(null);

  const [form, setForm] = useState<{
    editId: string | null;
  } | null>(null);

  const [issueFor, setIssueFor] =
    useState<string | null>(null);

  const [moveFor, setMoveFor] =
    useState<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);

  const [photo, setPhoto] = useState<{
    url: string;
    name: string;
  } | null>(null);

  const [slipId, setSlipId] =
    useState<string | null>(null);

  const { show: toast, node: toastNode } = useToast();

  const itemsRef = useRef<Item[]>([]);
  const meRef = useRef<Me | null>(null);

  itemsRef.current = items;

  /* ---------- APPLY SAVED THEME ---------- */

  useEffect(() => {
    applySavedTheme();

    function onStorage(e: StorageEvent) {
      if (
        e.key === THEME_MODE_KEY ||
        e.key === THEME_COLOR_KEY ||
        e.key === null
      ) {
        applySavedTheme();
      }
    }

    window.addEventListener(
      'storage',
      onStorage
    );

    return () => {
      window.removeEventListener(
        'storage',
        onStorage
      );
    };
  }, []);

  /* ---------- FIREBASE ---------- */

  useEffect(() => {
    setNotifier({
      late: (e) => toast(explain(e)),
      queued: () =>
        toast(
          'Net nahi hai. Entry is phone me save hai, ' +
          'net aate hi upload ho jayegi.'
        ),
    });
  }, [toast]);

  useEffect(() => {
    if (!configOK) return;

    return watchAuth(
      (m) => {
        setMe(m);

        if (!m) {
          setItems([]);
          setPhase('login');
        } else {
          setPhase('loading');
        }
      },
      (e) => toast(authMsg(e))
    );
  }, [toast]);

  const uidKey = me?.uid ?? '';

  useEffect(() => {
    if (!uidKey) return;

    const u1 = subscribeItems(
      (list) => {
        setItems(list);
        setNoticeMsg('');
        setPhase('ready');
      },
      (code) => {
        if (code === 'permission-denied') {
          setPhase('denied');
        } else {
          setPhase('ready');
          setNoticeMsg(
            'Register live update nahi ho raha. ' +
            'Internet check karke page reload karo.'
          );
        }
      }
    );

    const u2 = subscribeMin(setMinMap);

    return () => {
      u1();
      u2();
    };
  }, [uidKey]);

  useEffect(() => {
    if (phase !== 'ready') return;

    let live = true;

    fetchAiStatus().then(
      (s) => live && setAi(s)
    );

    fetchGoogleStatus().then((on) => {
      if (!live) return;

      setGoogleOn(on);

      initSync({
        enabled: on,
        getItem: (id) =>
          itemsRef.current.find(
            (x) => x.id === id
          ),
        me: meRef.current,
        notify: toast,
        onChange: setSync,
      });
    });

    return () => {
      live = false;
    };
  }, [phase, toast]);

  useEffect(() => {
    meRef.current = me;
    setSyncMe(me);
  }, [me]);

  /* ---------- PHONE MENU ---------- */

  useEffect(() => {
    setMenuOpen(false);
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return;

    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', k);

    return () => {
      window.removeEventListener('keydown', k);
    };
  }, [menuOpen]);

  /* ---------- PRINT ---------- */

  useEffect(() => {
    if (!slipId) return;

    const html = document.documentElement;
    html.classList.add('slip-mode');

    const done = () => setSlipId(null);

    window.addEventListener(
      'afterprint',
      done,
      { once: true }
    );

    const t = window.setTimeout(
      () => window.print(),
      120
    );

    return () => {
      window.clearTimeout(t);
      window.removeEventListener(
        'afterprint',
        done
      );
      html.classList.remove('slip-mode');
    };
  }, [slipId]);

  /* ---------- ACTIONS ---------- */

  const signIn = async (remember: boolean) => {
    try {
      await signInGoogle(remember);
    } catch (e) {
      toast(authMsg(e));
    }
  };

  const signOutNow = useCallback(() => {
    setMenuOpen(false);
    setOpenId(null);

    signOutUser().catch(() => {});
  }, []);

  const minRef = useRef<MinMap>({});
  minRef.current = minMap;

  const saveMin = useCallback(
    (key: string, n: number) => {
      const m = { ...minRef.current };

      if (n > 0) {
        m[key] = n;
      } else {
        delete m[key];
      }

      minRef.current = m;
      setMinMap(m);

      writeMin(m).then(
        () =>
          toast(
            n > 0
              ? 'Kam se kam stock ' +
                n +
                ' set ho gaya'
              : 'Kam se kam stock hata diya'
          ),
        (e) => toast(explain(e))
      );
    },
    [toast]
  );

  const goList = useCallback(
    (
      patch: Partial<Filters>,
      to = '/saman'
    ) => {
      setF((p) => ({
        ...EMPTY_FILTERS,
        sort: p.sort,
        ...patch,
      }));

      router.push(to);
    },
    [router]
  );

  const clearFilters = useCallback(
    () =>
      setF((p) => ({
        ...EMPTY_FILTERS,
        sort: p.sort,
      })),
    []
  );

  const groups = useMemo(
    () => stockGroups(items, minMap),
    [items, minMap]
  );

  const exportCsv = useCallback(
    (tab: Tab) => {
      const { name, text } = buildCsv(
        tab,
        itemsRef.current,
        groups,
        f
      );

      saveFile(
        name,
        new Blob([text], {
          type: 'text/csv;charset=utf-8',
        })
      );

      toast(
        'File download ho gayi, Excel me khol lo'
      );
    },
    [groups, f, toast]
  );

  const printPage = useCallback(() => {
    setSlipId(null);

    document.documentElement.classList.remove(
      'slip-mode'
    );

    window.print();
  }, []);

  const printEntry = useCallback(
    (id: string) => {
      setOpenId(null);
      setSlipId(id);
    },
    []
  );

  const newEntry = useCallback(
    () => setForm({ editId: null }),
    []
  );

  /* ---------- SHARED CONTEXT ---------- */

  const getItem = useCallback(
    (id: string) =>
      itemsRef.current.find(
        (x) => x.id === id
      ),
    []
  );

  const reg = useMemo<Reg>(
    () => ({
      me,
      items,
      getItem,
      toast,
      notice: setNoticeMsg,
      ai,
      groups,
      f,
      setF,
      clearFilters,
      goList,
      openEntry: setOpenId,
      newEntry,
      saveMin,
      exportCsv,
      printPage,
      printEntry,
      google: {
        enabled: googleOn,
        sync,
      },
      signOut: signOutNow,
    }),
    [
      me,
      items,
      getItem,
      toast,
      ai,
      groups,
      f,
      clearFilters,
      goList,
      newEntry,
      saveMin,
      exportCsv,
      printPage,
      printEntry,
      googleOn,
      sync,
      signOutNow,
    ]
  );

  const iss = allIssues(items);

  const counts = {
    items: items.length,
    stock: groups.length,
    issues: iss.length,
  };

  const lists = {
    item: distinct(
      items.map((i) => i.item)
    ),
    category: distinct(
      DEF.category.concat(
        items.map((i) => i.category)
      )
    ),
    vendor: distinct(
      DEF.vendor.concat(
        items.map((i) => i.vendor)
      )
    ),
    brought: distinct(
      DEF.brought.concat(
        items.map((i) => i.broughtBy)
      )
    ),
    person: distinct(
      iss.map((i) => i.person)
    ),
    dept: distinct(
      DEF.dept.concat(
        iss.map((i) => i.dept)
      )
    ),
  };

  const slipItem = slipId
    ? items.find((x) => x.id === slipId)
    : undefined;

  const active = (href: string) =>
    href === '/'
      ? path === '/'
      : path === href ||
        path.startsWith(href + '/');

  /* ---------- APP UI ---------- */

  return (
    <RegContext.Provider value={reg}>
      {phase !== 'ready' ? (
        <Gate
          kind={phase}
          email={me?.email}
          onSignIn={signIn}
          onSignOut={signOutNow}
        />
      ) : (
        <div
          className={
            'shell' +
            (menuOpen ? ' menu-open' : '')
          }
        >
          <aside
            className="side"
            id="sideMenu"
            aria-label="Register ka menu"
          >
            <div className="side-head">
              <Link
                href="/"
                className="brand"
                aria-label="Office Saman Register: Dashboard"
              >
                <span
                  className="logo"
                  aria-hidden="true"
                >
                  <Icon name="boxFull" />
                </span>

                <span className="brand-t">
                  Office Saman
                  <br />
                  Register
                </span>
              </Link>

              <button
                className="iconbtn side-x"
                type="button"
                onClick={() =>
                  setMenuOpen(false)
                }
                aria-label="Menu band karo"
              >
                <Icon name="x" />
              </button>
            </div>

            <nav
              className="nav"
              aria-label="Register ke page"
            >
              {PAGES.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  id={p.id}
                  className={
                    'nav-a' +
                    (active(p.href) ? ' on' : '')
                  }
                  aria-current={
                    active(p.href)
                      ? 'page'
                      : undefined
                  }
                  onClick={() =>
                    setMenuOpen(false)
                  }
                >
                  <Icon name={p.icon} />

                  <span className="nav-l">
                    {p.label}
                  </span>

                  {p.count &&
                    counts[p.count] > 0 && (
                      <span className="nav-n">
                        {counts[p.count]}
                      </span>
                    )}
                </Link>
              ))}

              <button
                className="nav-a"
                type="button"
                id="logoutBtn"
                onClick={signOutNow}
                title="Logout: register band karo"
              >
                <Icon name="logout" />

                <span className="nav-l">
                  Logout
                </span>
              </button>
            </nav>

            <div className="side-user">
              <span className="avatar">
                {initials(me?.name)}
              </span>

              <span className="who-t">
                <b>{me?.name || '—'}</b>
                <small>{me?.email}</small>
              </span>
            </div>
          </aside>

          <div
            className="scrim"
            aria-hidden="true"
            onClick={() =>
              setMenuOpen(false)
            }
          />

          <div className="main-wrap">
            <header className="topbar">
              <button
                className="iconbtn"
                type="button"
                id="menuBtn"
                onClick={() =>
                  setMenuOpen(true)
                }
                aria-label="Menu kholo"
                aria-controls="sideMenu"
                aria-expanded={menuOpen}
              >
                <Icon name="menu" />
              </button>

              <Link
                href="/"
                className="brand sm"
                aria-label="Dashboard"
              >
                <span
                  className="logo"
                  aria-hidden="true"
                >
                  <Icon name="boxFull" />
                </span>

                <span className="brand-t">
                  Office Saman Register
                </span>
              </Link>

              <Link
                href="/settings"
                className="avatar"
                aria-label="Settings"
              >
                {initials(me?.name)}
              </Link>
            </header>

            <main
              className="main"
              id="main"
            >
              {noticeMsg && (
                <div
                  className="notice"
                  role="status"
                >
                  {noticeMsg}
                </div>
              )}

              {children}
            </main>
          </div>
        </div>
      )}

      {/* SHARED DATALISTS */}

      {(
        Object.keys(lists) as
          (keyof typeof lists)[]
      ).map((k) => (
        <datalist
          id={'dl-' + k}
          key={k}
        >
          {lists[k].map((v) => (
            <option
              value={v}
              key={v}
            />
          ))}
        </datalist>
      ))}

      {/* EXISTING MODALS */}

      <EntryDrawer
        id={openId}
        onClose={() =>
          setOpenId(null)
        }
        onEdit={(id) =>
          setForm({ editId: id })
        }
        onIssue={setIssueFor}
        onMove={setMoveFor}
        onViewBill={setPhoto}
      />

      <ItemFormModal
        open={!!form}
        editId={form?.editId ?? null}
        onClose={() =>
          setForm(null)
        }
      />

      <IssueModal
        itemId={issueFor}
        onClose={() =>
          setIssueFor(null)
        }
      />

      <MoveModal
        itemId={moveFor}
        onClose={() =>
          setMoveFor(null)
        }
      />

      <Lightbox
        bill={photo}
        onClose={() =>
          setPhoto(null)
        }
      />

      {/* PRINT ENTRY */}

      <div
        className="slip-wrap"
        aria-hidden={
          slipItem ? undefined : true
        }
      >
        {slipItem && (
          <EntryPrint
            it={slipItem}
            items={items}
            me={me}
          />
        )}
      </div>

      {toastNode}
    </RegContext.Provider>
  );
}
