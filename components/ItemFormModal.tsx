'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { parseAiLines, readBillWithAi } from '@/lib/ai';
import { delBill, uploadBill } from '@/lib/bills';
import { addYears, blankItem, inr, num, remaining, round2, today, uid, validDate } from '@/lib/calc';
import { errCode } from '@/lib/errors';
import { newItemId } from '@/lib/firebase';
import { explain, explainAi, explainUpload } from '@/lib/messages';
import type { AiLine, AiResult, Bill, Item } from '@/lib/types';
import { BillImg } from './BillThumb';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { useReg, useSave } from './context';
import { IssueRowsEditor, checkRows, newRow, type IRow } from './IssueRows';
import { removeBill as dropBill } from '@/lib/sync';

export function ItemFormModal({ open, editId, onClose }: { open: boolean; editId: string | null; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} className="modal" labelledBy="formTitle">
      {open && <ItemForm editId={editId} onDone={onClose} />}
    </Dialog>
  );
}

type Vals = {
  item: string; category: string; billNo: string;
  qty: string; rate: string; total: string;
  orderDate: string; receivedDate: string; vendor: string; broughtBy: string; note: string;
  serials: string; warrantyTill: string;
  iPaid: boolean; myPaid: string; myBack: string; myBackDate: string;
  issOn: boolean; issDate: string;
};
type FieldErr = Partial<Record<'item' | 'qty', string>>;
type AiView = { kind: 'busy' | 'msg' | 'ok' | 'pick'; node: ReactNode } | null;

const str = (n: number) => (n ? String(n) : '');

function initVals(it?: Item): Vals {
  return {
    item: it?.item ?? '', category: it?.category ?? '', billNo: it?.billNo ?? '',
    qty: it ? String(num(it.qty)) : '1', rate: it ? str(it.rate) : '', total: it ? str(it.total) : '',
    orderDate: it ? it.orderDate : today(), receivedDate: it?.receivedDate ?? '',
    vendor: it?.vendor ?? '', broughtBy: it?.broughtBy ?? '', note: it?.note ?? '',
    serials: it?.serials ?? '', warrantyTill: it?.warrantyTill ?? '',
    iPaid: !!it?.iPaid, myPaid: it?.iPaid ? str(it.myPaid) : '', myBack: it?.iPaid ? str(it.myBack) : '', myBackDate: it?.myBackDate ?? '',
    issOn: false, issDate: today(),
  };
}

/** Piece, rate aur total aapas me jude hai: rate badlo to total, total badlo to rate. */
function couple(p: Vals, changed: 'qty' | 'rate' | 'total'): Vals {
  const q = Math.round(num(p.qty));
  if (q <= 0) return p;
  if (changed === 'total') return p.total !== '' ? { ...p, rate: String(round2(num(p.total) / q)) } : p;
  if (p.rate !== '') return { ...p, total: String(round2(q * num(p.rate))) };
  if (p.total !== '') return { ...p, rate: String(round2(num(p.total) / q)) };
  return p;
}

const formTotal = (v: Vals) => num(v.total) || round2(num(v.rate) * Math.round(num(v.qty)));

function ItemForm({ editId, onDone }: { editId: string | null; onDone: () => void }) {
  const { items, getItem, me, toast, ai } = useReg();
  const save = useSave();
  const [v, setV] = useState<Vals>(() => initVals(editId ? getItem(editId) : undefined));
  const vRef = useRef(v);
  vRef.current = v;
  const [bills, setBills] = useState<Bill[]>(() => (editId ? getItem(editId)?.bills.map((b) => ({ ...b })) ?? [] : []));
  const billsRef = useRef(bills);
  billsRef.current = bills;
  const [uploading, setUploading] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRan, setAiRan] = useState(false);
  const [aiView, setAiView] = useState<AiView>(null);
  const [aiLines, setAiLines] = useState<AiLine[]>([]);
  const [flash, setFlash] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<FieldErr>({});
  const [issRows, setIssRows] = useState<IRow[]>([]);
  const [issErr, setIssErr] = useState<{ msg: string; key?: string } | null>(null);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const R = useRef({
    uploaded: [] as string[],
    removed: [] as Bill[],
    blobs: {} as Record<string, Blob>,
    saved: false,
    closed: false,
    aiCtl: null as AbortController | null,
  });

  useEffect(() => {
    const r = R.current;
    r.closed = false;
    return () => {
      r.closed = true;
      r.aiCtl?.abort();
      r.aiCtl = null;
      if (!r.saved) r.uploaded.forEach(delBill); // save nahi kiya to naye lagaye bill hata do
    };
  }, []);

  const unflash = (...keys: string[]) =>
    setFlash((p) => {
      if (!keys.some((k) => p[k])) return p;
      const n = { ...p };
      keys.forEach((k) => delete n[k]);
      return n;
    });
  const set = <K extends keyof Vals>(k: K, val: Vals[K]) => {
    setV((p) => ({ ...p, [k]: val }) as Vals);
    unflash(k);
  };
  const setMoney = (k: 'qty' | 'rate' | 'total', val: string) => {
    setV((p) => couple({ ...p, [k]: val }, k));
    unflash('qty', 'rate', 'total');
  };
  const cls = (k: string) => (flash[k] ? 'aifilled' : undefined);
  const focus = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  /* ---------- bills ---------- */
  async function onFiles(files: File[]) {
    if (!files.length) return;
    let lastBill: Bill | null = null;
    let failed: unknown = null;
    for (const f of files) {
      setUploading((n) => n + 1);
      try {
        const r = await uploadBill(f, me);
        if (R.current.closed && !R.current.saved) delBill(r.bill.id);
        else {
          R.current.uploaded.push(r.bill.id);
          R.current.blobs[r.bill.id] = r.blob;
          setBills((b) => [...b, r.bill]);
          lastBill = r.bill;
        }
      } catch (e) {
        failed = e;
      }
      if (!R.current.closed) setUploading((n) => n - 1);
    }
    if (R.current.closed) return;
    if (failed) setFormErr(explainUpload(failed));
    if (lastBill && ai.enabled && !R.current.aiCtl) runAi(true, lastBill);
  }

  function removeBill(bid: string) {
    const bill = billsRef.current.find((x) => x.id === bid);
    setBills((b) => b.filter((x) => x.id !== bid));
    delete R.current.blobs[bid];
    const i = R.current.uploaded.indexOf(bid);
    if (i >= 0) {
      R.current.uploaded.splice(i, 1);
      delBill(bid);
    } else if (bill) R.current.removed.push(bill);
  }

  /* ---------- AI ---------- */
  async function runAi(auto: boolean, bill?: Bill) {
    const b = bill || billsRef.current[billsRef.current.length - 1];
    if (!b || R.current.aiCtl) return;
    const ctl = new AbortController();
    R.current.aiCtl = ctl;
    setAiBusy(true);
    setAiRan(true);
    setAiLines([]);
    setAiView({
      kind: 'busy',
      node: (auto ? 'Bill padh ke bill no. aur baaki details bhar raha hai…' : 'AI bill padh raha hai…') + ' 10 se 40 second lag sakte hai.',
    });
    try {
      const res = await readBillWithAi(b, R.current.blobs[b.id], ctl.signal);
      if (R.current.closed) return;
      applyAi(res, auto);
    } catch (e) {
      if (R.current.closed) return;
      setAiView(errCode(e) === 'cancelled' ? null : { kind: 'msg', node: explainAi(e) });
    } finally {
      if (R.current.aiCtl === ctl) R.current.aiCtl = null;
      if (!R.current.closed) setAiBusy(false);
    }
  }

  function lineVals(l: AiLine): Partial<Vals> {
    return { item: l.item, ...(l.category ? { category: l.category } : {}), qty: String(l.qty), rate: str(l.rate), total: str(l.total) };
  }

  function applyAi(res: AiResult, auto: boolean) {
    const cur = vRef.current;
    const lines = parseAiLines(res.lines);
    const patch: Partial<Vals> = {};
    const fl: string[] = [];
    if (validDate(res.date) && !(auto && editId)) {
      patch.orderDate = res.date;
      fl.push('orderDate');
    }
    const vendor = String(res.vendor ?? '').trim().slice(0, 80);
    if (vendor && !cur.vendor.trim()) {
      patch.vendor = vendor;
      fl.push('vendor');
    }
    const bn = String(res.billNo ?? '').trim().slice(0, 80);
    if (bn && (!auto || !cur.billNo.trim())) {
      patch.billNo = bn;
      fl.push('billNo');
    }
    const itemTyped = auto && !!cur.item.trim();
    if (lines.length === 1 && !itemTyped) {
      Object.assign(patch, lineVals(lines[0]));
      fl.push('item', 'qty', 'rate', 'total');
      if (lines[0].category) fl.push('category');
    }
    setV((p) => ({ ...p, ...patch }));
    setFlash((p) => {
      const n = { ...p };
      fl.forEach((k) => (n[k] = true));
      return n;
    });
    setAiLines(lines);
    const head = bn ? (
      <>
        Bill no. <b>{bn}</b> bhar diya.
      </>
    ) : (
      <>Bill me bill no. nahi mila, khud likh do.</>
    );
    if (!lines.length) setAiView({ kind: 'msg', node: <>{head} Saman ki line saaf nahi mili, saman khud likh do.</> });
    else if (itemTyped) setAiView({ kind: 'ok', node: <>{head} Aapka likha saman waisa hi rakha hai.</> });
    else if (lines.length === 1) setAiView({ kind: 'ok', node: <>{head} Saman, rate aur total bhi bhar diya. Ek baar check karke Save karo.</> });
    else setAiView({ kind: 'pick', node: <>{head} Bill me {lines.length} saman mile. Ek chuno is entry ke liye, ya sab ki alag-alag entry ek saath bana do.</> });
  }

  function pickLine(l: AiLine) {
    setV((p) => ({ ...p, ...lineVals(l) }));
    setFlash((p) => ({ ...p, item: true, qty: true, rate: true, total: true, ...(l.category ? { category: true } : {}) }));
    setAiView({ kind: 'ok', node: 'Ye saman form me bhar diya. Check karke Save karo.' });
  }

  /* ---------- save ---------- */
  function common(x: Vals) {
    return {
      orderDate: x.orderDate, receivedDate: x.receivedDate, vendor: x.vendor.trim(), broughtBy: x.broughtBy.trim(),
      billNo: x.billNo.trim(), note: x.note.trim(),
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrs({});
    setFormErr('');
    setIssErr(null);
    if (uploading) {
      setFormErr('Bill upload ho raha hai, thoda ruko.');
      return;
    }
    const item = v.item.trim();
    const qty = Math.round(num(v.qty));
    if (!item) {
      setErrs({ item: 'Saman ka naam likho' });
      return focus('f-item');
    }
    if (qty < 1) {
      setErrs({ qty: 'Kam se kam 1 piece' });
      return focus('f-qty');
    }
    let rate = round2(num(v.rate));
    let total = round2(num(v.total));
    if (!total && rate) total = round2(rate * qty);
    if (!rate && total) rate = round2(total / qty);
    const existing = editId ? getItem(editId) : undefined;
    if (editId && !existing) {
      setFormErr('Ye entry ab register me nahi hai.');
      return;
    }
    if (existing && remaining({ ...existing, qty }) < 0) {
      setErrs({ qty: 'Itne piece pehle hi de chuke ho ya kharab likhe hai, isse kam nahi ho sakta' });
      return focus('f-qty');
    }
    let my = { iPaid: false, myPaid: 0, myBack: 0, myBackDate: '' };
    if (v.iPaid) {
      const paid = round2(num(v.myPaid)) || total;
      const back = round2(num(v.myBack));
      if (back > paid) {
        setFormErr('Wapas mile paise, diye hue paison se zyada nahi ho sakte.');
        return focus('f-myBack');
      }
      my = { iPaid: true, myPaid: paid, myBack: back, myBackDate: back > 0 ? v.myBackDate : '' };
    }
    const base: Item = existing ? structuredClone(existing) : blankItem(newItemId(), me);
    const doc: Item = {
      ...base,
      ...common(v),
      ...my,
      item,
      category: v.category.trim(),
      qty,
      rate,
      total,
      serials: v.serials.trim(),
      warrantyTill: v.warrantyTill,
      bills: billsRef.current.map((b) => ({ ...b })),
    };
    if (!existing && v.issOn) {
      const chk = checkRows(issRows, qty);
      if (!chk.ok) {
        setIssErr({ msg: chk.msg, key: chk.key });
        return focus('f-iss-person');
      }
      doc.issues = chk.rows.map((r) => ({
        id: uid(), date: v.issDate || today(), qty: r.qty, person: r.person, dept: r.dept, note: '', by: me?.uid ?? '', byName: me?.name ?? '',
      }));
    }
    setSaving(true);
    try {
      await save(doc);
      R.current.saved = true;
      R.current.removed.forEach((b) => dropBill(b, items, doc.id));
      toast(existing ? 'Entry update ho gayi' : 'Entry jud gayi · ' + inr(total) + ' total me jud gaya');
      onDone();
    } catch (err) {
      setSaving(false);
      setFormErr(explain(err));
    }
  }

  async function saveAllLines() {
    if (aiLines.length < 2) return;
    setSaving(true);
    setAiView({ kind: 'busy', node: aiLines.length + ' entries save ho rahi hai…' });
    const c = common(v);
    const paidRaw = num(v.myPaid);
    const allBack = paidRaw > 0 && num(v.myBack) >= paidRaw;
    let done = 0;
    let err: unknown = null;
    for (const l of aiLines) {
      const doc: Item = {
        ...blankItem(newItemId(), me),
        ...c,
        item: l.item,
        category: l.category,
        qty: l.qty,
        rate: l.rate,
        total: l.total,
        bills: billsRef.current.map((b) => ({ ...b })),
        ...(v.iPaid
          ? { iPaid: true, myPaid: l.total, myBack: allBack ? l.total : 0, myBackDate: allBack ? v.myBackDate || today() : '' }
          : {}),
      };
      try {
        await save(doc);
        done++;
      } catch (e) {
        err = e;
        break;
      }
    }
    if (done) {
      R.current.saved = true;
      R.current.removed.forEach((b) => dropBill(b, items, null));
    }
    if (err) {
      setSaving(false);
      setAiView({ kind: 'msg', node: done + ' entries save hui. Baaki save nahi hui: ' + explain(err) });
      return;
    }
    toast(done + ' entries jud gayi · ' + inr(aiLines.reduce((s, l) => s + l.total, 0)) + ' total me jud gaya');
    onDone();
  }

  /* ---------- view ---------- */
  const q = Math.round(num(v.qty));
  let showRate = num(v.rate);
  let showTotal = num(v.total);
  if (!showTotal && showRate && q > 0) showTotal = round2(showRate * q);
  if (!showRate && showTotal && q > 0) showRate = round2(showTotal / q);

  let myBal: { cls: string; text: string } = { cls: 'mybal', text: '' };
  if (v.iPaid) {
    const t = formTotal(v);
    const p = num(v.myPaid);
    const b = num(v.myBack);
    if (!p) myBal = { cls: 'mybal', text: 'Maine kitne diye, wo likho' + (t ? ' (is saman ka total ' + inr(t) + ')' : '') };
    else {
      const d = round2(p - b);
      if (d > 0) myBal = { cls: 'mybal due', text: 'Abhi ' + inr(d) + ' wapas milne baaki' };
      else if (d < 0) myBal = { cls: 'mybal due', text: 'Wapas mile, diye se zyada nahi ho sakte' };
      else myBal = { cls: 'mybal ok', text: 'Saare ' + inr(p) + ' wapas mil gaye' };
    }
  }

  const aiOK = ai.enabled && bills.length > 0;
  const billHint = aiOK
    ? 'Bill lagate hi AI bill no., saman, rate, total, tareekh aur dukaan khud bhar deta hai. Kuch chhoot jaye to button dabake dobara padhwa lo.'
    : ai.enabled
      ? 'Bill ki photo ya PDF lagao. Lagate hi AI bill no., saman, rate, total aur tareekh khud bhar dega.'
      : 'Phone se bill ki photo khinch ke bhi laga sakte ho.';

  const setWarranty = (y: number) => {
    let base = v.receivedDate || v.orderDate || today();
    if (!validDate(base)) base = today();
    set('warrantyTill', addYears(base, y));
  };

  return (
    <form id="itemForm" noValidate onSubmit={onSubmit}>
      <div className="mhead">
        <h2 id="formTitle">{editId ? 'Entry badlo' : 'Naya saman jodo'}</h2>
        <button type="button" className="iconbtn" onClick={onDone} aria-label="Band karo">
          <Icon name="x" />
        </button>
      </div>

      <div className="mbody">
        <div className="fsec">
          <h3 className="fsh">Bill (pehle lagao, AI form bhar dega)</h3>
          <div className="upl">
            {(bills.length > 0 || uploading > 0) && (
              <div className="upl-list" id="f-billList">
                {bills.map((b) => (
                  <div className="uitem" key={b.id}>
                    {b.type === 'application/pdf' ? <span className="tn">PDF</span> : <BillImg id={b.id} alt="" className="tn" />}
                    <span className="nm" title={b.name}>
                      {b.name}
                    </span>
                    <button type="button" className="iconbtn sm" onClick={() => removeBill(b.id)} aria-label="Ye bill hatao">
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
                {uploading > 0 && (
                  <div className="uitem">
                    <span className="tn">
                      <span className="spin" />
                    </span>
                    <span className="nm">Upload ho raha hai…</span>
                  </div>
                )}
              </div>
            )}
            <div className="upl-btns">
              <label className="btn sm" htmlFor="f-file" id="f-fileBtn">
                <Icon name="clip" />
                Bill lagao (photo ya PDF)
              </label>
              {aiOK && (
                <button type="button" className="btn sm ai" id="f-ai" onClick={() => runAi(false)} disabled={aiBusy}>
                  <Icon name="spark" />
                  {aiRan ? 'Bill dobara padho (AI)' : 'Bill se form bharo (AI)'}
                </button>
              )}
            </div>
            <input
              id="f-file"
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                e.target.value = '';
                onFiles(files);
              }}
            />
            <p className="hint">{billHint}</p>
            {aiView && (
              <div className="aibox" id="f-aiBox">
                <div className="aistat">
                  {aiView.kind === 'busy' && <span className="spin" />}
                  {aiView.kind === 'ok' && <Icon name="check" />}
                  <span>{aiView.node}</span>
                  {aiView.kind === 'busy' && aiBusy && (
                    <button type="button" className="btn sm" onClick={() => R.current.aiCtl?.abort()}>
                      Rok do
                    </button>
                  )}
                </div>
                {aiView.kind === 'pick' && (
                  <>
                    <div className="ailines">
                      {aiLines.map((l, i) => (
                        <button type="button" className="ailine" key={i} onClick={() => pickLine(l)}>
                          <strong>{l.item}</strong>
                          <span>
                            {l.qty} × {inr(l.rate)} = {inr(l.total)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div>
                      <button type="button" className="btn sm primary" onClick={saveAllLines} disabled={saving}>
                        Sab {aiLines.length} saman ki alag entry bana do
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Saman</h3>
          <div className="fgrid">
            <div className="field span2">
              <label htmlFor="f-item">Saman ka naam *</label>
              <input id="f-item" list="dl-item" placeholder="Jaise: Hard Disk 2TB Seagate" autoComplete="off" className={cls('item')} value={v.item} onChange={(e) => set('item', e.target.value)} />
              {errs.item && <span className="err">{errs.item}</span>}
            </div>
            <div className="field">
              <label htmlFor="f-category">Kis tarah ka saman</label>
              <input id="f-category" list="dl-category" placeholder="Hard Disk, SDI Cable, HDMI Cable…" autoComplete="off" className={cls('category')} value={v.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-billNo">Bill / Order no.</label>
              <input id="f-billNo" placeholder="Amazon order ID ya bill number" autoComplete="off" className={cls('billNo')} value={v.billNo} onChange={(e) => set('billNo', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Paisa</h3>
          <div className="fgrid g3">
            <div className="field">
              <label htmlFor="f-qty">Kitne piece *</label>
              <input id="f-qty" type="number" inputMode="numeric" min={1} step={1} className={cls('qty')} value={v.qty} onChange={(e) => setMoney('qty', e.target.value)} />
              {errs.qty && <span className="err">{errs.qty}</span>}
            </div>
            <div className="field">
              <label htmlFor="f-rate">Rate (1 piece ka)</label>
              <div className="money">
                <span>₹</span>
                <input id="f-rate" type="number" inputMode="decimal" min={0} step="any" placeholder="0" className={cls('rate')} value={v.rate} onChange={(e) => setMoney('rate', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="f-total">Total</label>
              <div className="money">
                <span>₹</span>
                <input id="f-total" type="number" inputMode="decimal" min={0} step="any" placeholder="0" className={cls('total')} value={v.total} onChange={(e) => setMoney('total', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="calcbox" aria-live="polite">
            <div className="eq">
              <b>{q > 0 ? q : 0}</b> pcs × <b>{inr(showRate)}</b>
            </div>
            <div className="tot">
              <small>Total</small>
              <strong id="cb-tot">{inr(showTotal)}</strong>
            </div>
          </div>
          <p className="hint">Rate daalo to total khud judta hai. Sirf total pata ho to total daalo, 1 piece ka rate khud nikal aayega.</p>
        </div>

        <div className="fsec">
          <h3 className="fsh">Mera paisa</h3>
          <label className="check" htmlFor="f-iPaid">
            <input
              type="checkbox"
              id="f-iPaid"
              checked={v.iPaid}
              onChange={(e) => {
                const on = e.target.checked;
                setV((p) => ({ ...p, iPaid: on, myPaid: on && !p.myPaid && formTotal(p) ? String(formTotal(p)) : p.myPaid }));
              }}
            />{' '}
            Maine apni jeb se paise diye
          </label>
          <p className="hint">Tick nahi kiya to maana jayega ki dukaan ya laane wale ne paise khud le liye.</p>
          {v.iPaid && (
            <div className="myfields">
              <div className="fgrid g3">
                <div className="field">
                  <label htmlFor="f-myPaid">Maine kitne diye</label>
                  <div className="money">
                    <span>₹</span>
                    <input id="f-myPaid" type="number" inputMode="decimal" min={0} step="any" placeholder="0" value={v.myPaid} onChange={(e) => set('myPaid', e.target.value)} />
                  </div>
                  <div className="linkrow">
                    <button type="button" className="link" onClick={() => formTotal(v) && set('myPaid', String(formTotal(v)))}>
                      Pura total daalo
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="f-myBack">Wapas kitne mile</label>
                  <div className="money">
                    <span>₹</span>
                    <input id="f-myBack" type="number" inputMode="decimal" min={0} step="any" placeholder="0" value={v.myBack} onChange={(e) => set('myBack', e.target.value)} />
                  </div>
                  <div className="linkrow">
                    <button
                      type="button"
                      className="link"
                      onClick={() => {
                        const pp = num(v.myPaid) || formTotal(v);
                        if (pp) setV((p) => ({ ...p, myPaid: String(pp), myBack: String(pp), myBackDate: p.myBackDate || today() }));
                      }}
                    >
                      Sab mil gaye
                    </button>
                    <button type="button" className="link" onClick={() => setV((p) => ({ ...p, myBack: '', myBackDate: '' }))}>
                      Abhi kuch nahi
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="f-myBackDate">Kab mile</label>
                  <input id="f-myBackDate" type="date" value={v.myBackDate} onChange={(e) => set('myBackDate', e.target.value)} />
                </div>
              </div>
              <div className={myBal.cls} id="f-myBal" aria-live="polite">
                {myBal.text}
              </div>
            </div>
          )}
        </div>

        <div className="fsec">
          <h3 className="fsh">Kab aur kahan se</h3>
          <div className="fgrid">
            <div className="field">
              <label htmlFor="f-orderDate">Kab mangaya</label>
              <input id="f-orderDate" type="date" className={cls('orderDate')} value={v.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-receivedDate">Kab pahuncha</label>
              <div className="inrow">
                <input id="f-receivedDate" type="date" value={v.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />
                <button type="button" className="btn sm" onClick={() => set('receivedDate', today())}>
                  Aaj
                </button>
              </div>
              <span className="hint">Abhi nahi aaya to khaali chhodo</span>
            </div>
            <div className="field">
              <label htmlFor="f-vendor">Kahan se mangaya</label>
              <input id="f-vendor" list="dl-vendor" placeholder="Amazon, Nehru Place…" autoComplete="off" className={cls('vendor')} value={v.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-broughtBy">Kisne laya</label>
              <input id="f-broughtBy" list="dl-brought" placeholder="Kapil Das, courier…" autoComplete="off" value={v.broughtBy} onChange={(e) => set('broughtBy', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Serial no. aur warranty</h3>
          <div className="fgrid">
            <div className="field">
              <label htmlFor="f-serials">Serial no. (har piece ka, alag line me)</label>
              <textarea id="f-serials" rows={2} placeholder="Jaise: WX12A3456789" autoComplete="off" value={v.serials} onChange={(e) => set('serials', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-warrantyTill">Warranty kab tak</label>
              <input id="f-warrantyTill" type="date" value={v.warrantyTill} onChange={(e) => set('warrantyTill', e.target.value)} />
              <div className="inrow">
                {[1, 2, 3].map((y) => (
                  <button key={y} type="button" className="btn sm" onClick={() => setWarranty(y)}>
                    +{y} saal
                  </button>
                ))}
              </div>
              <span className="hint">Pahunchne ki tareekh se ginta hai. 30 din pehle yaad dilayega.</span>
            </div>
          </div>
        </div>

        {!editId && (
          <div className="fsec">
            <label className="check" htmlFor="f-iss-on">
              <input
                type="checkbox"
                id="f-iss-on"
                checked={v.issOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setV((p) => ({ ...p, issOn: on }));
                  if (on && !issRows.length) setIssRows([newRow(String(Math.max(1, Math.round(num(v.qty)))))]);
                }}
              />{' '}
              Aate hi kisi ko de diya? Yahin likh do
            </label>
            {v.issOn && (
              <>
                <p className="hint">Alag-alag logo ko diya ho to har bande ki alag line jodo.</p>
                <IssueRowsEditor rows={issRows} setRows={setIssRows} max={Math.max(0, Math.round(num(v.qty)))} idPrefix="f-iss" badKey={issErr?.key} />
                {issErr && <p className="ferr">{issErr.msg}</p>}
                <div className="fgrid">
                  <div className="field">
                    <label htmlFor="f-iss-date">Kab diya</label>
                    <input id="f-iss-date" type="date" value={v.issDate} onChange={(e) => set('issDate', e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="f-note">Note</label>
          <textarea id="f-note" rows={2} placeholder="Koi bhi yaad rakhne wali baat, jaise kiske kehne pe mangaya…" value={v.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        {formErr && <p className="ferr">{formErr}</p>}
      </div>

      <div className="mfoot">
        <button type="button" className="btn" onClick={onDone}>
          Rehne do
        </button>
        <button type="submit" className="btn primary" id="f-save" disabled={saving || uploading > 0 || aiBusy}>
          {saving ? 'Save ho raha…' : 'Save karo'}
        </button>
      </div>
    </form>
  );
}
