'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc } from 'firebase/firestore';
import { useReg } from './context';
import { today, inr } from '@/lib/calc';

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
    const q = query(collection(db, 'demands'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: DemandItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as DemandItem);
      });
      setDemands(list);
    });
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
      await addDoc(collection(db, 'purchases'), {
        item: d.item,
        category: 'General',
        qty: d.qty,
        rate: d.rate || 0,
        total: d.qty * (d.rate || 0),
        orderDate: d.createdAt.slice(0, 10) || today(),
        receivedDate: today(),
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

  function shareWhatsApp() {
    if (!pendingList.length) {
      toast('Koi pending demand nahi hai.');
      return;
    }
    const text = pendingList
      .map(
        (d, i) =>
          `${i + 1}. *${d.item}*\n   ${d.qty} pcs${d.rate ? ` (Est. ₹${d.rate})` : ''}${
            d.link ? `\n   Link: ${d.link}` : ''
          }${d.note ? `\n   Note: ${d.note}` : ''}`
      )
      .join('\n\n');

    const msg = `📋 *OFFICE SAMAN ORDER DEMAND LIST*\n\n${text}\n\n_Bhejnewala: ${me?.email || 'Office'}_`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <div style={{ padding: '16px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2>🛒 Naya Saman Demand / Requisition</h2>
        <button type="button" className="btn primary sm" onClick={shareWhatsApp}>
          📱 WhatsApp Par Share Karo
        </button>
      </div>

      <form onSubmit={handleAddDemand} style={{ background: 'var(--card-bg, #1e293b)', padding: '16px', borderRadius: '10px', marginBottom: '24px', border: '1px solid var(--border, #334155)' }}>
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

      <h3 style={{ marginBottom: '10px' }}>Mangwaya Jane Wala Saman ({pendingList.length})</h3>
      {pendingList.length === 0 ? (
        <p className="muted" style={{ marginBottom: '24px' }}>Abhi koi pending demand nahi hai.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
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
        <details style={{ marginTop: '20px' }}>
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