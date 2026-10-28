
'use client';

import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { getApp } from 'firebase/app';
import {
  doc,
  getFirestore,
  runTransaction,
} from 'firebase/firestore';
import { blankItem } from '@/lib/calc';
import type { Item, Issue } from '@/lib/types';
import { useReg } from './context';

type RowStatus = 'ready' | 'review' | 'duplicate' | 'done';

type ImportRow = {
  excelRow: number;
  sourceNo: string;
  item: Item;
  status: RowStatus;
  reason: string;
  blocked: boolean;
  selected: boolean;
};

type FilterType = 'all' | 'ready' | 'review' | 'duplicate';

const SHEET_NAME = 'List(Jo saman aaya)';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normal(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function number(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const n = Number(clean(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function dateValue(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';

    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
  }

  const s = clean(value);
  if (!s) return '';

  let y: number;
  let m: number;
  let d: number;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const indian = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else if (indian) {
    d = Number(indian[1]);
    m = Number(indian[2]);
    y = Number(indian[3]);
  } else {
    return '';
  }

  const check = new Date(y, m - 1, d);

  if (
    check.getFullYear() !== y ||
    check.getMonth() !== m - 1 ||
    check.getDate() !== d
  ) {
    return '';
  }

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function header(value: unknown): string {
  return normal(clean(value));
}

/*
  Compare actual purchase details.
  Same keyword like "lens" does NOT mean duplicate.
*/
function exactKey(item: Item): string {
  return [
    normal(item.item),
    item.receivedDate,
    item.qty,
    item.rate,
    normal(item.vendor),
  ].join('|');
}

function basicKey(item: Item): string {
  return [
    normal(item.item),
    item.receivedDate,
    item.qty,
  ].join('|');
}

function compareExisting(
  entry: Item,
  existing: Item[],
): { status: 'duplicate' | 'review' | 'none'; reason: string } {
  if (existing.some((it) => it.id === entry.id)) {
    return {
      status: 'duplicate',
      reason: 'Ye Excel row pehle import ho chuki hai',
    };
  }

  if (
    existing.some(
      (it) =>
        normal(it.item) === normal(entry.item) &&
        it.receivedDate === entry.receivedDate &&
        it.qty === entry.qty &&
        it.rate === entry.rate &&
        normal(it.vendor) === normal(entry.vendor),
    )
  ) {
    return {
      status: 'review',
      reason: 'Same name, date, quantity, rate aur supplier mila. Duplicate ho sakta hai',
    };
  }

  if (existing.some((it) => basicKey(it) === basicKey(entry))) {
    return {
      status: 'review',
      reason: 'Same name, date aur quantity mili. Purchase verify karein',
    };
  }

  if (
    existing.some(
      (it) =>
        normal(it.item) === normal(entry.item) &&
        it.receivedDate === entry.receivedDate,
    )
  ) {
    return {
      status: 'review',
      reason: 'Same item aur date mili. Quantity compare karein',
    };
  }

  return { status: 'none', reason: '' };
}

function canSelect(row: ImportRow): boolean {
  return (
    !row.blocked &&
    row.status !== 'duplicate' &&
    row.status !== 'done'
  );
}

async function createOnlyIfAbsent(item: Item): Promise<void> {
  const db = getFirestore(getApp());
  const reference = doc(db, 'purchases', item.id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);

    if (snapshot.exists()) {
      throw new Error(
        `Already imported: ${item.item}. Existing document overwrite nahi kiya.`,
      );
    }

    const { id, ...data } = item;

    transaction.set(reference, {
      ...data,
      updatedAt: new Date().toISOString(),
    });
  });
}

export function ImportOldData() {
  const { items } = useReg();

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState(0);

  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  async function handleFile(file?: File) {
    if (!file) return;

    setLoading(true);
    setRows([]);
    setProgress(0);
    setMessage('');
    setFileName(file.name);
    setFilter('all');
    setSearch('');

    try {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new Error('Sirf .xlsx Excel file upload karein.');
      }

      const sheet = await readSheet(file, SHEET_NAME);

      if (!sheet.length) {
        throw new Error('Excel Sheet khaali hai.');
      }

      const headerIndex = sheet.findIndex((line) =>
        line.some((cell) => header(cell) === header('Item Name')),
      );

      if (headerIndex < 0) {
        throw new Error('Excel mein Item Name header nahi mila.');
      }

      const headers = sheet[headerIndex].map(header);

      function col(name: string): number {
        return headers.indexOf(header(name));
      }

      for (const required of [
        'Item Name',
        'Received Date',
        'Received Qty',
      ]) {
        if (col(required) < 0) {
          throw new Error(
            `Excel mein "${required}" column nahi mila.`,
          );
        }
      }

      const result: ImportRow[] = [];
      const seenIds = new Set<string>();
      const seenKeys = new Set<string>();

      for (
        let index = headerIndex + 1;
        index < sheet.length;
        index++
      ) {
        const line = sheet[index];

        function val(name: string): unknown {
          const position = col(name);
          return position >= 0 ? line[position] : null;
        }

        const name = clean(val('Item Name'));
        if (!name) continue;

        const excelRow = index + 1;
        const sourceNo = clean(val('No.'));

        const sourceIdentity = sourceNo
          ? sourceNo.replace(/[^a-zA-Z0-9_-]/g, '-')
          : `row-${excelRow}`;

        const id = `legacy-jo-saman-aaya-${sourceIdentity}`;

        const item = blankItem(id, null);

        const qty = number(val('Received Qty'));
        const rate = number(val('Rate'));
        const excelTotal = number(val('Total Value'));

        const receivedDate = dateValue(val('Received Date'));

        const rawGivenDate = clean(val('Given Date'));
        const rawGivenQty = clean(val('Given Qty'));
        const givenDate = dateValue(val('Given Date'));
        const givenQty = number(val('Given Qty'));
        const givenTo = clean(val('Given To'));

        const dept = clean(val('Department/Use'));
        const remarks = clean(val('Remarks'));
        const productLink = clean(val('Link'));

        const reasons: string[] = [];
        let blocked = false;

        item.item = name;
        item.category = '';
        item.qty = qty;
        item.rate = rate;
        item.total = excelTotal > 0 ? excelTotal : qty * rate;
        item.orderDate = receivedDate;
        item.receivedDate = receivedDate;
        item.vendor = clean(val('Supplier Name'));
        item.broughtBy = clean(val('Received By'));
        item.billNo = clean(val('Bill No.'));

        item.createdAt = receivedDate
          ? `${receivedDate}T12:00:00.000Z`
          : new Date().toISOString();

        const notes: string[] = [
          'Imported from old Excel',
          `Excel Sheet: ${SHEET_NAME}`,
          `Original Excel No: ${sourceNo || excelRow}`,
          `Excel Row: ${excelRow}`,
        ];

        if (remarks) {
          notes.push(`Remarks: ${remarks}`);
        }

        if (productLink) {
          notes.push(`Product Link: ${productLink}`);
        }

        item.note = notes.join('\n');

        if (!receivedDate) {
          reasons.push('Received Date missing/invalid');
          blocked = true;
        }

        if (!Number.isInteger(qty) || qty <= 0) {
          reasons.push('Received Qty missing/invalid');
          blocked = true;
        }

        if (rate < 0 || excelTotal < 0) {
          reasons.push('Rate ya Total invalid');
          blocked = true;
        }

        if (
          rate > 0 &&
          excelTotal > 0 &&
          Math.abs(qty * rate - excelTotal) > 1
        ) {
          reasons.push('Rate aur Total match nahi karte');
          blocked = true;
        }

        /*
          Handle issue details.
          Multiple dates or multiple people cannot be
          safely converted to a single issue automatically.
        */
        const hasGivenDetails =
          !!rawGivenDate || !!rawGivenQty || !!givenTo;

        const issues: Issue[] = [];

        if (hasGivenDetails) {
          if (
            !givenDate ||
            !Number.isInteger(givenQty) ||
            givenQty <= 0 ||
            !givenTo ||
            givenQty > qty
          ) {
            reasons.push('Given details incomplete / unclear');
            blocked = true;
          } else {
            issues.push({
              id: `legacy-issue-${sourceIdentity}`,
              date: givenDate,
              qty: givenQty,
              person: givenTo,
              dept,
              note: 'Imported from old Excel',
              by: '',
              byName: '',
            });
          }
        }

        item.issues = issues;

        const rawBalance = clean(val('Balance'));

        if (rawBalance && hasGivenDetails && !blocked) {
          const expected = qty - givenQty;
          const balance = number(val('Balance'));

          if (Math.abs(expected - balance) > 0.001) {
            reasons.push('Excel Balance mismatch');
            blocked = true;
          }
        }

        /*
          Duplicate classification:
          1. Existing imported ID => Duplicate
          2. Same purchase in register => Review
          3. Same keyword (Lens/Hard Disk) alone => Ready
          4. Duplicate-looking Excel rows => Review
        */
        let status: RowStatus = 'ready';

        const existing = compareExisting(item, items);
        const key = exactKey(item);

        if (seenIds.has(id) || existing.status === 'duplicate') {
          status = 'duplicate';
          blocked = true;
          reasons.push('Already imported / repeated Excel ID');
        } else if (blocked) {
          status = 'review';
        } else if (existing.status === 'review') {
          status = 'review';
          reasons.push(existing.reason);
        } else if (seenKeys.has(key)) {
          status = 'review';
          reasons.push(
            'Same purchase details ki doosri Excel row hai. Verify karein',
          );
        }

        seenIds.add(id);
        seenKeys.add(key);

        result.push({
          excelRow,
          sourceNo,
          item,
          status,
          reason: reasons.join('; '),
          blocked,
          selected: false,
        });
      }

      setRows(result);
      setMessage(
        `${result.length} entries mili. Ready aur Review dono ko select kar sakte hain.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Excel read nahi ho paayi.',
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(excelRow: number) {
    if (importing) return;

    setRows((current) =>
      current.map((row) =>
        row.excelRow === excelRow && canSelect(row)
          ? { ...row, selected: !row.selected }
          : row,
      ),
    );
  }

  function selectGroup(group: 'ready' | 'review' | 'all') {
    if (importing) return;

    setRows((current) =>
      current.map((row) => {
        if (!canSelect(row)) return row;

        const match =
          group === 'all' || row.status === group;

        return match
          ? { ...row, selected: true }
          : row;
      }),
    );
  }

  function clearSelection() {
    if (importing) return;

    setRows((current) =>
      current.map((row) => ({
        ...row,
        selected: false,
      })),
    );
  }

  async function startImport() {
    if (importing) return;

    const selectedRows = rows.filter(
      (row) => row.selected && canSelect(row),
    );

    if (!selectedRows.length) {
      setMessage('Pehle entries select karein.');
      return;
    }

    if (!navigator.onLine) {
      setMessage('Internet connect karke import karein.');
      return;
    }

    const reviewCount = selectedRows.filter(
      (row) => row.status === 'review',
    ).length;

    const confirmed = window.confirm(
      `${selectedRows.length} entries Firebase mein add hongi.\n\n` +
      `Review Entries: ${reviewCount}\n\n` +
      'Dhyan rahe: Review ka matlab possible duplicate ho sakta hai.\n' +
      'Existing document IDs overwrite nahi hongi.\n\n' +
      'Kya aapne sab selected entries verify kar li hain?',
    );

    if (!confirmed) return;

    setImporting(true);
    setProgress(0);
    setMessage('');

    let saved = 0;

    try {
      for (const row of selectedRows) {
        if (!navigator.onLine) {
          throw new Error('Internet disconnect ho gaya.');
        }

        /*
          Recheck current register before every write.
          Existing IDs are protected again inside transaction.
        */
        const existing = compareExisting(row.item, items);

        if (existing.status === 'duplicate') {
          setRows((current) =>
            current.map((r) =>
              r.excelRow === row.excelRow
                ? {
                    ...r,
                    status: 'duplicate',
                    blocked: true,
                    selected: false,
                    reason: 'Already imported in register',
                  }
                : r,
            ),
          );
          continue;
        }

        await createOnlyIfAbsent(row.item);

        saved++;
        setProgress(saved);

        setRows((current) =>
          current.map((r) =>
            r.excelRow === row.excelRow
              ? {
                  ...r,
                  status: 'done',
                  blocked: true,
                  selected: false,
                  reason: 'Firebase mein save ho gaya',
                }
              : r,
          ),
        );
      }

      setMessage(
        `${saved} entries Firebase mein save ho gayi. Saman aur Stock check karein.`,
      );
    } catch (error) {
      setMessage(
        (error instanceof Error
          ? error.message
          : 'Import failed') +
          ' Dobara import karne se pehle register verify karein.',
      );
    } finally {
      setImporting(false);
    }
  }

  const ready = rows.filter(
    (r) => r.status === 'ready',
  ).length;

  const review = rows.filter(
    (r) => r.status === 'review',
  ).length;

  const duplicate = rows.filter(
    (r) => r.status === 'duplicate',
  ).length;

  const done = rows.filter(
    (r) => r.status === 'done',
  ).length;

  const selected = rows.filter(
    (r) => r.selected,
  ).length;

  const visibleRows = rows.filter((row) => {
    const matchesFilter =
      filter === 'all' || row.status === filter;

    const q = normal(search);

    const matchesSearch =
      !q ||
      normal(
        `${row.item.item} ${row.sourceNo} ${row.reason}`,
      ).includes(q);

    return matchesFilter && matchesSearch;
  });

  const buttonStyle = {
    marginRight: 8,
    marginBottom: 8,
  };

  return (
    <section
      className="tcard"
      style={{
        padding: 20,
        marginTop: 20,
        borderRadius: 16,
        minWidth: 0,
      }}
    >
      <h2 style={{ marginTop: 0 }}>
        Import Old Excel Data
      </h2>

      <p>
        Sirf <strong>{SHEET_NAME}</strong> Sheet ka
        data import hoga.
      </p>

      <p style={{ fontSize: 13, opacity: 0.75 }}>
        Order aur Sheet7 import nahi hongi.
        Existing Firebase documents overwrite nahi honge.
      </p>

      <label
        style={{
          display: 'block',
          marginTop: 15,
          marginBottom: 10,
          fontWeight: 600,
        }}
      >
        Excel File (.xlsx)
      </label>

      <input
        type="file"
        accept=".xlsx"
        disabled={loading || importing}
        onChange={(event) =>
          void handleFile(event.target.files?.[0])
        }
      />

      {fileName && (
        <p style={{ fontSize: 13 }}>
          Selected: {fileName}
        </p>
      )}

      {loading && (
        <p>Excel read ho rahi hai...</p>
      )}

      {rows.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              margin: '18px 0',
              fontSize: 14,
            }}
          >
            <strong>Total: {rows.length}</strong>
            <span>Ready: {ready}</span>
            <span>Review: {review}</span>
            <span>Duplicate: {duplicate}</span>
            <span>Imported: {done}</span>
            <strong>Selected: {selected}</strong>
          </div>

          <div style={{ marginBottom: 12 }}>
            <button
              type="button"
              className="btn sm primary"
              style={buttonStyle}
              disabled={importing}
              onClick={() => selectGroup('ready')}
            >
              Select All Ready
            </button>

            <button
              type="button"
              className="btn sm"
              style={buttonStyle}
              disabled={importing}
              onClick={() => selectGroup('review')}
            >
              Select All Review
            </button>

            <button
              type="button"
              className="btn sm"
              style={buttonStyle}
              disabled={importing}
              onClick={() => selectGroup('all')}
            >
              Select All
            </button>

            <button
              type="button"
              className="btn sm"
              style={buttonStyle}
              disabled={importing}
              onClick={clearSelection}
            >
              Clear All
            </button>
          </div>

          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Ready aur Review dono ko tick kar sakte hain.
            Review entries pehle check karein.
            Invalid quantity/date ya incomplete Given
            details wali entries disabled rahengi.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <input
              type="search"
              value={search}
              placeholder="Saman search karo..."
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: '1 1 180px',
                minWidth: 0,
                padding: 10,
                borderRadius: 8,
              }}
            />

            <select
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as FilterType)
              }
              style={{
                padding: 10,
                borderRadius: 8,
              }}
            >
              <option value="all">All Entries</option>
              <option value="ready">Ready</option>
              <option value="review">Review</option>
              <option value="duplicate">Duplicate</option>
            </select>
          </div>

          <div
            style={{
              overflowX: 'auto',
              maxHeight: 500,
              borderRadius: 10,
            }}
          >
            <table
              className="itable"
              style={{
                width: '100%',
                minWidth: 850,
              }}
            >
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Excel No.</th>
                  <th>Saman</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Received Date</th>
                  <th>Status / Reason</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.excelRow}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={
                          importing || !canSelect(row)
                        }
                        onChange={() =>
                          toggleRow(row.excelRow)
                        }
                      />
                    </td>

                    <td>
                      {row.sourceNo || row.excelRow}
                    </td>

                    <td>
                      <strong>{row.item.item}</strong>
                    </td>

                    <td>{row.item.qty}</td>

                    <td>
                      {row.item.rate
                        ? '₹' +
                          row.item.rate.toLocaleString('en-IN')
                        : '—'}
                    </td>

                    <td>
                      {row.item.receivedDate || '—'}
                    </td>

                    <td>
                      <strong>
                        {row.status === 'ready'
                          ? 'Ready'
                          : row.status === 'review'
                            ? 'Review'
                            : row.status === 'duplicate'
                              ? 'Duplicate'
                              : 'Imported'}
                      </strong>

                      {row.reason && (
                        <div
                          style={{
                            fontSize: 12,
                            marginTop: 4,
                            opacity: 0.8,
                          }}
                        >
                          {row.reason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}

                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      Is filter mein koi entry nahi mili.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="btn primary"
            style={{ marginTop: 18 }}
            disabled={
              loading ||
              importing ||
              selected === 0
            }
            onClick={() => void startImport()}
          >
            {importing
              ? `Importing... ${progress}`
              : `Import Selected (${selected})`}
          </button>
        </>
      )}

      {message && (
        <p
          role="status"
          style={{
            marginTop: 15,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {message}
        </p>
      )}
    </section>
  );
}
