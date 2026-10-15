export type Bill = {
  id: string;
  name: string;
  type: string;
  size: number;
  /** Google Drive me save hone ke baad */
  driveId: string;
  driveUrl: string;
};

export type Issue = {
  id: string;
  date: string;
  qty: number;
  person: string;
  dept: string;
  note: string;
  by: string;
  byName: string;
};

export type MoveType = 'back' | 'damaged' | 'vendor';

export type Move = { id: string; date: string; qty: number; type: MoveType; note: string; by: string };

export type Item = {
  id: string;
  item: string;
  category: string;
  qty: number;
  rate: number;
  total: number;
  orderDate: string;
  receivedDate: string;
  vendor: string;
  broughtBy: string;
  billNo: string;
  note: string;
  serials: string;
  warrantyTill: string;
  /** true = maine apni jeb se paise diye */
  iPaid: boolean;
  myPaid: number;
  myBack: number;
  myBackDate: string;
  bills: Bill[];
  issues: Issue[];
  moves: Move[];
  addedBy: string;
  addedByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
};

export type Me = { uid: string; name: string; email: string };

export type Tab = 'items' | 'stock' | 'issues' | 'summary';

export type Filters = {
  q: string;
  month: string;
  vendor: string;
  status: string;
  pay: string;
  stock: string;
  dept: string;
  sort: string;
};

export type MinMap = Record<string, number>;

export type StockGroup = {
  key: string;
  name: string;
  category: string;
  aaya: number;
  rasta: number;
  diya: number;
  wapas: number;
  kharab: number;
  bacha: number;
  entries: number;
  last: string;
  min: number;
  low: boolean;
  st: { cls: string; label: string };
};

export type IssueRow = {
  id: string;
  date: string;
  qty: number;
  person: string;
  dept: string;
  note: string;
  itemId: string;
  itemName: string;
  rate: number;
};

export type MoveRow = {
  id: string;
  date: string;
  qty: number;
  type: MoveType;
  note: string;
  itemId: string;
  itemName: string;
  rate: number;
};

export type AiLine = { item: string; category: string; qty: number; rate: number; total: number };

export type AiResult = {
  vendor?: unknown;
  billNo?: unknown;
  date?: unknown;
  lines?: unknown;
  grandTotal?: unknown;
};
