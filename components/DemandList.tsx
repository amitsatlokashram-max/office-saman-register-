
'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
  runTransaction,
} from 'firebase/firestore';
import { useReg } from './context';
import { blankItem, inr, nextArrivalNo, num, today, uid } from '@/lib/calc';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { Item } from '@/lib/types';
import { queueUpsert } from '@/lib/sync';

export interface DemandItem {
  id: string;
  item: string;
  category?: string;
  qty: number;
  rate?: number;
  link?: string;
  note?: string;
  status: 'pending' | 'received';
  receivedQty?: number;
  createdAt: string;
}

const CATEGORIES = [
  'General',
  'Electronics',
  'Stationery',
  'Pantry',
  'Furniture',
  'Maintenance',
  'Other',
];

const getTodayStr = () =>
  today();

function receivedQuantity(d: DemandItem): number {
  if (Number.isFinite(d.receivedQty)) return Math.max(0, Number(d.receivedQty));
  return d.status === 'received' ? Math.max(0, num(d.qty)) : 0;
}

function remainingDemandQty(d: DemandItem): number {
  return Math.max(0, num(d.qty) - receivedQuantity(d));
}

type ReceiveLine = {
  key: string;
  demandId: string;
  qty: string;
  actualRate: string;
  travelShare: string;
};

type SavedDelivery = {
  arrivalNo: string;
  itemIds: string[];
  queued: boolean;
};

function cleanUrl(url: string) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

export function DemandList() {
  const { toast, me, items, google } = useReg();

  const [demands, setDemands] = useState<DemandItem[]>([]);
  const [receivingDemand, setReceivingDemand] = useState<DemandItem | null>(null);
  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [receiveOrderDate, setReceiveOrderDate] = useState(getTodayStr);
  const [receiveDate, setReceiveDate] = useState(getTodayStr);
  const [receiveTime, setReceiveTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [receiveTravelCost, setReceiveTravelCost] = useState('');
  const [receiveVendor, setReceiveVendor] = useState('');
  const [receiveBroughtBy, setReceiveBroughtBy] = useState('');
  const [receiveBy, setReceiveBy] = useState('');
  const [receiveBillNo, setReceiveBillNo] = useState('');
  const [receiveNote, setReceiveNote] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState<SavedDelivery | null>(null);
  const receiveLock = useRef(false);

  // Add Form
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('General');
  const [qty, setQty] = useState<number | string>(1);
  const [rate, setRate] = useState<number | string>('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [
    selectedCategoryFilter,
    setSelectedCategoryFilter,
  ] = useState('All');

  // Edit Form
  const [editingItem, setEditingItem] =
    useState<DemandItem | null>(null);

  const [editItemName, setEditItemName] = useState('');
  const [editCategory, setEditCategory] =
    useState('General');
  const [editQty, setEditQty] =
    useState<number | string>(1);
  const [editRate, setEditRate] =
    useState<number | string>('');
  const [editLink, setEditLink] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // NEW PDF OPTIONS
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  const [selectedPdfIds, setSelectedPdfIds] =
    useState<string[]>([]);

  const [showEmailOnSlip, setShowEmailOnSlip] =
    useState(false);

  const [printedIds, setPrintedIds] =
    useState<string[]>([]);

  const [printedEmail, setPrintedEmail] =
    useState(false);

  // Firebase Live Data
  useEffect(() => {
    const db = getFirestore();

    const q = query(
      collection(db, 'demands'),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: DemandItem[] = [];

        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...docSnap.data(),
          } as DemandItem);
        });

        setDemands(list);
      },
      () => {}
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!savedDelivery || savedDelivery.queued || !google.enabled) return;
    if (!savedDelivery.itemIds.every((id) => items.some((item) => item.id === id))) return;
    savedDelivery.itemIds.forEach(queueUpsert);
    setSavedDelivery((current) => current && current.arrivalNo === savedDelivery.arrivalNo ? { ...current, queued: true } : current);
  }, [google.enabled, items, savedDelivery]);

  // Add Demand
  async function handleAddDemand(e: React.FormEvent) {
    e.preventDefault();

    if (!item.trim()) {
      toast('Saman ka naam likhna zaroori hai.');
      return;
    }

    setLoading(true);

    try {
      const db = getFirestore();

      await addDoc(collection(db, 'demands'), {
        item: item.trim(),
        category: category || 'General',
        qty: Number(qty) || 1,
        rate: rate ? Number(rate) : 0,
        link: link.trim(),
        note: note.trim(),
        status: 'pending',
        receivedQty: 0,
        addedBy: me?.email || '',
        createdAt: new Date().toISOString(),
      });

      toast('Demand list mein jud gaya!');

      setItem('');
      setCategory('General');
      setQty(1);
      setRate('');
      setLink('');
      setNote('');
    } catch {
      toast('Save nahi hua, dubara try karein.');
    } finally {
      setLoading(false);
    }
  }

  // Delete Demand
  async function handleDeleteDemand(
    id: string,
    itemName: string
  ) {
    if (
      !window.confirm(
        `Kya aap "${itemName}" ko demand list se hatana chahte hain?`
      )
    ) {
      return;
    }

    try {
      const db = getFirestore();

      await deleteDoc(doc(db, 'demands', id));

      toast(`"${itemName}" demand list se hata diya gaya.`);
    } catch {
      toast('Delete karne mein dikkat aayi.');
    }
  }

  // Start Edit
  function startEdit(d: DemandItem) {
    setEditingItem(d);
    setEditItemName(d.item);
    setEditCategory(d.category || 'General');
    setEditQty(d.qty);
    setEditRate(d.rate || '');
    setEditLink(d.link || '');
    setEditNote(d.note || '');
  }

  // Update Demand
  async function handleUpdateDemand(e: React.FormEvent) {
    e.preventDefault();

    if (!editingItem) return;

    if (!editItemName.trim()) {
      toast('Saman ka naam likhna zaroori hai.');
      return;
    }

    setEditLoading(true);

    try {
      const db = getFirestore();

      await updateDoc(
        doc(db, 'demands', editingItem.id),
        {
          item: editItemName.trim(),
          category: editCategory,
          qty: Number(editQty) || 1,
          rate: editRate ? Number(editRate) : 0,
          link: editLink.trim(),
          note: editNote.trim(),
          receivedQty: receivedQuantity(editingItem),
          status: Number(editQty) > receivedQuantity(editingItem) ? 'pending' : 'received',
        }
      );

      toast('Demand update ho gayi!');
      setEditingItem(null);
    } catch {
      toast('Update nahi ho paya.');
    } finally {
      setEditLoading(false);
    }
  }

  function openReceiveForm(d: DemandItem) {
    setReceivingDemand(d);
    setReceiveLines([{
      key: uid(),
      demandId: d.id,
      qty: String(remainingDemandQty(d)),
      actualRate: '',
      travelShare: '',
    }]);
    setReceiveOrderDate(getTodayStr());
    setReceiveDate(getTodayStr());
    setReceiveTime(new Date().toTimeString().slice(0, 5));
    setReceiveTravelCost('');
    setReceiveVendor(d.link ? 'Online / Buy Link' : 'Market');
    setReceiveBroughtBy(me?.name || '');
    setReceiveBy(me?.name || '');
    setReceiveBillNo('');
    setReceiveNote(d.note || '');
    setReceiveError('');
  }

  function closeReceiveForm() {
    if (receiveLock.current) return;
    setReceivingDemand(null);
    setReceiveError('');
  }

  function addReceiveLine(demandId: string) {
    const demand = demands.find((d) => d.id === demandId);
    if (!demand) return;
    const alreadyAdded = receiveLines.some((line) => line.demandId === demandId);
    setReceiveLines((lines) => [...lines, {
      key: uid(),
      demandId,
      qty: alreadyAdded ? '' : String(remainingDemandQty(demand)),
      actualRate: '',
      travelShare: '',
    }]);
  }

  function updateReceiveLine(key: string, patch: Partial<ReceiveLine>) {
    setReceiveLines((lines) => lines.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  // Save all lines in one delivery; each line has its own stock and Sheet row.
  async function handleReceiveDemand(e: React.FormEvent) {
    e.preventDefault();
    const d = receivingDemand;
    if (!d || receiveLock.current) return;

    if (!receiveLines.length) {
      setReceiveError('Kam se kam ek demand item jodo.');
      return;
    }

    const lines = receiveLines.map((line) => ({
      ...line,
      demand: demands.find((demand) => demand.id === line.demandId),
      qty: Number(line.qty),
      rate: line.actualRate.trim() ? Number(line.actualRate) : NaN,
      travelShare: line.travelShare.trim() ? Number(line.travelShare) : 0,
    }));
    const travelCost = receiveTravelCost.trim() ? Number(receiveTravelCost) : 0;
    const badLine = lines.find((line) => !line.demand || !Number.isFinite(line.qty) || line.qty <= 0 || !Number.isFinite(line.rate) || line.rate < 0 || !Number.isFinite(line.travelShare) || line.travelShare < 0);
    if (badLine) {
      setReceiveError('Har line me demand, sahi Mili Qty aur zero ya usse zyada Actual Rate likho.');
      return;
    }
    if (!Number.isFinite(travelCost) || travelCost < 0) {
      setReceiveError('Aane-jane ka kharcha zero ya usse zyada likho.');
      return;
    }
    const shareTotal = lines.reduce((sum, line) => sum + line.travelShare, 0);
    if (shareTotal > travelCost + 0.005) {
      setReceiveError('Item-wise travel share, total Aane-Jane ke kharche se zyada nahi ho sakta.');
      return;
    }
    if (!receiveDate || !receiveTime || !receiveOrderDate) {
      setReceiveError('Kharid aur aane ki tareekh aur samay likhna zaroori hai.');
      return;
    }

    receiveLock.current = true;
    setReceiveSaving(true);
    setReceiveError('');
    try {
      const db = getFirestore();
      const sequenceRef = doc(db, 'settings', 'arrival-sequence');
      const uniqueDemandIds = Array.from(new Set(lines.map((line) => line.demandId)));
      const demandRefs = new Map(uniqueDemandIds.map((id) => [id, doc(db, 'demands', id)]));
      const itemRefs = lines.map(() => doc(collection(db, 'purchases')));
      const firstAvailable = Number(nextArrivalNo(items).replace('AWK-', '')) - 1;
      const now = new Date().toISOString();

      const result = await runTransaction(db, async (transaction) => {
        const [demandSnaps, sequenceSnap] = await Promise.all([
          Promise.all(Array.from(demandRefs.values()).map((ref) => transaction.get(ref))),
          transaction.get(sequenceRef),
        ]);
        const currentById = new Map<string, Record<string, unknown>>();
        for (const [index, id] of uniqueDemandIds.entries()) {
          const snap = demandSnaps[index];
          if (!snap.exists()) throw new Error('Ek demand list mein nahi mili.');
          currentById.set(id, snap.data());
        }

        const receivedByDemand = new Map<string, number>();
        for (const line of lines) {
          receivedByDemand.set(line.demandId, (receivedByDemand.get(line.demandId) || 0) + line.qty);
        }
        for (const [id, adding] of receivedByDemand) {
          const current = currentById.get(id);
          if (!current) throw new Error('Ek demand list mein nahi mili.');
          const requested = Math.max(0, num(current.qty));
          const currentReceived = Number.isFinite(current.receivedQty)
            ? Math.max(0, num(current.receivedQty))
            : current.status === 'received'
              ? requested
              : 0;
          const outstanding = Math.max(0, requested - currentReceived);
          if (outstanding <= 0) throw new Error(`${String(current.item || 'Saman')} ki demand pehle hi poori aa chuki hai.`);
          if (adding > outstanding) throw new Error(`${String(current.item || 'Saman')}: is demand me abhi sirf ${outstanding} pcs baaki hain.`);
        }

        const lastNumber = Math.max(
          firstAvailable,
          Math.max(0, Math.floor(num(sequenceSnap.data()?.lastNumber))),
        );
        const serial = lastNumber + 1;
        const arrivalNo = `AWK-${String(serial).padStart(4, '0')}`;
        const purchases: Item[] = lines.map((line, index) => {
          const current = currentById.get(line.demandId)!;
          const demand = line.demand!;
          return {
            ...blankItem(itemRefs[index].id, me),
            arrivalNo,
            arrivalTime: receiveTime,
            arrivalMode: 'demand',
            demandId: line.demandId,
            arrivalTravelCost: index === 0 ? travelCost : 0,
            arrivalTravelShare: line.travelShare,
            item: String(current.item || demand.item).trim(),
            category: String(current.category || demand.category || 'General'),
            qty: line.qty,
            rate: line.rate,
            total: Math.round(line.qty * line.rate * 100) / 100,
            orderDate: receiveOrderDate,
            receivedDate: receiveDate,
            vendor: receiveVendor.trim(),
            broughtBy: receiveBroughtBy.trim(),
            receivedBy: receiveBy.trim(),
            billNo: receiveBillNo.trim(),
            note: receiveNote.trim(),
            createdAt: now,
            updatedAt: now,
          };
        });
        purchases.forEach((purchase, index) => transaction.set(itemRefs[index], purchase));
        for (const [id, adding] of receivedByDemand) {
          const current = currentById.get(id)!;
          const requested = Math.max(0, num(current.qty));
          const oldReceived = Number.isFinite(current.receivedQty)
            ? Math.max(0, num(current.receivedQty))
            : current.status === 'received'
              ? requested
              : 0;
          const received = oldReceived + adding;
          transaction.update(demandRefs.get(id)!, {
            receivedQty: received,
            status: received >= requested ? 'received' : 'pending',
            updatedAt: now,
          });
        }
        transaction.set(sequenceRef, { lastNumber: serial, updatedAt: now });
        const outstanding = Array.from(receivedByDemand, ([id, adding]) => {
          const current = currentById.get(id)!;
          const oldReceived = Number.isFinite(current.receivedQty)
            ? Math.max(0, num(current.receivedQty))
            : current.status === 'received'
              ? Math.max(0, num(current.qty))
              : 0;
          return Math.max(0, num(current.qty) - oldReceived - adding);
        }).reduce((sum, qty) => sum + qty, 0);
        return {
          arrivalNo,
          itemIds: purchases.map((purchase) => purchase.id),
          total: purchases.reduce((sum, purchase) => sum + purchase.total, 0) + travelCost,
          outstanding,
        };
      });

      result.itemIds.forEach(queueUpsert);
      setSavedDelivery({ arrivalNo: result.arrivalNo, itemIds: result.itemIds, queued: true });
      setReceivingDemand(null);
      toast(`Delivery ${result.arrivalNo} Stock mein jud gayi · Total ${inr(result.total)}${result.outstanding ? ` · ${result.outstanding} pcs demand baaki` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stock mein add nahi ho paya.';
      setReceiveError(message);
      toast(message);
    } finally {
      receiveLock.current = false;
      setReceiveSaving(false);
    }
  }

  // Search and Category Filter
  const filteredDemands = demands.filter((d) => {
    const search = searchQuery.toLowerCase();

    const matchesSearch =
      d.item.toLowerCase().includes(search) ||
      (d.note || '').toLowerCase().includes(search) ||
      (d.category || '').toLowerCase().includes(search);

    const matchesCategory =
      selectedCategoryFilter === 'All' ||
      (d.category || 'General') ===
        selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const pendingList = filteredDemands.filter(
    (d) => remainingDemandQty(d) > 0
  );

  const receivedList = filteredDemands.filter(
    (d) => remainingDemandQty(d) <= 0
  );

  const receiveItemsTotal = receiveLines.reduce(
    (sum, line) => sum + Math.round(num(line.qty) * num(line.actualRate) * 100) / 100,
    0,
  );
  const receiveTravelPreview = Math.max(0, num(receiveTravelCost));

  const grandTotal = pendingList.reduce(
    (sum, d) => sum + remainingDemandQty(d) * (d.rate || 0),
    0
  );

  // WhatsApp Share - original behaviour
  function shareWhatsApp() {
    if (!pendingList.length) {
      toast('Koi pending demand nahi hai.');
      return;
    }

    const text = pendingList
      .map(
        (d, i) => {
          const outstanding = remainingDemandQty(d);
          return `${i + 1}. *${d.item}* [${
            d.category || 'General'
          }]\n   Qty: ${outstanding} pcs${
            d.rate
              ? ` | Est: ₹${d.rate * outstanding}`
              : ''
          }${
            d.link
              ? `\n   Link: ${cleanUrl(d.link)}`
              : ''
          }${
            d.note
              ? `\n   Note: ${d.note}`
              : ''
          }`;
        }
      )
      .join('\n\n');

    const msg = `📋 *OFFICE SAMAN ORDER DEMAND LIST*
📅 Date: ${getTodayStr()}
💰 *Kul Anumanit Kharcha: ₹${grandTotal.toLocaleString(
      'en-IN'
    )}*

${text}

_Bhejnewala: ${me?.email || 'Office'}_`;

    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`,
      '_blank'
    );
  }

  // OPEN PDF SELECTION WINDOW
  function handleDownloadPdf() {
    if (!pendingList.length) {
      toast(
        'Download karne ke liye koi pending demand nahi hai.'
      );
      return;
    }

    // By default all visible pending items selected
    setSelectedPdfIds(pendingList.map((d) => d.id));

    // Email hidden by default
    setShowEmailOnSlip(false);

    setPdfModalOpen(true);
  }

  // SELECT OR DESELECT ONE ITEM
  function togglePdfItem(id: string) {
    setSelectedPdfIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((x) => x !== id);
      }

      return [...previous, id];
    });
  }

  // SELECT ALL ITEMS
  function selectAllPdfItems() {
    setSelectedPdfIds(pendingList.map((d) => d.id));
  }

  // DESELECT ALL ITEMS
  function deselectAllPdfItems() {
    setSelectedPdfIds([]);
  }

  // Items selected inside modal
  const selectedPdfItems = pendingList.filter(
    (d) => selectedPdfIds.includes(d.id)
  );

  const selectedPdfTotal = selectedPdfItems.reduce(
    (sum, d) => sum + remainingDemandQty(d) * (d.rate || 0),
    0
  );

  // Only these items go into PDF
  const printableItems = pendingList.filter((d) => printedIds.includes(d.id));

  const printableTotal = printableItems.reduce(
    (sum, d) => sum + remainingDemandQty(d) * (d.rate || 0),
    0
  );

  // FINAL PRINT
  function printSelectedPdf() {
    if (!selectedPdfItems.length) {
      toast('PDF ke liye kam se kam ek saman chunein.');
      return;
    }

    // Update printed content synchronously
    flushSync(() => {
      setPrintedIds(selectedPdfItems.map((d) => d.id));
      setPrintedEmail(showEmailOnSlip);
      setPdfModalOpen(false);
    });

    // Open browser PDF / Print dialog
    window.print();
  }

  return (
    <div
      style={{
        padding: '16px',
        maxWidth: '950px',
        margin: '0 auto',
      }}
    >
      {/* PRINT STYLES */}
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }

          body * {
            visibility: hidden !important;
          }

          #printable-demand-slip,
          #printable-demand-slip * {
            visibility: visible !important;
          }

          #printable-demand-slip {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-sizing: border-box;
            color: #000 !important;
            background: #fff !important;
            padding: 0;
            font-family: Arial, sans-serif;
          }

          #printable-demand-slip table {
            width: 100%;
            border-collapse: collapse;
          }

          #printable-demand-slip thead {
            display: table-header-group;
          }

          #printable-demand-slip tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          .no-print,
          .pdf-modal-overlay {
            display: none !important;
          }
        }

        @media screen {
          #printable-demand-slip {
            display: none !important;
          }
        }
      `}</style>

      {/* PAGE HEADER */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <h2>🛒 Naya Saman Demand / Requisition</h2>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn sm"
            onClick={handleDownloadPdf}
            style={{
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              fontWeight: 'bold',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            📥 Download PDF / Print
          </button>

          <button
            type="button"
            className="btn primary sm"
            onClick={shareWhatsApp}
          >
            📱 WhatsApp Share
          </button>
        </div>
      </div>

      {/* ADD DEMAND FORM */}
      <form
        onSubmit={handleAddDemand}
        className="no-print"
        style={{
          background: 'var(--card-bg, #1e293b)',
          padding: '16px',
          borderRadius: '10px',
          marginBottom: '20px',
          border: '1px solid var(--border, #334155)',
        }}
      >
        <h3
          style={{
            marginBottom: '12px',
            fontSize: '15px',
          }}
        >
          Naye Saman ki Demand List Jodein
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <input
            type="text"
            placeholder="Saman ka Naam *"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            required
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: '#fff',
            }}
          >
            {CATEGORIES.map((c) => (
              <option
                key={c}
                value={c}
                style={{
                  background: '#1e293b',
                  color: '#fff',
                }}
              >
                {c}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Pieces (Qty)"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          />

          <input
            type="number"
            placeholder="Est. Rate (₹)"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          />

          <input
            type="url"
            placeholder="Buy Link (URL)"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
            }}
          />
        </div>

        <input
          type="text"
          placeholder="Note / Details (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            marginBottom: '12px',
          }}
        />

        <button
          type="submit"
          className="btn primary"
          disabled={loading}
        >
          {loading
            ? 'Adding...'
            : '+ Demand List mein Jodein'}
        </button>
      </form>

      {/* SEARCH AND FILTER */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '20px',
          flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.03)',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--border, #334155)',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search saman, note ya category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        />

        <select
          value={selectedCategoryFilter}
          onChange={(e) =>
            setSelectedCategoryFilter(e.target.value)
          }
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: '#fff',
            minWidth: '150px',
          }}
        >
          <option
            value="All"
            style={{
              background: '#1e293b',
              color: '#fff',
            }}
          >
            📁 All Categories
          </option>

          {CATEGORIES.map((c) => (
            <option
              key={c}
              value={c}
              style={{
                background: '#1e293b',
                color: '#fff',
              }}
            >
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* EDIT DEMAND FORM */}
      {editingItem && (
        <div
          className="no-print"
          style={{
            background: '#1e293b',
            border: '2px solid #3b82f6',
            padding: '16px',
            borderRadius: '10px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
            }}
          >
            <h3
              style={{
                color: '#60a5fa',
                margin: 0,
              }}
            >
              ✏️ Demand Edit Karein: {editingItem.item}
            </h3>

            <button
              type="button"
              onClick={() => setEditingItem(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              ✖
            </button>
          </div>

          <form onSubmit={handleUpdateDemand}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              <input
                type="text"
                placeholder="Saman ka Naam"
                value={editItemName}
                onChange={(e) =>
                  setEditItemName(e.target.value)
                }
                required
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              />

              <select
                value={editCategory}
                onChange={(e) =>
                  setEditCategory(e.target.value)
                }
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: '#fff',
                }}
              >
                {CATEGORIES.map((c) => (
                  <option
                    key={c}
                    value={c}
                    style={{
                      background: '#1e293b',
                      color: '#fff',
                    }}
                  >
                    {c}
                  </option>
                ))}
              </select>

              <input
                type="number"
                placeholder="Qty"
                min={1}
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                required
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              />

              <input
                type="number"
                placeholder="Rate (₹)"
                value={editRate}
                onChange={(e) =>
                  setEditRate(e.target.value)
                }
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              />

              <input
                type="url"
                placeholder="Buy Link"
                value={editLink}
                onChange={(e) =>
                  setEditLink(e.target.value)
                }
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                }}
              />
            </div>

            <input
              type="text"
              placeholder="Note"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--bg)',
                marginBottom: '12px',
              }}
            />

            <div
              style={{
                display: 'flex',
                gap: '8px',
              }}
            >
              <button
                type="submit"
                className="btn primary"
                disabled={editLoading}
              >
                {editLoading
                  ? 'Saving...'
                  : '✓ Changes Save Karein'}
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => setEditingItem(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NEW PDF SELECTION MODAL */}
      {pdfModalOpen && (
        <div
          className="pdf-modal-overlay no-print"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '15px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="PDF ke liye saman chunein"
            style={{
              background: '#0f172a',
              color: '#f8fafc',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '14px',
              border: '1px solid #334155',
              boxShadow:
                '0 20px 70px rgba(0,0,0,0.5)',
              padding: '22px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                  color: '#fff',
                }}
              >
                📄 PDF ke liye Saman Chunein
              </h2>

              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                style={{
                  background: 'transparent',
                  color: '#cbd5e1',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <p
              style={{
                color: '#94a3b8',
                marginTop: '8px',
                fontSize: '13px',
              }}
            >
              Jis saman ko PDF mein dikhana hai,
              uske aage tick karein.
            </p>

            {/* SELECT ALL BUTTONS */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '15px',
                marginBottom: '12px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={selectAllPdfItems}
                style={{
                  background: '#2563eb',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                ☑ Select All
              </button>

              <button
                type="button"
                onClick={deselectAllPdfItems}
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                ☐ Deselect All
              </button>
            </div>

            {/* PDF ITEMS CHECKBOX LIST */}
            <div
              style={{
                border: '1px solid #334155',
                borderRadius: '8px',
                maxHeight: '280px',
                overflowY: 'auto',
              }}
            >
              {pendingList.map((d) => (
                <label
                  key={d.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    cursor: 'pointer',
                    borderBottom:
                      '1px solid rgba(148,163,184,0.15)',
                    background:
                      selectedPdfIds.includes(d.id)
                        ? 'rgba(37,99,235,0.13)'
                        : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPdfIds.includes(d.id)}
                    onChange={() => togglePdfItem(d.id)}
                    style={{
                      width: '19px',
                      height: '19px',
                      accentColor: '#2563eb',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />

                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        color: '#f8fafc',
                        fontSize: '14px',
                        fontWeight: 'bold',
                      }}
                    >
                      {d.item}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#94a3b8',
                        marginTop: '4px',
                      }}
                    >
                      {d.category || 'General'} | Qty: {remainingDemandQty(d)} baaki
                      {d.rate
                        ? ` | Est: ${inr(d.rate * remainingDemandQty(d))}`
                        : ''}
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {/* EMAIL CHECKBOX */}
            <div
              style={{
                marginTop: '18px',
                padding: '14px',
                border: '1px solid #334155',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={showEmailOnSlip}
                  onChange={(e) =>
                    setShowEmailOnSlip(e.target.checked)
                  }
                  style={{
                    marginTop: '2px',
                    width: '19px',
                    height: '19px',
                    accentColor: '#2563eb',
                    cursor: 'pointer',
                  }}
                />

                <span>
                  <strong
                    style={{
                      display: 'block',
                      color: '#fff',
                    }}
                  >
                    PDF mein Email (By:) dikhana hai?
                  </strong>

                  <small
                    style={{
                      color: '#94a3b8',
                      display: 'block',
                      marginTop: '5px',
                    }}
                  >
                    {showEmailOnSlip
                      ? `Haan - ${
                          me?.email || 'Office'
                        }`
                      : 'Nahi - PDF mein By aur Email nahi aayega'}
                  </small>
                </span>
              </label>
            </div>

            {/* SUMMARY */}
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                background: '#1e293b',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'block',
                    color: '#94a3b8',
                    fontSize: '12px',
                  }}
                >
                  Selected Items
                </span>

                <strong
                  style={{
                    color: '#38bdf8',
                    fontSize: '20px',
                  }}
                >
                  {selectedPdfItems.length}
                </strong>
              </div>

              <div
                style={{
                  textAlign: 'right',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    color: '#94a3b8',
                    fontSize: '12px',
                  }}
                >
                  Estimated Total
                </span>

                <strong
                  style={{
                    color: '#4ade80',
                    fontSize: '20px',
                  }}
                >
                  {inr(selectedPdfTotal)}
                </strong>
              </div>
            </div>

            {/* MODAL ACTIONS */}
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginTop: '18px',
              }}
            >
              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #475569',
                  background: '#334155',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={printSelectedPdf}
                disabled={selectedPdfItems.length === 0}
                style={{
                  flex: 2,
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    selectedPdfItems.length > 0
                      ? '#16a34a'
                      : '#475569',
                  color: '#fff',
                  cursor:
                    selectedPdfItems.length > 0
                      ? 'pointer'
                      : 'not-allowed',
                  fontWeight: 'bold',
                }}
              >
                📥 Download Selected PDF / Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE REQUISITION SLIP */}
      <div id="printable-demand-slip">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderBottom: '2px solid #000',
            paddingBottom: '8px',
            marginBottom: '15px',
            gap: '12px',
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: '20px',
                color: '#000',
              }}
            >
              RAHUL OFFICE REQUISITION SLIP
            </h1>

            <p
              style={{
                margin: '2px 0 0',
                fontSize: '12px',
                color: '#555',
              }}
            >
              Demand List for Purchase{' '}
              {selectedCategoryFilter !== 'All'
                ? `(${selectedCategoryFilter})`
                : ''}
            </p>
          </div>

          <div
            style={{
              textAlign: 'right',
              fontSize: '12px',
              color: '#000',
              flexShrink: 0,
            }}
          >
            <div>
              <strong>Date:</strong> {getTodayStr()}
            </div>

            {printedEmail && (
              <div
                style={{
                  marginTop: '3px',
                }}
              >
                <strong>By:</strong>{' '}
                {me?.email || 'Office'}
              </div>
            )}
          </div>
        </div>

        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            marginBottom: '15px',
            fontSize: '12px',
            color: '#000',
          }}
        >
          <thead>
            <tr
              style={{
                background: '#f1f5f9',
                borderBottom: '1.5px solid #000',
              }}
            >
              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'left',
                  width: '35px',
                }}
              >
                S.No
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'left',
                }}
              >
                Item Name
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'left',
                  width: '90px',
                }}
              >
                Category
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'center',
                  width: '45px',
                }}
              >
                Qty
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'right',
                  width: '75px',
                }}
              >
                Est. Rate
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'right',
                  width: '85px',
                }}
              >
                Total Est.
              </th>

              <th
                style={{
                  padding: '8px 6px',
                  textAlign: 'left',
                }}
              >
                Details & Buy Link
              </th>
            </tr>
          </thead>

          <tbody>
            {printableItems.map((d, index) => (
              <tr
                key={d.id}
                style={{
                  borderBottom: '1px solid #cbd5e1',
                  verticalAlign: 'top',
                }}
              >
                <td
                  style={{
                    padding: '8px 6px',
                  }}
                >
                  {index + 1}
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                  }}
                >
                  <strong>{d.item}</strong>
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                    color: '#475569',
                  }}
                >
                  {d.category || 'General'}
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                    textAlign: 'center',
                  }}
                >
                  {remainingDemandQty(d)}
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                    textAlign: 'right',
                  }}
                >
                  {d.rate ? `₹${d.rate}` : '—'}
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                    textAlign: 'right',
                  }}
                >
                  {d.rate
                    ? `₹${d.rate * remainingDemandQty(d)}`
                    : '—'}
                </td>

                <td
                  style={{
                    padding: '8px 6px',
                  }}
                >
                  {d.note && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#1e293b',
                        marginBottom: d.link
                          ? '4px'
                          : '0',
                      }}
                    >
                      {d.note}
                    </div>
                  )}

                  {d.link ? (
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        display: 'block',
                        color: '#1d4ed8',
                        fontSize: '9.5px',
                        textDecoration: 'underline',
                        wordBreak: 'break-all',
                        background: '#eff6ff',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        border: '1px solid #bfdbfe',
                        marginTop: '2px',
                      }}
                    >
                      🔗 {cleanUrl(d.link)}
                    </a>
                  ) : (
                    !d.note && (
                      <span
                        style={{
                          color: '#94a3b8',
                          fontSize: '11px',
                        }}
                      >
                        —
                      </span>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {printableTotal > 0 && (
          <div
            style={{
              textAlign: 'right',
              fontSize: '14px',
              fontWeight: 'bold',
              borderTop: '2px solid #000',
              paddingTop: '8px',
              color: '#000',
            }}
          >
            Kul Anumanit Kharcha: ₹
            {printableTotal.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      {/* ACTIVE PENDING DEMANDS */}
      <h3
        className="no-print"
        style={{
          marginBottom: '10px',
        }}
      >
        Mangwaya Jane Wala Saman ({pendingList.length})
      </h3>

      {pendingList.length === 0 ? (
        <p
          className="muted no-print"
          style={{
            marginBottom: '24px',
          }}
        >
          {searchQuery ||
          selectedCategoryFilter !== 'All'
            ? 'Koi match karne wali demand nahi mili.'
            : 'Abhi koi pending demand nahi hai.'}
        </p>
      ) : (
        <div
          className="no-print"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '24px',
          }}
        >
          {pendingList.map((d) => (
            <div
              key={d.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background:
                  'var(--card-bg, #1e293b)',
                padding: '12px 16px',
                borderRadius: '8px',
                border:
                  '1px solid var(--border, #334155)',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: '220px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong
                    style={{
                      fontSize: '16px',
                    }}
                  >
                    {d.item}
                  </strong>

                  <span
                    style={{
                      fontSize: '11px',
                      background: '#334155',
                      color: '#38bdf8',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    {d.category || 'General'}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '13px',
                  }}
                >
                  <span
                    style={{
                      color: '#94a3b8',
                    }}
                  >
                    Mangaya:
                  </span>{' '}
                  <strong
                    style={{
                      color: '#38bdf8',
                    }}
                  >
                    {d.qty} pcs
                  </strong>
                  {receivedQuantity(d) > 0 && (
                    <>
                      <span style={{ marginLeft: '12px', color: '#94a3b8' }}>Aa chuka:</span>{' '}
                      <strong style={{ color: '#4ade80' }}>{receivedQuantity(d)} pcs</strong>
                    </>
                  )}
                  <span style={{ marginLeft: '12px', color: '#fbbf24' }}>
                    Baaki: {remainingDemandQty(d)} pcs
                  </span>

                  {d.rate ? (
                    <span
                      style={{
                        marginLeft: '12px',
                        color: '#a3e635',
                      }}
                    >
                      Est: {inr(d.rate * remainingDemandQty(d))}
                    </span>
                  ) : null}
                </div>

                {d.link && (
                  <div
                    style={{
                      marginTop: '4px',
                    }}
                  >
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: '12px',
                        color: '#60a5fa',
                        textDecoration: 'underline',
                      }}
                    >
                      🔗 Buy Link Kholo
                    </a>
                  </div>
                )}

                {d.note && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#94a3b8',
                      marginTop: '2px',
                    }}
                  >
                    Note: {d.note}
                  </div>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => startEdit(d)}
                  style={{
                    background: '#334155',
                    color: '#e2e8f0',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  ✏️ Edit
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleDeleteDemand(d.id, d.item)
                  }
                  style={{
                    background: '#991b1b',
                    color: '#fca5a5',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  🗑️ Delete
                </button>

                <button
                  type="button"
                  onClick={() => openReceiveForm(d)}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                  }}
                >
                  ✓ Saman Aa Gaya
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RECEIVED DEMANDS */}
      {receivedList.length > 0 && (
        <details
          className="no-print"
          style={{
            marginTop: '20px',
          }}
        >
          <summary
            style={{
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#94a3b8',
            }}
          >
            Pehle Mangwaya Gaya Saman (
            {receivedList.length})
          </summary>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '10px',
            }}
          >
            {receivedList.map((d) => (
              <div
                key={d.id}
                style={{
                  padding: '8px 12px',
                  background:
                    'rgba(255,255,255,0.03)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: '#94a3b8',
                }}
              >
                <span>
                  {d.item} ({receivedQuantity(d)}/{d.qty} pcs) —{' '}
                  <small>
                    {d.category || 'General'}
                  </small>
                </span>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      color: '#4ade80',
                    }}
                  >
                    ✓ Main Stock mein jud gaya
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteDemand(d.id, d.item)
                    }
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {(savedDelivery || (google.enabled && (google.sync.pending > 0 || google.sync.lastErr))) && (
        <div className="notice no-print" role="status">
          {savedDelivery && <><strong>{savedDelivery.arrivalNo}</strong>{' · '}</>}
          {!google.enabled
            ? 'Google Sheet sync chalu nahi hai.'
            : savedDelivery?.itemIds.some((id) => google.sync.pendingIds.includes(id))
              ? google.sync.running
                ? 'Google Sheet me sync ho raha hai…'
                : google.sync.lastErr
                  ? 'Google Sheet sync pending hai; retry kar sakte hain.'
                  : 'Google Sheet sync pending hai.'
                : savedDelivery && google.sync.pendingIds.length > 0
                  ? 'Is delivery ka sync ho gaya; doosri Sheet entries pending hain.'
                  : !savedDelivery && google.sync.pendingIds.length > 0
                    ? google.sync.running
                      ? 'Google Sheet me sync ho raha hai…'
                      : google.sync.lastErr
                        ? 'Google Sheet sync pending hai; retry kar sakte hain.'
                        : 'Google Sheet sync pending hai.'
                : google.sync.lastErr
                  ? 'Google Sheet sync me dikkat hai.'
                : savedDelivery?.queued
                  ? 'Google Sheet me sync ho gaya.'
                  : 'Google Sheet sync ke liye entries load ho rahi hain…'}
          {google.enabled && google.sync.pendingIds.length > 0 && (
            <button type="button" className="btn sm" style={{ marginLeft: 10 }} onClick={() => google.sync.pendingIds.forEach(queueUpsert)}>
              <Icon name="undo" />
              Sheet retry
            </button>
          )}
        </div>
      )}

      <Dialog
        open={!!receivingDemand}
        onClose={closeReceiveForm}
        className="modal sm"
        labelledBy="receiveDemandTitle"
        backdropClose
      >
        {receivingDemand && (
          <form noValidate onSubmit={handleReceiveDemand}>
            <div className="mhead">
              <div>
                <h2 id="receiveDemandTitle">Saman Aa Gaya</h2>
                <p className="msub">Is demand ki is baar aayi quantity ko alag AWK entry me save karo.</p>
              </div>
              <button type="button" className="iconbtn" onClick={closeReceiveForm} aria-label="Band karo" disabled={receiveSaving}>
                <Icon name="x" />
              </button>
            </div>

            <div className="mbody">
              <div className="fgrid">
                <div className="field">
                  <label htmlFor="receive-order-date">Kab kharida</label>
                  <input id="receive-order-date" type="date" value={receiveOrderDate} onChange={(e) => setReceiveOrderDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-date">Saman Milne ki Date</label>
                  <input id="receive-date" type="date" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="receive-time">Pahunchne ka samay</label>
                  <input id="receive-time" type="time" value={receiveTime} onChange={(e) => setReceiveTime(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="receive-brought-by">Kisne Laya</label>
                  <input id="receive-brought-by" value={receiveBroughtBy} onChange={(e) => setReceiveBroughtBy(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-vendor">Dukaan / Supplier</label>
                  <input id="receive-vendor" value={receiveVendor} onChange={(e) => setReceiveVendor(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-by">Office me kisne liya</label>
                  <input id="receive-by" value={receiveBy} onChange={(e) => setReceiveBy(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-bill">Bill number</label>
                  <input id="receive-bill" value={receiveBillNo} onChange={(e) => setReceiveBillNo(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-travel">Aane-Jane ka Kharcha</label>
                  <input id="receive-travel" type="number" min="0" step="0.01" value={receiveTravelCost} onChange={(e) => setReceiveTravelCost(e.target.value)} placeholder="₹" />
                  <span className="hint">Travel Share isi kharche ka batwara hai; Grand Total me dobara nahi judta.</span>
                </div>
              </div>

              <section className="receive-lines">
                <div className="card-h">
                  <h3>Saman ki lines</h3>
                  <span className="muted small">Estimate reference hai; actual rate alag bharo.</span>
                </div>
                {receiveLines.map((line, index) => {
                  const demand = demands.find((candidate) => candidate.id === line.demandId);
                  const otherQty = receiveLines.filter((candidate) => candidate.demandId === line.demandId && candidate.key !== line.key).reduce((sum, candidate) => sum + Math.max(0, num(candidate.qty)), 0);
                  const available = demand ? Math.max(0, remainingDemandQty(demand) - otherQty) : 0;
                  const lineTotal = Math.round(num(line.qty) * num(line.actualRate) * 100) / 100;
                  return (
                    <div className="card receive-line" key={line.key}>
                      <div className="card-h">
                        <strong>{demand?.item || 'Demand item'}</strong>
                        <button type="button" className="iconbtn sm" onClick={() => setReceiveLines((all) => all.filter((candidate) => candidate.key !== line.key))} aria-label="Ye line hatao" disabled={receiveLines.length === 1}>
                          <Icon name="x" />
                        </button>
                      </div>
                      <p className="hint">
                        Mangaya {num(demand?.qty)} · Pehle aa chuka {demand ? receivedQuantity(demand) : 0} · Estimated Rate {inr(num(demand?.rate))} / piece · Ab available {available}
                      </p>
                      <div className="fgrid">
                        <div className="field">
                          <label htmlFor={`receive-qty-${line.key}`}>Mili Qty</label>
                          <input id={`receive-qty-${line.key}`} type="number" min="0.01" max={available} step="any" value={line.qty} onChange={(e) => updateReceiveLine(line.key, { qty: e.target.value })} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`receive-rate-${line.key}`}>Actual Rate per Piece</label>
                          <input id={`receive-rate-${line.key}`} type="number" min="0" step="0.01" value={line.actualRate} onChange={(e) => updateReceiveLine(line.key, { actualRate: e.target.value })} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`receive-share-${line.key}`}>Travel Share (optional)</label>
                          <input id={`receive-share-${line.key}`} type="number" min="0" step="0.01" value={line.travelShare} onChange={(e) => updateReceiveLine(line.key, { travelShare: e.target.value })} placeholder="₹" />
                        </div>
                        <div className="field">
                          <span className="flabel">Saman ka Kharcha</span>
                          <strong className="num">{inr(lineTotal)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {demands.some((demand) => remainingDemandQty(demand) > 0) && (
                  <div className="field">
                    <label htmlFor="receive-add-demand">Isi delivery me ek aur demand item jodo</label>
                    <select id="receive-add-demand" value="" onChange={(e) => { if (e.target.value) addReceiveLine(e.target.value); }}>
                      <option value="">Demand item chuno…</option>
                      {demands.filter((demand) => remainingDemandQty(demand) > 0).map((demand) => <option key={demand.id} value={demand.id}>{demand.item} · Baaki {remainingDemandQty(demand)}</option>)}
                    </select>
                    <span className="hint">Same item ko do alag rate par mila ho to use dobara chuno.</span>
                  </div>
                )}
              </section>

              <div className="calcbox">
                <span className="eq">
                  Saman ka Total <b>{inr(receiveItemsTotal)}</b>
                  {' · '}Aane-Jane ka Kharcha <b>{inr(receiveTravelPreview)}</b>
                  {' · '}Grand Total <b>{inr(receiveItemsTotal + receiveTravelPreview)}</b>
                </span>
              </div>

              <div className="field">
                <label htmlFor="receive-note">Note</label>
                <textarea id="receive-note" rows={2} value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="Koi saman abhi aana baaki ho to likhein…" />
              </div>
              {receiveError && <p className="ferr" role="alert">{receiveError}</p>}
            </div>

            <div className="mfoot">
              <button type="button" className="btn" onClick={closeReceiveForm} disabled={receiveSaving}>Rehne do</button>
              <button type="submit" className="btn primary" disabled={receiveSaving}>
                <Icon name="check" />
                {receiveSaving ? 'Save ho raha…' : 'AWK ke saath save karo'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
