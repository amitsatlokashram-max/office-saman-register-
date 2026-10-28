
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { AiStatus } from '@/lib/ai';
import {
  distinct, initials, issuedQty, moveSum,
  num, remaining, today, uid, MOVE,
} from '@/lib/calc';
import { errCode } from '@/lib/errors';
import { readTeam, writeTeam } from '@/lib/firebase';
import { googlePing } from '@/lib/google';
import { explain } from '@/lib/messages';
import {
  resyncAll, syncMessage, type SyncState,
} from '@/lib/sync';
import type { Item, Me, MoveType } from '@/lib/types';
import { Dialog } from './Dialog';
import {
  IssueRowsEditor, checkRows, newRow, type IRow,
} from './IssueRows';
import { Icon } from './Icon';
import { useReg, useSave } from './context';

function Head({
  title, sub, id, onClose,
}: {
  title: string;
  sub?: string;
  id: string;
  onClose: () => void;
}) {
  return (
    <div className="mhead">
      <div>
        <h2 id={id}>{title}</h2>
        {sub && <p className="msub">{sub}</p>}
      </div>
      <button
        type="button"
        className="iconbtn"
        onClick={onClose}
        aria-label="Band karo"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

/* ---------- KISI KO DO ---------- */

export function IssueModal({
  itemId, onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!itemId}
      onClose={onClose}
      className="modal sm"
      labelledBy="issTitle"
    >
      {itemId && (
        <IssueForm itemId={itemId} onClose={onClose} />
      )}
    </Dialog>
  );
}

function IssueForm({
  itemId, onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const { getItem, items, me, toast } = useReg();
  const save = useSave();
  const it0 = getItem(itemId);
  const rem0 = it0 ? Math.max(0, remaining(it0)) : 0;

  const [rows, setRows] = useState<IRow[]>(
    () => [newRow(String(rem0 || 1))]
  );
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<{
    msg: string;
    key?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const it = items.find((x) => x.id === itemId);
  const rem = it ? Math.max(0, remaining(it)) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    const cur = getItem(itemId);

    if (!cur) {
      return setErr({ msg: 'Ye entry ab nahi hai.' });
    }

    const chk = checkRows(
      rows,
      Math.max(0, remaining(cur))
    );

    if (!chk.ok) {
      return setErr({
        msg: chk.msg,
        key: chk.key,
      });
    }

    const d: Item = structuredClone(cur);

    d.issues = d.issues.concat(
      chk.rows.map((r) => ({
        id: uid(),
        date: date || today(),
        qty: r.qty,
        person: r.person,
        dept: r.dept,
        note: note.trim(),
        by: me?.uid ?? '',
        byName: me?.name ?? '',
      }))
    );

    setBusy(true);

    try {
      await save(d);

      toast(
        chk.rows.length === 1
          ? chk.total + ' pcs ' +
            (chk.rows[0].person || chk.rows[0].dept) +
            ' ko diya'
          : chk.rows.length +
            ' logo ko kul ' +
            chk.total +
            ' pcs diye'
      );

      onClose();
    } catch (x) {
      setBusy(false);
      setErr({ msg: explain(x) });
    }
  }

  return (
    <form id="issueForm" noValidate onSubmit={submit}>
      <Head
        id="issTitle"
        title="Kisi ko do"
        sub={
          it0
            ? it0.item + ' · ' + rem + ' pcs bache hai'
            : ''
        }
        onClose={onClose}
      />

      <div className="mbody">
        <p className="hint">
          Alag-alag logo ko diya hai to har bande ki
          alag line jodo.
        </p>

        <IssueRowsEditor
          rows={rows}
          setRows={setRows}
          max={rem}
          idPrefix="i"
          badKey={err?.key}
        />

        {err && (
          <p className="ferr">{err.msg}</p>
        )}

        <div className="fgrid">
          <div className="field">
            <label htmlFor="i-date">Kab diya</label>
            <input
              id="i-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="i-note">Note</label>
            <input
              id="i-note"
              placeholder="Jaise: studio camera 2 ke liye"
              autoComplete="off"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mfoot">
        <button
          type="button"
          className="btn"
          onClick={onClose}
        >
          Rehne do
        </button>

        <button
          type="submit"
          className="btn primary"
          id="i-save"
          disabled={busy}
        >
          {busy ? 'Save ho raha…' : 'Save karo'}
        </button>
      </div>
    </form>
  );
}

/* ---------- WAPAS / KHARAB ---------- */

const moveLimit = (it: Item, type: MoveType) =>
  type === 'back'
    ? Math.max(0, issuedQty(it) - moveSum(it, 'back'))
    : Math.max(0, remaining(it));

export function MoveModal({
  itemId, onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!itemId}
      onClose={onClose}
      className="modal sm"
      labelledBy="mvTitle"
    >
      {itemId && (
        <MoveForm itemId={itemId} onClose={onClose} />
      )}
    </Dialog>
  );
}

function MoveForm({
  itemId, onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const { getItem, items, me, toast } = useReg();
  const save = useSave();
  const it0 = getItem(itemId);

  const [type, setType] = useState<MoveType>(
    () =>
      it0 && moveLimit(it0, 'back') > 0
        ? 'back'
        : 'damaged'
  );

  const [qty, setQty] = useState('1');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const it = items.find((x) => x.id === itemId);
  const lim = it ? moveLimit(it, type) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');

    const cur = getItem(itemId);

    if (!cur) {
      return setErr('Ye entry ab nahi hai.');
    }

    const l = moveLimit(cur, type);
    const q = Math.round(num(qty));

    if (l <= 0) {
      return setErr(
        type === 'back'
          ? 'Is saman me se abhi kisi ko diya hi nahi, to wapas kaise aayega.'
          : 'Stock me kuch nahi bacha.'
      );
    }

    if (q < 1 || q > l) {
      return setErr(
        '1 se ' + l + ' ke beech piece likho.'
      );
    }

    const d: Item = structuredClone(cur);

    d.moves = d.moves.concat([
      {
        id: uid(),
        date: date || today(),
        qty: q,
        type,
        note: note.trim(),
        by: me?.uid ?? '',
      },
    ]);

    setBusy(true);

    try {
      await save(d);
      toast(MOVE[type] + ': ' + q + ' pcs likh diya');
      onClose();
    } catch (x) {
      setBusy(false);
      setErr(explain(x));
    }
  }

  return (
    <form id="moveForm" noValidate onSubmit={submit}>
      <Head
        id="mvTitle"
        title="Wapas / kharab"
        sub={
          it0
            ? it0.item +
              ' · ' +
              Math.max(remaining(it0), 0) +
              ' pcs stock me'
            : ''
        }
        onClose={onClose}
      />

      <div className="mbody">
        <div className="fgrid">
          <div className="field span2">
            <label htmlFor="m-type">
              Kya hua?
            </label>

            <select
              id="m-type"
              value={type}
              onChange={(e) =>
                setType(e.target.value as MoveType)
              }
            >
              <option value="back">
                Kisi ne wapas kiya (stock me wapas aaya)
              </option>
              <option value="damaged">
                Kharab ho gaya
              </option>
              <option value="vendor">
                Dukaan ko wapas bheja (return)
              </option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="m-qty">
              Kitne piece
            </label>

            <input
              id="m-qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={lim || 1}
              step={1}
              value={qty}
              onChange={(e) =>
                setQty(e.target.value)
              }
            />

            <span className="hint">
              {lim > 0
                ? 'Zyada se zyada ' +
                  lim +
                  (type === 'back'
                    ? ' (jitne diye the)'
                    : ' (jitne stock me hai)')
                : type === 'back'
                  ? 'Abhi kisi ko diya hi nahi'
                  : 'Stock me kuch nahi bacha'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="m-date">Kab</label>

            <input
              id="m-date"
              type="date"
              value={date}
              onChange={(e) =>
                setDate(e.target.value)
              }
            />
          </div>

          <div className="field span2">
            <label htmlFor="m-note">Note</label>

            <input
              id="m-note"
              placeholder="Kisne wapas kiya, ya kya kharabi hai"
              autoComplete="off"
              value={note}
              onChange={(e) =>
                setNote(e.target.value)
              }
            />
          </div>
        </div>

        {err && (
          <p className="ferr">{err}</p>
        )}
      </div>

      <div className="mfoot">
        <button
          type="button"
          className="btn"
          onClick={onClose}
        >
          Rehne do
        </button>

        <button
          type="submit"
          className="btn primary"
          id="m-save"
          disabled={busy}
        >
          {busy ? 'Save ho raha…' : 'Save karo'}
        </button>
      </div>
    </form>
  );
}

/* ---------- SETTINGS ---------- */

type GoogleInfo = {
  enabled: boolean;
  sync: SyncState;
};

function timeText(iso: string): string {
  const t = new Date(iso);

  return isNaN(t.getTime())
    ? ''
    : t.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function GoogleSection({
  google,
}: {
  google: GoogleInfo;
}) {
  const { items, toast } = useReg();

  const [links, setLinks] = useState<{
    sheetUrl?: string;
    folderUrl?: string;
  }>({});

  const [busy, setBusy] = useState(false);

  const [msg, setMsg] = useState<{
    cls: string;
    text: string;
  }>({
    cls: 'hint',
    text: '',
  });

  useEffect(() => {
    if (!google.enabled) return;

    let live = true;

    googlePing().then(
      (r) => live && setLinks(r),
      (e) =>
        live &&
        setMsg({
          cls: 'badmsg',
          text: syncMessage(errCode(e)),
        })
    );

    return () => {
      live = false;
    };
  }, [google.enabled]);

  async function resync() {
    setBusy(true);

    setMsg({
      cls: 'hint',
      text: 'Shuru ho raha hai…',
    });

    try {
      const n = await resyncAll(
        items,
        (t) =>
          setMsg({
            cls: 'hint',
            text: t,
          })
      );

      setMsg({
        cls: 'okmsg',
        text: n + ' entries Sheet me likh di.',
      });

      toast('Google Sheet update ho gayi');
    } catch (e) {
      setMsg({
        cls: 'badmsg',
        text: syncMessage(errCode(e)),
      });
    } finally {
      setBusy(false);
    }
  }

  const s = google.sync;

  return (
    <section className="setsec card">
      <h3 className="fsh">
        Google Sheet aur Drive
      </h3>

      <p
        className={
          'aistate' + (google.enabled ? ' on' : '')
        }
        id="s-gMsg"
      >
        <span
          className="dot"
          aria-hidden="true"
        />
        {google.enabled ? 'Chalu' : 'Band'}
      </p>

      {!google.enabled ? (
        <p className="hint">
          Har entry Google Sheet me aur har bill
          Google Drive me save karne ke liye
          Vercel me GOOGLE_SCRIPT_URL aur
          GOOGLE_SCRIPT_SECRET daal ke dobara
          deploy karo (README dekho).
        </p>
      ) : (
        <>
          <p className="hint" id="s-gState">
            {s.running
              ? 'Abhi bhej raha hai…'
              : s.pending
                ? s.pending +
                  ' badlav Sheet me bhejne baaki'
                : 'Sab Sheet me pahunch gaya'}

            {s.lastOk
              ? ' · aakhri baar ' + timeText(s.lastOk)
              : ''}
          </p>

          {s.lastErr && s.pending > 0 && (
            <p className="badmsg">
              {syncMessage(s.lastErr)}
            </p>
          )}

          {(links.sheetUrl || links.folderUrl) && (
            <div className="inrow">
              {links.sheetUrl && (
                <a
                  className="btn sm"
                  href={links.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="sheet" />
                  Sheet kholo
                </a>
              )}

              {links.folderUrl && (
                <a
                  className="btn sm"
                  href={links.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon name="cloud" />
                  Bill folder kholo
                </a>
              )}
            </div>
          )}

          <div className="inrow">
            <button
              type="button"
              className="btn sm primary"
              id="s-resync"
              onClick={resync}
              disabled={busy}
            >
              Saari entries Sheet me dobara bhejo
            </button>
          </div>

          <p
            className={msg.cls}
            id="s-gResult"
            role="status"
          >
            {msg.text}
          </p>

          <p className="hint">
            Sheet sirf copy hai: Sheet me kuch
            badloge to app me nahi aayega.
            Badlav app me hi karo.
          </p>
        </>
      )}
    </section>
  );
}

function aiText(ai: AiStatus): string {
  if (!ai.enabled) {
    return (
      'AI band hai. Vercel ke Environment Variables ' +
      'me AI_API_KEY daal ke dobara deploy karo ' +
      '(README dekho).'
    );
  }

  return (
    'AI chalu hai (' +
    (ai.provider === 'claude' ? 'Claude' : 'Gemini') +
    '). Bill lagate hi bill no. aur details ' +
    'khud bhar jayengi.'
  );
}

/* ---------- NEW APPEARANCE & THEME ---------- */

type DisplayMode = 'dark' | 'light';

type ColorTheme =
  | 'purple'
  | 'blue'
  | 'green'
  | 'red'
  | 'orange'
  | 'pink'
  | 'cyan';

const themeColors: {
  id: ColorTheme;
  label: string;
  hex: string;
}[] = [
  {
    id: 'purple',
    label: 'Purple',
    hex: '#6366F1',
  },
  {
    id: 'blue',
    label: 'Blue',
    hex: '#2563EB',
  },
  {
    id: 'green',
    label: 'Green',
    hex: '#16A34A',
  },
  {
    id: 'red',
    label: 'Red',
    hex: '#DC2626',
  },
  {
    id: 'orange',
    label: 'Orange',
    hex: '#EA580C',
  },
  {
    id: 'pink',
    label: 'Pink',
    hex: '#DB2777',
  },
  {
    id: 'cyan',
    label: 'Cyan',
    hex: '#0891B2',
  },
];

function ThemeSection() {
  const [mode, setMode] =
    useState<DisplayMode>('dark');

  const [color, setColor] =
    useState<ColorTheme>('purple');

  useEffect(() => {
    const root = document.documentElement;

    const savedMode = localStorage.getItem(
      'office-theme-mode'
    );

    const savedColor = localStorage.getItem(
      'office-theme-color'
    );

    const initialMode: DisplayMode =
      savedMode === 'light' ? 'light' : 'dark';

    const initialColor: ColorTheme =
      themeColors.find((c) => c.id === savedColor)
        ?.id ?? 'purple';

    setMode(initialMode);
    setColor(initialColor);

    root.dataset.theme = initialMode;
    root.dataset.color = initialColor;
  }, []);

  function changeMode(next: DisplayMode) {
    setMode(next);

    document.documentElement.dataset.theme =
      next;

    localStorage.setItem(
      'office-theme-mode',
      next
    );
  }

  function changeColor(next: ColorTheme) {
    setColor(next);

    document.documentElement.dataset.color =
      next;

    localStorage.setItem(
      'office-theme-color',
      next
    );
  }

  return (
    <section
      className="setsec card"
      aria-label="Appearance and color theme"
    >
      <h3 className="fsh">
        Appearance &amp; Theme
      </h3>

      <p className="hint">
        Dark / Light mode aur apna pasandida
        rang chuno.
      </p>

      <span className="flabel">
        Display Mode
      </span>

      <div
        className="theme-modes"
        role="group"
        aria-label="Display mode"
      >
        <button
          type="button"
          className="theme-mode"
          aria-pressed={mode === 'light'}
          onClick={() => changeMode('light')}
        >
          ☀️ Light
        </button>

        <button
          type="button"
          className="theme-mode"
          aria-pressed={mode === 'dark'}
          onClick={() => changeMode('dark')}
        >
          🌙 Dark
        </button>
      </div>

      <span className="flabel">
        Color Theme
      </span>

      <div
        className="theme-colors"
        role="group"
        aria-label="Color theme"
      >
        {themeColors.map((c) => (
          <button
            key={c.id}
            type="button"
            className="theme-color"
            aria-pressed={color === c.id}
            onClick={() => changeColor(c.id)}
          >
            <span
              className="theme-swatch"
              style={{
                background: c.hex,
              }}
              aria-hidden="true"
            >
              {color === c.id ? '✓' : ''}
            </span>

            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <p className="hint">
        Theme is browser me save rahegi.
        Data aur PDF par koi asar nahi padega.
      </p>
    </section>
  );
}

/* ---------- SETTINGS PAGE ---------- */

export function SettingsSections() {
  const { me, ai, google, signOut } = useReg();

  const [team, setTeam] = useState('');

  const [msg, setMsg] = useState<{
    cls: string;
    text: string;
  }>({
    cls: 'hint',
    text: '',
  });

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;

    readTeam().then(
      (list) =>
        live && setTeam(list.join('\n')),
      () =>
        live &&
        setMsg({
          cls: 'badmsg',
          text: 'Team list nahi khuli.',
        })
    );

    return () => {
      live = false;
    };
  }, []);

  async function saveTeamList(
    meNow: Me | null
  ) {
    const raw = team
      .split(/[\s,;]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);

    const bad = raw.find(
      (x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)
    );

    if (bad) {
      return setMsg({
        cls: 'badmsg',
        text: 'Ye email sahi nahi lag raha: ' + bad,
      });
    }

    const list = distinct(raw);

    setBusy(true);

    try {
      await writeTeam(list, meNow);

      setTeam(list.join('\n'));

      setMsg({
        cls: 'okmsg',
        text:
          'Team save ho gayi (' +
          list.length +
          ' log).',
      });
    } catch (e) {
      setMsg({
        cls: 'badmsg',
        text:
          errCode(e) === 'permission-denied'
            ? 'Sirf register ka owner team badal sakta hai.'
            : 'Save nahi hua. Internet check karo.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      id="setForm"
      className="setgrid"
      noValidate
      onSubmit={(e) => e.preventDefault()}
    >
      <section className="setsec card">
        <h3 className="fsh">
          Aapka account
        </h3>

        <div className="me">
          <span className="avatar">
            {initials(me?.name)}
          </span>

          <div style={{ minWidth: 0 }}>
            <strong>{me?.name}</strong>
            <p className="hint">
              {me?.email}
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            className="btn sm"
            onClick={signOut}
          >
            <Icon name="logout" />
            Logout
          </button>
        </div>
      </section>

      <section className="setsec card">
        <h3 className="fsh">
          Team: kaun-kaun register khol sakta hai
        </h3>

        <p className="hint">
          Har line me ek Gmail likho.
          Inke alawa sirf owner
          (jiska email Firebase rules me hai)
          andar aa sakta hai.
          Team sirf owner badal sakta hai.
        </p>

        <textarea
          id="s-team"
          rows={4}
          placeholder={
            'banda1@gmail.com\nbanda2@gmail.com'
          }
          autoComplete="off"
          value={team}
          onChange={(e) =>
            setTeam(e.target.value)
          }
        />

        <div className="inrow">
          <button
            type="button"
            className="btn sm primary"
            onClick={() => saveTeamList(me)}
            disabled={busy}
          >
            Team save karo
          </button>

          <span
            className={msg.cls}
            id="s-teamMsg"
            role="status"
          >
            {msg.text}
          </span>
        </div>
      </section>

      <section className="setsec card">
        <h3 className="fsh">
          AI se bill padhna
        </h3>

        <p
          className={
            'aistate' +
            (ai.enabled ? ' on' : '')
          }
          id="s-aiMsg"
        >
          <span
            className="dot"
            aria-hidden="true"
          />
          {ai.enabled ? 'Chalu' : 'Band'}
        </p>

        <p className="hint">
          {aiText(ai)}
        </p>

        <p className="hint">
          AI ki key server pe rehti hai,
          kisi phone ya browser me nahi jaati.
        </p>
      </section>

      <GoogleSection google={google} />

      {/* NEW DARK / LIGHT & COLOR THEME */}
      <ThemeSection />
    </form>
  );
}

/* ---------- PHOTO LIGHTBOX ---------- */

export function Lightbox({
  bill, onClose,
}: {
  bill: {
    url: string;
    name: string;
  } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!bill}
      onClose={onClose}
      className="lightbox"
      label="Bill ki photo"
      clickClose
    >
      {bill && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bill.url}
            alt={bill.name || 'Bill'}
          />

          <p>{bill.name}</p>
        </>
      )}
    </Dialog>
  );
}
