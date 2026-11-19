// Scriptorium — main process
// Owns the filesystem: the Library folder, .tome files, fonts, settings.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const JSZip = require('jszip');
const { readFontInfo } = require('./fontinfo');
const updater = require('./updater');

const APP_NAME = 'Scriptorium';
const TOME_FORMAT_VERSION = 1;
const ASSET_DIR = path.join(__dirname, 'assets');

let win = null;
let dirty = false;
let pendingOpenPath = null;
let quitting = false;

// ------------------------------------------------------------------ settings
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const defaultSettings = () => ({
  uiScale: 1,
  libraryRoot: path.join(app.getPath('documents'), APP_NAME, 'Library'),
});
function loadSettings() {
  try { return { ...defaultSettings(), ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) }; }
  catch { return defaultSettings(); }
}
function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2));
}
let settings;

function libraryRoot() { return settings.libraryRoot; }
function ensureLibrary() {
  fs.mkdirSync(path.join(libraryRoot(), 'My Books'), { recursive: true });
}
function safeName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
}

// ------------------------------------------------------------------ sealing (password protection)
// A sealed tome keeps its words in AES-256-GCM, keyed from the magic words with PBKDF2-SHA256.
const KDF_ITER = 210000;
function sealKey(words, salt) { return crypto.pbkdf2Sync(String(words).normalize('NFC'), salt, KDF_ITER, 32, 'sha256'); }
function encrypt(key, buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}
function decrypt(key, buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

// ------------------------------------------------------------------ fonts
// Registry entry: { id, family, weight, style, source: bundled|system|user|embedded, path, fsType, license }
let fontRegistry = [];

const WINDOWS_CANDIDATES = [
  // [family label, file names]  (ship with Windows itself)
  ['Gabriola', ['Gabriola.ttf']],
  ['Palatino Linotype', ['pala.ttf', 'palai.ttf', 'palab.ttf', 'palabi.ttf']],
  ['Constantia', ['constan.ttf', 'constani.ttf', 'constanb.ttf', 'constanz.ttf']],
  ['Georgia', ['georgia.ttf', 'georgiai.ttf', 'georgiab.ttf', 'georgiaz.ttf']],
  ['Segoe Script', ['segoesc.ttf', 'segoescb.ttf']],
  ['Segoe Print', ['segoepr.ttf', 'segoeprb.ttf']],
  ['Sylfaen', ['sylfaen.ttf']],
  ['Ink Free', ['Inkfree.ttf']],
  // (ship with Microsoft Office; present on many machines)
  ['Old English Text MT', ['OLDENGL.TTF']],
  ['Monotype Corsiva', ['MTCORSVA.TTF']],
  ['Lucida Calligraphy', ['LCALLIG.TTF']],
  ['Lucida Handwriting', ['LHANDW.TTF']],
  ['Blackadder ITC', ['ITCBLKAD.TTF']],
  ['Papyrus', ['PAPYRUS.TTF']],
  ['Garamond', ['GARA.TTF', 'GARAIT.TTF', 'GARABD.TTF']],
  ['Book Antiqua', ['BKANT.TTF', 'ANTQUAI.TTF', 'ANTQUAB.TTF', 'ANTQUABI.TTF']],
  ['Goudy Old Style', ['GOUDOS.TTF', 'GOUDOSI.TTF', 'GOUDOSB.TTF']],
  ['Centaur', ['CENTAUR.TTF']],
  ['Harrington', ['HARNGTON.TTF']],
  ['Edwardian Script ITC', ['ITCEDSCR.TTF']],
  ['Vivaldi', ['VIVALDII.TTF']],
  ['Viner Hand ITC', ['VINERITC.TTF']],
  ['Mistral', ['MISTRAL.TTF']],
  ['Kunstler Script', ['KUNSTLER.TTF']],
  ['Bradley Hand ITC', ['BRADHITC.TTF']],
  ['Castellar', ['CASTELAR.TTF']],
  ['Perpetua', ['PER_____.TTF', 'PERI____.TTF', 'PERB____.TTF']],
  ['Poor Richard', ['POORICH.TTF']],
];

function faceFromInfo(info, fallbackFamily) {
  return {
    family: info?.family || fallbackFamily,
    weight: info?.weight || 400,
    style: info?.italic ? 'italic' : 'normal',
    fsType: info?.fsType ?? 0,
  };
}

function scanFonts() {
  const reg = [];
  // bundled
  const catalog = JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'fonts', 'fonts.json'), 'utf8'));
  const famMeta = Object.fromEntries(catalog.families.map(f => [f.family, f]));
  for (const f of catalog.faces) {
    reg.push({ id: 'b:' + f.file, family: f.family, weight: f.weight, style: f.style, source: 'bundled',
      path: path.join(ASSET_DIR, 'fonts', f.file), fsType: 0, license: famMeta[f.family]?.license, category: famMeta[f.family]?.category });
  }
  // system (Windows only, but harmless elsewhere)
  if (process.platform === 'win32') {
    const dirs = [path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')];
    if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    for (const [label, files] of WINDOWS_CANDIDATES) {
      for (const file of files) {
        for (const d of dirs) {
          const p = path.join(d, file);
          if (fs.existsSync(p)) {
            const info = readFontInfo(fs.readFileSync(p));
            reg.push({ id: 's:' + file.toLowerCase(), ...faceFromInfo(info, label), family: label, source: 'system', path: p });
            break;
          }
        }
      }
    }
  }
  // user-imported
  const ud = path.join(app.getPath('userData'), 'fonts');
  fs.mkdirSync(ud, { recursive: true });
  for (const file of fs.readdirSync(ud)) {
    if (!/\.(ttf|otf|woff2?)$/i.test(file)) continue;
    const p = path.join(ud, file);
    const info = readFontInfo(fs.readFileSync(p));
    reg.push({ id: 'u:' + file, ...faceFromInfo(info, path.parse(file).name), source: 'user', path: p });
  }
  // keep embedded fonts already discovered this session
  fontRegistry = reg.concat(fontRegistry.filter(f => f.source === 'embedded'));
  return fontRegistry;
}

function publicFont(f) {
  const { path: _p, ...rest } = f; return rest;
}

// ------------------------------------------------------------------ .tome read/write
async function readTomeMeta(file) {
  try {
    const zip = await JSZip.loadAsync(await fsp.readFile(file));
    const meta = JSON.parse(await zip.file('manifest.json').async('string'));
    return { title: meta.title, author: meta.author, cover: meta.cover, sealed: !!meta.seal };
  } catch { return null; }
}

async function listLibrary() {
  ensureLibrary();
  const root = libraryRoot();
  const shelves = [];
  const dirs = (await fsp.readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
  dirs.sort((a, b) => (a === 'My Books' ? -1 : b === 'My Books' ? 1 : a.localeCompare(b)));
  for (const name of dirs) {
    const dir = path.join(root, name);
    const books = [];
    for (const f of await fsp.readdir(dir)) {
      if (!f.toLowerCase().endsWith('.tome')) continue;
      const p = path.join(dir, f);
      const meta = await readTomeMeta(p);
      const st = await fsp.stat(p);
      books.push({ path: p, file: f, title: meta?.title || path.parse(f).name, author: meta?.author || '', cover: meta?.cover || null, sealed: !!meta?.sealed, mtime: st.mtimeMs, broken: !meta });
    }
    books.sort((a, b) => a.title.localeCompare(b.title));
    shelves.push({ name, path: dir, books });
  }
  return { root, shelves };
}

async function writeTome(file, payload) {
  // payload: { book, fontFamilies: [family], images: {name: Uint8Array} }
  const zip = new JSZip();
  const { book } = payload;
  let key = null, seal = null;
  if (payload.seal && payload.seal.words) {
    const salt = crypto.randomBytes(16);
    key = sealKey(payload.seal.words, salt);
    seal = { cipher: 'aes-256-gcm', kdf: 'pbkdf2-sha256', iterations: KDF_ITER, salt: salt.toString('base64'), hint: String(payload.seal.hint || '').slice(0, 200) };
  }
  zip.file('mimetype', 'application/x-scriptorium-tome', { compression: 'STORE' });
  zip.file('manifest.json', JSON.stringify({
    format: 'tome', version: TOME_FORMAT_VERSION, app: APP_NAME, appVersion: app.getVersion(),
    title: book.title, author: book.author, cover: book.cover || null, saved: new Date().toISOString(), seal,
  }, null, 1));
  const bookBuf = Buffer.from(JSON.stringify(book), 'utf8');
  if (key) zip.file('book.sealed', encrypt(key, bookBuf)); else zip.file('book.json', bookBuf);
  // fonts: every face of every family the book uses
  const wanted = new Set(payload.fontFamilies || []);
  const fontManifest = [];
  const seenFiles = new Set();
  const warnings = [];
  for (const f of fontRegistry) {
    if (!wanted.has(f.family)) continue;
    let data;
    try { data = await fsp.readFile(f.path); } catch { continue; }
    const hash = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
    const ext = path.extname(f.path).toLowerCase() || '.ttf';
    const name = `fonts/${safeName(f.family).replace(/ /g, '_')}-${f.weight}-${f.style}-${hash}${ext}`;
    if (seenFiles.has(name)) continue;
    seenFiles.add(name);
    zip.file(name, data);
    fontManifest.push({ family: f.family, weight: f.weight, style: f.style, file: name, source: f.source, fsType: f.fsType });
    if (f.fsType === 2) warnings.push(f.family);
  }
  zip.file('fonts/fonts.json', JSON.stringify(fontManifest, null, 1));
  for (const [name, data] of Object.entries(payload.images || {})) zip.file('images/' + name + (key ? '.sealed' : ''), key ? encrypt(key, Buffer.from(data)) : data);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.writing';
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, file);
  return { path: file, restrictedFonts: [...new Set(warnings)] };
}

async function readTome(file, words) {
  const zip = await JSZip.loadAsync(await fsp.readFile(file));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  if (manifest.format !== 'tome') throw new Error('Not a tome');
  let book = null, key = null;
  if (manifest.seal) {
    if (words == null) book = null; // caller must ask for the magic words
    else {
      key = sealKey(words, Buffer.from(manifest.seal.salt, 'base64'));
      try { book = JSON.parse(decrypt(key, await zip.file('book.sealed').async('nodebuffer')).toString('utf8')); }
      catch { const e = new Error('WRONG_WORDS'); e.code = 'WRONG_WORDS'; throw e; }
    }
  } else book = JSON.parse(await zip.file('book.json').async('string'));
  const fonts = [];
  const fm = zip.file('fonts/fonts.json');
  if (fm) {
    const list = JSON.parse(await fm.async('string'));
    const cacheDir = path.join(app.getPath('userData'), 'embedded-fonts');
    await fsp.mkdir(cacheDir, { recursive: true });
    for (const f of list) {
      const entry = zip.file(f.file);
      if (!entry) continue;
      const data = await entry.async('nodebuffer');
      // cache so re-saving keeps the font even if this machine lacks it
      const cached = path.join(cacheDir, path.basename(f.file));
      if (!fs.existsSync(cached)) await fsp.writeFile(cached, data);
      const already = fontRegistry.find(r => r.family === f.family && r.weight === f.weight && r.style === f.style);
      if (!already) fontRegistry.push({ id: 'e:' + path.basename(f.file), family: f.family, weight: f.weight, style: f.style, source: 'embedded', path: cached, fsType: f.fsType || 0 });
      fonts.push({ family: f.family, weight: f.weight, style: f.style, data: new Uint8Array(data) });
    }
  }
  const images = {};
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith('images/') || zip.files[name].dir) continue;
    let data = await zip.file(name).async('nodebuffer');
    let short = name.slice(7);
    if (short.endsWith('.sealed')) { if (!key) continue; data = decrypt(key, data); short = short.slice(0, -7); }
    images[short] = new Uint8Array(data);
  }
  return { path: file, manifest, book, fonts, images, locked: !!manifest.seal && !book, hint: manifest.seal?.hint || '' };
}

// ------------------------------------------------------------------ window
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#1a0f08',
    title: APP_NAME,
    icon: path.join(ASSET_DIR, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('close', (e) => {
    if (quitting || !dirty) return;
    e.preventDefault();
    win.webContents.send('app:close-requested');
  });
  // never let book content navigate the window or open windows
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.SCRIPTORIUM_DEBUG) win.webContents.openDevTools({ mode: 'detach' });
}

function tomeArg(argv) {
  return argv.slice(1).find(a => a.toLowerCase().endsWith('.tome') && fs.existsSync(a)) || null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    const p = tomeArg(argv);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (p) win.webContents.send('app:open-path', p); }
  });
  app.on('open-file', (e, p) => { e.preventDefault(); if (win) win.webContents.send('app:open-path', p); else pendingOpenPath = p; });
  app.whenReady().then(() => {
    settings = loadSettings();
    ensureLibrary();
    scanFonts();
    pendingOpenPath = pendingOpenPath || tomeArg(process.argv);
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('app:init', () => ({
  settings, platform: process.platform, version: app.getVersion(),
  openPath: (() => { const p = pendingOpenPath; pendingOpenPath = null; return p; })(),
}));
// ------------------------------------------------------------------ the messenger (updates)
ipcMain.handle('update:check', async (_e, force) => {
  try { const r = await updater.check({ force }); return { ...r, skipped: settings.skipVersion === r.version }; }
  catch (e) { return { error: String(e.message || e), current: app.getVersion(), configured: updater.configured() }; }
});
ipcMain.handle('update:skip', (_e, v) => { settings.skipVersion = v; saveSettings(settings); return true; });
ipcMain.handle('update:fetch-and-install', async (e) => {
  const send = (stage, frac) => { try { e.sender.send('update:progress', { stage, frac }); } catch {} };
  const info = await updater.check({});
  if (!info.available) throw new Error('No new edition awaits.');
  send('download', 0);
  const file = await updater.download(info, (f) => send('download', f));
  send('backup', 0);
  const b = await updater.backupLibrary(libraryRoot());
  send('install', 1);
  const r = await updater.install(file);
  if (!r.dryRun && !r.interactive) setTimeout(() => { quitting = true; app.quit(); }, 400);
  return { ...r, backup: b.file, books: b.count };
});
ipcMain.handle('app:asset-text', (_e, rel) => {
  const p = path.normalize(path.join(ASSET_DIR, rel));
  if (!p.startsWith(ASSET_DIR) || !/\.svg$/i.test(p)) return null;
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:manifest', () => JSON.parse(fs.readFileSync(path.join(ASSET_DIR, 'manifest.json'), 'utf8')));
ipcMain.on('app:set-dirty', (_e, d) => { dirty = !!d; });
ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
ipcMain.on('app:toggle-fullscreen', () => { if (win) win.setFullScreen(!win.isFullScreen()); });
ipcMain.handle('settings:set', (_e, patch) => { settings = { ...settings, ...patch }; saveSettings(settings); ensureLibrary(); return settings; });

ipcMain.handle('library:list', () => listLibrary());
ipcMain.handle('library:add-shelf', async (_e, name) => {
  const n = safeName(name);
  await fsp.mkdir(path.join(libraryRoot(), n), { recursive: true });
  return n;
});
ipcMain.handle('library:reveal', (_e, p) => shell.showItemInFolder(p || libraryRoot()));
ipcMain.handle('library:choose-root', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose where thy Library dwells', properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings.libraryRoot = path.join(r.filePaths[0]);
  saveSettings(settings); ensureLibrary();
  return settings;
});

ipcMain.handle('tome:save', async (_e, { target, payload }) => {
  // target: {path} | {shelf, filename}
  let file = target.path;
  if (!file) file = path.join(libraryRoot(), safeName(target.shelf || 'My Books'), safeName(target.filename) + '.tome');
  return writeTome(file, payload);
});
ipcMain.handle('tome:exists', (_e, { shelf, filename }) => fs.existsSync(path.join(libraryRoot(), safeName(shelf), safeName(filename) + '.tome')));
ipcMain.handle('tome:save-dialog', async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Seal this tome elsewhere', defaultPath: path.join(libraryRoot(), safeName(suggested) + '.tome'),
    filters: [{ name: 'Tome', extensions: ['tome'] }],
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('tome:open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Open a tome', defaultPath: libraryRoot(), filters: [{ name: 'Tome', extensions: ['tome'] }], properties: ['openFile'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('tome:open', async (_e, p, words) => {
  try { return await readTome(p, words); }
  catch (e) { if (e.code === 'WRONG_WORDS') return { wrongWords: true }; throw e; }
});
ipcMain.on('app:quit-now', () => { quitting = true; app.quit(); });

ipcMain.handle('fonts:list', () => scanFonts().map(publicFont));
ipcMain.handle('fonts:read', async (_e, id) => {
  const f = fontRegistry.find(r => r.id === id);
  if (!f) return null;
  return new Uint8Array(await fsp.readFile(f.path));
});
ipcMain.handle('fonts:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Bring a new typeface to thy desk', filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'woff', 'woff2'] }], properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return [];
  const ud = path.join(app.getPath('userData'), 'fonts');
  await fsp.mkdir(ud, { recursive: true });
  const added = [];
  for (const src of r.filePaths) {
    const dst = path.join(ud, path.basename(src));
    await fsp.copyFile(src, dst);
    const info = readFontInfo(await fsp.readFile(dst));
    added.push({ file: path.basename(src), family: info?.family || path.parse(src).name, fsType: info?.fsType ?? 0 });
  }
  scanFonts();
  return added;
});
