// Modo — proces główny: okno, pliki (.modo, PNG, DXF/DWG), zamiana DWG na DXF przez ODA File Converter, aktualizacje.
const { app, BrowserWindow, ipcMain, dialog, shell, net, protocol } = require('electron');
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
let settings = { bounds: null, maximized: false, recent: [], odaPath: null };
function loadSettings() { try { Object.assign(settings, JSON.parse(fs.readFileSync(settingsFile(), 'utf8'))); } catch (e) {} }
function saveSettings() { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) {} }

/* ---------- okno ---------- */
const wins = new Set();
const dirty = new WeakMap();   // okno → czy są niezapisane zmiany
function createWindow(openPath) {
  const b = settings.bounds || { width: 1440, height: 900 };
  const win = new BrowserWindow({
    ...b, minWidth: 820, minHeight: 520, show: false,
    title: 'Modo', backgroundColor: '#f7f7f5', autoHideMenuBar: true,
    // pasek tytułu schowany — przyciski okna rysuje system w górnym pasku programu (jak w Gapie)
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 19 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#f7f7f5', symbolColor: '#4a4945', height: 52 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
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
      type: 'question', buttons: ['Zapisz', 'Nie zapisuj', 'Anuluj'], defaultId: 0, cancelId: 2,
      message: 'Zapisać zmiany w szkicu?', detail: 'Jeśli nie zapiszesz, zmiany przepadną.'
    });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) { e.preventDefault(); win.webContents.send('save-then-close'); }
  });
  win.on('closed', () => { wins.delete(win); });
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
  if (isWin) try { w.setTitleBarOverlay({ color: dark ? '#161616' : '#f7f7f5', symbolColor: dark ? '#c4c4c1' : '#4a4945' }); } catch (err) {}
});
ipcMain.handle('platform', () => process.platform);

/* ---------- pliki .modo ---------- */
const MODO_FILTER = [{ name: 'Szkic Modo', extensions: ['modo'] }];
function addRecent(p) { settings.recent = [p, ...(settings.recent || []).filter(x => x !== p)].slice(0, 12); saveSettings(); if (isMac || isWin) app.addRecentDocument(p); }
ipcMain.handle('file-open', async (e, p) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showOpenDialog(win, { filters: MODO_FILTER, properties: ['openFile'] });
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
    const r = await dialog.showSaveDialog(win, { filters: MODO_FILTER, defaultPath: (suggested || 'Szkic') + '.modo' });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  const tmp = p + '.zapis';
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, p);
  addRecent(p);
  return { path: p, name: path.basename(p, '.modo') };
});
ipcMain.handle('png-save', async (e, buf, suggested) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { filters: [{ name: 'Obraz PNG', extensions: ['png'] }], defaultPath: path.join(app.getPath('pictures'), (suggested || 'Modo') + '.png') });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, Buffer.from(buf));
  return r.filePath;
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
  const r = await dialog.showOpenDialog(win, { title: 'Wskaż ODA File Converter', properties: ['openFile'] });
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
        if (err2) reject(new Error('ODA File Converter nie zamienił pliku' + (err ? ': ' + err.message : '')));
        else resolve(data);
      });
    });
  });
}
ipcMain.handle('underlay-pick', async (e, p) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!p) {
    const r = await dialog.showOpenDialog(win, { filters: [{ name: 'Rysunek CAD', extensions: ['dxf', 'dwg'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    p = r.filePaths[0];
  }
  const isDwg = /\.dwg$/i.test(p);
  try {
    const data = isDwg ? await dwgToDxf(p) : await fsp.readFile(p);
    return { path: p, name: path.basename(p), converted: isDwg, data: new Uint8Array(data) };
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
    if (!r.ok) throw new Error('GitHub odpowiedział ' + r.status);
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
    if (!r.ok || !r.body) throw new Error('pobieranie nie powiodło się (' + r.status + ')');
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
