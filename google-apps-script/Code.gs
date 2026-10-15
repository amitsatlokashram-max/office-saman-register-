/**
 * Office Saman Register — Google Sheet + Drive
 *
 * Ye script aapki Google Sheet ke andar chalta hai:
 *   - app ki har entry "Saman" sheet me likhta hai (save / edit / delete hote hi)
 *   - kisko diya / wapas / kharab "Kisko diya" sheet me likhta hai
 *   - har bill ki photo/PDF aapke Google Drive ke "Office Saman Register - Bills" folder me mahine ke hisaab se rakhta hai
 *
 * Lagane ka tareeka README.md ke "Google Sheet aur Drive" hisse me hai. Short me:
 *   1. Nayi Google Sheet → Extensions → Apps Script → ye poora code paste karo → Save
 *   2. Upar function me "setup" chuno → Run → permission do → Execution log me jo secret aaye wo copy karo
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy → URL copy karo
 *   4. Vercel me GOOGLE_SCRIPT_URL aur GOOGLE_SCRIPT_SECRET daalo → Redeploy
 *
 * Sheet sirf copy hai: Sheet me kuch badloge to app me nahi aayega. Badlav app me hi karo.
 */

var ROOT_FOLDER_NAME = 'Office Saman Register - Bills';
var FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];

/* ---------- menu + setup ---------- */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Office Register').addItem('Setup / secret dikhao', 'setup').addToUi();
}

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  props.setProperty('SHEET_ID', ss.getId());
  var secret = props.getProperty('SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SECRET', secret);
  }
  // Nayi sheet ka khaali "Sheet1" ho to usko "Saman" bana do
  if (!ss.getSheetByName('Saman')) {
    var first = ss.getSheets()[0];
    if (first && first.getLastRow() === 0) first.setName('Saman');
  }
  var folder = rootFolder_();
  Logger.log('GOOGLE_SCRIPT_SECRET = ' + secret);
  Logger.log('Bill folder: ' + folder.getUrl());
  try {
    SpreadsheetApp.getUi().alert(
      'Setup ho gaya',
      'Ye secret Vercel me GOOGLE_SCRIPT_SECRET me daalo:\n\n' + secret + '\n\nBill is Drive folder me jayenge: ' + folder.getName(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    // Script editor se chalaya ho to message sirf Execution log me dikhega
  }
  return secret;
}

/* ---------- web app ---------- */
function doGet() {
  return out_({ ok: true, app: 'office-saman-register' });
}

function doPost(e) {
  var p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ ok: false, error: 'bad_request' });
  }
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret || p.secret !== secret) return out_({ ok: false, error: 'bad_secret' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(28000); // ek waqt me ek hi kaam, taaki lines aapas me na takraye
    var res = handle_(p) || {};
    res.ok = true;
    return out_(res);
  } catch (err) {
    return out_({ ok: false, error: 'script_error', message: String((err && err.message) || err) });
  } finally {
    try {
      lock.releaseLock();
    } catch (e2) {}
  }
}

function handle_(p) {
  switch (p.action) {
    case 'ping':
      return { sheetUrl: book_().getUrl(), folderUrl: rootFolder_().getUrl() };
    case 'uploadBill':
      return uploadBill_(p);
    case 'trashBill':
      trash_(p.driveId);
      return {};
    case 'upsert':
      upsert_(p);
      return {};
    case 'delete':
      remove_(p);
      return {};
    case 'replaceAll':
      replaceAll_(p);
      return { rows: (p.saman.rows || []).length };
    default:
      throw new Error('Unknown action: ' + p.action);
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Drive ---------- */
function book_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('FOLDER_ID');
  if (id) {
    try {
      var f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) {}
  }
  var found = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function monthFolder_(month) {
  var root = rootFolder_();
  var name = /^\d{4}-\d{2}$/.test(month || '') ? month : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var found = root.getFoldersByName(name);
  return found.hasNext() ? found.next() : root.createFolder(name);
}

function safeName_(s) {
  return String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'bill';
}

function uploadBill_(p) {
  if (FILE_TYPES.indexOf(p.type) < 0 || !p.data) throw new Error('Ye file bill nahi lagti');
  var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.type, safeName_(p.name));
  var file = monthFolder_(p.month).createFile(blob);
  return { driveId: file.getId(), driveUrl: file.getUrl() };
}

function trash_(id) {
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {}
}

/** Bill ka achha naam aur sahi mahine ka folder */
function tidyBill_(b) {
  if (!b || !b.driveId) return;
  try {
    var f = DriveApp.getFileById(b.driveId);
    var name = safeName_(b.name);
    if (f.getName() !== name) f.setName(name);
    var folder = monthFolder_(b.month);
    var parents = f.getParents();
    var inside = false;
    while (parents.hasNext()) {
      if (parents.next().getId() === folder.getId()) {
        inside = true;
        break;
      }
    }
    if (!inside) f.moveTo(folder);
  } catch (e) {}
}

/* ---------- Sheet ---------- */
function sheet_(ss, spec) {
  var sh = ss.getSheetByName(spec.name) || ss.insertSheet(spec.name);
  var n = spec.headers.length;
  if (sh.getMaxColumns() < n) sh.insertColumnsAfter(sh.getMaxColumns(), n - sh.getMaxColumns());
  var head = sh.getRange(1, 1, 1, n);
  var cur = sh.getLastRow() >= 1 ? head.getValues()[0] : [];
  var same = cur.length === n && spec.headers.every(function (h, i) { return cur[i] === h; });
  if (!same) {
    head.setValues([spec.headers]).setFontWeight('bold').setBackground('#0A5559').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function findRows_(sh, col, id) {
  var last = sh.getLastRow();
  if (last < 2 || !id || col < 1) return [];
  var found = sh.getRange(2, col, last - 1, 1).createTextFinder(String(id)).matchEntireCell(true).matchCase(true).findAll();
  return found.map(function (r) { return r.getRow(); }).sort(function (a, b) { return a - b; });
}

function deleteRowsFor_(sh, col, id) {
  var rows = findRows_(sh, col, id);
  if (!rows.length) return;
  // Sheet me kam se kam kuch khaali line bachi rahe (Sheets saari lines delete nahi karne deta)
  if (sh.getMaxRows() - rows.length < 3) sh.insertRowsAfter(sh.getMaxRows(), 50);
  for (var i = rows.length - 1; i >= 0; i--) sh.deleteRow(rows[i]);
}

function value_(c) {
  if (c === null || c === undefined) return '';
  if (typeof c === 'number') return c;
  if (typeof c === 'string') return /^[=+@]/.test(c) ? "'" + c : c;
  if (c.d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.d);
    // dopahar 12 baje (UTC) taaki kisi bhi time zone me tareekh na badle
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)) : String(c.d);
  }
  if (c.l) return linkText_(c.l);
  return String(c);
}

function linkText_(links) {
  return links.map(function (x) { return x[0]; }).join(' · ');
}

function rich_(c) {
  var text = c && c.l ? linkText_(c.l) : String(value_(c));
  var b = SpreadsheetApp.newRichTextValue().setText(text);
  if (c && c.l) {
    var pos = 0;
    c.l.forEach(function (x) {
      if (/^https:\/\//.test(x[1])) b.setLinkUrl(pos, pos + x[0].length, x[1]);
      pos += x[0].length + 3;
    });
  }
  return b.build();
}

function fit_(row, n) {
  var r = (row || []).slice(0, n);
  while (r.length < n) r.push('');
  return r;
}

function writeRows_(sh, start, spec, rows) {
  if (!rows || !rows.length) return;
  var n = spec.headers.length;
  rows = rows.map(function (r) { return fit_(r, n); });
  var need = start + rows.length - 1;
  if (sh.getMaxRows() < need) sh.insertRowsAfter(sh.getMaxRows(), need - sh.getMaxRows());
  var rng = sh.getRange(start, 1, rows.length, n);
  rng.setNumberFormats(rows.map(function () { return spec.formats; }));
  rng.setValues(rows.map(function (r) { return r.map(value_); }));
  // Bill wale column me click karne layak links
  for (var j = 0; j < n; j++) {
    var hasLink = rows.some(function (r) { return r[j] && typeof r[j] === 'object' && r[j].l; });
    if (!hasLink) continue;
    sh.getRange(start, j + 1, rows.length, 1).setRichTextValues(rows.map(function (r) { return [rich_(r[j] === '' ? '' : r[j])]; }));
  }
}

function upsert_(p) {
  var ss = book_();
  var sh = sheet_(ss, p.saman);
  var idCol = p.saman.headers.indexOf('ID') + 1;
  var rows = findRows_(sh, idCol, p.id);
  var target = rows.length ? rows[0] : Math.max(sh.getLastRow(), 1) + 1;
  for (var i = rows.length - 1; i >= 1; i--) sh.deleteRow(rows[i]); // galti se do baar likhi ho to ek hi rakho
  writeRows_(sh, target, p.saman, [p.saman.row]);

  var lg = sheet_(ss, p.log);
  deleteRowsFor_(lg, p.log.headers.indexOf('Entry ID') + 1, p.id);
  writeRows_(lg, Math.max(lg.getLastRow(), 1) + 1, p.log, p.log.rows || []);

  (p.bills || []).forEach(tidyBill_);
}

function remove_(p) {
  var ss = book_();
  if (p.saman) {
    var sh = sheet_(ss, p.saman);
    deleteRowsFor_(sh, p.saman.headers.indexOf('ID') + 1, p.id);
  }
  if (p.log) {
    var lg = sheet_(ss, p.log);
    deleteRowsFor_(lg, p.log.headers.indexOf('Entry ID') + 1, p.id);
  }
  (p.driveIds || []).forEach(trash_);
}

function replaceAll_(p) {
  var ss = book_();
  [p.saman, p.log].forEach(function (spec) {
    var sh = sheet_(ss, spec);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getMaxColumns()).clear();
    writeRows_(sh, 2, spec, spec.rows || []);
    try {
      sh.autoResizeColumns(1, spec.headers.length);
    } catch (e) {}
  });
}
