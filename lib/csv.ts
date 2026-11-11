import {
  ddmmyyyy,
  filteredIssues,
  filteredItems,
  issuedQty,
  moveSum,
  myPay,
  num,
  regNos,
  remaining,
  round2,
  today,
} from './calc';
import type { Filters, Item, StockGroup, Tab } from './types';

function cell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+@]/.test(s)) s = "'" + s; // Excel formula se bachne ke liye
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Export the current tab as a CSV file that can be opened in Excel. */
export function buildCsv(tab: Tab, items: Item[], groups: StockGroup[], f: Filters): { name: string; text: string } {
  let rows: unknown[][];
  let kind: string;
  if (tab === 'issues') {
    kind = 'kisko-diya';
    rows = [
      ['Date issued', 'Item', 'Pcs', 'Issued to', 'Department', 'Value (Rs)', 'Note'],
      ...filteredIssues(items, f).map((i) => [ddmmyyyy(i.date), i.itemName, i.qty, i.person, i.dept, round2(i.qty * i.rate), i.note]),
    ];
  } else if (tab === 'stock') {
    kind = 'stock';
    rows = [
      ['Item', 'Category', 'Received', 'In transit', 'Issued', 'Returned', 'Damaged/vendor return', 'Remaining', 'Minimum stock', 'Status'],
      ...groups.map((g) => [g.name, g.category, g.aaya, g.rasta, g.diya, g.wapas, g.kharab, g.bacha, g.min || '', g.st.label]),
    ];
  } else {
    kind = 'saman';
    const nos = regNos(items);
    const list = filteredItems(items, f, tab === 'summary' ? 'summary' : 'items');
    rows = [
      ['Entry no.', 'Item', 'Category', 'Pcs', 'Rate (Rs)', 'Total (Rs)', 'Order date', 'Received date', 'Supplier', 'Brought by',
        'Receipt/Order no.', 'Paid by me (Rs)', 'Reimbursed (Rs)', 'Reimbursement due (Rs)', 'Issued (pcs)', 'Returned (pcs)', 'Damaged/vendor return (pcs)',
        'Remaining (pcs)', 'Issued to', 'Serial no.', 'Warranty until', 'Note', 'Receipt files', 'Entry created by'],
      ...list.map((it) => {
        const who = it.issues.map((i) => [i.person, i.dept].filter(Boolean).join('/') + ': ' + num(i.qty)).join('; ');
        const mp = myPay(it);
        return [
          nos[it.id], it.item, it.category, num(it.qty), num(it.rate), num(it.total), ddmmyyyy(it.orderDate),
          it.receivedDate ? ddmmyyyy(it.receivedDate) : 'Not received', it.vendor, it.broughtBy, it.billNo,
          mp.mine ? mp.paid : '', mp.mine ? mp.back : '', mp.mine ? mp.due : '',
          issuedQty(it), moveSum(it, 'back'), moveSum(it, 'damaged') + moveSum(it, 'vendor'), Math.max(remaining(it), 0), who,
          it.serials.replace(/\s*\n\s*/g, ', '), ddmmyyyy(it.warrantyTill), it.note, it.bills.length, it.addedByName,
        ];
      }),
    ];
  }
  const text = '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
  return { name: 'office-' + kind + '-' + today() + '.csv', text };
}
