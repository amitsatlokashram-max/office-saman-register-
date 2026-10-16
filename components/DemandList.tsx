'use client';

import { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useReg } from './context';
import { inr } from '@/lib/calc';

export interface DemandItem {
  id: string;
  item: string;
  category?: string;
  qty: number;
  rate?: number;
  link?: string;
  note?: string;
  status: 'pending' | 'received';
  createdAt: string;
}

const CATEGORIES = ['General', 'Electronics', 'Stationery', 'Pantry', 'Furniture', 'Maintenance', 'Other'];

const getTodayStr = () => new Date().toISOString().slice(0, 10);

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
  const { toast, me } = useReg();
  const [demands, setDemands] = useState<DemandItem[]>([]);
  
  // Add Form State
  const [item, setItem] = useState('');
  const [category, setCategory] = useState('General');
  const [qty, setQty] = useState<number | string>(1);
  const [rate, setRate] = useState<number | string>('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

  // Edit State
  const [editingItem, setEditingItem] = useState<DemandItem | null>(null);
  const [editItemName, setEditItemName] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editQty, setEditQty] = useState<number | string>(1);
  const [editRate, setEditRate] = useState<number | string>('');
  const [editLink, setEditLink] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    const db = getFirestore();
    const q = query(collection(db, 'demands'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: DemandItem[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as DemandItem);
        });
        setDemands(list);
      },
      () => {}
    );
    return () => unsub();
  }, []);

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

  async function handleDeleteDemand(id: string, itemName: string) {
    if (!confirm(`Kya aap "${itemName}" ko demand list se hatana chahte hain?`)) return;
    try {
      const db = getFirestore();
      await deleteDoc(doc(db, 'demands', id));
      toast(`"${itemName}" demand list se hata diya gaya.`);
    } catch {
      toast('Delete karne mein dikkat aayi.');
    }
  }

  function startEdit(d: DemandItem) {
    setEditingItem(d);
    setEditItemName(d.item);
    setEditCategory(d.category || 'General');
    setEditQty(d.qty);
    setEditRate(d.rate || '');
    setEditLink(d.link || '');
    setEditNote(d.note || '');
  }

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
      await updateDoc(doc(db, 'demands', editingItem.id), {
        item: editItemName.trim(),
        category: editCategory,
        qty: Number(editQty) || 1,
        rate: editRate ? Number(editRate) : 0,
        link: editLink.trim(),
        note: editNote.trim(),
      });
      toast('Demand update ho gayi!');
      setEditingItem(null);
    } catch {
      toast('Update nahi ho paya.');
    } finally {
      setEditLoading(false);
    }
  }

  async function handleReceiveDemand(d: DemandItem) {
    try {
      const db = getFirestore();
      await addDoc(collection(db, 'purchases'), {
        item: d.item,
        category: d.category || 'General',
        qty: d.qty,
        rate: d.rate || 0,
        total: d.qty * (d.rate || 0),
        orderDate: d.createdAt.slice(0, 10) || getTodayStr(),
        receivedDate: getTodayStr(),
        vendor: d.link ? 'Online / Buy Link' : 'Market',
        broughtBy: me?.email || 'Office',
        note: `Demand list se auto-added. ${d.link ? 'Link: ' + d.link : ''} ${d.note ? 'Note: ' + d.note : ''}`.trim(),
        bills: [],
        issues: [],
        moves: [],
        addedBy: me?.email || '',
        createdAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'demands', d.id), { status: 'received' });
      toast(`"${d.item}" main Stock register mein jud gaya!`);
    } catch {
      toast('Stock mein add nahi ho paya.');
    }
  }

  // Filtered List Logic
  const filteredDemands = demands.filter((d) => {
    const matchesSearch =
      d.item.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.note && d.note.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (d.category && d.category.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory =
      selectedCategoryFilter === 'All' || (d.category || 'General') === selectedCategoryFilter;

    return matchesSearch && matchesCategory;
  });

  const pendingList = filteredDemands.filter((d) => d.status === 'pending');
  const receivedList = filteredDemands.filter((d) => d.status === 'received');
  const grandTotal = pendingList.reduce((sum, d) => sum + d.qty * (d.rate || 0), 0);

  function shareWhatsApp() {
    if (!pendingList.length) {
      toast('Koi pending demand nahi hai.');
      return;
    }
    const text = pendingList
      .map(
        (d, i) =>
          `${i + 1}. *${d.item}* [${d.category || 'General'}]\n   Qty: ${d.qty} pcs${d.rate ? ` | Est: ₹${d.rate * d.qty}` : ''}${
            d.link ? `\n   Link: ${cleanUrl(d.link)}` : ''
          }${d.note ? `\n   Note: ${d.note}` : ''}`
      )
      .join('\n\n');

    const msg = `📋 *OFFICE SAMAN ORDER DEMAND LIST*\n📅 Date: ${getTodayStr()}\n💰 *Kul Anumanit Kharcha: ₹${grandTotal.toLocaleString(
      'en-IN'
    )}*\n\n${text}\n\n_Bhejnewala: ${me?.email || 'Office'}_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function handleDownloadPdf() {
    if (!pendingList.length) {
      toast('Download karne ke liye koi pending demand nahi hai.');
      return;
    }
    window.print();
  }

  return (
    <div style={{ padding: '16px', maxWidth: '950px', margin: '0 auto' }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-demand-slip, #printable-demand-slip * { visibility: visible; }
          #printable-demand-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #000 !important;
            background: #fff !important;
            padding: 20px;
            font-family: system-ui, -apple-system, sans-serif;
          }
          .no-print { display: none !important; }
        }
        @media screen {
          #printable-demand-slip { display: none; }
        }
      `}</style>

      {/* Header Actions */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
        <h2>🛒 Naya Saman Demand / Requisition</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn sm" onClick={handleDownloadPdf} style={{ background: '#2563eb', color: '#fff', border: 'none', fontWeight: 'bold', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>
            📥 Download PDF / Print
          </button>
          <button type="button" className="btn primary sm" onClick={shareWhatsApp}>
            📱 WhatsApp Share
          </button>
        </div>
      </div>

      {/* Add Demand Form */}
      <form onSubmit={handleAddDemand} className="no-print" style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border, #334155)' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '15px' }}>Naye Saman ki Demand List Jodein</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <input type="text" placeholder="Saman ka Naam *" value={item} onChange={(e) => setItem(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: '#fff' }}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} style={{ background: '#1e293b', color: '#fff' }}>{c}</option>
            ))}
          </select>

          <input type="number" placeholder="Pieces (Qty)" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <input type="number" placeholder="Est. Rate (₹)" value={rate} onChange={(e) => setRate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <input type="url" placeholder="Buy Link (URL)" value={link} onChange={(e) => setLink(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
        </div>
        <input type="text" placeholder="Note / Details (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: '12px' }} />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? 'Adding...' : '+ Demand List mein Jodein'}
        </button>
      </form>

      {/* Search & Filter Bar */}
      <div className="no-print" style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border, #334155)' }}>
        <input
          type="text"
          placeholder="🔍 Search saman, note ya category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }}
        />
        <select
          value={selectedCategoryFilter}
          onChange={(e) => setSelectedCategoryFilter(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: '#fff', minWidth: '150px' }}
        >
          <option value="All" style={{ background: '#1e293b', color: '#fff' }}>📁 All Categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c} style={{ background: '#1e293b', color: '#fff' }}>{c}</option>
          ))}
        </select>
      </div>

      {/* Edit Form Box */}
      {editingItem && (
        <div className="no-print" style={{ background: '#1e293b', border: '2px solid #3b82f6', padding: '16px', borderRadius: '10px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ color: '#60a5fa', margin: 0 }}>✏️ Demand Edit Karein: {editingItem.item}</h3>
            <button type="button" onClick={() => setEditingItem(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✖</button>
          </div>
          <form onSubmit={handleUpdateDemand}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
              <input type="text" placeholder="Saman ka Naam" value={editItemName} onChange={(e) => setEditItemName(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
              <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: '#fff' }}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} style={{ background: '#1e293b', color: '#fff' }}>{c}</option>
                ))}
              </select>
              <input type="number" placeholder="Qty" min={1} value={editQty} onChange={(e) => setEditQty(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
              <input type="number" placeholder="Rate (₹)" value={editRate} onChange={(e) => setEditRate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
              <input type="url" placeholder="Buy Link" value={editLink} onChange={(e) => setEditLink(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
            </div>
            <input type="text" placeholder="Note" value={editNote} onChange={(e) => setEditNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" className="btn primary" disabled={editLoading}>
                {editLoading ? 'Saving...' : '✓ Changes Save Karein'}
              </button>
              <button type="button" className="btn" onClick={() => setEditingItem(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Printable PDF Slip Layout */}
      <div id="printable-demand-slip">
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '15px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', color: '#000' }}>OFFICE SAMAN REQUISITION SLIP</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555' }}>
              Demand List for Purchase {selectedCategoryFilter !== 'All' ? `(${selectedCategoryFilter})` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#000' }}>
            <div><strong>Date:</strong> {getTodayStr()}</div>
            <div><strong>By:</strong> {me?.email || 'Office'}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '12px', color: '#000' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #000' }}>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: '35px' }}>S.No</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Item Name</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: '90px' }}>Category</th>
              <th style={{ padding: '8px 6px', textAlign: 'center', width: '45px' }}>Qty</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: '75px' }}>Est. Rate</th>
              <th style={{ padding: '8px 6px', textAlign: 'right', width: '85px' }}>Total Est.</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Details & Buy Link</th>
            </tr>
          </thead>
          <tbody>
            {pendingList.map((d, index) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #cbd5e1', verticalAlign: 'top' }}>
                <td style={{ padding: '8px 6px' }}>{index + 1}</td>
                <td style={{ padding: '8px 6px' }}><strong>{d.item}</strong></td>
                <td style={{ padding: '8px 6px', color: '#475569' }}>{d.category || 'General'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>{d.qty}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{d.rate ? `₹${d.rate}` : '—'}</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>{d.rate ? `₹${d.rate * d.qty}` : '—'}</td>
                <td style={{ padding: '8px 6px' }}>
                  {d.note && (
                    <div style={{ fontSize: '11px', color: '#1e293b', marginBottom: d.link ? '4px' : '0' }}>
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
                        marginTop: '2px'
                      }}
                    >
                      🔗 {cleanUrl(d.link)}
                    </a>
                  ) : (
                    !d.note && <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {grandTotal > 0 && (
          <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 'bold', borderTop: '2px solid #000', paddingTop: '8px', color: '#000' }}>
            Kul Anumanit Kharcha: ₹{grandTotal.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      {/* Active Pending List Cards */}
      <h3 className="no-print" style={{ marginBottom: '10px' }}>
        Mangwaya Jane Wala Saman ({pendingList.length})
      </h3>
      {pendingList.length === 0 ? (
        <p className="muted no-print" style={{ marginBottom: '24px' }}>
          {searchQuery || selectedCategoryFilter !== 'All' ? 'Koi match karne wali demand nahi mili.' : 'Abhi koi pending demand nahi hai.'}
        </p>
      ) : (
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {pendingList.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg, #1e293b)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border, #334155)', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '16px' }}>{d.item}</strong>
                  <span style={{ fontSize: '11px', background: '#334155', color: '#38bdf8', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
                    {d.category || 'General'}
                  </span>
                </div>
                <div style={{ marginTop: '4px', fontSize: '13px' }}>
                  <span style={{ color: '#94a3b8' }}>Qty:</span> <strong style={{ color: '#38bdf8' }}>{d.qty} pcs</strong>
                  {d.rate ? <span style={{ marginLeft: '12px', color: '#a3e635' }}>Est: {inr(d.rate * d.qty)}</span> : null}
                </div>
                {d.link && (
                  <div style={{ marginTop: '4px' }}>
                    <a href={d.link} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#60a5fa', textDecoration: 'underline' }}>
                      🔗 Buy Link Kholo
                    </a>
                  </div>
                )}
                {d.note && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Note: {d.note}</div>}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => startEdit(d)} style={{ background: '#334155', color: '#e2e8f0', padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                  ✏️ Edit
                </button>
                <button type="button" onClick={() => handleDeleteDemand(d.id, d.item)} style={{ background: '#991b1b', color: '#fca5a5', padding: '6px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px' }}>
                  🗑️ Delete
                </button>
                <button type="button" onClick={() => handleReceiveDemand(d)} style={{ background: '#16a34a', color: '#fff', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
                  ✓ Saman Aa Gaya
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Received List */}
      {receivedList.length > 0 && (
        <details className="no-print" style={{ marginTop: '20px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#94a3b8' }}>Pehle Mangwaya Gaya Saman ({receivedList.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {receivedList.map((d) => (
              <div key={d.id} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>{d.item} ({d.qty} pcs) — <small>{d.category || 'General'}</small></span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ color: '#4ade80' }}>✓ Main Stock mein jud gaya</span>
                  <button type="button" onClick={() => handleDeleteDemand(d.id, d.item)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}