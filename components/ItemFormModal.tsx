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
  arrivalNo: string; arrivalTime: string; arrivalMode: 'demand' | 'direct' | 'unknown'; receivedBy: string;
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
    arrivalNo: it?.arrivalNo ?? '', arrivalTime: it?.arrivalTime ?? new Date().toTimeString().slice(0, 5), arrivalMode: it?.arrivalMode ?? 'unknown', receivedBy: it?.receivedBy ?? '',
    item: it?.item ?? '', category: it?.category ?? '', billNo: it?.billNo ?? '',
    qty: it ? String(num(it.qty)) : '1', rate: it ? str(it.rate) : '', total: it ? str(it.total) : '',
    orderDate: it ? it.orderDate : today(), receivedDate: it?.receivedDate ?? '',
    vendor: it?.vendor ?? '', broughtBy: it?.broughtBy ?? '', note: it?.note ?? '',
    serials: it?.serials ?? '', warrantyTill: it?.warrantyTill ?? '',
    iPaid: !!it?.iPaid, myPaid: it?.iPaid ? str(it.myPaid) : '', myBack: it?.iPaid ? str(it.myBack) : '', myBackDate: it?.myBackDate ?? '',
    issOn: false, issDate: today(),
  };
}

/** Quantity, rate, and total are linked: changing either value recalculates the other. */
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
  const [v, setV] = useState<Vals>(() => {
    const existing = editId ? getItem(editId) : undefined;
    const value = initVals(existing);
    if (!editId) {
      const next = 'AWK-' + String((items.filter((it) => /^AWK-\d{4,}$/.test(it.arrivalNo || '')).reduce((max, it) => {
        const n = Number((it.arrivalNo || '').replace(/^AWK-/, ''));
        return Number.isFinite(n) && n > max ? n : max;
      }, 0) + 1)).padStart(4, '0');
      value.arrivalNo = next;
    }
    if (!editId && !value.arrivalTime) value.arrivalTime = new Date().toTimeString().slice(0, 5);
    return value;
  });
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
      if (!r.saved) r.uploaded.forEach(delBill);
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
      node: (auto ? 'Reading the receipt and filling in its number and details…' : 'AI is reading the receipt…') + ' This may take 10–40 seconds.',
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
        Receipt number <b>{bn}</b> filled in.
      </>
    ) : (
      <>No receipt number found. Enter it manually.</>
    );
    if (!lines.length) setAiView({ kind: 'msg', node: <>{head} No clear item line found. Enter the item details manually.</> });
    else if (itemTyped) setAiView({ kind: 'ok', node: <>{head} Your existing item details were kept.</> });
    else if (lines.length === 1) setAiView({ kind: 'ok', node: <>{head} Item, rate, and total filled in. Review and save.</> });
    else setAiView({ kind: 'pick', node: <>{head} Found {lines.length} items. Choose one for this entry or create separate entries for all.</> });
  }

  function pickLine(l: AiLine) {
    setV((p) => ({ ...p, ...lineVals(l) }));
    setFlash((p) => ({ ...p, item: true, qty: true, rate: true, total: true, ...(l.category ? { category: true } : {}) }));
    setAiView({ kind: 'ok', node: 'Item details filled in. Review and save.' });
  }

  /* ---------- save ---------- */
  function common(x: Vals) {
    const nextNo = (x.arrivalNo || '').trim() || `AWK-${String((items.filter((it) => /^AWK-\d{4,}$/.test(it.arrivalNo || '')).reduce((max, it) => {
      const n = Number((it.arrivalNo || '').replace(/^AWK-/, ''));
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1)).padStart(4, '0')}`;
    return {
      arrivalNo: nextNo,
      arrivalTime: x.arrivalTime || new Date().toTimeString().slice(0, 5),
      arrivalMode: x.arrivalMode,
      receivedBy: x.receivedBy.trim(),
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
      setFormErr('A receipt is uploading. Please wait.');
      return;
    }
    const item = v.item.trim();
    const qty = Math.round(num(v.qty));
    if (!item) {
      setErrs({ item: 'Enter an item name.' });
      return focus('f-item');
    }
    if (qty < 1) {
      setErrs({ qty: 'Quantity must be at least 1.' });
      return focus('f-qty');
    }
    let rate = round2(num(v.rate));
    let total = round2(num(v.total));
    if (!total && rate) total = round2(rate * qty);
    if (!rate && total) rate = round2(total / qty);
    const existing = editId ? getItem(editId) : undefined;
    if (editId && !existing) {
      setFormErr('This entry is no longer in the register.');
      return;
    }
    if (existing && remaining({ ...existing, qty }) < 0) {
      setErrs({ qty: 'Quantity cannot be lower than the amount already issued or marked damaged.' });
      return focus('f-qty');
    }
    const arrivalMeta = common(v);
    let my = { iPaid: false, myPaid: 0, myBack: 0, myBackDate: '' };
    if (v.iPaid) {
      const paid = round2(num(v.myPaid)) || total;
      const back = round2(num(v.myBack));
      if (back > paid) {
        setFormErr('The reimbursed amount cannot exceed the amount paid.');
        return focus('f-myBack');
      }
      my = { iPaid: true, myPaid: paid, myBack: back, myBackDate: back > 0 ? v.myBackDate : '' };
    }
    const base: Item = existing ? structuredClone(existing) : blankItem(newItemId(), me);
    const doc: Item = {
      ...base,
      ...arrivalMeta,
      ...my,
      arrivalNo: arrivalMeta.arrivalNo,
      arrivalTime: arrivalMeta.arrivalTime,
      arrivalMode: arrivalMeta.arrivalMode,
      receivedBy: arrivalMeta.receivedBy,
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
      toast(existing ? '✓ Expense updated' : '✓ Expense saved · ' + inr(total));
      onDone();
    } catch (err) {
      setSaving(false);
      setFormErr(explain(err));
    }
  }

  async function saveAllLines() {
    if (aiLines.length < 2) return;
    setSaving(true);
    setAiView({ kind: 'busy', node: 'Saving ' + aiLines.length + ' entries…' });
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
      setAiView({ kind: 'msg', node: done + ' entries saved. The remaining entries could not be saved: ' + explain(err) });
      return;
    }
    toast('✓ Expenses saved · ' + inr(aiLines.reduce((s, l) => s + l.total, 0)));
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
    if (!p) myBal = { cls: 'mybal', text: 'Enter the amount you paid' + (t ? ' (item total: ' + inr(t) + ')' : '') };
    else {
      const d = round2(p - b);
      if (d > 0) myBal = { cls: 'mybal due', text: inr(d) + ' reimbursement outstanding' };
      else if (d < 0) myBal = { cls: 'mybal due', text: 'Reimbursed amount cannot exceed the amount paid.' };
      else myBal = { cls: 'mybal ok', text: 'Fully reimbursed: ' + inr(p) };
    }
  }

  const aiOK = ai.enabled && bills.length > 0;
  const billHint = aiOK
    ? 'AI can read the receipt number, items, rates, total, date, and supplier. If anything is missed, run the scan again.'
    : ai.enabled
      ? 'Upload a receipt photo or PDF and AI will fill in the receipt number, items, rates, total, and date.'
      : 'You can also take a photo of the receipt with your phone.';

  const setWarranty = (y: number) => {
    let base = v.receivedDate || v.orderDate || today();
    if (!validDate(base)) base = today();
    set('warrantyTill', addYears(base, y));
  };

  return (
    <form id="itemForm" noValidate onSubmit={onSubmit}>
      <div className="mhead">
        <h2 id="formTitle">{editId ? 'Edit entry' : 'Add item'}</h2>
        <button type="button" className="iconbtn" onClick={onDone} aria-label="Close">
          <Icon name="x" />
        </button>
      </div>

      <div className="mbody">
        <div className="fsec">
          <h3 className="fsh">Receipt (upload first to let AI fill in the form)</h3>
          <div className="upl">
            {(bills.length > 0 || uploading > 0) && (
              <div className="upl-list" id="f-billList">
                {bills.map((b) => (
                  <div className="uitem" key={b.id}>
                    {b.type === 'application/pdf' ? <span className="tn">PDF</span> : <BillImg id={b.id} alt="" className="tn" />}
                    <span className="nm" title={b.name}>
                      {b.name}
                    </span>
                    <button type="button" className="iconbtn sm" onClick={() => removeBill(b.id)} aria-label="Remove receipt">
                      <Icon name="x" />
                    </button>
                  </div>
                ))}
                {uploading > 0 && (
                  <div className="uitem">
                    <span className="tn">
                      <span className="spin" />
                    </span>
                    <span className="nm">Uploading…</span>
                  </div>
                )}
              </div>
            )}
            <div className="upl-btns">
              <label className="btn sm" htmlFor="f-file" id="f-fileBtn">
                <Icon name="clip" />
                Upload receipt (photo or PDF)
              </label>
              {aiOK && (
                <button type="button" className="btn sm ai" id="f-ai" onClick={() => runAi(false)} disabled={aiBusy}>
                  <Icon name="spark" />
                  {aiRan ? 'Scan receipt again (AI)' : 'Fill form from receipt (AI)'}
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
                      Cancel
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
                        Create separate entries for all {aiLines.length} items
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Item details</h3>
          <div className="fgrid">
            <div className="field span2">
              <label htmlFor="f-item">Item name *</label>
              <input id="f-item" list="dl-item" placeholder="For example: Seagate 2TB hard drive" autoComplete="off" className={cls('item')} value={v.item} onChange={(e) => set('item', e.target.value)} />
              {errs.item && <span className="err">{errs.item}</span>}
            </div>
            <div className="field">
              <label htmlFor="f-category">Category</label>
              <input id="f-category" list="dl-category" placeholder="Hard Disk, SDI Cable, HDMI Cable…" autoComplete="off" className={cls('category')} value={v.category} onChange={(e) => set('category', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-billNo">Bill / Order no.</label>
              <input id="f-billNo" placeholder="Amazon order ID or receipt number" autoComplete="off" className={cls('billNo')} value={v.billNo} onChange={(e) => set('billNo', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Pricing</h3>
          <div className="fgrid g3">
            <div className="field">
              <label htmlFor="f-qty">Quantity *</label>
              <input id="f-qty" type="number" inputMode="numeric" min={1} step={1} className={cls('qty')} value={v.qty} onChange={(e) => setMoney('qty', e.target.value)} />
              {errs.qty && <span className="err">{errs.qty}</span>}
            </div>
            <div className="field">
              <label htmlFor="f-rate">Rate (per item)</label>
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
          <p className="hint">Enter the rate to calculate the total, or enter the total to calculate the per-item rate.</p>
        </div>

        <div className="fsec">
          <h3 className="fsh">Reimbursement</h3>
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
            I paid for this personally
          </label>
          <p className="hint">If unchecked, the supplier or person who brought the item is assumed to have paid.</p>
          {v.iPaid && (
            <div className="myfields">
              <div className="fgrid g3">
                <div className="field">
                  <label htmlFor="f-myPaid">Amount paid</label>
                  <div className="money">
                    <span>₹</span>
                    <input id="f-myPaid" type="number" inputMode="decimal" min={0} step="any" placeholder="0" value={v.myPaid} onChange={(e) => set('myPaid', e.target.value)} />
                  </div>
                  <div className="linkrow">
                    <button type="button" className="link" onClick={() => formTotal(v) && set('myPaid', String(formTotal(v)))}>
                      Use full total
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="f-myBack">Amount reimbursed</label>
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
                      Fully reimbursed
                    </button>
                    <button type="button" className="link" onClick={() => setV((p) => ({ ...p, myBack: '', myBackDate: '' }))}>
                      Not reimbursed yet
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="f-myBackDate">Reimbursement date</label>
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
          <h3 className="fsh">Delivery details</h3>
          <div className="fgrid">
            <div className="field">
              <label htmlFor="f-arrivalNo">Delivery number</label>
              <input id="f-arrivalNo" value={v.arrivalNo || 'AWK-0001'} onChange={(e) => set('arrivalNo', e.target.value)} placeholder="AWK-0001" />
            </div>
            <div className="field">
              <label htmlFor="f-arrivalTime">Delivery time</label>
              <input id="f-arrivalTime" type="time" value={v.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-arrivalMode">Delivery type</label>
              <select id="f-arrivalMode" value={v.arrivalMode} onChange={(e) => set('arrivalMode', e.target.value as 'demand' | 'direct' | 'unknown')}>
                <option value="unknown">Unknown</option>
                <option value="demand">From a request</option>
                <option value="direct">Direct purchase</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-receivedBy">Received by</label>
              <input id="f-receivedBy" placeholder="Amit, Office team…" autoComplete="off" value={v.receivedBy} onChange={(e) => set('receivedBy', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-orderDate">Order date</label>
              <input id="f-orderDate" type="date" className={cls('orderDate')} value={v.orderDate} onChange={(e) => set('orderDate', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-receivedDate">Received date</label>
              <div className="inrow">
                <input id="f-receivedDate" type="date" value={v.receivedDate} onChange={(e) => set('receivedDate', e.target.value)} />
                <button type="button" className="btn sm" onClick={() => set('receivedDate', today())}>
                  Today
                </button>
              </div>
              <span className="hint">Leave blank if it has not arrived yet.</span>
            </div>
            <div className="field">
              <label htmlFor="f-vendor">Supplier</label>
              <input id="f-vendor" list="dl-vendor" placeholder="Amazon, Nehru Place…" autoComplete="off" className={cls('vendor')} value={v.vendor} onChange={(e) => set('vendor', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-broughtBy">Brought by</label>
              <input id="f-broughtBy" list="dl-brought" placeholder="Kapil Das, courier…" autoComplete="off" value={v.broughtBy} onChange={(e) => set('broughtBy', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="fsec">
          <h3 className="fsh">Serial numbers and warranty</h3>
          <div className="fgrid">
            <div className="field">
              <label htmlFor="f-serials">Serial numbers (one per line)</label>
              <textarea id="f-serials" rows={2} placeholder="Jaise: WX12A3456789" autoComplete="off" value={v.serials} onChange={(e) => set('serials', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-warrantyTill">Warranty expiration date</label>
              <input id="f-warrantyTill" type="date" value={v.warrantyTill} onChange={(e) => set('warrantyTill', e.target.value)} />
              <div className="inrow">
                {[1, 2, 3].map((y) => (
                  <button key={y} type="button" className="btn sm" onClick={() => setWarranty(y)}>
                    +{y} year{y > 1 ? 's' : ''}
                  </button>
                ))}
              </div>
              <span className="hint">Calculated from the received date. A reminder appears 30 days before expiration.</span>
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
              Issued to someone on arrival? Record it here.
            </label>
            {v.issOn && (
              <>
                <p className="hint">Add a separate line for each person or department.</p>
                <IssueRowsEditor rows={issRows} setRows={setIssRows} max={Math.max(0, Math.round(num(v.qty)))} idPrefix="f-iss" badKey={issErr?.key} />
                {issErr && <p className="ferr">{issErr.msg}</p>}
                <div className="fgrid">
                  <div className="field">
                    <label htmlFor="f-iss-date">Date issued</label>
                    <input id="f-iss-date" type="date" value={v.issDate} onChange={(e) => set('issDate', e.target.value)} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="field">
          <label htmlFor="f-note">Note</label>
          <textarea id="f-note" rows={2} placeholder="Add a note, such as who requested this purchase…" value={v.note} onChange={(e) => set('note', e.target.value)} />
        </div>
        {formErr && <p className="ferr">{formErr}</p>}
      </div>

      <div className="mfoot">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" id="f-save" disabled={saving || uploading > 0 || aiBusy}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
