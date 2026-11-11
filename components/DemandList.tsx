
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
import { delBill, uploadBill } from '@/lib/bills';
import { explainUpload } from '@/lib/messages';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import type { Bill, Item, TripExpense } from '@/lib/types';
import { queueUpsert } from '@/lib/sync';

export interface DemandItem {
  id: string;
  item: string;
  category?: string;
  qty: number;
  rate?: number;
  onlinePrice?: number;
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
  onlinePrice: string;
  actualRate: string;
};

type ReceiveExpense = {
  key: string;
  date: string;
  type: TripExpense['type'];
  description: string;
  amount: string;
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
  const [hasTripExpenses, setHasTripExpenses] = useState(false);
  const [receiveExpenses, setReceiveExpenses] = useState<ReceiveExpense[]>([]);
  const [receiveVendor, setReceiveVendor] = useState('');
  const [receiveBroughtBy, setReceiveBroughtBy] = useState('');
  const [receiveBy, setReceiveBy] = useState('');
  const [receiveBillNo, setReceiveBillNo] = useState('');
  const [receiveBills, setReceiveBills] = useState<Bill[]>([]);
  const receiveBillsRef = useRef<Bill[]>([]);
  const [receiveBillUploading, setReceiveBillUploading] = useState(false);
  const receiveBillUploadLock = useRef(false);
  const receiveBillInputRef = useRef<HTMLInputElement>(null);
  const [receiveNote, setReceiveNote] = useState('');
  const [receiveError, setReceiveError] = useState('');
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [savedDelivery, setSavedDelivery] = useState<SavedDelivery | null>(null);
  const receiveLock = useRef(false);

  useEffect(() => () => {
    receiveBillsRef.current.forEach((bill) => delBill(bill.id));
  }, []);

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
      toast('An item name is required.');
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

      toast('Added to the request list.');

      setItem('');
      setCategory('General');
      setQty(1);
      setRate('');
      setLink('');
      setNote('');
    } catch {
      toast('Could not save. Please try again.');
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
        `Remove "${itemName}" from the request list?`
      )
    ) {
      return;
    }

    try {
      const db = getFirestore();

      await deleteDoc(doc(db, 'demands', id));

      toast(`"${itemName}" removed from the request list.`);
    } catch {
      toast('Could not delete the request.');
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
      toast('An item name is required.');
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

      toast('Request updated.');
      setEditingItem(null);
    } catch {
      toast('Could not update the item.');
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
      onlinePrice: String(d.onlinePrice || d.rate || ''),
      actualRate: '',
    }]);
    setReceiveOrderDate(getTodayStr());
    setReceiveDate(getTodayStr());
    setReceiveTime(new Date().toTimeString().slice(0, 5));
    setHasTripExpenses(false);
    setReceiveExpenses([]);
    setReceiveVendor(d.link ? 'Online / Buy Link' : 'Market');
    setReceiveBroughtBy(me?.name || '');
    setReceiveBy(me?.name || '');
    setReceiveBillNo('');
    receiveBillsRef.current = [];
    setReceiveBills([]);
    setReceiveNote(d.note || '');
    setReceiveError('');
  }

  function setDeliveryBills(bills: Bill[]) {
    receiveBillsRef.current = bills;
    setReceiveBills(bills);
  }

  async function handleReceiveBillFiles(files: File[]) {
    if (!files.length || receiveBillUploadLock.current) return;
    receiveBillUploadLock.current = true;
    setReceiveBillUploading(true);
    setReceiveError('');
    let uploadError: unknown = null;
    for (const file of files) {
      try {
        const { bill } = await uploadBill(file, me);
        setDeliveryBills([...receiveBillsRef.current, bill]);
      } catch (error) {
        uploadError = error;
        break;
      }
    }
    receiveBillUploadLock.current = false;
    setReceiveBillUploading(false);
    if (uploadError) setReceiveError(explainUpload(uploadError));
  }

  function removeReceiveBill(id: string) {
    setDeliveryBills(receiveBillsRef.current.filter((bill) => bill.id !== id));
    delBill(id);
  }

  function closeReceiveForm() {
    if (receiveLock.current || receiveBillUploadLock.current) return;
    receiveBillsRef.current.forEach((bill) => delBill(bill.id));
    receiveBillsRef.current = [];
    setReceiveBills([]);
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
      onlinePrice: String(demand.onlinePrice || demand.rate || ''),
      actualRate: '',
    }]);
  }

  function updateReceiveLine(key: string, patch: Partial<ReceiveLine>) {
    setReceiveLines((lines) => lines.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function addReceiveExpense() {
    setReceiveExpenses((expenses) => [...expenses, {
      key: uid(),
      date: receiveDate || getTodayStr(),
      type: 'Petrol',
      description: '',
      amount: '',
    }]);
  }

  function updateReceiveExpense(key: string, patch: Partial<ReceiveExpense>) {
    setReceiveExpenses((expenses) => expenses.map((expense) => expense.key === key ? { ...expense, ...patch } : expense));
  }

  // Save all lines in one delivery; each line has its own stock and Sheet row.
  async function handleReceiveDemand(e: React.FormEvent) {
    e.preventDefault();
    const d = receivingDemand;
    if (!d || receiveLock.current) return;

    if (receiveBillUploadLock.current) {
      setReceiveError('Wait for the receipt upload to finish before saving the delivery.');
      return;
    }
    if (!receiveLines.length) {
      setReceiveError('Add at least one requested item.');
      return;
    }

    const lines = receiveLines.map((line) => ({
      ...line,
      demand: demands.find((demand) => demand.id === line.demandId),
      qty: Number(line.qty),
      onlineRate: line.onlinePrice.trim() ? Number(line.onlinePrice) : 0,
      rate: line.actualRate.trim() ? Number(line.actualRate) : NaN,
    }));
    const expenses = hasTripExpenses ? receiveExpenses.map((expense) => ({
      ...expense,
      amount: Number(expense.amount),
      description: expense.description.trim(),
    })) : [];
    const badLine = lines.find((line) => !line.demand || !Number.isFinite(line.qty) || line.qty <= 0 || !Number.isFinite(line.onlineRate) || line.onlineRate < 0 || !Number.isFinite(line.rate) || line.rate < 0);
    if (badLine) {
      setReceiveError('For each line, enter a valid requested item, received quantity, online price, and actual rate (zero or more).');
      return;
    }
    if (hasTripExpenses && (!expenses.length || expenses.some((expense) =>
      !expense.date || !Number.isFinite(expense.amount) || expense.amount <= 0 ||
      (expense.type === 'Other' && !expense.description)
    ))) {
      setReceiveError('Enter a valid date, type, and amount for each trip expense. For Other, also enter an expense description.');
      return;
    }
    if (!receiveDate || !receiveTime || !receiveOrderDate) {
      setReceiveError('Purchase date, delivery date, and time are required.');
      return;
    }

    receiveLock.current = true;
    setReceiveSaving(true);
    setReceiveError('');
    try {
      const db = getFirestore();
      const sequenceRef = doc(db, 'settings', 'arrival-sequence');
      const tripExpenses: TripExpense[] = expenses.map((expense) => ({
        id: expense.key,
        date: expense.date,
        type: expense.type,
        description: expense.description,
        amount: Math.round(expense.amount * 100) / 100,
      }));
      const tripCost = tripExpenses.reduce((sum, expense) => sum + expense.amount, 0);
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
          if (!snap.exists()) throw new Error('A requested item was not found in the list.');
          currentById.set(id, snap.data());
        }

        const receivedByDemand = new Map<string, number>();
        for (const line of lines) {
          receivedByDemand.set(line.demandId, (receivedByDemand.get(line.demandId) || 0) + line.qty);
        }
        for (const [id, adding] of receivedByDemand) {
          const current = currentById.get(id);
          if (!current) throw new Error('A requested item was not found in the list.');
          const requested = Math.max(0, num(current.qty));
          const currentReceived = Number.isFinite(current.receivedQty)
            ? Math.max(0, num(current.receivedQty))
            : current.status === 'received'
              ? requested
              : 0;
          const outstanding = Math.max(0, requested - currentReceived);
          if (outstanding <= 0) throw new Error(`The request for ${String(current.item || 'item')} has already been fulfilled.`);
          if (adding > outstanding) throw new Error(`${String(current.item || 'Item')}: only ${outstanding} pcs remain on this request.`);
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
            ...(index === 0 ? { tripExpenses } : {}),
            arrivalTravelCost: index === 0 ? tripCost : 0,
            arrivalTravelShare: 0,
            item: String(current.item || demand.item).trim(),
            category: String(current.category || demand.category || 'General'),
            qty: line.qty,
            onlineRate: line.onlineRate,
            rate: line.rate,
            total: Math.round(line.qty * line.rate * 100) / 100,
            bills: receiveBills.map((bill) => ({ ...bill })),
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
          total: purchases.reduce((sum, purchase) => sum + purchase.total, 0) + tripCost,
          outstanding,
        };
      });

      result.itemIds.forEach(queueUpsert);
      setSavedDelivery({ arrivalNo: result.arrivalNo, itemIds: result.itemIds, queued: true });
      receiveBillsRef.current = [];
      setReceiveBills([]);
      setReceivingDemand(null);
      toast(`Delivery ${result.arrivalNo} added to stock · Total ${inr(result.total)}${result.outstanding ? ` · ${result.outstanding} pcs still requested` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not add items to stock.';
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
  const receiveExpenseTotal = hasTripExpenses
    ? receiveExpenses.reduce((sum, expense) => sum + Math.max(0, num(expense.amount)), 0)
    : 0;

  const grandTotal = pendingList.reduce(
    (sum, d) => sum + remainingDemandQty(d) * (d.rate || 0),
    0
  );

  // WhatsApp Share - original behaviour
  function shareWhatsApp() {
    if (!pendingList.length) {
      toast('There are no pending requests.');
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

    const msg = `📋 *OFFICE SUPPLIES ORDER REQUEST LIST*
📅 Date: ${getTodayStr()}
💰 *Estimated Total: ₹${grandTotal.toLocaleString(
      'en-IN'
    )}*

${text}

_Sent by: ${me?.email || 'Office'}_`;

    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`,
      '_blank'
    );
  }

  // OPEN PDF SELECTION WINDOW
  function handleDownloadPdf() {
    if (!pendingList.length) {
      toast(
        'There are no pending requests to download.'
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
      toast('Select at least one item for the PDF.');
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
        <h2>🛒 New Item Request / Requisition</h2>

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
          background: 'var(--surface)',
          padding: '16px',
          borderRadius: '10px',
          marginBottom: '20px',
          border: '1px solid var(--border)',
        }}
      >
        <h3
          style={{
            marginBottom: '12px',
            fontSize: '15px',
          }}
        >
          Add Items to the Request List
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
            placeholder="Item name *"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            required
            style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--ink)',
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
              color: 'var(--ink)',
            }}
          >
            {CATEGORIES.map((c) => (
              <option
                key={c}
                value={c}
                style={{
                  background: 'var(--surface)',
                  color: 'var(--ink)',
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
              color: 'var(--ink)',
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
              color: 'var(--ink)',
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
              color: 'var(--ink)',
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
            color: 'var(--ink)',
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
            : '+ Add to Request List'}
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
          background: 'var(--surface-2)',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search items, notes, or categories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: '200px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--ink)',
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
            color: 'var(--ink)',
            minWidth: '150px',
          }}
        >
          <option
            value="All"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
            }}
          >
            📁 All Categories
          </option>

          {CATEGORIES.map((c) => (
            <option
              key={c}
              value={c}
              style={{
                background: 'var(--surface)',
                color: 'var(--ink)',
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
            background: 'var(--surface)',
            border: '2px solid var(--accent)',
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
                color: 'var(--accent)',
                margin: 0,
              }}
            >
              ✏️ Edit Request: {editingItem.item}
            </h3>

            <button
              type="button"
              onClick={() => setEditingItem(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
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
                placeholder="Item name"
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
                  color: 'var(--ink)',
                }}
              >
                {CATEGORIES.map((c) => (
                  <option
                    key={c}
                    value={c}
                    style={{
                      background: 'var(--surface)',
                      color: 'var(--ink)',
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
                  : '✓ Save Changes'}
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
            aria-label="Select items for PDF"
            style={{
              background: 'var(--surface)',
              color: 'var(--ink)',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: '14px',
              border: '1px solid var(--border)',
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
                  color: 'var(--ink)',
                }}
              >
                📄 Select Items for PDF
              </h2>

              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                style={{
                  background: 'transparent',
                  color: 'var(--muted)',
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
                color: 'var(--muted)',
                marginTop: '8px',
                fontSize: '13px',
              }}
            >
              Select the items you want to include in the PDF.
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
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
                  border: '1px solid var(--border)',
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
                border: '1px solid var(--border)',
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
                      '1px solid var(--border)',
                    background:
                      selectedPdfIds.includes(d.id)
                        ? 'var(--accent-soft)'
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
                        color: 'var(--ink)',
                        fontSize: '14px',
                        fontWeight: 'bold',
                      }}
                    >
                      {d.item}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        marginTop: '4px',
                      }}
                    >
                      {d.category || 'General'} | Qty: {remainingDemandQty(d)} remaining
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
                border: '1px solid var(--border)',
                borderRadius: '8px',
                background: 'var(--sunk)',
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
                      color: 'var(--ink)',
                    }}
                  >
                    Show email (By:) in the PDF?
                  </strong>

                  <small
                    style={{
                      color: 'var(--muted)',
                      display: 'block',
                      marginTop: '5px',
                    }}
                  >
                    {showEmailOnSlip
                      ? `Yes - ${
                          me?.email || 'Office'
                        }`
                      : 'No - By and email will not appear in the PDF'}
                  </small>
                </span>
              </label>
            </div>

            {/* SUMMARY */}
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                background: 'var(--surface-2)',
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
                    color: 'var(--muted)',
                    fontSize: '12px',
                  }}
                >
                  Selected Items
                </span>

                <strong
                  style={{
                    color: 'var(--accent)',
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
                    color: 'var(--muted)',
                    fontSize: '12px',
                  }}
                >
                  Estimated Total
                </span>

                <strong
                  style={{
                    color: 'var(--ok)',
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
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--ink)',
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
            Estimated Total: ₹
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
        Requested Items ({pendingList.length})
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
            ? 'No matching requests found.'
            : 'There are no pending requests.'}
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
                background: 'var(--surface)',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
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
                      color: 'var(--ink)',
                    }}
                  >
                    {d.item}
                  </strong>

                  <span
                    style={{
                      fontSize: '11px',
                      background: 'var(--surface-2)',
                      color: 'var(--accent)',
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
                      color: 'var(--muted)',
                    }}
                  >
                    Requested:
                  </span>{' '}
                  <strong
                    style={{
                      color: 'var(--accent)',
                    }}
                  >
                    {d.qty} pcs
                  </strong>
                  {receivedQuantity(d) > 0 && (
                    <>
                      <span style={{ marginLeft: '12px', color: 'var(--muted)' }}>Received:</span>{' '}
                      <strong style={{ color: 'var(--ok)' }}>{receivedQuantity(d)} pcs</strong>
                    </>
                  )}
                  <span style={{ marginLeft: '12px', color: 'var(--warn)' }}>
                    Remaining: {remainingDemandQty(d)} pcs
                  </span>

                  {d.rate ? (
                    <span
                      style={{
                        marginLeft: '12px',
                        color: 'var(--ok)',
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
                        color: 'var(--info)',
                        textDecoration: 'underline',
                      }}
                    >
                      🔗 Buy Link
                    </a>
                  </div>
                )}

                {d.note && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--muted)',
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
                    background: 'var(--surface-2)',
                    color: 'var(--ink)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
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
                    background: 'var(--danger-soft)',
                    color: 'var(--danger)',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--danger-soft)',
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
                    background: 'var(--ok)',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                  }}
                >
                  ✓ Items Received
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
              color: 'var(--muted)',
            }}
          >
            Previously Requested Items (
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
                    'var(--surface-2)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  color: 'var(--ink)',
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
                      color: 'var(--ok)',
                    }}
                  >
                    ✓ Added to Main Stock
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteDemand(d.id, d.item)
                    }
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--danger)',
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
            ? 'Google Sheets sync is not configured.'
            : savedDelivery?.itemIds.some((id) => google.sync.pendingIds.includes(id))
              ? google.sync.running
                ? 'Syncing to Google Sheets…'
                : google.sync.lastErr
                  ? 'Google Sheets sync is pending; you can retry.'
                  : 'Google Sheets sync is pending.'
                : savedDelivery && google.sync.pendingIds.length > 0
                  ? 'This delivery synced; other spreadsheet entries are still pending.'
                  : !savedDelivery && google.sync.pendingIds.length > 0
                    ? google.sync.running
                      ? 'Syncing to Google Sheets…'
                      : google.sync.lastErr
                        ? 'Google Sheets sync is pending; you can retry.'
                        : 'Google Sheets sync is pending.'
                : google.sync.lastErr
                  ? 'Google Sheets sync failed.'
                : savedDelivery?.queued
                  ? 'Synced to Google Sheets.'
                  : 'Loading entries for Google Sheets sync…'}
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
                <h2 id="receiveDemandTitle">Receive Items</h2>
                <p className="msub">Save the quantity received for this request as a separate AWK entry.</p>
              </div>
              <button type="button" className="iconbtn" onClick={closeReceiveForm} aria-label="Close" disabled={receiveSaving || receiveBillUploading}>
                <Icon name="x" />
              </button>
            </div>

            <div className="mbody">
              <div className="fgrid">
                <div className="field">
                  <label htmlFor="receive-order-date">Purchase date</label>
                  <input id="receive-order-date" type="date" max={today()} value={receiveOrderDate} onChange={(e) => setReceiveOrderDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-date">Received date</label>
                  <input id="receive-date" type="date" max={today()} value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="receive-time">Delivery time</label>
                  <input id="receive-time" type="time" value={receiveTime} onChange={(e) => setReceiveTime(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="receive-brought-by">Brought by</label>
                  <input id="receive-brought-by" value={receiveBroughtBy} onChange={(e) => setReceiveBroughtBy(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-vendor">Store / Supplier</label>
                  <input id="receive-vendor" value={receiveVendor} onChange={(e) => setReceiveVendor(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-by">Received by</label>
                  <input id="receive-by" value={receiveBy} onChange={(e) => setReceiveBy(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="receive-bill">Bill number</label>
                  <input id="receive-bill" value={receiveBillNo} onChange={(e) => setReceiveBillNo(e.target.value)} />
                </div>
              </div>
              <div className="field">
                <button type="button" className="btn sm" onClick={() => receiveBillInputRef.current?.click()} disabled={receiveBillUploading || receiveSaving}>
                  <Icon name="clip" />
                  {receiveBillUploading ? 'Uploading receipt…' : '+ Add receipt'}
                </button>
                <input
                  ref={receiveBillInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = '';
                    void handleReceiveBillFiles(files);
                  }}
                />
                {receiveBills.length > 0 && (
                  <div className="receive-bill-list">
                    {receiveBills.map((bill) => (
                      <div className="uitem" key={bill.id}>
                        <span className="nm">{bill.name}</span>
                        <button type="button" className="iconbtn sm" onClick={() => removeReceiveBill(bill.id)} aria-label="Remove receipt" disabled={receiveSaving || receiveBillUploading}>
                          <Icon name="x" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <section className="receive-lines">
                <div className="card-h">
                  <h3>Item lines</h3>
                  <span className="muted small">The estimate is for reference; enter the actual rate separately.</span>
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
                        <button type="button" className="iconbtn sm" onClick={() => setReceiveLines((all) => all.filter((candidate) => candidate.key !== line.key))} aria-label="Remove line" disabled={receiveLines.length === 1}>
                          <Icon name="x" />
                        </button>
                      </div>
                      <p className="hint">
                        Requested {num(demand?.qty)} · Previously received {demand ? receivedQuantity(demand) : 0} · Estimated rate {inr(num(demand?.rate))} / piece · Available now {available}
                      </p>
                      <div className="fgrid">
                        <div className="field">
                          <label htmlFor={`receive-qty-${line.key}`}>Received quantity</label>
                          <input id={`receive-qty-${line.key}`} type="number" min="0.01" max={available} step="any" value={line.qty} onChange={(e) => updateReceiveLine(line.key, { qty: e.target.value })} required />
                        </div>
                        <div className="field">
                          <label htmlFor={`receive-online-price-${line.key}`}>Online Price / Piece</label>
                          <input id={`receive-online-price-${line.key}`} type="number" min="0" step="0.01" value={line.onlinePrice} onChange={(e) => updateReceiveLine(line.key, { onlinePrice: e.target.value })} placeholder="Optional" />
                          {demand?.link && <a href={demand.link} target="_blank" rel="noreferrer">Open purchase link</a>}
                        </div>
                        <div className="field">
                          <label htmlFor={`receive-rate-${line.key}`}>Actual Rate / Piece</label>
                          <input id={`receive-rate-${line.key}`} type="number" min="0" step="0.01" value={line.actualRate} onChange={(e) => updateReceiveLine(line.key, { actualRate: e.target.value })} required />
                        </div>
                        <div className="field">
                          <span className="flabel">Item Amount</span>
                          <strong className="num">{inr(lineTotal)}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {demands.some((demand) => remainingDemandQty(demand) > 0) && (
                  <div className="field">
                    <label htmlFor="receive-add-demand">Add another requested item to this delivery</label>
                    <select id="receive-add-demand" value="" onChange={(e) => { if (e.target.value) addReceiveLine(e.target.value); }}>
                      <option value="">Select a requested item…</option>
                      {demands.filter((demand) => remainingDemandQty(demand) > 0).map((demand) => <option key={demand.id} value={demand.id}>{demand.item} · {remainingDemandQty(demand)} remaining</option>)}
                    </select>
                    <span className="hint">Select the same item again if it was received at a different rate.</span>
                  </div>
                )}
              </section>

              <section className="receive-lines trip-expenses">
                <div className="card-h">
                  <div>
                    <h3>Trip expenses</h3>
                    <span className="muted small">Trip expenses are recorded separately from item purchases.</span>
                  </div>
                  <label className="field">
                    <span>Any expenses?</span>
                    <select value={hasTripExpenses ? 'yes' : 'no'} onChange={(e) => {
                      const hasExpenses = e.target.value === 'yes';
                      setHasTripExpenses(hasExpenses);
                      if (hasExpenses && !receiveExpenses.length) addReceiveExpense();
                      if (!hasExpenses) setReceiveExpenses([]);
                    }}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>
                </div>
                {hasTripExpenses && (
                  <>
                    {receiveExpenses.map((expense, index) => (
                      <div className="card receive-line" key={expense.key}>
                        <div className="card-h">
                          <strong>Trip expense {index + 1}</strong>
                          <button type="button" className="iconbtn sm" onClick={() => setReceiveExpenses((all) => all.filter((candidate) => candidate.key !== expense.key))} aria-label="Remove this expense">
                            <Icon name="x" />
                          </button>
                        </div>
                        <div className="fgrid">
                          <div className="field">
                            <label htmlFor={`receive-expense-date-${expense.key}`}>Expense date</label>
                            <input id={`receive-expense-date-${expense.key}`} type="date" max={today()} value={expense.date} onChange={(e) => updateReceiveExpense(expense.key, { date: e.target.value })} required />
                          </div>
                          <div className="field">
                            <label htmlFor={`receive-expense-type-${expense.key}`}>Expense Type</label>
                            <select id={`receive-expense-type-${expense.key}`} value={expense.type} onChange={(e) => updateReceiveExpense(expense.key, { type: e.target.value as TripExpense['type'] })}>
                              <option>Petrol</option>
                              <option>Diesel</option>
                              <option>Parking</option>
                              <option>Freight</option>
                              <option>Other</option>
                            </select>
                          </div>
                          {expense.type === 'Other' && (
                            <div className="field">
                              <label htmlFor={`receive-expense-description-${expense.key}`}>Expense description</label>
                              <input id={`receive-expense-description-${expense.key}`} value={expense.description} onChange={(e) => updateReceiveExpense(expense.key, { description: e.target.value })} required />
                            </div>
                          )}
                          <div className="field">
                            <label htmlFor={`receive-expense-amount-${expense.key}`}>Amount</label>
                            <input id={`receive-expense-amount-${expense.key}`} type="number" min="0.01" step="0.01" value={expense.amount} onChange={(e) => updateReceiveExpense(expense.key, { amount: e.target.value })} required />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" className="btn sm" onClick={addReceiveExpense}>
                      <Icon name="plus" /> Add Expense
                    </button>
                  </>
                )}
              </section>

              <div className="calcbox">
                <span className="eq">
                  Item Amount <b>{inr(receiveItemsTotal)}</b>
                  {' · '}Trip Expense <b>{inr(receiveExpenseTotal)}</b>
                  {' · '}Grand Total <b>{inr(receiveItemsTotal + receiveExpenseTotal)}</b>
                </span>
              </div>

              <div className="field">
                <label htmlFor="receive-note">Note</label>
                <textarea id="receive-note" rows={2} value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="Add a note if any items are still outstanding…" />
              </div>
              {receiveError && <p className="ferr" role="alert">{receiveError}</p>}
            </div>

            <div className="mfoot">
              <button type="button" className="btn" onClick={closeReceiveForm} disabled={receiveSaving || receiveBillUploading}>Cancel</button>
              <button type="submit" className="btn primary" disabled={receiveSaving || receiveBillUploading}>
                <Icon name="check" />
                {receiveSaving ? 'Saving…' : 'Save with AWK'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
