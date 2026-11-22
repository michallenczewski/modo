// Przyklejanie kursora (inferencje jak w SketchUpie): końce i środki krawędzi, krawędzie, ściany, ziemia,
// osie od punktu początkowego, wyrównanie „od punktu” do niedawno wskazanych punktów, blokada osi strzałkami.

import { vertices, edges, V, isHidden } from './model.js';

export const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
export const AXIS_COLOR = { x: '#c0533f', y: '#4f8a46', z: '#3f63a8' };
export const REF_COLOR = '#b0489e';   // równolegle / prostopadle do krawędzi — magenta, jak w SketchUpie
export const AXIS_NAME = { x: 'Na osi czerwonej', y: 'Na osi zielonej', z: 'Na osi niebieskiej' };

const R_END = 12, R_MID = 10, R_EDGE = 8, R_AXIS = 10;

export class Snapper {
  constructor(viewer) {
    this.v = viewer;
    this.tracking = [];      // ostatnio wskazane punkty (do wyrównań „od punktu”)
    this.refs = [];          // ostatnio wskazane krawędzie (do „równolegle”, „prostopadle”, „przedłużenie”)
    this.under = null;       // siatka odcinków podkładu
  }

  setUnderlay(u) {
    this.under = null;
    if (!u || !u.snap) return;
    const segs = [];
    for (const L of u.layers) if (L.visible) for (let i = 0; i < L.segs.length; i += 4) segs.push([L.segs[i], L.segs[i + 1], L.segs[i + 2], L.segs[i + 3]]);
    if (!segs.length) return;
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const s of segs) for (const k of [0, 2]) { lo[0] = Math.min(lo[0], s[k]); hi[0] = Math.max(hi[0], s[k]); lo[1] = Math.min(lo[1], s[k + 1]); hi[1] = Math.max(hi[1], s[k + 1]); }
    const cell = Math.max(0.5, Math.max(hi[0] - lo[0], hi[1] - lo[1]) / 256);
    const grid = new Map();
    const put = (ix, iy, i) => { const k = ix + ',' + iy; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); };
    segs.forEach((s, i) => {
      const x0 = Math.floor(Math.min(s[0], s[2]) / cell), x1 = Math.floor(Math.max(s[0], s[2]) / cell);
      const y0 = Math.floor(Math.min(s[1], s[3]) / cell), y1 = Math.floor(Math.max(s[1], s[3]) / cell);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) { put(x0, y0, i); put(x1, y1, i); return; }
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) put(x, y, i);
    });
    this.under = { segs, grid, cell, h: u.height };
  }

  underNear(x, y) {
    const U = this.under; if (!U) return [];
    const g = this.v.onPlane(x, y, [0, 0, U.h], [0, 0, 1]); if (!g) return [];
    const r = R_END * this.v.pixelSize(g) * 1.5;
    const out = new Set();
    for (let ix = Math.floor((g[0] - r) / U.cell); ix <= Math.floor((g[0] + r) / U.cell); ix++)
      for (let iy = Math.floor((g[1] - r) / U.cell); iy <= Math.floor((g[1] + r) / U.cell); iy++) {
        const a = U.grid.get(ix + ',' + iy); if (a) for (const i of a) out.add(i);
      }
    return [...out].slice(0, 400).map(i => { const s = U.segs[i]; return [[s[0], s[1], U.h], [s[2], s[3], U.h]]; });
  }

  remember(p) {
    if (this.tracking.some(t => V.dist(t, p) < 1e-6)) return;
    this.tracking.unshift(p.slice()); this.tracking.length = Math.min(this.tracking.length, 3);
  }
  forget() { this.tracking = []; this.refs = []; this.lockLine = null; }
  // krawędź, nad którą był kursor, staje się odniesieniem dla następnych odcinków (jak „zachęcanie” inferencji w SketchUpie)
  touch(a, b) {
    const L = V.dist(a, b); if (L < 1e-6) return;
    const dir = V.mul(V.sub(b, a), 1 / L);
    this.refs = this.refs.filter(r => !(Math.abs(Math.abs(V.dot(r.dir, dir)) - 1) < 1e-6 && V.dist(r.a, a) + V.dist(r.b, b) < 1e-6));
    this.refs.unshift({ a: a.slice(), b: b.slice(), dir }); this.refs.length = Math.min(this.refs.length, 2);
  }

  // opts: { anchor, lockAxis, plane: {o,n}, line: {o,d}, exclude: shapeId, model }
  // Linie śledzenia: przedłużenia krawędzi, nad którymi był kursor (rysowane przerywaną linią przez app.js),
  // oraz osie przez ostatnio wskazane punkty. dla płaszczyzny (o, n) — tylko te, które w niej leżą po zrzutowaniu.
  guideLines(plane) {
    const out = [];
    for (const r of this.refs) out.push({ o: r.a, d: r.dir, from: r.b, to: r.a, label: 'Przedłużenie krawędzi', color: REF_COLOR, L: V.dist(r.a, r.b) });
    for (const T of this.tracking) for (const [name, a] of Object.entries(AXES)) out.push({ o: T, d: a, from: T, to: T, label: 'Od punktu', color: AXIS_COLOR[name], point: true });
    if (!plane) return out;
    const { o, n } = plane;
    return out.filter(g => Math.abs(V.dot(g.d, n)) < 1e-3 && !(g.point && V.dist(g.o, o) < 1e-6)).map(g => ({ ...g, o: V.sub(g.o, V.mul(n, V.dot(V.sub(g.o, o), n))) }));
  }

  find(x, y, opts = {}) {
    // Shift na linii śledzenia: kursor zostaje na tej linii, a punkty, krawędzie i ściany pod nim tylko wyznaczają miejsce na niej
    if (this.lockLine && !opts.line) opts = { ...opts, line: this.lockLine, viaLock: true, plane: null };
    const v = this.v, model = opts.model;
    const scr = p => v.toScreen(p);
    const d2 = (p) => { const s = scr(p); return s.behind ? Infinity : Math.hypot(s.x - x, s.y - y); };

    // 1. punkty: końce i środki
    let best = null;
    const tryPt = (p, type, dir) => {
      const d = d2(p), r = type === 'mid' ? R_MID : R_END;
      if (d > r) return;
      const score = d + (type === 'mid' ? 3 : type === 'cross' ? 1 : 0);
      if (!best || score < best.score) best = { p, type, score, dir };
    };
    const ex = opts.excludeSet;
    const segs = [];
    if (model) {
      for (const s of model.shapes) {
        if (isHidden(model, s) || s.id === opts.exclude || (ex && ex.has(s.id))) continue;
        for (const p of vertices(s)) tryPt(p, 'end');
        for (const e of edges(s)) { tryPt(V.lerp(e.a, e.b, 0.5), 'mid', V.norm(V.sub(e.b, e.a))); segs.push([e.a, e.b]); }
      }
      for (const l of model.lines) { if (isHidden(model, l) || (ex && ex.has('l' + l.id))) continue; tryPt(l.a, 'end'); tryPt(l.b, 'end'); tryPt(V.lerp(l.a, l.b, 0.5), 'mid', V.norm(V.sub(l.b, l.a))); segs.push([l.a, l.b]); }
      // prowadnice: przyklejanie do nich i do ich przecięć z innymi prowadnicami i krawędziami
      const gs = (model.guides || []).filter(g => !(ex && ex.has('g' + g.id))).map(g => [V.sub(g.o, V.mul(g.d, 400)), V.add(g.o, V.mul(g.d, 400)), g]);
      const nModel = segs.length;
      for (let i = 0; i < gs.length; i++) {
        const [a, b, g] = gs[i];
        for (let j = i + 1; j < gs.length; j++) { const q = closestLines(g.o, g.d, gs[j][2].o, gs[j][2].d); if (q && q.gap < 1e-4) tryPt(q.p, 'cross'); }
        for (let j = 0; j < nModel && j < 4000; j++) {
          const [c, d] = segs[j], L = V.dist(c, d); if (L < 1e-9) continue;
          const dir = V.mul(V.sub(d, c), 1 / L), q = closestLines(g.o, g.d, c, dir);
          if (q && q.gap < 1e-4 && q.t > -1e-6 && q.t < L + 1e-6) tryPt(q.p, 'cross');
        }
        segs.push([a, b]);
      }
    }
    for (const [a, b] of this.underNear(x, y)) { tryPt(a, 'end'); tryPt(b, 'end'); tryPt(V.lerp(a, b, 0.5), 'mid'); segs.push([a, b]); }
    tryPt([0, 0, 0], 'end');
    if (opts.extraPoints) for (const p of opts.extraPoints) tryPt(p, 'end');

    // krawędzie wychodzące z punktu pod kursorem (albo ta, której to środek) też stają się odniesieniem
    if (best && (best.type === 'end' || best.type === 'mid')) {
      let k = 0;
      for (const [a, b] of segs) { if (k >= 2) break; if (V.dist(a, best.p) < 1e-6 || V.dist(b, best.p) < 1e-6 || V.dist(V.lerp(a, b, 0.5), best.p) < 1e-6) { this.touch(a, b); k++; } }
    }
    const label = { end: 'Punkt końcowy', mid: 'Środek', cross: 'Przecięcie' };
    // krawędź pod kursorem i ściana pod kursorem — także dla narzędzi związanych z prostą, płaszczyzną albo osią
    const edgeNear = () => {
      let eb = null;
      for (const [a, b] of segs) {
        const L = V.dist(a, b); if (L < 1e-9) continue;
        const r = v.onLine(x, y, a, V.sub(b, a)); if (!r) continue;
        const t = Math.max(0, Math.min(L, r.t));
        const p = V.add(a, V.mul(V.norm(V.sub(b, a)), t));
        const d = d2(p);
        if (d < R_EDGE && (!eb || d < eb.d)) eb = { p, d, dir: V.norm(V.sub(b, a)), a, b };
      }
      if (eb) this.touch(eb.a, eb.b);
      return eb;
    };
    let ebMemo; const eNear = () => ebMemo === undefined ? (ebMemo = edgeNear()) : ebMemo;
    // ściana innej bryły niż ta, którą właśnie zmieniasz
    // (liczy się tylko bryła, która istniała przed rozpoczęciem operacji — nie jej świeża kopia ani bryła-gospodarz)
    const faceHit = () => {
      const h = v.pick(x, y); if (!h || !model) return null;
      const id = h.shapeId;
      return model.shapes.some(s => s.id === id) && id !== opts.exclude && !(ex && ex.has(id)) && !(opts.noFace && opts.noFace.has(id)) ? h : null;
    };

    // ograniczenie do prostej (push/pull): punkt rzutujemy na prostą
    if (opts.line) {
      const { o, d } = opts.line;
      const fin = r => opts.viaLock ? { ...r, label: r.label ? 'Linia śledzenia · ' + r.label.toLowerCase() : 'Na linii śledzenia', gline: opts.line, locked: true, color: REF_COLOR } : r;
      if (best) {
        this.remember(best.p);
        const t = V.dot(V.sub(best.p, o), d);
        const p = V.add(o, V.mul(d, t));
        return fin({ p, t, type: 'from', label: V.dist(p, best.p) < 1e-6 ? label[best.type] : 'Od punktu', guide: V.dist(p, best.p) < 1e-6 ? null : [best.p, p], ref: best.p, refType: best.type });
      }
      // krawędź albo ściana pod kursorem: wyrównanie do niej (np. wypchnięcie do wysokości sąsiedniej bryły)
      const eb = edgeNear(), fh = eb ? null : faceHit(), ref = eb ? eb.p : fh ? fh.point : null;
      if (ref) {
        const t = V.dot(V.sub(ref, o), d), p = V.add(o, V.mul(d, t)), on = V.dist(p, ref) < 1e-6;
        return fin({ p, t, type: 'from', label: eb ? (on ? 'Na krawędzi' : 'Od krawędzi') : (on ? 'Na ścianie' : 'Od ściany'), guide: on ? null : [ref, p], ref });
      }
      const r = v.onLine(x, y, o, d);
      if (!r) return null;
      return fin({ p: r.p, t: r.t, type: opts.viaLock ? 'from' : 'free', label: '' });
    }

    // ograniczenie do płaszczyzny (drugi narożnik prostokąta)
    if (opts.plane) {
      const { o, n } = opts.plane;
      if (best) {
        this.remember(best.p);
        const off = V.dot(V.sub(best.p, o), n);
        const p = V.sub(best.p, V.mul(n, off));
        const on = Math.abs(off) < 1e-6;
        return { p, type: on ? best.type : 'from', label: on ? label[best.type] : 'Od punktu', guide: on ? null : [best.p, p], ref: best.p };
      }
      // krawędź pod kursorem: punkt na niej, zrzutowany na płaszczyznę rysowania
      const eb = edgeNear();
      if (eb) {
        const off = V.dot(V.sub(eb.p, o), n), p = V.sub(eb.p, V.mul(n, off)), on = Math.abs(off) < 1e-6;
        return { p, type: on ? 'edge' : 'from', label: on ? 'Na krawędzi' : 'Od krawędzi', guide: on ? null : [eb.p, p], ref: eb.p, dir: eb.dir };
      }
      const p = v.onPlane(x, y, o, n);
      if (!p) return null;
      // linie śledzenia leżące w płaszczyźnie rysowania: kursor przykleja się do najbliższej albo do przecięcia dwóch
      const near = [];
      for (const g of this.guideLines(opts.plane)) {
        const q = V.add(g.o, V.mul(g.d, V.dot(V.sub(p, g.o), g.d))), dd = d2(q);
        if (dd < R_EDGE) near.push({ g, q, dd });
      }
      near.sort((a, b) => a.dd - b.dd);
      if (near.length > 1) for (const b of near.slice(1)) {
        const c = closestLines(near[0].g.o, near[0].g.d, b.g.o, b.g.d);
        if (c && c.gap < 1e-4 && d2(c.p) < R_END) return { p: c.p, type: 'cross', label: 'Przecięcie linii śledzenia', guide: [near[0].g.from, c.p], guideColor: near[0].g.color };
      }
      if (near.length) { const { g, q } = near[0]; return { p: q, type: 'from', label: g.label, guide: [V.dist(g.from, q) > V.dist(g.to, q) ? g.to : g.from, q], guideColor: g.color, gline: { o: g.o, d: g.d } }; }
      return { p, type: 'free', label: '' };
    }

    // blokada osi strzałką (albo Shift): wszystko rzutujemy na tę oś
    // lockDir — dowolny kierunek zatrzymany Shiftem (np. wzdłuż krawędzi), jak blokada inferencji w SketchUpie
    if (opts.anchor && (opts.lockAxis || opts.lockDir)) {
      const ax = opts.lockDir ? undefined : opts.lockAxis, a = opts.lockDir || AXES[ax], o = opts.anchor, name = ax ? AXIS_NAME[ax] : 'Zablokowany kierunek';
      if (best) {
        this.remember(best.p);
        const p = V.add(o, V.mul(a, V.dot(V.sub(best.p, o), a)));
        return { p, type: 'axis', axis: ax, label: name, guide: V.dist(p, best.p) > 1e-6 ? [best.p, p] : null, locked: true };
      }
      // przy zablokowanej osi krawędź albo ściana pod kursorem wyznacza, jak daleko po tej osi
      const eb = edgeNear(), fh = eb ? null : faceHit(), ref = eb ? eb.p : fh ? fh.point : null;
      if (ref) {
        const p = V.add(o, V.mul(a, V.dot(V.sub(ref, o), a)));
        return { p, type: 'axis', axis: ax, label: eb ? 'Od krawędzi' : 'Od ściany', guide: V.dist(p, ref) > 1e-6 ? [ref, p] : null, locked: true };
      }
      const r = v.onLine(x, y, o, a);
      if (r) return { p: r.p, type: 'axis', axis: ax, label: name, locked: true };
    }

    if (best) { this.remember(best.p); return { p: best.p, type: best.type, label: label[best.type], dir: best.dir }; }

    // 2. osie od punktu początkowego i wyrównania „od punktu”
    if (opts.anchor) {
      const o = opts.anchor;
      let ax = null;
      for (const [name, a] of Object.entries(AXES)) {
        const r = v.onLine(x, y, o, a); if (!r) continue;
        const d = d2(r.p);
        if (d < R_AXIS && (!ax || d < ax.d)) ax = { p: r.p, d, name };
        // przecięcie osi od punktu początkowego z osią od zapamiętanego punktu
        for (const T of this.tracking) {
          if (V.dist(T, o) < 1e-6) continue;
          for (const [nb, b] of Object.entries(AXES)) {
            if (nb === name) continue;
            const q = closestLines(o, a, T, b); if (!q || q.gap > 1e-4) continue;
            const dq = d2(q.p);
            if (dq < R_AXIS) return { p: q.p, type: 'from', axis: name, label: 'Od punktu', guide: [T, q.p], guideColor: AXIS_COLOR[nb] };
          }
        }
      }
      // oś od punktu początkowego przecięta z linią śledzenia (przedłużeniem krawędzi)
      if (ax) for (const r of this.refs) {
        const q = closestLines(o, AXES[ax.name], r.a, r.dir);
        if (q && q.gap < 1e-4 && V.dist(q.p, o) > 1e-6 && d2(q.p) < R_END) return { p: q.p, type: 'cross', axis: ax.name, label: 'Przecięcie z linią śledzenia', guide: [q.t < 0 ? r.a : r.b, q.p], guideColor: REF_COLOR };
      }
      if (ax) return { p: ax.p, type: 'axis', axis: ax.name, label: AXIS_NAME[ax.name] };

      // 2b. równolegle albo prostopadle do krawędzi: tej, nad którą był kursor, i tych, które wychodzą z punktu początkowego
      const refs = this.refs.slice();
      for (const [a, b] of segs) { if (refs.length > 8) break; if (V.dist(a, o) < 1e-6 || V.dist(b, o) < 1e-6) { const L = V.dist(a, b); if (L > 1e-6) refs.push({ a, b, dir: V.mul(V.sub(b, a), 1 / L), own: true }); } }
      let rb = null;
      // punkt na krawędzi pod kursorem ma pierwszeństwo przed kierunkiem (i przy okazji ta krawędź staje się odniesieniem)
      for (const r of eNear() ? [] : refs) {
        if (Object.values(AXES).some(a => Math.abs(Math.abs(V.dot(a, r.dir)) - 1) < 1e-4)) continue;   // to już załatwiają osie
        const perp = [], h = V.cross(r.dir, [0, 0, 1]);
        if (V.len(h) > 1e-4) { perp.push(V.norm(h)); perp.push(V.norm(V.cross(r.dir, h))); }
        for (const [c, kind] of [[r.dir, 'par'], ...perp.map(q => [q, 'perp'])]) {
          if (kind === 'par' && r.own) continue;   // przedłużanie własnej krawędzi to nie „równolegle”
          const q = v.onLine(x, y, o, c); if (!q || V.dist(q.p, o) < 1e-6) continue;
          const d = d2(q.p);
          if (d < R_AXIS && (!rb || d < rb.d)) rb = { p: q.p, d, kind, r, dir: c };
        }
      }
      if (rb) return { p: rb.p, type: 'ref', color: REF_COLOR, label: rb.kind === 'par' ? 'Równolegle do krawędzi' : 'Prostopadle do krawędzi', hl: [rb.r.a, rb.r.b], dir: rb.dir };
    }

    // 2c. przedłużenie krawędzi, nad którą był kursor; wyrównanie „od punktu” wzdłuż osi także bez punktu początkowego
    for (const r of eNear() ? [] : this.refs) {
      const L = V.dist(r.a, r.b), q = v.onLine(x, y, r.a, r.dir); if (!q || (q.t > -1e-6 && q.t < L + 1e-6)) continue;
      if (d2(q.p) < R_EDGE) return { p: q.p, type: 'from', label: 'Przedłużenie krawędzi', guide: [q.t < 0 ? r.a : r.b, q.p], guideColor: REF_COLOR, gline: { o: r.a, d: r.dir } };
    }
    {
      let tb = null;
      for (const T of this.tracking) {
        if (opts.anchor && V.dist(T, opts.anchor) < 1e-6) continue;
        for (const [name, a] of Object.entries(AXES)) {
          const q = v.onLine(x, y, T, a); if (!q || Math.abs(q.t) < 1e-6) continue;
          const d = d2(q.p), far = d2(T);
          if (d < R_AXIS * 0.6 && far > 2 * R_END && (!tb || d < tb.d)) tb = { p: q.p, d, T, name };
        }
      }
      if (tb && !eNear()) return { p: tb.p, type: 'from', label: 'Od punktu', guide: [tb.T, tb.p], guideColor: AXIS_COLOR[tb.name], gline: { o: tb.T, d: AXES[tb.name] } };
    }

    // 3. krawędzie
    const eb = eNear();
    // ściana pod kursorem
    const hit = v.pick(x, y);
    if (eb) return { p: eb.p, type: 'edge', label: 'Na krawędzi', face: hit, dir: eb.dir };
    if (hit) return { p: hit.point, type: 'face', label: 'Na ścianie', face: hit };

    // 4. ziemia
    const g = v.onPlane(x, y, [0, 0, 0], [0, 0, 1]);
    if (g) return { p: g, type: 'ground', label: '' };
    return null;
  }
}

// najbliższe punkty dwóch prostych (o1 + s·d1, o2 + t·d2)
export function closestLines(o1, d1, o2, d2) {
  const w = V.sub(o1, o2), a = V.dot(d1, d1), b = V.dot(d1, d2), c = V.dot(d2, d2), d = V.dot(d1, w), e = V.dot(d2, w);
  const den = a * c - b * b; if (Math.abs(den) < 1e-12) return null;
  const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
  const p = V.add(o1, V.mul(d1, s)), q = V.add(o2, V.mul(d2, t));
  return { p, q, gap: V.dist(p, q), s, t };
}
