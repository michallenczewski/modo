// Wersja w przeglądarce (do testów interfejsu): zastępuje most do procesu głównego Electrona.
// W programie window.api ustawia preload.js, więc ten plik nic nie robi.
(function () {
  if (window.api) return;
  const pick = accept => new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  window.api = {
    web: true,
    platform: /Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux',
    async openFile() { const f = await pick('.modo'); return f ? { path: null, name: f.name.replace(/\.modo$/i, ''), text: await f.text() } : null; },
    async saveFile(p, text, suggested) { download(new Blob([text], { type: 'application/json' }), (suggested || 'Szkic') + '.modo'); return { path: null, name: suggested || 'Szkic' }; },
    async saveCopy(text, suggested) { download(new Blob([text], { type: 'application/json' }), (suggested || 'Szkic — kopia') + '.modo'); return true; },
    async recentList() { return []; },
    // autozapis w przeglądarce: jedna kopia w pamięci przeglądarki
    async autosave(key, rec) { try { localStorage.setItem('modo.autozapis', JSON.stringify({ key, ...rec })); return true; } catch (e) { return false; } },
    async autosaveClear(key) { try { const r = JSON.parse(localStorage.getItem('modo.autozapis') || 'null'); if (r && r.key === key) localStorage.removeItem('modo.autozapis'); } catch (e) {} return true; },
    async autosaveRead(key) { try { const r = JSON.parse(localStorage.getItem('modo.autozapis') || 'null'); return r && r.key === key ? r : null; } catch (e) { return null; } },
    async autosaveList(mine) { try { const r = JSON.parse(localStorage.getItem('modo.autozapis') || 'null'); return r && r.key !== mine ? [{ key: r.key, name: r.name, path: null, time: r.time }] : []; } catch (e) { return []; } },
    async saveExport(data, suggested, ext) { const n = (suggested || 'Modo') + '.' + ext; download(new Blob([data], { type: 'application/octet-stream' }), n); return n; },
    async saveDxf(dxf, suggested) { const n = (suggested || 'Modo') + '.dxf'; download(new Blob([dxf], { type: 'application/dxf' }), n); return n; },
    async savePng(buf, suggested) { download(new Blob([buf], { type: 'image/png' }), (suggested || 'Modo') + '.png'); return (suggested || 'Modo') + '.png'; },
    async saveObj(obj, mtl, suggested) { const n = suggested || 'Modo'; download(new Blob([obj.replace(/^mtllib .*$/m, 'mtllib ' + n + '.mtl')], { type: 'text/plain' }), n + '.obj'); setTimeout(() => download(new Blob([mtl], { type: 'text/plain' }), n + '.mtl'), 300); return n + '.obj'; },
    // w przeglądarce klucz leży w pamięci przeglądarki, a zapytanie idzie wprost do Gemini
    async geminiHasKey() { try { return !!localStorage.getItem('modo.geminiKey'); } catch (e) { return false; } },
    async geminiSetKey(k) { try { k ? localStorage.setItem('modo.geminiKey', String(k).trim()) : localStorage.removeItem('modo.geminiKey'); } catch (e) {} return !!k; },
    async geminiRender(req) {
      let key = null; try { key = localStorage.getItem('modo.geminiKey'); } catch (e) {}
      if (!key) return { error: 'Brak klucza API Gemini.', code: 'NO_KEY' };
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(req.model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(req.body) });
        const j = await r.json().catch(() => null);
        if (!r.ok) return { error: (j && j.error && j.error.message) || ('Gemini odpowiedział ' + r.status), status: r.status };
        return { json: j };
      } catch (err) { return { error: 'Nie udało się połączyć z Gemini: ' + err.message }; }
    },
    async pickBinary(ext) { const f = await pick([].concat(ext).map(x => '.' + x).join(',')); return f ? { path: null, name: f.name, data: new Uint8Array(await f.arrayBuffer()) } : null; },
    async pickImage() { const f = await pick('image/*'); return f ? { name: f.name, type: f.type, data: new Uint8Array(await f.arrayBuffer()) } : null; },
    async pickUnderlay() {
      const f = await pick('.dxf,.dwg'); if (!f) return null;
      return { path: null, name: f.name, dwg: /\.dwg$/i.test(f.name), data: new Uint8Array(await f.arrayBuffer()) };
    },
    async dwgViaOda() { return { error: 'Brak programu ODA File Converter', code: 'NO_ODA' }; },
    async odaStatus() { return { path: null, web: true }; },
    async odaPick() { return null; },
    showInFolder() {}, openExternal(url) { window.open(url, '_blank'); },
    setDirty() {}, closeNow() {}, newWindow() { window.open(location.href, '_blank'); },
    onSaveThenClose() {}, onFullscreen() {}, onUpdate() {},
    ownButtons: false, _winCtl: null, setOwnButtons(v) { this.ownButtons = !!v; return true; }, winCtl(c) { this._winCtl = c; }, onWinMax() {},
    async updateGet() { return { state: 'idle' }; }, async updateCheck() { return { state: 'idle' }; }, async updateInstall() { return false; }
  };
})();
