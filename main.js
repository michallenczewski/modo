// Modo — proces główny: okno, pliki (.modo, PNG, DXF/DWG), zamiana DWG na DXF przez ODA File Converter, aktualizacje.
const { app, BrowserWindow, ipcMain, dialog, shell, net, protocol, safeStorage } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn, execFile } = require('child_process');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

// Okno ładujemy z modo://app/ zamiast file:// — moduły JavaScript (import) z file:// Chromium blokuje.
protocol.registerSchemesAsPrivileged([{ scheme: 'modo', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const RENDERER = path.join(__dirname, 'renderer');
function serveRenderer() {
  protocol.handle('modo', req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(RENDERER, decodeURIComponent(u.pathname)));
    if (!file.startsWith(RENDERER)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

/* ---------- ustawienia ---------- */
const settingsFile = () => path.join(app.getPath('userData'), 'ustawienia.json');
let settings = { bounds: null, maximized: false, recent: [], odaPath: null, geminiKey: null, lang: 'pl' };
// napisy okienek systemowych po angielsku (język wybiera okno programu, zob. renderer/i18n.js)
const EN = {
  'Zapisz': 'Save', 'Nie zapisuj': "Don't Save", 'Anuluj': 'Cancel',
  'Zapisać zmiany w szkicu?': 'Save changes to the sketch?', 'Jeśli nie zapiszesz, zmiany przepadną.': "If you don't save, your changes will be lost.",
  'Zapisz kopię jako': 'Save a Copy As', 'Szkic — kopia': 'Sketch — copy', 'Wskaż ODA File Converter': 'Locate ODA File Converter', 'Szkic Modo': 'Modo sketch',
  'Gemini odpowiedział ': 'Gemini responded ', 'Nie udało się połączyć z Gemini: ': 'Could not connect to Gemini: ',
  'ODA File Converter nie zamienił pliku': 'ODA File Converter did not convert the file', 'GitHub odpowiedział ': 'GitHub responded ', 'pobieranie nie powiodło się (': 'download failed ('
};
const _t = s => (settings.lang === 'en' && EN[s]) || s;
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) {} }

/* ---------- okno ---------- */
const wins = new Set();
const dirty = new WeakMap();   // okno → czy są niezapisane zmiany
const autoKeys = new WeakMap(); // okno → klucz jego autozapisu
const liveKeys = new Set();     // klucze autozapisu okien, które teraz działają
const crashed = new WeakSet();  // okna, w których padł proces rysujący (ich autozapis zostaje)
// Własne przyciski okna na Windows (opcja „Przyciski okna w stylu Modo”, wytyczne rodziny p. 8a): okno bez systemowej
// nakładki, przyciski rysuje Modo na końcu górnego paska. Ustawienie działa od utworzenia okna, więc zmiana uruchamia Modo ponownie.
const ownBtns = () => isWin && !!settings.ownButtons;
ipcMain.on('own-buttons', e => { const w = BrowserWindow.fromWebContents(e.sender); e.returnValue = !!(w && w.ownBtns); });
ipcMain.handle('own-buttons-set', (e, v) => { settings.ownButtons = !!v; saveSettings(); app.relaunch(); app.quit(); return true; });
ipcMain.on('win-ctl', (e, cmd) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  if (cmd === 'min') w.minimize();
  else if (cmd === 'max') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (cmd === 'close') w.close();
});
function createWindow(openPath) {
  const b = settings.bounds || { width: 1440, height: 900 }, own = ownBtns();
  const win = new BrowserWindow({
    ...b, minWidth: 820, minHeight: 520, show: false,
    title: 'Modo', backgroundColor: '#f7f7f5', autoHideMenuBar: true,
    // pasek tytułu schowany — przyciski okna rysuje system w górnym pasku programu (jak w Gapie)
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 } }
      : own ? { titleBarStyle: 'hidden' }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f7f5', symbolColor: '#4a4945', height: 52 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.ownBtns = own;
  const maxState = () => { if (!win.isDestroyed()) win.webContents.send('win-max', win.isMaximized()); };
  win.on('maximize', maxState); win.on('unmaximize', maxState);
  wins.add(win);
  if (settings.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadURL('modo://app/index.html' + (openPath ? '?p=' + encodeURIComponent(openPath) : ''));
  const remember = () => { if (!win.isMaximized() && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds(); settings.maximized = win.isMaximized(); };
  win.on('resize', remember); win.on('move', remember);
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  // niezapisane zmiany: pytamy przed zamknięciem
  win.on('close', e => {
    remember(); saveSettings();
    if (!dirty.get(win)) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: [_t('Zapisz'), _t('Nie zapisuj'), _t('Anuluj')], defaultId: 0, cancelId: 2,
      message: _t('Zapisać zmiany w szkicu?'), detail: _t('Jeśli nie zapiszesz, zmiany przepadną.')
    });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) { e.preventDefault(); win.webContents.send('save-then-close'); }
  });
  win.webContents.on('render-process-gone', () => crashed.add(win));
  // zwykłe zamknięcie okna kasuje jego autozapis; po awarii plik zostaje i program zaproponuje przywrócenie
  win.on('closed', () => {
    wins.delete(win);
    const k = autoKeys.get(win);
    if (k) { liveKeys.delete(k); if (!crashed.has(win)) try { fs.unlinkSync(autoFile(k)); } catch (e) {} }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return win;
}
ipcMain.on('dirty', (e, v) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { dirty.set(w, !!v); if (isMac) w.setDocumentEdited(!!v); } });
ipcMain.on('close-now', e => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { dirty.set(w, false); w.close(); } });
ipcMain.on('new-window', () => createWindow(null));
// tryb ciemny: kolor tła okna i przycisków okna na Windows
ipcMain.on('theme', (e, dark) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  w.setBackgroundColor(dark ? '#161616' : '#f7f7f5');
  if (isWin && !w.ownBtns) try { w.setTitleBarOverlay({ color: dark ? '#161616' : '#f7f7f5', symbolColor: dark ? '#c4c4c1' : '#4a4945' }); } catch (err) {}
});
ipcMain.handle('platform', () => process.platform);
ipcMain.handle('set-lang', (e, l) => { if (l === 'en' || l === 'pl') { settings.lang = l; saveSettings(); } return true; });

/* ---------- pliki .modo ---------- */
const MODO_FILTER = () => [{ name: _t('Szkic Modo'), extensions: ['modo'] }];
function addRecent(p) { settings.recent = [p, ...(settings.recent || []).filter(x => x !== p)].slice(0, 12); saveSettings(); if (isMac || isWin) app.addRecentDocument(p); }
ipcMain.handle('file-open', async (e, p) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showOpenDialog(win, { filters: MODO_FILTER(), properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    p = r.filePaths[0];
  }
  const text = await fsp.readFile(p, 'utf8');
  addRecent(p);
  return { path: p, name: path.basename(p, '.modo'), text };
});
ipcMain.handle('file-save', async (e, p, text, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showSaveDialog(win, { filters: MODO_FILTER(), defaultPath: (suggested || 'Szkic') + '.modo' });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  const tmp = p + '.zapis';
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, p);
  addRecent(p);
  return { path: p, name: path.basename(p, '.modo') };
});
// kopia szkicu w innym miejscu — bieżący plik zostaje bez zmian
ipcMain.handle('file-save-copy', async (e, text, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { title: _t('Zapisz kopię jako'), filters: MODO_FILTER(), defaultPath: (suggested || _t('Szkic — kopia')) + '.modo' });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, text, 'utf8');
  return r.filePath;
});
// ostatnio otwierane i zapisywane pliki, które nadal istnieją
ipcMain.handle('recent-list', () => (settings.recent || []).filter(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } })
  .map(p => ({ path: p, name: path.basename(p, '.modo'), dir: path.basename(path.dirname(p)) })));

/* ---------- autozapis ---------- */
// Każde okno zapisuje niezapisany szkic do własnego pliku w folderze ustawień. Plik znika przy zapisie
// i przy zwykłym zamknięciu okna, więc to, co tu zostaje po starcie programu, pochodzi z awarii.
const autoDir = () => path.join(app.getPath('userData'), 'autozapis');
const autoFile = k => path.join(autoDir(), String(k).replace(/[^a-z0-9]/gi, '') + '.json');
ipcMain.handle('autosave', async (e, key, rec) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w) autoKeys.set(w, key);
  liveKeys.add(key);
  await fsp.mkdir(autoDir(), { recursive: true });
  const f = autoFile(key);
  await fsp.writeFile(f + '.zapis', JSON.stringify(rec), 'utf8');
  await fsp.rename(f + '.zapis', f);
  return true;
});
ipcMain.handle('autosave-clear', async (e, key) => { try { await fsp.unlink(autoFile(key)); } catch (err) {} return true; });
ipcMain.handle('autosave-read', async (e, key) => { try { return JSON.parse(await fsp.readFile(autoFile(key), 'utf8')); } catch (err) { return null; } });
ipcMain.handle('autosave-list', async () => {
  const out = [];
  let names = []; try { names = await fsp.readdir(autoDir()); } catch (err) { return out; }
  for (const n of names) {
    if (!/\.json$/.test(n)) continue;
    const key = n.slice(0, -5), f = path.join(autoDir(), n);
    if (liveKeys.has(key)) continue;
    try {
      const st = await fsp.stat(f);
      // kopie starsze niż dwa tygodnie nie są już nikomu potrzebne
      if (Date.now() - st.mtimeMs > 14 * 24 * 3600 * 1000) { await fsp.unlink(f); continue; }
      const rec = JSON.parse(await fsp.readFile(f, 'utf8'));
      out.push({ key, name: rec.name || 'Bez nazwy', path: rec.path || null, time: rec.time || st.mtimeMs });
    } catch (err) {}
  }
  return out.sort((a, b) => b.time - a.time);
});
ipcMain.handle('png-save', async (e, buf, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { filters: [{ name: 'Obraz PNG', extensions: ['png'] }], defaultPath: path.join(app.getPath('pictures'), (suggested || 'Modo') + '.png') });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, Buffer.from(buf));
  return r.filePath;
});
/* ---------- render przez Gemini (Nano Banana) ---------- */
// Klucz API zostaje w procesie głównym (zaszyfrowany przez system, gdy to możliwe); okno wie tylko, czy klucz jest.
function geminiKey() {
  const k = settings.geminiKey; if (!k) return null;
  try { return k.enc ? safeStorage.decryptString(Buffer.from(k.enc, 'base64')) : k.plain || null; } catch (e) { return null; }
}
ipcMain.handle('gemini-key-has', () => !!geminiKey());
ipcMain.handle('gemini-key-set', (e, key) => {
  key = String(key || '').trim();
  if (!key) settings.geminiKey = null;
  else settings.geminiKey = safeStorage.isEncryptionAvailable() ? { enc: safeStorage.encryptString(key).toString('base64') } : { plain: key };
  saveSettings(); return !!key;
});
ipcMain.handle('gemini-render', async (e, req) => {
  const key = geminiKey();
  if (!key) return { error: 'Brak klucza API Gemini.', code: 'NO_KEY' };
  try {
    const r = await net.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(req.model) + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(req.body)
    });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (err) {}
    if (!r.ok) return { error: (j && j.error && j.error.message) || (_t('Gemini odpowiedział ') + r.status), status: r.status };
    return { json: j };
  } catch (err) { return { error: _t('Nie udało się połączyć z Gemini: ') + err.message }; }
});

// OBJ z materiałami: plik .mtl o tej samej nazwie obok
ipcMain.handle('obj-save', async (e, obj, mtl, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { filters: [{ name: 'Model OBJ', extensions: ['obj'] }], defaultPath: (suggested || 'Modo') + '.obj' });
  if (r.canceled || !r.filePath) return null;
  const base = r.filePath.replace(/\.obj$/i, '');
  await fsp.writeFile(base + '.mtl', mtl, 'utf8');
  await fsp.writeFile(base + '.obj', obj.replace(/^mtllib .*$/m, 'mtllib ' + path.basename(base) + '.mtl'), 'utf8');
  return base + '.obj';
});
ipcMain.handle('dxf-save', async (e, dxf, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { filters: [{ name: 'DXF', extensions: ['dxf'] }], defaultPath: (suggested || 'Modo') + '.dxf' });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, dxf, 'latin1');
  return r.filePath;
});
// eksport 3D (DAE — tekst, STL — dane binarne): okno zapisu z jednym rozszerzeniem
ipcMain.handle('export-save', async (e, data, suggested, ext, label) => {
  if (!/^[a-z0-9]{1,5}$/.test(ext || '')) return null;
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { filters: [{ name: label || ext.toUpperCase(), extensions: [ext] }], defaultPath: (suggested || 'Modo') + '.' + ext });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
});
ipcMain.handle('show-in-folder', (e, p) => shell.showItemInFolder(p));
ipcMain.handle('open-external', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

/* ---------- podkład CAD: DXF wprost, DWG przez ODA File Converter ---------- */
// ODA File Converter to darmowy program Open Design Alliance. Licencja nie pozwala go rozpowszechniać,
// więc Modo go nie zawiera: szuka programu zainstalowanego na komputerze i wywołuje go w tle.
function odaCandidates() {
  const list = [];
  if (settings.odaPath) list.push(settings.odaPath);
  if (isWin) {
    for (const base of [process.env['ProgramFiles'], process.env['ProgramFiles(x86)']].filter(Boolean)) {
      const oda = path.join(base, 'ODA');
      try { for (const d of fs.readdirSync(oda)) if (/^ODAFileConverter/i.test(d)) list.push(path.join(oda, d, 'ODAFileConverter.exe')); } catch (e) {}
    }
  } else if (isMac) {
    list.push('/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter');
    list.push(path.join(os.homedir(), 'Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter'));
  } else {
    list.push('/usr/bin/ODAFileConverter');
  }
  return list;
}
function findOda() { return odaCandidates().find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null; }
ipcMain.handle('oda-status', () => ({ path: findOda() }));
ipcMain.handle('oda-pick', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { title: _t('Wskaż ODA File Converter'), properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  let p = r.filePaths[0];
  if (isMac && p.endsWith('.app')) p = path.join(p, 'Contents/MacOS/ODAFileConverter');
  settings.odaPath = p; saveSettings();
  return p;
});
function dwgToDxf(file) {
  const oda = findOda();
  if (!oda) return Promise.reject(Object.assign(new Error('Brak programu ODA File Converter'), { code: 'NO_ODA' }));
  return new Promise((resolve, reject) => {
    const inDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-dwg-'));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-dxf-'));
    const name = path.basename(file);
    fs.copyFileSync(file, path.join(inDir, name));
    // składnia: wejście wyjście wersja typ rekurencja audyt [filtr]
    execFile(oda, [inDir, outDir, 'ACAD2018', 'DXF', '0', '1', name], { timeout: 120000, windowsHide: true }, err => {
      const out = path.join(outDir, name.replace(/\.dwg$/i, '.dxf'));
      fs.readFile(out, (err2, data) => {
        try { fs.rmSync(inDir, { recursive: true, force: true }); fs.rmSync(outDir, { recursive: true, force: true }); } catch (e) {}
        if (err2) reject(new Error(_t('ODA File Converter nie zamienił pliku') + (err ? ': ' + err.message : '')));
        else resolve(data);
      });
    });
  });
}
// wybór pliku do importu (np. .skp): zwraca jego zawartość
ipcMain.handle('pick-binary', async (e, ext, label) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { filters: [{ name: label || 'Plik', extensions: [].concat(ext) }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return { path: r.filePaths[0], name: path.basename(r.filePaths[0]), data: new Uint8Array(await fsp.readFile(r.filePaths[0])) }; }
  catch (err) { return { name: path.basename(r.filePaths[0]), error: err.message }; }
});
ipcMain.handle('dwg-oda', async (e, p) => {
  try { return { data: new Uint8Array(await dwgToDxf(p)) }; }
  catch (err) { return { error: err.message, code: err.code || null }; }
});
// obraz: podkład albo materiał (dane surowe — okno samo zmniejsza i koduje)
ipcMain.handle('image-pick', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Obraz', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }], properties: ['openFile'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0], ext = path.extname(p).slice(1).toLowerCase();
  return { name: path.basename(p), type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext), data: new Uint8Array(await fsp.readFile(p)) };
});
ipcMain.handle('underlay-pick', async (e, p) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Rysunek CAD', extensions: ['dxf', 'dwg'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    p = r.filePaths[0];
  }
  // DWG czyta sam program (LibreDWG w oknie); ODA File Converter jest tylko zapasem — patrz 'dwg-oda'
  const isDwg = /\.dwg$/i.test(p);
  try {
    return { path: p, name: path.basename(p), dwg: isDwg, data: new Uint8Array(await fsp.readFile(p)) };
  } catch (err) {
    return { path: p, name: path.basename(p), error: err.message, code: err.code || null };
  }
});

/* ---------- aktualizacje z wydań na GitHubie (jak w Gapie) ---------- */
const REPO = 'michallenczewski/modo';
let upd = { state: 'idle', version: null, url: null, name: null, size: 0, got: 0, error: '' };
const verNum = v => String(v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const newer = (a, b) => { const x = verNum(a), y = verNum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function updTell() { const s = { ...upd, current: app.getVersion() }; for (const w of wins) w.webContents.send('update-status', s); }
async function updCheck() {
  if (upd.state === 'downloading') return upd;
  try {
    const r = await net.fetch('https://api.github.com/repos/' + REPO + '/releases/latest', { headers: { 'User-Agent': 'Modo', Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(_t('GitHub odpowiedział ') + r.status);
    const j = await r.json(), v = String(j.tag_name || '').replace(/^v/, '');
    const want = isWin ? /-win-x64\.exe$/ : isMac ? new RegExp('-mac-' + process.arch + '\\.dmg$') : null;
    const a = want && (j.assets || []).find(x => want.test(x.name));
    if (a && newer(v, app.getVersion())) Object.assign(upd, { state: 'available', version: v, url: a.browser_download_url, name: a.name, size: a.size, error: '' });
    else Object.assign(upd, { state: 'none', version: v, error: '' });
  } catch (err) { upd.state = 'error'; upd.error = err.message; }
  updTell(); return { ...upd, current: app.getVersion() };
}
async function updInstall() {
  if (upd.state !== 'available' || !upd.url) return false;
  const file = path.join(isMac ? app.getPath('downloads') : app.getPath('temp'), upd.name);
  upd.state = 'downloading'; upd.got = 0; updTell();
  try {
    const r = await net.fetch(upd.url, { headers: { 'User-Agent': 'Modo' } });
    if (!r.ok || !r.body) throw new Error(_t('pobieranie nie powiodło się (') + r.status + ')');
    const out = fs.createWriteStream(file + '.part'); let last = 0;
    for await (const chunk of r.body) { out.write(chunk); upd.got += chunk.length; if (Date.now() - last > 400) { last = Date.now(); updTell(); } }
    await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
    await fsp.rename(file + '.part', file);
  } catch (err) { upd.state = 'available'; upd.error = err.message; updTell(); return false; }
  upd.state = 'ready'; updTell();
  if (isWin) { spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref(); setTimeout(() => app.quit(), 400); }
  else if (isMac) shell.openPath(file);
  return true;
}
ipcMain.handle('update-get', () => ({ ...upd, current: app.getVersion() }));
ipcMain.handle('update-check', () => updCheck());
// sprawdzanie przy starcie (z opóźnieniem, żeby nie spowalniać otwierania) i potem co sześć godzin
app.whenReady().then(() => { setTimeout(updCheck, 4000); setInterval(updCheck, 6 * 3600 * 1000); });
ipcMain.handle('update-install', () => updInstall());

/* ---------- start ---------- */
// plik .modo podany przy uruchomieniu (Windows: argument, Mac: zdarzenie open-file)
let pendingOpen = process.argv.slice(1).find(a => /\.modo$/i.test(a)) || null;
app.on('open-file', (e, p) => { e.preventDefault(); if (app.isReady()) createWindow(p); else pendingOpen = p; });
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => { const p = argv.find(a => /\.modo$/i.test(a)); createWindow(p || null); });
app.whenReady().then(() => {
  loadSettings();
  serveRenderer();
  createWindow(pendingOpen);
  setTimeout(updCheck, 8000); setInterval(updCheck, 6 * 3600 * 1000);
});
app.on('activate', () => { if (!wins.size) createWindow(null); });
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
