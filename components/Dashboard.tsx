'use client';

import type { ReactNode } from 'react';
import {
  dayLong,
  fdate,
  inr,
  lastMonths,
  mlabel,
  monShort,
  myPay,
  num,
  status,
  sumTotal,
  today,
  warrantyState,
} from '@/lib/calc';
import type { Item } from '@/lib/types';
import { Icon, type IconName } from './Icon';
import { PageHead } from './PageParts';
import { useReg } from './context';

function Card({ title, action, className, children }: { title: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={'card ' + (className || '')}>
      <header className="card-h">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

const byNew = (a: Item, b: Item) => (b.createdAt || b.orderDate).localeCompare(a.createdAt || a.orderDate);

export function Dashboard() {
  const { items, groups, goList, openEntry } = useReg();
  const head = <PageHead title="Dashboard" sub={dayLong()} className="dashboard-head" />;

  /* ---- mahine ---- */
  const mk = today().slice(0, 7);
  const months = lastMonths(6);
  const mTot = new Map<string, number>(months.map((m) => [m, 0]));
  for (const it of items) {
    const k = it.orderDate.slice(0, 7);
    if (mTot.has(k)) mTot.set(k, (mTot.get(k) || 0) + num(it.total));
  }
  const thisM = items.filter((i) => i.orderDate.startsWith(mk));
  const cur = mTot.get(mk) || 0;
  const prevK = months[months.length - 2];
  const prev = mTot.get(prevK) || 0;
  const diff = cur - prev;
  const maxM = Math.max(1, ...Array.from(mTot.values()));

  /* ---- upar ke 4 dabbe ---- */
  const pend = items.filter((i) => !i.receivedDate);
  const mps = items.map(myPay);
  const myDue = mps.reduce((s, m) => s + m.due, 0);
  const dueN = mps.filter((m) => m.due > 0).length;
  const allPcs = items.reduce((s, i) => s + num(i.qty), 0);
  const stats: { id: string; icon: IconName; tone: string; label: string; value: string; sub: ReactNode; go: () => void }[] = [
    {
      id: 'st-month', icon: 'cal', tone: 'indigo', label: 'Is mahine ka kharcha', value: inr(cur),
      sub: (
        <>
          {thisM.length} entries
          {(cur > 0 || prev > 0) && diff !== 0 && (
            <span className={'trend ' + (diff > 0 ? 'up' : 'down')}>
              <Icon name={diff > 0 ? 'up' : 'down'} />
              {monShort(prevK)} se {inr(Math.abs(diff))} {diff > 0 ? 'zyada' : 'kam'}
            </span>
          )}
        </>
      ),
      go: () => goList({ month: mk }),
    },
    { id: 'st-total', icon: 'rupee', tone: 'violet', label: 'Kul kharcha', value: inr(sumTotal(items)), sub: items.length + ' entries, ' + allPcs + ' pcs', go: () => goList({}, '/hisaab') },
    {
      id: 'st-pend', icon: 'truck', tone: 'amber', label: 'Saman aana baaki', value: String(pend.length),
      sub: pend.length ? pend.length + (pend.length === 1 ? ' entry pending · ' : ' entries pending · ') + inr(sumTotal(pend)) : 'Sab saman aa gaya', go: () => goList({ status: 'pending' }),
    },
    {
      id: 'st-pay', icon: 'wallet', tone: 'red', label: 'Mere paise baaki', value: inr(myDue),
      sub: dueN ? dueN + ' entries ke paise milne hai' : 'Koi paisa baaki nahi', go: () => goList({ pay: 'baaki' }),
    },
  ];

  /* ---- dhyan do ---- */
  const low = groups.filter((g) => g.low);
  const soon = items.filter((i) => warrantyState(i)?.key === 'soon');
  const over = items.filter((i) => warrantyState(i)?.key === 'over');
  const noBill = items.filter((i) => !i.bills.length);
  const alerts: { id: string; icon: IconName; tone: string; title: string; value: string; sub: string; hot: boolean; go: () => void }[] = [
    {
      id: 'st-low', icon: 'alert', tone: 'red', title: 'Kam stock', value: String(low.length),
      sub: low.length ? low.slice(0, 2).map((g) => g.name).join(', ') + (low.length > 2 ? ' +' + (low.length - 2) : '') : 'Sab theek hai',
      hot: low.length > 0, go: () => goList({ stock: 'low' }, '/stock'),
    },
    {
      id: 'st-war', icon: 'shield', tone: 'blue', title: 'Warranty khatam hone wali', value: String(soon.length),
      sub: soon.length ? '30 din ke andar' + (over.length ? ', ' + over.length + ' khatam ho chuki' : '') : over.length ? over.length + ' ki khatam ho chuki' : 'Koi jaldi khatam nahi',
      hot: soon.length > 0, go: () => goList({ status: 'warranty' }),
    },
    {
      id: 'st-nobill', icon: 'clip', tone: 'amber', title: 'Bill nahi laga', value: String(noBill.length),
      sub: noBill.length ? 'In entries me bill ki photo lagao' : 'Har entry me bill hai', hot: noBill.length > 0,
      go: () => goList({ status: 'nobill' }),
    },
  ];

  const recent = items.slice().sort(byNew).slice(0, 6);

  const seeAll = (to: string) => (
    <button type="button" className="btn sm ghost" onClick={() => goList({}, to)}>
      Sab dekho
      <Icon name="chevR" />
    </button>
  );

  return (
    <>
      {head}

      <div className="stats">
        {stats.map((s) => (
          <button key={s.id} type="button" className={'stat t-' + s.tone} onClick={s.go}>
            <span className="stat-top">
              <span className="stat-l">{s.label}</span>
              <span className="ibox">
                <Icon name={s.icon} />
              </span>
            </span>
            <span className="stat-v" id={s.id}>
              {s.value}
            </span>
            <span className="stat-s">{s.sub}</span>
          </button>
        ))}
      </div>

      <div className="dgrid">
        <Card title="Pichhle 6 mahine ka kharcha" className="chart-card" action={<span className="muted small">Bar dabao: us mahine ki list</span>}>
          <div className="mchart">
            {months.map((m) => {
              const v = mTot.get(m) || 0;
              const h = v > 0 ? Math.max(3, (v / maxM) * 100) : 0;
              return (
                <button
                  key={m}
                  type="button"
                  className={'mcol' + (m === mk ? ' now' : '')}
                  onClick={() => goList({ month: m })}
                  aria-label={mlabel(m) + ': ' + inr(v) + '. Us mahine ki entries dikhao'}
                  title={mlabel(m) + ': ' + inr(v)}
                >
                  <span className="mc-v">{v > 0 ? inr(v) : '—'}</span>
                  <span className="mc-bar">
                    <span style={{ height: h.toFixed(1) + '%' }} />
                  </span>
                  <span className="mc-m">{mlabel(m)}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Dhyan do" className="alerts">
          <ul className="alist">
            {alerts.map((a) => (
              <li key={a.id}>
                <button type="button" className={'arow t-' + a.tone + (a.hot ? ' hot' : '')} onClick={a.go}>
                  <span className="ibox sm">
                    <Icon name={a.icon} />
                  </span>
                  <span className="at">
                    <strong>{a.title}</strong>
                    <small>{a.sub}</small>
                  </span>
                  <span className="av" id={a.id}>
                    {a.value}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Haal ki entries" className="recent" action={seeAll('/saman')}>
          {recent.length ? (
            <ul className="rlist">
              {recent.map((it) => {
                const st = status(it);
                return (
                  <li key={it.id}>
                    <button type="button" className="rrow" onClick={() => openEntry(it.id)}>
                      <span className="ibox sm t-indigo">
                        <Icon name="box" />
                      </span>
                      <span className="rt">
                        <strong>{it.item || '(bina naam)'}</strong>
                        <small>{[fdate(it.orderDate), num(it.qty) + ' pcs', it.vendor].filter(Boolean).join(' · ')}</small>
                      </span>
                      <span className="rr">
                        <b>{inr(it.total)}</b>
                        <span className={'stamp ' + st.cls}>{st.label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="none">Abhi koi entry nahi hai. Upar “+ Naya saman” se pehli entry jodo.</p>
          )}
        </Card>
      </div>
    </>
  );
}
