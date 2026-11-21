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
    async savePng(buf, suggested) { download(new Blob([buf], { type: 'image/png' }), (suggested || 'Modo') + '.png'); return (suggested || 'Modo') + '.png'; },
    async pickUnderlay() {
      const f = await pick('.dxf,.dwg'); if (!f) return null;
      if (/\.dwg$/i.test(f.name)) return { name: f.name, error: 'W przeglądarce DWG nie da się zamienić — użyj programu albo pliku DXF', code: 'WEB' };
      return { path: null, name: f.name, data: new Uint8Array(await f.arrayBuffer()) };
    },
    async odaStatus() { return { path: null, web: true }; },
    async odaPick() { return null; },
    showInFolder() {}, openExternal(url) { window.open(url, '_blank'); },
    setDirty() {}, closeNow() {}, newWindow() { window.open(location.href, '_blank'); },
    onSaveThenClose() {}, onFullscreen() {}, onUpdate() {},
    async updateGet() { return { state: 'idle' }; }, async updateCheck() { return { state: 'idle' }; }, async updateInstall() { return false; }
  };
})();
