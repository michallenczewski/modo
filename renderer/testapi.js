// Stałe polecenia do testów (window.modoTest) — dla asystenta i dla ręcznych sprawdzeń w konsoli.
// Zamiast klikać w obraz po współrzędnych, test woła te funkcje; każda zwraca zwykłe dane (liczby, tablice, napisy).
// Opis i przykłady: .claude/skills/test-w-przegladarce/SKILL.md. Nie zmieniaj nazw bez poprawienia tego opisu.
import { newModel, fixModel, makeShape, membersOf } from './model.js';
import { subFaces } from './tools.js';

export function installTestApi(app) {
  const v = app.viewer, errors = [];
  // błędy z konsoli od chwili wczytania strony (test sprawdza je na końcu)
  window.addEventListener('error', e => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', e => errors.push('promise: ' + String(e.reason && e.reason.message || e.reason)));
  const ce = console.error.bind(console); console.error = (...a) => { errors.push(a.map(String).join(' ').slice(0, 300)); ce(...a); };
  const now = () => performance.now();
  const loose = () => app.model.shapes.find(s => s.geo && s.g == (app.editing ?? null));
  const api = {
    app,
    // nowy pusty szkic (bez pytania o zapis), jasny wygląd
    reset({ dark = false } = {}) { app.model = newModel(); app.undo = []; app.redo = []; app.selection.clear(); app.sub = []; app.editing = null; v.editGroup = null; v.setDark(dark); v.setModel(app.model); app.markDirty(false); return api.stats(); },
    // wczytanie modelu: obiekt modelu, zapisany plik .modo (tekst lub obiekt) albo adres pliku przy wersji w przeglądarce
    async load(src) {
      if (typeof src === 'string' && !src.trim().startsWith('{')) src = await (await fetch(src, { cache: 'no-store' })).text();
      let d = typeof src === 'string' ? JSON.parse(src) : src; if (d.model) d = d.model;
      app.model = fixModel(d); app.undo = []; app.redo = []; app.selection.clear(); app.sub = []; v.setModel(app.model); v.zoomExtents();
      return api.stats();
    },
    // prostopadłościan [szer., głęb., wys.] z narożnikiem w o — przechodzi przez zwykłe zlewanie geometrii jak po narysowaniu
    box(o, [w, d, h], { color, alpha } = {}) {
      app.checkpoint(); const s = makeShape(app.model, { o, u: [1, 0, 0], v: [0, 1, 0] }, [[0, 0], [w, 0], [w, d], [0, d]], h);
      if (color) s.color = color; if (alpha != null) s.alpha = alpha; app.changed(); return api.stats();
    },
    // grupa albo komponent z całej luźnej geometrii bieżącego kontekstu; zwraca id grupy
    group(kind = 'group', name) {
      const s = loose(); if (!s) return null;
      app.selection.clear(); app.sub = subFaces(s, s.polys.map((_, i) => i)); app.selectionChanged(); app.run(kind === 'comp' ? 'comp' : 'group');
      const g = app.model.groups.filter(g => g.p == (app.editing ?? null)).pop(); if (g && name) g.name = name;
      app.selection.clear(); app.selectionChanged(); return g ? g.id : null;
    },
    select(groupId) { app.selection.clear(); app.sub = []; if (groupId != null) for (const id of membersOf(app.model, groupId)) app.selection.add(id); app.selectionChanged(); return app.selection.size; },
    run(cmd) { app.run(cmd); return api.stats(); },
    tool(id) { app.setTool ? app.setTool(id) : app.run(id); return document.querySelector('#hint').textContent; },
    // kamera: p — położenie, f — kierunek patrzenia; bez argumentów pokazuje cały model
    camera(p, f, fov = 35) { if (!p) v.zoomExtents(); else v.setCamera({ p, f, fov }); v.needs = true; return v.getCamera(); },
    // punkt modelu → miejsce na ekranie w pikselach strony (zrzut ekranu ma inną skalę — zob. opis umiejętności)
    screen(p) { const r = v.canvas.getBoundingClientRect(), q = v.toScreen(p); return { x: Math.round(r.left + q.x), y: Math.round(r.top + q.y), behind: q.behind }; },
    stats() {
      const m = app.model, info = v.renderer.info.render;
      return { shapes: m.shapes.length, groups: m.groups.length, polys: m.shapes.reduce((n, s) => n + (s.polys ? s.polys.length : 6), 0), lines: m.lines.length,
        undo: app.undo.length, editing: app.editing ?? null, selected: app.selection.size + app.sub.length, triangles: info.triangles, drawCalls: info.calls,
        heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, errors: errors.length };
    },
    // czasy najważniejszych operacji na bieżącym modelu (ms)
    bench() {
      const t = {}, tm = (k, f) => { const a = now(); f(); t[k] = Math.round((now() - a) * 10) / 10; };
      tm('rebuild', () => v.rebuild()); tm('render', () => { v.render(); v.renderer.getContext().finish(); }); tm('render2', () => { v.render(); v.renderer.getContext().finish(); });
      tm('selectionChanged', () => app.selectionChanged()); tm('snap', () => app.snapper.find(v.w / 2, v.h / 2, { model: app.model })); tm('snap2', () => app.snapper.find(v.w / 2 + 30, v.h / 2 - 20, { model: app.model }));
      tm('checkpoint', () => { app.checkpoint(); app.undo.pop(); });
      return { ...t, ...api.stats() };
    },
    // klatki na sekundę przy obracaniu kamery wokół modelu przez ms milisekund
    async fps(ms = 1500) {
      const c = v.getCamera(), b = v._bounds; if (!b) return 0; let n = 0; const t0 = now();
      await new Promise(res => { const f = () => { const a = n * 0.02, r = Math.hypot(c.p[0] - b.center[0], c.p[1] - b.center[1]);
        v.setCamera({ ...c, p: [b.center[0] + r * Math.cos(a), b.center[1] + r * Math.sin(a), c.p[2]], f: [-Math.cos(a), -Math.sin(a), c.f[2]] }); v.needs = true; n++;
        if (now() - t0 < ms) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      v.setCamera(c); return Math.round(n / (ms / 1000));
    },
    // wieża do sprawdzianu wydajności (renderer/dev/wieza.js)
    async tower(opts) { const { buildTower } = await import('./dev/wieza.js'); const t = await buildTower(app, opts); return { ...t, ...api.stats() }; },
    errors: () => errors.slice(),
    text: sel => { const e = document.querySelector(sel); return e ? e.textContent : null; }
  };
  window.modoTest = api;
  return api;
}
