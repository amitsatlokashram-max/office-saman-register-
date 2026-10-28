
'use client';

import { useState } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { getApp } from 'firebase/app';
import { doc, getFirestore, runTransaction } from 'firebase/firestore';
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

const SHEET_NAME = 'List(Jo saman aaya)';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normal(value: string): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
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

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  const s = clean(value);
  if (!s) return '';

  let year: number;
  let month: number;
  let day: number;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const indian = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (indian) {
    day = Number(indian[1]);
    month = Number(indian[2]);
    year = Number(indian[3]);
  } else {
    return '';
  }

  const check = new Date(year, month - 1, day);

  if (
    check.getFullYear() !== year ||
    check.getMonth() !== month - 1 ||
    check.getDate() !== day
  ) {
    return '';
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function header(value: unknown): string {
  return normal(clean(value))
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ');
}

function itemKey(item: Item): string {
  return [
    normal(item.item),
    item.receivedDate,
    item.qty,
    item.rate,
    normal(item.vendor),
  ].join('|');
}

function sourceKey(item: Item): string {
  return [
    normal(item.item),
    item.receivedDate,
    item.qty,
  ].join('|');
}

function needsSpecialReview(name: string): boolean {
  return /hard[\s-]*disk|hardisk|hdd|ssd|lens|लेंस/i.test(name);
}

function checkDuplicate(
  entry: Item,
  existing: Item[],
): 'duplicate' | 'review' | 'none' {
  if (existing.some((it) => it.id === entry.id)) {
    return 'duplicate';
  }

  if (existing.some((it) => itemKey(it) === itemKey(entry))) {
    return 'duplicate';
  }

  if (existing.some((it) => sourceKey(it) === sourceKey(entry))) {
    return 'review';
  }

  if (existing.some((it) => normal(it.item) === normal(entry.item))) {
    return 'review';
  }

  return 'none';
}

async function createOnlyIfAbsent(item: Item): Promise<void> {
  const db = getFirestore(getApp());
  const reference = doc(db, 'purchases', item.id);

  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reference);

    if (existing.exists()) {
      throw new Error(
        'Ye Excel row Firebase mein pehle se hai. Duplicate roka gaya.'
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

  async function handleFile(file?: File) {
    if (!file) return;

    setLoading(true);
    setRows([]);
    setProgress(0);
    setMessage('');
    setFileName(file.name);

    try {
      if (!/\.xlsx$/i.test(file.name)) {
        throw new Error('Sirf .xlsx Excel file upload karein.');
      }

      if (!navigator.onLine) {
        throw new Error('Pehle internet connect karein.');
      }

      // Correct read-excel-file v9 API.
      // Sheet name is the second argument.
      const sheet = await readSheet(file, SHEET_NAME);

      if (!sheet.length) {
        throw new Error('Excel Sheet khaali hai.');
      }

      const headerIndex = sheet.findIndex((line) =>
        line.some((cell) => header(cell) === header('Item Name'))
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
          throw new Error(`Excel mein ${required} column nahi mila.`);
        }
      }

      const result: ImportRow[] = [];
      const sourceIds = new Set<string>();
      const exactKeys = new Set<string>();

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

        const notes = [
          'Imported from old Excel',
          `Excel Sheet: ${SHEET_NAME}`,
          `Original Excel No: ${sourceNo || excelRow}`,
          `Excel Row: ${excelRow}`,
        ];

        if (remarks) notes.push(`Remarks: ${remarks}`);
        if (productLink) notes.push(`Product Link: ${productLink}`);

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
          reasons.push('Rate / Total invalid');
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
              dept: clean(val('Department/Use')),
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
            reasons.push('Excel Balance alag hai');
            blocked = true;
          }
        }

        if (rawGivenDate && !givenDate) {
          reasons.push('Multiple / unclear Given Dates');
          blocked = true;
        }

        let status: RowStatus = 'ready';

        const key = itemKey(item);
        const duplicate = checkDuplicate(item, items);

        if (
          sourceIds.has(id) ||
          exactKeys.has(key) ||
          duplicate === 'duplicate'
        ) {
          status = 'duplicate';
          blocked = true;
          reasons.push('Duplicate / already imported');
        } else if (blocked) {
          status = 'review';
        } else if (
          duplicate === 'review' ||
          needsSpecialReview(name)
        ) {
          status = 'review';
          reasons.push(
            'Pehle se maujood / Hard Disk / Lens: manual check zaroori'
          );
        }

        sourceIds.add(id);
        exactKeys.add(key);

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
        `${result.length} entries mili. Sabhi entries pehle unselected hain. Preview check karke select karein.`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Excel read nahi ho paayi.'
      );
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(rowNumber: number) {
    if (importing) return;

    setRows((current) =>
      current.map((row) => {
        if (row.excelRow !== rowNumber) return row;
        if (row.blocked) return row;

        if (row.status === 'duplicate' || row.status === 'done') {
          return row;
        }

        return {
          ...row,
          selected: !row.selected,
        };
      })
    );
  }

  async function startImport() {
    if (importing) return;

    const selectedRows = rows.filter(
      (row) =>
        row.selected &&
        !row.blocked &&
        row.status !== 'duplicate' &&
        row.status !== 'done'
    );

    if (!selectedRows.length) {
      setMessage('Pehle entries select karein.');
      return;
    }

    if (!navigator.onLine) {
      setMessage('Internet connect karke dobara try karein.');
      return;
    }

    const confirmed = window.confirm(
      `${selectedRows.length} selected entries Firebase mein add hongi.\n\n` +
      'Existing documents overwrite nahi honge.\n' +
      'Hard Disk / Lens aur duplicate entries check kar lein.\n\n' +
      'Kya Import shuru karein?'
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

        const duplicate = checkDuplicate(row.item, items);

        if (duplicate === 'duplicate') {
          setRows((current) =>
            current.map((r) =>
              r.excelRow === row.excelRow
                ? {
                    ...r,
                    status: 'duplicate',
                    blocked: true,
                    selected: false,
                    reason: 'Already exists in current register',
                  }
                : r
            )
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
                }
              : r
          )
        );
      }

      setMessage(
        `${saved} entries Firebase mein save ho gayi. Saman List aur Stock check karein.`
      );
    } catch (error) {
      setMessage(
        (error instanceof Error ? error.message : 'Import failed') +
          ' Dobara import se pehle register refresh karke verify karein.'
      );
    } finally {
      setImporting(false);
    }
  }

  const ready = rows.filter((r) => r.status === 'ready').length;
  const review = rows.filter((r) => r.status === 'review').length;
  const duplicate = rows.filter((r) => r.status === 'duplicate').length;
  const done = rows.filter((r) => r.status === 'done').length;
  const selected = rows.filter((r) => r.selected).length;

  return (
    <section
      className="tcard"
      style={{
        padding: 20,
        marginTop: 20,
        borderRadius: 16,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Import Old Excel Data</h2>

      <p>
        Sirf <strong>{SHEET_NAME}</strong> Sheet ka data import hoga.
      </p>

      <p style={{ fontSize: 13, opacity: 0.75 }}>
        Order aur Sheet7 import nahi hongi.
        Purani Firebase entries overwrite nahi ki jayengi.
      </p>

      <label
        style={{
          display: 'block',
          marginTop: 16,
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

      {loading && <p>Excel read ho rahi hai...</p>}

      {rows.length > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 14,
              margin: '18px 0',
            }}
          >
            <strong>Total: {rows.length}</strong>
            <span>Ready: {ready}</span>
            <span>Review: {review}</span>
            <span>Duplicate: {duplicate}</span>
            <span>Imported: {done}</span>
            <strong>Selected: {selected}</strong>
          </div>

          <p style={{ fontSize: 13, opacity: 0.8 }}>
            Koi entry automatic select nahi hoti.
            Hard Disk aur Lens pehle se imported ho sakte hain.
            Review entries dhyan se compare karein.
            Invalid Date, Qty ya Given details wali
            entries select nahi hongi.
          </p>

          <div
            style={{
              overflowX: 'auto',
              maxHeight: 500,
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
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.excelRow}>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.selected}
                        disabled={
                          importing ||
                          row.blocked ||
                          row.status === 'duplicate' ||
                          row.status === 'done'
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
              </tbody>
            </table>
          </div>

          <button
            type="button"
            className="btn"
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
