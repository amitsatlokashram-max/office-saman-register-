'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { readBillWithAi } from '@/lib/ai';
import { billExt, delBill, delBillIfUnused, getBill, saveFile, uploadBill } from '@/lib/bills';
import { MOVE, fdate, inr, issuedQty, moveSum, myPay, num, regNos, remaining, status, today, warrantyState } from '@/lib/calc';
import { errCode } from '@/lib/errors';
import { deleteItemDoc } from '@/lib/firebase';
import { explain, explainAi, explainUpload } from '@/lib/messages';
import type { Bill, Issue, Item } from '@/lib/types';
import { BillImg } from './BillThumb';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { useReg, useSave } from './context';
import { queueEntryDelete, removeBill } from '@/lib/sync';

type Props = {
  id: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onIssue: (id: string) => void;
  onMove: (id: string) => void;
  onViewBill: (b: { url: string; name: string }) => void;
};

export function EntryDrawer(props: Props) {
  return (
    <Dialog open={!!props.id} onClose={props.onClose} className="drawer" label="Entry ki puri detail" backdropClose>
      {props.id && <DrawerBody key={props.id} {...props} id={props.id} />}
    </Dialog>
  );
}

type UI = {
  confirmDel?: boolean;
  confirmIssue?: string | null;
  confirmMove?: string | null;
  confirmBill?: string | null;
  uploading?: boolean;
  aiReading?: boolean;
};

function DrawerBody({ id, onClose, onEdit, onIssue, onMove, onViewBill }: Props & { id: string }) {
  const { items, getItem, toast, ai, me, printEntry } = useReg();
  const save = useSave();
  const [ui, setUi] = useState<UI>({});
  
  // Kisko diya edit state
  const [editIssueId, setEditIssueId] = useState<string | null>(null);
  const [editPerson, setEditPerson] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editQty, setEditQty] = useState<number | string>(1);
  const [editDate, setEditDate] = useState(today());
  const [editNote, setEditNote] = useState('');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const patchUi = (p: UI) => alive.current && setUi((u) => ({ ...u, ...p }));

  const it = items.find((x) => x.id === id);
  if (!it) {
    return (
      <div className="dwrap">
        <div className="dhead">
          <div>
            <h2>Entry nahi mili</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Band karo">
            <Icon name="x" />
          </button>
        </div>
        <div className="dscroll">
          <p className="muted">Ye entry ab register me nahi hai. Shayad delete ho gayi.</p>
        </div>
      </div>
    );
  }

  async function update(mutate: (d: Item) => void, okMsg: string) {
    const cur = getItem(id);
    if (!cur) return;
    const d = structuredClone(cur);
    mutate(d);
    try {
      await save(d);
      toast(okMsg);
    } catch (e) {
      toast(explain(e));
    }
  }

  function startEditIssue(is: Issue) {
    setEditIssueId(is.id);
    setEditPerson(is.person || '');
    setEditDept(is.dept || '');
    setEditQty(is.qty || 1);
    setEditDate(is.date || today());
    setEditNote(is.note || '');
  }

  async function saveIssue(iid: string) {
    if (!editPerson.trim()) {
      toast('Naam likhna zaroori hai.');
      return;
    }
    const q = num(editQty);
    if (q <= 0) {
      toast('Piece kam se kam 1 hona chahiye.');
      return;
    }
    const cur = getItem(id);
    if (!cur) return;
    const oldIss = cur.issues.find((i) => i.id === iid);
    const oldQty = oldIss ? num(oldIss.qty) : 0;
    const diff = q - oldQty;
    if (diff > 0 && remaining(cur) < diff) {
      toast('Itne piece stock me bache nahi hain.');
      return;
    }

    await update((d) => {
      d.issues = d.issues.map((i) => {
        if (i.id === iid) {
          return {
            ...i,
            person: editPerson.trim(),
            dept: editDept.trim(),
            qty: q,
            date: editDate || today(),
            note: editNote.trim(),
          };
        }
        return i;
      });
    }, 'Badlav save ho gaye');
    setEditIssueId(null);
  }

  async function deleteIssue(iid: string) {
    patchUi({ confirmIssue: null });
    await update((d) => {
      d.issues = d.issues.filter((i) => i.id !== iid);
    }, 'Hata diya');
  }

  async function deleteMove(mid: string) {
    patchUi({ confirmMove: null });
    const cur = getItem(id);
    if (!cur) return;
    const mv = cur.moves.find((m) => m.id === mid);
    if (mv && mv.type === 'back') {
      const after = { ...cur, moves: cur.moves.filter((m) => m.id !== mid) };
      if (remaining(after) < 0) {
        toast('Pehle jo piece diye ya kharab likhe hai unhe hatao, warna stock minus ho jayega.');
        return;
      }
    }
    await update((d) => {
      d.moves = d.moves.filter((m) => m.id !== mid);
    }, 'Hata diya');
  }

  async function deleteBill(bid: string) {
    patchUi({ confirmBill: null });
    const cur = getItem(id);
    if (!cur) return;
    const bill = cur.bills.find((b) => b.id === bid);
    const d = structuredClone(cur);
    d.bills = d.bills.filter((b) => b.id !== bid);
    try {
      await save(d);
      if (bill) removeBill(bill, items, id);
      toast('Bill hata diya');
    } catch (e) {
      toast(explain(e));
    }
  }

  async function deleteEntry() {
    const cur = getItem(id);
    if (!cur) return;
    try {
      await deleteItemDoc(id);
      queueEntryDelete(cur, items);
      cur.bills.forEach((b) => delBillIfUnused(b.id, items, id));
      onClose();
      toast('Entry delete ho gayi');
    } catch (e) {
      toast(explain(e));
    }
  }

  async function readBillNo(bill: Bill, blob: Blob) {
    patchUi({ aiReading: true });
    try {
      const res = await readBillWithAi(bill, blob);
      const bn = String(res.billNo ?? '').trim().slice(0, 80);
      const cur = getItem(id);
      if (!cur) return;
      if (!bn) {
        toast('Bill me bill no. nahi mila. Edit karke khud likh do.');
        return;
      }
      if (cur.billNo) return;
      const d = structuredClone(cur);
      d.billNo = bn;
      if (res.vendor && !d.vendor) d.vendor = String(res.vendor).trim().slice(0, 80);
      await save(d);
      toast('Bill no. bhar diya: ' + bn);
    } catch (e) {
      if (errCode(e) !== 'cancelled') toast(errCode(e) === 'permission-denied' ? explain(e) : explainAi(e));
    } finally {
      patchUi({ aiReading: false });
    }
  }

  async function onFiles(files: File[]) {
    if (!files.length) return;
    patchUi({ uploading: true });
    const added: Bill[] = [];
    let last: { bill: Bill; blob: Blob } | null = null;
    let failed: unknown = null;
    for (const f of files) {
      try {
        last = await uploadBill(f, me);
        added.push(last.bill);
      } catch (e) {
        failed = e;
      }
    }
    patchUi({ uploading: false });
    const cur = getItem(id);
    let saved = false;
    if (added.length && cur) {
      const d = structuredClone(cur);
      d.bills = d.bills.concat(added);
      try {
        await save(d);
        saved = true;
        toast(added.length + ' bill lag gaya');
      } catch (e) {
        added.forEach((b) => delBill(b.id));
        toast(explain(e));
      }
    } else added.forEach((b) => delBill(b.id));
    if (failed) toast(explainUpload(failed));
    if (saved && last && ai.enabled && cur && !cur.billNo) readBillNo(last.bill, last.blob);
  }

  async function viewBill(b: Bill) {
    try {
      const v = await getBill(b.id);
      onViewBill({ url: v.url, name: b.name });
    } catch {
      toast('Bill nahi khula.');
    }
  }
  async function openPdf(b: Bill) {
    const w = window.open('', '_blank');
    try {
      const v = await getBill(b.id);
      if (w) w.location.href = v.url;
      else window.open(v.url, '_blank');
    } catch {
      w?.close();
      toast('Bill nahi khula.');
    }
  }
  async function downloadBill(b: Bill) {
    try {
      const v = await getBill(b.id);
      saveFile(b.name.replace(/\.[^.]+$/, '') + '.' + billExt(b.type), v.blob);
    } catch {
      toast('Bill download nahi hua.');
    }
  }

  const st = status(it);
  const rem = remaining(it);
  const nos = regNos(items);
  const mp = myPay(it);
  const war = warrantyState(it);
  const backLimit = Math.max(0, issuedQty(it) - moveSum(it, 'back'));
  const issues = it.issues.slice().sort((a, b) => a.date.localeCompare(b.date));
  const moves = it.moves.slice().sort((a, b) => a.date.localeCompare(b.date));

  const facts: { k: string; v: ReactNode; cls?: string }[] = [
    { k: 'Kab mangaya', v: fdate(it.orderDate) || '—' },
    {
      k: 'Kab pahuncha',
      v: it.receivedDate ? (
        fdate(it.receivedDate)
      ) : (
        <>
          <span className="pend">Abhi nahi aaya</span>
          <button type="button" className="btn sm" onClick={() => update((d) => { d.receivedDate = today(); }, 'Pahuncha: aaj ki tareekh lag gayi')}>
            <Icon name="check" />
            Aaj aa gaya
          </button>
        </>
      ),
    },
    { k: 'Kahan se mangaya', v: it.vendor || '—' },
    { k: 'Kisne laya', v: it.broughtBy || '—' },
    { k: 'Bill / Order no.', v: it.billNo || '—' },
    {
      k: 'Mera paisa',
      cls: 'wide',
      v: mp.mine ? (
        <>
          <span>
            Maine diye <b>{inr(mp.paid)}</b> · Mile <b>{inr(mp.back)}</b>
            {it.myBackDate && mp.back > 0 ? ' (' + fdate(it.myBackDate) + ')' : ''}
          </span>
          {mp.due > 0 ? (
            <>
              <span className="stamp low">{inr(mp.due)} baaki</span>
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  update((d) => {
                    const m = myPay(d);
                    d.iPaid = true;
                    d.myPaid = m.paid;
                    d.myBack = m.paid;
                    d.myBackDate = today();
                  }, 'Likh diya: saare paise wapas mil gaye')
                }
              >
                <Icon name="check" />
                Sab mil gaye
              </button>
            </>
          ) : (
            <span className="stamp ok">Sab mil gaye</span>
          )}
        </>
      ) : (
        'Maine nahi diye (dukaan ya laane wale ne khud liye)'
      ),
    },
  ];
  if (it.warrantyTill)
    facts.push({
      k: 'Warranty',
      v: (
        <>
          {fdate(it.warrantyTill)}{' '}
          {war && <span className={'stamp ' + war.cls}>{war.key === 'ok' ? war.n + ' din baaki' : war.label}</span>}
        </>
      ),
    });
  if (it.serials) facts.push({ k: 'Serial no.', v: <span className="pre">{it.serials}</span>, cls: 'wide' });
  if (it.note) facts.push({ k: 'Note', v: it.note, cls: 'wide' });

  return (
    <div className="dwrap">
      <div className="dhead">
        <div style={{ minWidth: 0 }}>
          <p className="eyebrow">
            Entry #{String(nos[it.id] || 0).padStart(3, '0')}
            {it.category ? ' · ' + it.category : ''}
          </p>
          <h2>{it.item || '(bina naam)'}</h2>
          <div className="stamps">
            <span className={'stamp ' + st.cls}>{st.label}</span>
            {mp.due > 0 && <span className="stamp low">Mere {inr(mp.due)} baaki</span>}
            {war && war.key !== 'ok' && <span className={'stamp ' + war.cls}>{war.label}</span>}
          </div>
        </div>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Band karo">
          <Icon name="x" />
        </button>
      </div>

      <div className="dscroll">
        <div className="moneyband">
          <span className="eq">
            {num(it.qty)} pcs × {num(it.rate) ? inr(it.rate) : '—'}
          </span>
          <span className="tot">{inr(it.total)}</span>
        </div>

        <dl className="facts">
          {facts.map((f) => (
            <div key={f.k} className={f.cls}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>

        <section className="dsec">
          <div className="dsec-h">
            <h3>Kisko diya</h3>
            <span className="grow">
              {Math.max(rem, 0)} bache · {num(it.qty)} me se
            </span>
            <button type="button" className="btn sm primary" onClick={() => onIssue(id)} disabled={rem <= 0} title={rem > 0 ? undefined : 'Stock me kuch nahi bacha'}>
              <Icon name="give" />
              Kisi ko do
            </button>
            <button type="button" className="btn sm" onClick={() => onMove(id)} disabled={rem <= 0 && backLimit <= 0}>
              <Icon name="undo" />
              Wapas / kharab
            </button>
          </div>
          {issues.length ? (
            <ul className="issues">
              {issues.map((is) => (
                <li key={is.id} style={{ flexDirection: editIssueId === is.id ? 'column' : 'row', alignItems: editIssueId === is.id ? 'stretch' : 'center' }}>
                  {editIssueId === is.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 0', width: '100%' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          placeholder="Kisko diya (Naam)"
                          value={editPerson}
                          onChange={(e) => setEditPerson(e.target.value)}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                        />
                        <input
                          type="text"
                          placeholder="Department"
                          value={editDept}
                          onChange={(e) => setEditDept(e.target.value)}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number"
                          placeholder="Qty"
                          min={1}
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          style={{ width: '80px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                        />
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button type="button" className="btn sm primary" onClick={() => saveIssue(is.id)}>
                          Save karo
                        </button>
                        <button type="button" className="btn sm" onClick={() => setEditIssueId(null)}>
                          Radd karo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="iss-main">
                        <strong>{[is.person, is.dept].filter(Boolean).join(' · ') || '—'}</strong>
                        <small>{[fdate(is.date), is.note, is.byName ? 'likha: ' + is.byName : ''].filter(Boolean).join(' · ')}</small>
                      </div>
                      {ui.confirmIssue === is.id ? (
                        <div className="inline-confirm">
                          <span>Hatao?</span>
                          <button type="button" className="btn sm danger" onClick={() => deleteIssue(is.id)}>
                            Haan
                          </button>
                          <button type="button" className="btn sm" onClick={() => patchUi({ confirmIssue: null })}>
                            Nahi
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="iss-qty">{num(is.qty)} pcs</span>
                          <button type="button" className="iconbtn sm" onClick={() => startEditIssue(is)} aria-label="Edit karo" title="Edit karo">
                            <Icon name="edit" />
                          </button>
                          <button type="button" className="iconbtn sm" onClick={() => patchUi({ confirmIssue: is.id })} aria-label="Ye entry hatao" title="Hatao">
                            <Icon name="trash" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dnote">Abhi kisi ko nahi diya.</p>
          )}
          {moves.length > 0 && (
            <ul className="issues">
              {moves.map((mv) => (
                <li key={mv.id}>
                  <div className="iss-main">
                    <strong>{MOVE[mv.type]}</strong>
                    <small>{[fdate(mv.date), mv.note].filter(Boolean).join(' · ')}</small>
                  </div>
                  {ui.confirmMove === mv.id ? (
                    <div className="inline-confirm">
                      <span>Hatao?</span>
                      <button type="button" className="btn sm danger" onClick={() => deleteMove(mv.id)}>
                        Haan
                      </button>
                      <button type="button" className="btn sm" onClick={() => patchUi({ confirmMove: null })}>
                        Nahi
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={'iss-qty ' + (mv.type === 'back' ? 'plus' : 'minus')}>
                        {mv.type === 'back' ? '+' : '−'}
                        {num(mv.qty)} pcs
                      </span>
                      <button type="button" className="iconbtn sm" onClick={() => patchUi({ confirmMove: mv.id })} aria-label="Ye entry hatao" title="Hatao">
                        <Icon name="trash" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dsec">
          <div className="dsec-h">
            <h3>Bill</h3>
            <span className="grow">{it.bills.length} laga hai</span>
            <label className="btn sm" htmlFor="d-file">
              <Icon name="clip" />
              {ui.uploading ? 'Upload ho raha…' : 'Bill lagao'}
            </label>
            <input
              type="file"
              id="d-file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                onFiles(files);
              }}
            />
          </div>
          {it.bills.length ? (
            <div className="bills">
              {it.bills.map((b) => {
                const isPdf = b.type === 'application/pdf';
                return (
                  <figure className="bill" key={b.id}>
                    {isPdf ? (
                      <div className="pdfthumb">
                        <Icon name="file" />
                        PDF
                      </div>
                    ) : (
                      <button type="button" className="thumb" onClick={() => viewBill(b)} aria-label="Bill badi karke dekho">
                        <BillImg id={b.id} alt={b.name} className="bimg" />
                      </button>
                    )}
                    <figcaption>
                      <span className="bname" title={b.name}>
                        {b.name}
                      </span>
                      {ui.confirmBill === b.id ? (
                        <div className="inline-confirm">
                          <span>Hatao?</span>
                          <button type="button" className="btn sm danger" onClick={() => deleteBill(b.id)}>
                            Haan
                          </button>
                          <button type="button" className="btn sm" onClick={() => patchUi({ confirmBill: null })}>
                            Nahi
                          </button>
                        </div>
                      ) : (
                        <div className="bact">
                          {isPdf && (
                            <button type="button" className="btn sm" onClick={() => openPdf(b)}>
                              <Icon name="open" />
                              Kholo
                            </button>
                          )}
                          {b.driveUrl && (
                            <a className="iconbtn sm" href={b.driveUrl} target="_blank" rel="noopener noreferrer" aria-label="Google Drive me kholo" title="Google Drive me kholo">
                              <Icon name="cloud" />
                            </a>
                          )}
                          <button type="button" className="iconbtn sm" onClick={() => downloadBill(b)} aria-label="Download" title="Download">
                            <Icon name="dl" />
                          </button>
                          <button type="button" className="iconbtn sm" onClick={() => patchUi({ confirmBill: b.id })} aria-label="Bill hatao" title="Bill hatao">
                            <Icon name="trash" />
                          </button>
                        </div>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : (
            <p className="dnote">Abhi koi bill nahi laga.</p>
          )}
          {ui.aiReading && (
            <p className="dnote aiwait">
              <span className="spin" />
              AI bill se bill no. padh raha hai…
            </p>
          )}
        </section>

        {(it.addedByName || it.createdAt) && (
          <p className="meta">
            Entry ki: {it.addedByName || '—'}
            {it.createdAt ? ' · ' + fdate(it.createdAt.slice(0, 10)) : ''}
            {it.updatedByName && it.updatedBy !== it.addedBy ? ' · Aakhri badlav: ' + it.updatedByName : ''}
          </p>
        )}
      </div>

      <div className="dfoot">
        {ui.confirmDel ? (
          <div className="confirm">
            <p>Pakka delete karna hai? Ye entry aur iske bill hamesha ke liye hat jayenge.</p>
            <button type="button" className="btn danger" onClick={deleteEntry}>
              Haan, delete karo
            </button>
            <button type="button" className="btn" onClick={() => patchUi({ confirmDel: false })}>
              Nahi
            </button>
          </div>
        ) : (
          <>
            <button type="button" className="btn primary" onClick={() => onEdit(id)}>
              <Icon name="edit" />
              Edit karo
            </button>
            <button type="button" className="btn" id="d-print" onClick={() => printEntry(id)} title="Is entry ki parchi print karo (sign ki jagah ke saath)">
              <Icon name="print" />
              Print<span className="hide-xs">parchi</span>
            </button>
            <span className="grow" />
            <button type="button" className="btn quiet-danger" onClick={() => patchUi({ confirmDel: true })}>
              <Icon name="trash" />
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}