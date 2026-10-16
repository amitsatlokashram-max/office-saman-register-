'use client';

import { useState, useEffect } from 'react';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useReg } from './context';
import { inr } from '@/lib/calc';

export interface DemandItem {
  id: string;
  item: string;
  qty: number;
  rate?: number;
  link?: string;
  note?: string;
  status: 'pending' | 'received';
  createdAt: string;
}

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
  const [item, setItem] = useState('');
  const [qty, setQty] = useState<number | string>(1);
  const [rate, setRate] = useState<number | string>('');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

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

  async function handleReceiveDemand(d: DemandItem) {
    try {
      const db = getFirestore();
      await addDoc(collection(db, 'purchases'), {
        item: d.item,
        category: 'General',
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

  const pendingList = demands.filter((d) => d.status === 'pending');
  const receivedList = demands.filter((d) => d.status === 'received');
  const grandTotal = pendingList.reduce((sum, d) => sum + d.qty * (d.rate || 0), 0);

  function shareWhatsApp() {
    if (!pendingList.length) {
      toast('Koi pending demand nahi hai.');
      return;
    }
    const text = pendingList
      .map(
        (d, i) =>
          `${i + 1}. *${d.item}*\n   Qty: ${d.qty} pcs${d.rate ? ` | Est: ₹${d.rate * d.qty}` : ''}${
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
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>
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
            font-family: sans-serif;
          }
          .no-print { display: none !important; }
        }
        @media screen {
          #printable-demand-slip { display: none; }
        }
      `}</style>

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

      <form onSubmit={handleAddDemand} className="no-print" style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '10px', marginBottom: '24px', border: '1px solid var(--border, #334155)' }}>
        <h3 style={{ marginBottom: '12px', fontSize: '15px' }}>Naye Saman ki Demand List Jodein</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
          <input type="text" placeholder="Saman ka Naam *" value={item} onChange={(e) => setItem(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <input type="number" placeholder="Pieces (Qty)" min={1} value={qty} onChange={(e) => setQty(e.target.value)} required style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <input type="number" placeholder="Est. Rate (₹)" value={rate} onChange={(e) => setRate(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
          <input type="url" placeholder="Buy Link (URL)" value={link} onChange={(e) => setLink(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)' }} />
        </div>
        <input type="text" placeholder="Note / Details (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: '12px' }} />
        <button type="submit" className="btn primary" disabled={loading}>
          {loading ? 'Adding...' : '+ Demand List mein Jodein'}
        </button>
      </form>

      {/* Downloadable / Printable PDF Slip Layout */}
      <div id="printable-demand-slip">
        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '15px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '20px', color: '#000' }}>OFFICE SAMAN REQUISITION SLIP</h1>
            <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#555' }}>Demand List for Purchase</p>
          </div>
          <div style={{ textAlign: 'right', fontSize: '12px', color: '#000' }}>
            <div><strong>Date:</strong> {getTodayStr()}</div>
            <div><strong>By:</strong> {me?.email || 'Office'}</div>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px', fontSize: '12px', color: '#000' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #000' }}>
              <th style={{ padding: '6px', textAlign: 'left' }}>S.No</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Item Name</th>
              <th style={{ padding: '6px', textAlign: 'center' }}>Qty</th>
              <th style={{ padding: '6px', textAlign: 'right' }}>Est. Rate</th>
              <th style={{ padding: '6px', textAlign: 'right' }}>Total Est.</th>
              <th style={{ padding: '6px', textAlign: 'left' }}>Details / Link</th>
            </tr>
          </thead>
          <tbody>
            {pendingList.map((d, index) => (
              <tr key={d.id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                <td style={{ padding: '6px' }}>{index + 1}</td>
                <td style={{ padding: '6px' }}><strong>{d.item}</strong></td>
                <td style={{ padding: '6px', textAlign: 'center' }}>{d.qty}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{d.rate ? `₹${d.rate}` : '—'}</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>{d.rate ? `₹${d.rate * d.qty}` : '—'}</td>
                <td style={{ padding: '6px', fontSize: '10px', color: '#334155' }}>
                  {d.note ? d.note + ' ' : ''}{d.link ? `(${cleanUrl(d.link)})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {grandTotal > 0 && (
          <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 'bold', borderTop: '2px solid #000', paddingTop: '6px', color: '#000' }}>
            Kul Anumanit Kharcha: ₹{grandTotal.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      <h3 className="no-print" style={{ marginBottom: '10px' }}>Mangwaya Jane Wala Saman ({pendingList.length})</h3>
      {pendingList.length === 0 ? (
        <p className="muted no-print" style={{ marginBottom: '24px' }}>Abhi koi pending demand nahi hai.</p>
      ) : (
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {pendingList.map((d) => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--card-bg, #1e293b)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border, #334155)', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <strong style={{ fontSize: '16px' }}>{d.item}</strong> — <span style={{ color: '#38bdf8' }}>{d.qty} pcs</span>
                {d.rate ? <span style={{ fontSize: '13px', marginLeft: '10px', color: '#a3e635' }}>Est: {inr(d.rate * d.qty)}</span> : null}
                {d.link && (
                  <div style={{ marginTop: '4px' }}>
                    <a href={d.link} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: '#60a5fa', textDecoration: 'underline' }}>
                      🔗 Buy Link Kholo
                    </a>
                  </div>
                )}
                {d.note && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>Note: {d.note}</div>}
              </div>
              <button type="button" onClick={() => handleReceiveDemand(d)} style={{ background: '#16a34a', color: '#fff', padding: '8px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                ✓ Saman Aa Gaya (Stock me add karo)
              </button>
            </div>
          ))}
        </div>
      )}

      {receivedList.length > 0 && (
        <details className="no-print" style={{ marginTop: '20px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#94a3b8' }}>Pehle Mangwaya Gaya Saman ({receivedList.length})</summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            {receivedList.map((d) => (
              <div key={d.id} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: '#94a3b8' }}>
                <span>{d.item} ({d.qty} pcs)</span>
                <span style={{ color: '#4ade80' }}>✓ Main Stock mein jud gaya</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}