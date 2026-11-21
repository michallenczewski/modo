// Narzędzia: zaznacz, linia, prostokąt, wypchnij/wciśnij, wiaderko, orbita, przesuń widok, powiększ.
// Każde narzędzie dostaje zdarzenia z okna (lewy przycisk; środkowy i kółko obsługuje nawigacja w app.js),
// rysuje swoje pomoce na nakładce 2D i może przyjmować wymiary wpisane z klawiatury.

import { V, makeShape, pushPull, extrudeFace, faceFromLoop, faceByKey, cloneModel, closeLoop, circlePts, CIRCLE_SEGMENTS, translateShape, translateLine, translateGuide, rotateShape, rotateLine, rotateGuide, scaleShape, scalePoint, vertices, hostFace, duplicateIds, groupsWhollyIn, transformFrame, rotVec, splitByLine, toMesh, faces as facesOf, offsetPolygon, facePlane, insideDistance, edges as shapeEdges, removeIds, isHidden } from './model.js';
import { pickAnnotation, drawAnnotations } from './annot.js';
import { AXIS_COLOR, AXES } from './snap.js';
import { moveMeshPoints, booleanMesh, isMesh, transformMesh } from './mesh.js';
import { parseLength, parseLengths, fmtLength, fmtNum } from './units.js';

const INK = '#1a1a19', INK_DARK = '#e9e9e7', BLUE = '#3f5f99';

/* ---------- rysowanie pomocy na nakładce ---------- */
export function drawSeg(c, v, a, b, color = INK, { width = 1.5, dash = null } = {}) {
  const A = v.toScreen(a), B = v.toScreen(b);
  if (A.behind || B.behind) return;
  // w trybie ciemnym kreska podglądu jest jasna — ciemnej na ciemnym tle nie widać
  if (color === INK && v.dark) color = INK_DARK;
  c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); c.restore();
}
export function drawMarker(c, v, s) {
  if (!s) return;
  const P = v.toScreen(s.p); if (P.behind) return;
  c.save(); c.lineWidth = 1.4;
  const col = s.type === 'end' || s.type === 'cross' ? '#4f8a46' : s.type === 'mid' ? '#2f8c8c' : s.type === 'edge' ? '#c0533f' : s.type === 'face' ? BLUE : s.axis ? AXIS_COLOR[s.axis] : BLUE;
  c.strokeStyle = col; c.fillStyle = '#fff';
  c.beginPath();
  if (s.type === 'end' || s.type === 'from') c.arc(P.x, P.y, 4.5, 0, Math.PI * 2);
  else if (s.type === 'cross') { c.moveTo(P.x - 4, P.y - 4); c.lineTo(P.x + 4, P.y + 4); c.moveTo(P.x + 4, P.y - 4); c.lineTo(P.x - 4, P.y + 4); }
  else if (s.type === 'mid') { c.moveTo(P.x, P.y - 5); c.lineTo(P.x + 5, P.y); c.lineTo(P.x, P.y + 5); c.lineTo(P.x - 5, P.y); c.closePath(); }
  else if (s.type === 'edge') { c.rect(P.x - 3.5, P.y - 3.5, 7, 7); }
  else if (s.type === 'face') { c.moveTo(P.x - 4, P.y + 3); c.lineTo(P.x + 4, P.y + 3); c.lineTo(P.x, P.y - 4); c.closePath(); }
  else { c.arc(P.x, P.y, 2.5, 0, Math.PI * 2); }
  c.fill(); c.stroke(); c.restore();
  if (s.guide) {
    drawSeg(c, v, s.guide[0], s.guide[1], s.guideColor || BLUE, { width: 1.2, dash: [1.5, 4] });
    const R = v.toScreen(s.guide[0]);
    if (!R.behind) { c.save(); c.fillStyle = '#fff'; c.strokeStyle = BLUE; c.lineWidth = 1.2; c.beginPath(); c.arc(R.x, R.y, 3.5, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore(); }
  }
}
export function drawChip(c, x, y, text, color = BLUE) {
  if (!text) return;
  c.save();
  c.font = '11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const w = c.measureText(text).width + 16, h = 22;
  const X = Math.min(x + 18, c.canvas.width / (window.devicePixelRatio || 1) - w - 4), Y = y + 16;
  const dark = document.documentElement.dataset.theme === 'dark';
  c.fillStyle = dark ? 'rgba(40,40,39,.96)' : 'rgba(255,255,255,.96)'; c.strokeStyle = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)';
  if (dark && (color === BLUE || color === '#4a4945')) color = color === BLUE ? '#9fb3d6' : '#c4c4c1';
  c.beginPath(); c.roundRect(X, Y, w, h, 6); c.fill(); c.stroke();
  c.fillStyle = color; c.fillText(text, X + 8, Y + 15);
  c.restore();
}

/* ---------- baza ---------- */
class Tool {
  constructor(app) { this.app = app; }
  get v() { return this.app.viewer; }
  get model() { return this.app.model; }
  activate() { this.reset(); }
  deactivate() { this.reset(); this.v.setHoverFace(null); }
  reset() {}
  down() {} move() {} up() {} dbl() {}
  key() { return false; }
  value() { return false; }
  cancel() { this.reset(); this.app.refresh(); }
  draw() {}
  hint() { return ''; }
  vcb() { return null; }
}

/* ---------- zaznacz ---------- */
export class SelectTool extends Tool {
  hint() { return 'Klik zaznacza ścianę albo krawędź bryły, linię albo całą grupę; <kbd>⇧</kbd> dodaje. Dwuklik zaznacza całą bryłę, a w grupie — wchodzi do środka. Ramka w prawo zaznacza to, co w całości w środku, w lewo — wszystko, czego dotknie. Prawy klik — menu.'; }
  // bryła luzem (nie w grupie, nie wycięcie, nie figura 2D): jej ściany i krawędzie zaznacza się osobno
  loose(id) {
    const s = this.model.shapes.find(q => q.id === id);
    return !!s && !s.bill && s.op !== 'cut' && !s.locked && !this.app.groupAt(id) && (!this.app.editing || this.app.inEditing(id));
  }
  // ściana albo krawędź pod kursorem: { id bryły, kind, pts — punkty do przesunięcia, polys | a, b }
  subAt(id, x, y) {
    const e = edgeAt(this.app, x, y);
    if (e && e.shape && e.edge && (id == null || id === e.id) && this.loose(e.id)) return { id: e.id, kind: 'edge', a: e.edge.a.slice(), b: e.edge.b.slice(), pts: [e.edge.a.slice(), e.edge.b.slice()] };
    if (typeof id !== 'number' || !this.loose(id)) return null;
    const s = this.model.shapes.find(q => q.id === id), hit = this.v.pick(x, y);
    if (!hit || hit.shapeId !== id) return null;
    const f = faceByKey(s, hit.key); if (!f) return null;
    const polys = (f.region || [f.verts]).map(p => p.map(q => q.slice())), pts = [];
    for (const p of polys) for (const q of p) if (!pts.some(r => V.dist(r, q) < 1e-5)) pts.push(q.slice());
    return { id, kind: 'face', key: hit.key, polys, pts };
  }
  pickAny(x, y) { return pickEntity(this.app, x, y); }
  move(e, x, y) {
    if (this.drag(x, y)) return;
    const id = this.pickAny(x, y);
    if (id !== this.hoverId) {
      this.hoverId = id;
      hoverShape(this.app, x, y, id);
    }
  }
  reset() { this.box = null; }
  // przycisk w dół zapamiętuje miejsce; przeciągnięcie rysuje ramkę (także zaczęte na bryle), zwykły klik zaznacza przy puszczeniu
  down(e, x, y) { this.box = { x0: x, y0: y, x1: x, y1: y, add: e.shiftKey, id: this.pickAny(x, y) }; }
  click(id, shift, x, y) {
    const sel = this.app.selection;
    const sub = x == null ? null : this.subAt(id, x, y);
    if (sub && id == null) id = sub.id;
    if (this.app.editSolid != null && id !== this.app.editSolid) this.app.exitSolid();
    while (this.app.editing && (id == null || !this.app.inEditing(id))) this.app.exitGroup();
    if (sub) {
      // ta sama ściana albo krawędź kliknięta z ⇧ wypada z zaznaczenia
      const same = q => q.id === sub.id && q.kind === sub.kind && (sub.kind === 'face' ? q.key === sub.key : V.dist(q.a, sub.a) < 1e-6 && V.dist(q.b, sub.b) < 1e-6);
      const had = this.app.sub.some(same);
      sel.clear();
      this.app.sub = shift ? (had ? this.app.sub.filter(q => !same(q)) : [...this.app.sub, sub]) : [sub];
      this.app.selectionChanged(); return;
    }
    if (!shift || id != null) this.app.sub = [];
    const ids = id == null ? [] : this.app.expand(id);
    if (id == null) { if (!shift) sel.clear(); }
    else if (shift) { const on = sel.has(id); ids.forEach(i => on ? sel.delete(i) : sel.add(i)); }
    else { sel.clear(); ids.forEach(i => sel.add(i)); }
    this.app.selectionChanged();
  }
  drag(x, y) { if (this.box) { this.box.x1 = x; this.box.y1 = y; return true; } return false; }
  up(e, x, y) {
    const b = this.box; if (!b) return; this.box = null;
    const sel = this.app.selection;
    if (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 4) return this.click(b.id, b.add, b.x0, b.y0);
    this.app.sub = [];
    // od lewej do prawej: tylko to, co w całości w ramce; od prawej do lewej: wszystko, czego ramka dotyka
    const window_ = b.x1 >= b.x0, hits = boxSelect(this.app, b, window_);
    if (!b.add) sel.clear();
    hits.forEach(i => sel.add(i));
    this.app.selectionChanged();
  }
  draw(c) {
    const b = this.box; if (!b || Math.hypot(b.x1 - b.x0, b.y1 - b.y0) < 4) return;
    const crossing = b.x1 < b.x0, dark = this.app.viewer.dark;
    c.save();
    c.fillStyle = dark ? 'rgba(150,170,210,0.10)' : 'rgba(63,95,153,0.06)';
    c.strokeStyle = dark ? '#9fb4dc' : '#3f5f99'; c.lineWidth = 1;
    if (crossing) c.setLineDash([5, 4]);
    const x = Math.min(b.x0, b.x1) + 0.5, y = Math.min(b.y0, b.y1) + 0.5, w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h);
    c.restore();
  }
  // dwuklik w grupę albo komponent: edycja w środku
  dbl(e, x, y) {
    const id = this.pickAny(x, y); if (id == null) return;
    if (typeof id === 'string' && id[0] === 't') { const t = this.model.texts.find(q => 't' + q.id === id); if (t) this.app.editText(t, false); return; }
    const g = this.app.groupAt(id);   // grupa wprost w edytowanej — dwuklik schodzi o jeden poziom
    if (g) this.app.enterGroup(g.id);
    else if (typeof id === 'number') {
      // dwuklik w bryłę zaznacza ją całą (edycja bryły: Enter albo menu podręczne)
      this.app.sub = []; this.app.selection.clear(); this.app.expand(id).forEach(i => this.app.selection.add(i)); this.app.selectionChanged();
    }
  }
}

/* ---------- linia ---------- */
export class LineTool extends Tool {
  reset() { this.anchor = null; this.chain = []; this.ids = []; this.cur = null; }
  hint() {
    return this.anchor
      ? 'Kliknij następny punkt albo wpisz długość i <kbd>Enter</kbd>. Strzałki blokują oś: <kbd>→</kbd> czerwona, <kbd>←</kbd> zielona, <kbd>↑</kbd> niebieska. <kbd>Esc</kbd> kończy.'
      : 'Kliknij punkt początkowy linii. Zamknięty obrys tworzy ścianę.';
  }
  vcb() { return { label: 'Długość', value: this.anchor && this.cur ? fmtLength(V.dist(this.anchor, this.cur.p)) : '' }; }
  move(e, x, y) {
    this.cur = this.app.snapper.find(x, y, { model: this.model, anchor: this.anchor, lockAxis: this.app.lockAxis, extraPoints: this.chain.length > 2 ? [this.chain[0]] : null });
  }
  down(e, x, y) {
    if (!this.cur) return;
    const p = this.cur.p.slice();
    if (!this.anchor) { this.anchor = p; this.chain = [p]; this.ids = []; return; }
    this.add(p);
  }
  add(p) {
    if (V.dist(this.anchor, p) < 1e-6) return;
    this.app.checkpoint();
    // w edycji bryły linia po jej ścianie dzieli ścianę (jak w SketchUpie)
    if (this.app.editSolid != null) {
      const sh = this.model.shapes.find(q => q.id === this.app.editSolid);
      if (sh && splitByLine(this.model, sh, this.anchor, p)) { this.chain.push(p); this.anchor = p.slice(); this.app.lockAxis = null; this.app.changed(); return; }
    }
    const l = { id: this.model.next++, a: this.anchor.slice(), b: p.slice() };
    this.model.lines.push(l);
    this.ids.push(l.id); this.chain.push(p);
    // zamknięty obrys w jednej płaszczyźnie (także z innymi liniami i łukami) → ściana
    if (closeLoop(this.model, l)) { this.app.changed(); this.reset(); this.app.lockAxis = null; return; }
    this.anchor = p.slice();
    this.app.lockAxis = null;
    this.app.changed();
  }
  value(str) {
    const L = parseLength(str); if (L == null || !this.anchor || !this.cur) return false;
    const d = V.sub(this.cur.p, this.anchor); if (V.len(d) < 1e-9) return false;
    this.add(V.add(this.anchor, V.mul(V.norm(d), L)));
    return true;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.anchor) drawSeg(c, v, this.anchor, s.p, s.axis ? AXIS_COLOR[s.axis] : INK, { width: s.axis ? 2 : 1.6 });
    drawMarker(c, v, s);
    const P = v.toScreen(s.p); drawChip(c, P.x, P.y, s.label, s.axis ? AXIS_COLOR[s.axis] : BLUE);
  }
}

/* ---------- prostokąt ---------- */
export class RectTool extends Tool {
  reset() { this.p0 = null; this.plane = null; this.cur = null; }
  hint() { return this.p0 ? 'Kliknij przeciwległy narożnik albo wpisz wymiary, np. <kbd>6;4</kbd>, i <kbd>Enter</kbd>.' : 'Kliknij pierwszy narożnik — na ziemi albo na ścianie bryły.'; }
  dims() {
    if (!this.p0 || !this.cur) return null;
    const d = V.sub(this.cur.p, this.p0);
    return [V.dot(d, this.plane.u), V.dot(d, this.plane.v)];
  }
  vcb() {
    const d = this.dims() || (this.lastValid() ? [this.last.a, this.last.b] : null);
    return { label: 'Wymiary', value: d ? fmtNum(Math.abs(d[0])) + '; ' + fmtLength(Math.abs(d[1])) : '' };
  }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  move(e, x, y) {
    this.cur = this.p0 ? this.app.snapper.find(x, y, { model: this.model, plane: this.plane }) : this.app.snapper.find(x, y, { model: this.model });
  }
  down(e, x, y) {
    if (!this.cur) return;
    if (!this.p0) {
      const s = this.cur, p0 = s.p.slice();
      let n = [0, 0, 1];
      if (s.face && (s.type === 'face' || s.type === 'edge' || s.type === 'end' || s.type === 'mid')) {
        const sh = this.model.shapes.find(q => q.id === s.face.shapeId);
        const f = sh && faceByKey(sh, s.face.key);
        if (f && Math.abs(V.dot(V.sub(p0, f.verts[0]), f.normal)) < 1e-4) n = f.normal;
      }
      let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n));
      u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
      const vv = V.cross(n, u);
      this.p0 = p0; this.plane = { o: p0, n, u, v: vv };
      return;
    }
    const d = this.dims(); if (d) this.create(d[0], d[1]);
  }
  create(a, b) {
    if (Math.abs(a) < 1e-6 || Math.abs(b) < 1e-6) return;
    this.app.checkpoint();
    makeShape(this.model, { o: this.p0, u: this.plane.u, v: this.plane.v }, [[0, 0], [a, 0], [a, b], [0, b]], 0);
    this.app.changed();
    // zapamiętujemy, żeby po narysowaniu dało się jeszcze wpisać wymiary (jak w SketchUpie)
    this.last = { p0: this.p0, plane: this.plane, a, b, seq: this.app.opSeq };
    this.reset();
  }
  value(str) {
    const L = parseLengths(str); if (!L) return false;
    // po narysowaniu: wpisane wymiary poprawiają ostatni prostokąt
    if (!this.p0 && this.lastValid() && this.app.revertLast()) { const l = this.last; this.p0 = l.p0; this.plane = l.plane; this.cur = { p: V.add(V.add(l.p0, V.mul(l.plane.u, l.a)), V.mul(l.plane.v, l.b)) }; }
    if (!this.p0) return false;
    const d = this.dims() || [1, 1];
    const a = L[0] * (Math.sign(d[0]) || 1), b = (L[1] ?? L[0]) * (Math.sign(d[1]) || 1);
    this.create(a, b); return true;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    const d = this.dims();
    if (d) {
      const { u, v: w } = this.plane, o = this.p0;
      const q = [o, V.add(o, V.mul(u, d[0])), V.add(V.add(o, V.mul(u, d[0])), V.mul(w, d[1])), V.add(o, V.mul(w, d[1]))];
      for (let i = 0; i < 4; i++) drawSeg(c, v, q[i], q[(i + 1) % 4], INK, { width: 1.6 });
    }
    drawMarker(c, v, s);
    const P = v.toScreen(s.p);
    drawChip(c, P.x, P.y, d ? fmtNum(Math.abs(d[0])) + ' × ' + fmtLength(Math.abs(d[1])) : s.label);
  }
}

/* ---------- wypchnij / wciśnij ---------- */
export class PushTool extends Tool {
  reset() { this.active = null; this.cur = null; this.hit = null; this.downAt = null; }
  hint() {
    const mod = this.app.isMac ? '⌥' : 'Ctrl';
    return this.active
      ? `Przesuń i kliknij albo wpisz odległość i <kbd>Enter</kbd>. Wskaż inny punkt, żeby wyrównać wysokość. <kbd>${mod}</kbd> — ${this.copy ? '<b>włączone: nowa bryła, istniejące krawędzie zostają</b>' : 'nowa bryła, istniejące krawędzie zostają'}.`
      : `Kliknij ścianę i przesuń, żeby wypchnąć. Ścianka narysowana na bryle zmienia tę bryłę: wyciągnięta staje się jej częścią, wciśnięta wycina w niej otwór albo wnękę. Po zakończeniu możesz wpisać odległość. Dwuklik powtarza ostatnią. <kbd>${mod}</kbd> — ${this.copy ? '<b>włączone: nowa bryła</b>' : 'nowa bryła, krawędzie zostają'}.`;
  }
  vcb() { return { label: 'Odległość', value: this.active ? fmtLength(this.dist || 0) : this.lastValid() ? fmtLength(this.last.dist) : '' }; }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  shapeOf(id, m = this.model) { return m.shapes.find(s => s.id === id); }
  move(e, x, y) {
    this.mx = x; this.my = y;
    if (!this.active) {
      const hit = this.v.pick(x, y);
      this.hit = hit;
      const s = hit && this.shapeOf(hit.shapeId);
      this.v.setHoverFace(s ? faceByKey(s, hit.key)?.verts : null);
      return;
    }
    const A = this.active;
    this.cur = this.app.snapper.find(x, y, { model: A.start, line: { o: A.o, d: A.d }, exclude: A.shapeId, noFace: A.host ? new Set([A.host.shape.id]) : null });
    if (!this.cur) return;
    this.dist = V.dot(V.sub(this.cur.p, A.o), A.d);
    this.apply(this.dist);
  }
  apply(d) {
    const A = this.active, m = cloneModel(A.start);
    const s = this.shapeOf(A.shapeId, m);
    const k = A.flip ? -d : d;   // płaska ściana oglądana od spodu: ciągniemy przeciwnie do jej normalnej
    let target = null;
    if (this.copy) target = extrudeFace(m, s, A.key, k);
    else if (A.host && this.shapeOf(A.host.shape.id, m)) {
      // ścianka narysowana na bryle zmienia tę bryłę (jak w SketchUpie): wyciągnięta staje się jej częścią, wciśnięta wycina w niej
      const host = this.shapeOf(A.host.shape.id, m), inward = V.dot(V.mul(A.d, d), A.host.normal) < 0;
      pushPull(s, A.key, k);
      if (s.h > 1e-7) {
        const part = toMesh(JSON.parse(JSON.stringify(s)), facesOf);
        toMesh(host, facesOf);
        booleanMesh(host, part, inward ? 'subtract' : 'union');
        m.shapes = m.shapes.filter(q => q !== s && (q !== host || host.polys.length));
      }
    }
    else { pushPull(s, A.key, k); target = s; }
    this.app.setModelLive(m);
    const nk = this.copy ? 'top' : (A.key === 'face' ? (k >= 0 ? 'top' : 'bottom') : A.key);
    const f = target && faceByKey(target, target.h === 0 ? 'face' : nk);
    this.v.setHoverFace(f ? f.verts : null);
  }
  start(x, y) {
    const hit = this.hit || this.v.pick(x, y); if (!hit) return false;
    const s = this.shapeOf(hit.shapeId); const f = s && faceByKey(s, hit.key); if (!f) return false;
    let d = f.normal;
    // płaska ściana: ciągniemy w stronę, z której patrzymy
    if (s.h === 0 && V.dot(d, V.sub(this.v.cam.position.toArray(), hit.point)) < 0) d = V.mul(d, -1);
    this.active = { shapeId: s.id, key: hit.key, o: hit.point, d, start: cloneModel(this.model), flip: d !== f.normal, host: s.h === 0 ? hostFace(this.model, s) : null };
    this.dist = 0;
    return true;
  }
  down(e, x, y) {
    if (!this.active) { if (this.start(x, y)) this.downAt = { x, y }; return; }
    this.finish();
  }
  up(e, x, y) {
    // przeciągnięcie zamiast dwóch kliknięć
    if (this.active && this.downAt && Math.hypot(x - this.downAt.x, y - this.downAt.y) > 6) this.finish();
    this.downAt = null;
  }
  finish(dist = this.dist) {
    const A = this.active; if (!A) return;
    if (Math.abs(dist) < 1e-6) { this.app.setModelLive(A.start); this.reset(); this.app.refresh(); return; }
    if (dist !== this.dist) this.apply(dist);
    this.app.commitLive(A.start);
    this.app.lastPush = dist;
    // zapamiętujemy, żeby po zakończeniu dało się jeszcze wpisać odległość (jak w SketchUpie)
    this.last = { ...A, dist, copy: this.copy, seq: this.app.opSeq };
    this.reset();
    this.v.setHoverFace(null);
  }
  value(str) {
    const L = parseLength(str); if (L == null) return false;
    // wpisana odległość idzie w stronę, w którą ciągniesz (jak w SketchUpie); minus ją odwraca
    if (this.active) { const d = L * (Math.sign(this.dist) || 1); this.dist = d; this.apply(d); this.finish(d); return true; }
    // po zakończeniu: wpisana odległość poprawia ostatnie wypchnięcie
    if (this.lastValid() && this.app.revertLast()) {
      const keep = this.copy; this.copy = this.last.copy;
      const d = L * (Math.sign(this.last.dist) || 1);
      this.active = { ...this.last }; this.dist = d; this.apply(d); this.finish(d);
      this.copy = keep; return true;
    }
    return false;
  }
  dbl(e, x, y) {
    if (this.app.lastPush == null) return;
    this.reset();
    this.hit = this.v.pick(x, y);
    if (!this.start(x, y)) return;
    const d = this.app.lastPush;
    this.dist = d; this.apply(d); this.finish(d);
  }
  key(e) {
    if ((this.app.isMac && e.key === 'Alt') || (!this.app.isMac && e.key === 'Control')) {
      this.copy = !this.copy;
      if (this.active) this.apply(this.dist || 0);
      this.app.updateHint(); return true;
    }
    return false;
  }
  cancel() {
    if (this.active) this.app.setModelLive(this.active.start);
    super.cancel();
  }
  draw(c, v) {
    // tryb „nowa bryła” (Ctrl / ⌥): plus przy kursorze, jak w SketchUpie
    if (this.copy && this.mx != null) {
      c.save(); c.strokeStyle = v.dark ? INK_DARK : INK; c.lineWidth = 1.6; c.lineCap = 'round';
      const x = this.mx + 14, y = this.my - 12;
      c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.moveTo(x, y - 4); c.lineTo(x, y + 4); c.stroke(); c.restore();
    }
    if (!this.active || !this.cur) return;
    drawMarker(c, v, this.cur.label ? this.cur : null);
    const P = v.toScreen(this.cur.p);
    const txt = (this.copy ? 'Nowa bryła · ' : '') + (this.cur.label ? this.cur.label + ' · ' : '') + fmtLength(this.dist);
    drawChip(c, P.x, P.y, txt, this.cur.label ? BLUE : '#4a4945');
  }
}

/* ---------- wiaderko: kolor bryły ---------- */
export class PaintTool extends Tool {
  hint() { return `Kliknij bryłę, żeby nadać jej kolor i krycie (szkło). <kbd>${this.app.isMac ? '⌘' : 'Alt'}</kbd> + klik pobiera kolor z bryły.`; }
  move(e, x, y) {
    const hit = this.v.pick(x, y);
    const s = hit && this.model.shapes.find(q => q.id === hit.shapeId);
    this.v.setHoverFace(s ? faceByKey(s, hit.key)?.verts : null);
  }
  down(e, x, y) {
    const hit = this.v.pick(x, y); if (!hit) return;
    const s = this.model.shapes.find(q => q.id === (hit.solidId ?? hit.shapeId)); if (!s) return;
    if ((this.app.isMac && e.metaKey) || (!this.app.isMac && e.altKey)) { this.app.setPaint(s.color || null, s.alpha ?? 1); return; }
    // grupa albo komponent (poza edycją) dostaje kolor w całości
    const ids = this.app.expand(s.id).filter(i => typeof i === 'number');
    const a = this.app.paintAlpha >= 0.999 ? undefined : this.app.paintAlpha;
    this.app.checkpoint();
    for (const id of ids) { const q = this.model.shapes.find(x => x.id === id); if (q) { q.color = this.app.paint; if (a === undefined) delete q.alpha; else q.alpha = a; } }
    this.app.changed();
  }
}

/* ---------- nawigacja lewym przyciskiem ---------- */
export class NavTool extends Tool {
  constructor(app, mode) { super(app); this.mode = mode; }
  hint() { return { orbit: 'Przeciągnij, żeby obrócić widok.', pan: 'Przeciągnij, żeby przesunąć widok.', zoom: 'Przeciągnij w górę albo w dół, żeby przybliżyć.' }[this.mode]; }
  down(e, x, y) { this.last = { x, y }; this.pivot = this.v.pivotAt(x, y); this.z0 = { x, y }; }
  move(e, x, y) {
    if (!this.last || !(e.buttons & 1)) return;
    const dx = x - this.last.x, dy = y - this.last.y; this.last = { x, y };
    if (this.mode === 'orbit') this.v.orbit(dx, dy, this.pivot);
    else if (this.mode === 'pan') this.v.pan(dx, dy, this.pivot);
    else this.v.zoomAt(this.z0.x, this.z0.y, Math.pow(1.01, -dy));
  }
  up() { this.last = null; }
}

// powiększanie ramką: zaznaczony prostokąt wypełnia okno
export class ZoomWinTool extends Tool {
  hint() { return 'Przeciągnij ramkę wokół miejsca, które ma wypełnić okno. <kbd>Esc</kbd> przerywa.'; }
  reset() { this.box = null; }
  down(e, x, y) { this.box = { x0: x, y0: y, x1: x, y1: y }; }
  move(e, x, y) { if (this.box && (e.buttons & 1)) { this.box.x1 = x; this.box.y1 = y; } }
  up() {
    const b = this.box; this.box = null; if (!b) return;
    const w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0), v = this.v;
    if (w < 6 || h < 6) return;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    v.pan(v.w / 2 - cx, v.h / 2 - cy, v.pivotAt(cx, cy));
    v.zoomAt(v.w / 2, v.h / 2, Math.min(v.w / w, v.h / h));
    this.app.zoomWinDone?.();
  }
  draw(c) {
    const b = this.box; if (!b) return;
    const dark = this.app.viewer.dark;
    c.save();
    c.fillStyle = dark ? 'rgba(150,170,210,0.10)' : 'rgba(63,95,153,0.06)';
    c.strokeStyle = dark ? '#9fb4dc' : '#3f5f99'; c.lineWidth = 1;
    const x = Math.min(b.x0, b.x1) + 0.5, y = Math.min(b.y0, b.y1) + 0.5;
    c.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); c.strokeRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    c.restore();
  }
}

export { shapeEdges };

/* ---------- wspólne: co jest pod kursorem ---------- */
// zwraca id bryły (liczba), 'l<id>' dla linii albo 'g<id>' dla prowadnicy
// zaznaczenie ramką: elementy w bieżącym kontekście (edytowana grupa albo cały model); grupa liczy się jako całość
export function boxSelect(app, b, window_) {
  const v = app.viewer, m = app.model;
  const X0 = Math.min(b.x0, b.x1), X1 = Math.max(b.x0, b.x1), Y0 = Math.min(b.y0, b.y1), Y1 = Math.max(b.y0, b.y1);
  const inR = P => P.x >= X0 && P.x <= X1 && P.y >= Y0 && P.y <= Y1;
  const segHits = (A, B) => {
    if (inR(A) || inR(B)) return true;
    // przecięcie odcinka z bokami ramki
    const cr = (p, q, r, s) => { const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x); if (Math.abs(d) < 1e-9) return false; const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d, u = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d; return t >= 0 && t <= 1 && u >= 0 && u <= 1; };
    const c = [{ x: X0, y: Y0 }, { x: X1, y: Y0 }, { x: X1, y: Y1 }, { x: X0, y: Y1 }];
    for (let i = 0; i < 4; i++) if (cr(A, B, c[i], c[(i + 1) % 4])) return true;
    return false;
  };
  // dla każdego elementu: [punkty ekranowe, odcinki]
  const test = segs => {
    const S = segs.map(([a, b]) => [v.toScreen(a), v.toScreen(b)]);
    if (S.some(([A, B]) => A.behind || B.behind)) return window_ ? false : S.some(([A, B]) => !A.behind && !B.behind && segHits(A, B));
    return window_ ? S.every(([A, B]) => inR(A) && inR(B)) : S.some(([A, B]) => segHits(A, B));
  };
  const ctx = id => app.editing == null || app.inEditing(id);
  const res = new Map();   // id → wynik
  for (const s of m.shapes) {
    if (isHidden(m, s) || s.locked || !ctx(s.id) || (app.editSolid != null && s.id !== app.editSolid)) continue;
    res.set(s.id, test(shapeEdges(s).map(e => [e.a, e.b])));
  }
  for (const l of m.lines) {
    if (isHidden(m, l) || l.locked || app.editSolid != null || !ctx('l' + l.id)) continue;
    res.set('l' + l.id, test([[l.a, l.b]]));
  }
  const out = new Set();
  for (const [id, ok] of res) {
    const all = app.expand(id);
    if (all.length > 1) {
      const vals = all.map(i => res.get(i)).filter(x => x !== undefined);
      if (window_ ? vals.length && vals.every(Boolean) : vals.some(Boolean)) all.forEach(i => out.add(i));
    } else if (ok) out.add(id);
  }
  return [...out];
}

export function pickEntity(app, x, y) {
  const v = app.viewer, m = app.model;
  const segDist = (a, b) => {
    const A = v.toScreen(a), B = v.toScreen(b);
    if (A.behind || B.behind) return Infinity;
    const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2));
    return Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
  };
  const an = pickAnnotation(m, p => v.toScreen(p), x, y);
  if (an) return an;
  // obrys płaszczyzny przekroju
  if (v.showSectPlanes) for (const q of m.sections || []) {
    if (q.hidden) continue;
    const C = v.sectionCorners(q).map(p => v.toScreen(p)); if (C.some(c => c.behind)) continue;
    for (let i = 0; i < 4; i++) { const A = C[i], B = C[(i + 1) % 4], dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2)); if (Math.hypot(A.x + dx * t - x, A.y + dy * t - y) < 5) return 's' + q.id; }
  }
  let best = null, bd = 6;
  for (const l of m.lines) { if (isHidden(m, l) || l.locked) continue; const d = segDist(l.a, l.b); if (d < bd) { bd = d; best = 'l' + l.id; } }
  if (best) return best;
  // wycięcia: wybierane po przerywanym obrysie
  for (const s of m.shapes) {
    if (s.op !== 'cut' || isHidden(m, s) || s.locked) continue;
    for (const e of shapeEdges(s)) { const d = segDist(e.a, e.b); if (d < bd) { bd = d; best = s.id; } }
  }
  if (best != null) return best;
  const hit = v.pick(x, y);
  if (hit) return hit.shapeId;
  bd = 5;
  for (const g of m.guides || []) {
    // odcinek prowadnicy wokół miejsca najbliższego kamerze, żeby nie wychodził za kamerę
    const c = v.cam.position.toArray(), t = V.dot(V.sub(c, g.o), g.d), mid = V.add(g.o, V.mul(g.d, t));
    const R = Math.max(20, V.dist(c, mid) * 4);
    for (let i = 0; i < 16; i++) {
      const d = segDist(V.add(mid, V.mul(g.d, -R + 2 * R * i / 16)), V.add(mid, V.mul(g.d, -R + 2 * R * (i + 1) / 16)));
      if (d < bd) { bd = d; best = 'g' + g.id; }
    }
  }
  return best;
}
export function hoverShape(app, x, y, id = pickEntity(app, x, y)) {
  const s = typeof id === 'number' && app.model.shapes.find(q => q.id === id && !q.bill);
  const hit = s && app.viewer.pick(x, y);
  app.viewer.setHoverFace(hit ? faceByKey(s, hit.key)?.verts : null);
}
// płaszczyzna rysowania z pierwszego kliknięcia: ściana pod kursorem albo ziemia
function planeAt(app, s) {
  let n = [0, 0, 1];
  if (s.face) {
    const sh = app.model.shapes.find(q => q.id === s.face.shapeId), f = sh && faceByKey(sh, s.face.key);
    if (f && Math.abs(V.dot(V.sub(s.p, f.verts[0]), f.normal)) < 1e-4) n = f.normal;
  }
  if (app.lockAxis) n = AXES[app.lockAxis];
  let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n));
  u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
  return { o: s.p.slice(), n, u, v: V.cross(n, u) };
}
const toPlane = (pl, p) => { const d = V.sub(p, pl.o); return [V.dot(d, pl.u), V.dot(d, pl.v)]; };
const fromPlane = (pl, q) => V.add(V.add(pl.o, V.mul(pl.u, q[0])), V.mul(pl.v, q[1]));
function drawPoly(c, v, pts3, color = INK, closed = true, opts) { for (let i = 0; i < pts3.length - (closed ? 0 : 1); i++) drawSeg(c, v, pts3[i], pts3[(i + 1) % pts3.length], color, opts); }
const parseCount = str => { const m = String(str).trim().match(/^(?:[x*×](\d+)|(\d+)[x*×])$/i); return m ? +(m[1] || m[2]) : null; };
const parseDivide = str => { const m = String(str).trim().match(/^\/(\d+)$/); return m ? +m[1] : null; };
const copyKey = app => app.isMac ? '⌥' : 'Ctrl';
const isCopyKey = (app, e) => (app.isMac && e.key === 'Alt') || (!app.isMac && e.key === 'Control');
function drawPlus(c, x, y) {
  if (x == null) return;
  c.save(); c.strokeStyle = document.documentElement.dataset.theme === 'dark' ? '#e9e9e7' : INK; c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x + 10, y - 12); c.lineTo(x + 18, y - 12); c.moveTo(x + 14, y - 16); c.lineTo(x + 14, y - 8); c.stroke(); c.restore();
}

/* ---------- okrąg ---------- */
export class CircleTool extends Tool {
  reset() { this.c = null; this.plane = null; this.cur = null; }
  hint() { return this.c ? 'Przesuń, żeby ustalić promień, i kliknij — albo wpisz promień i <kbd>Enter</kbd>.' : 'Kliknij środek okręgu — na ziemi albo na ścianie. Strzałki ustawiają płaszczyznę: <kbd>↑</kbd> pozioma, <kbd>→</kbd> <kbd>←</kbd> pionowe.'; }
  r() { return this.c && this.cur ? V.dist(this.c, this.cur.p) : 0; }
  vcb() { return { label: 'Promień', value: this.c ? fmtLength(this.r()) : this.lastValid() ? fmtLength(this.last.r) : '' }; }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  move(e, x, y) { this.cur = this.c ? this.app.snapper.find(x, y, { model: this.model, plane: this.plane }) : this.app.snapper.find(x, y, { model: this.model }); }
  down() {
    if (!this.cur) return;
    if (!this.c) { this.plane = planeAt(this.app, this.cur); this.c = this.cur.p.slice(); this.plane.o = this.c; return; }
    this.create(this.r());
  }
  angle() { if (!this.cur) return 0; const q = toPlane(this.plane, this.cur.p); return Math.atan2(q[1], q[0]); }
  create(r, a0 = this.angle()) {
    if (r < 1e-6) return;
    this.app.checkpoint();
    const s = makeShape(this.model, { o: this.c, u: this.plane.u, v: this.plane.v }, circlePts(r, CIRCLE_SEGMENTS, a0), 0);
    s.soft = true;
    this.app.changed();
    this.last = { c: this.c, plane: this.plane, r, a0, seq: this.app.opSeq };
    this.reset();
  }
  value(str) {
    const r = parseLength(str); if (r == null || r <= 0) return false;
    if (this.c) { this.create(r); return true; }
    if (this.lastValid() && this.app.revertLast()) { const l = this.last; this.c = l.c; this.plane = l.plane; this.create(r, l.a0); return true; }
    return false;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.c) {
      const r = this.r(), a0 = this.angle();
      drawPoly(c, v, circlePts(r, 48, a0).map(q => fromPlane(this.plane, q)), INK, true, { width: 1.5 });
      drawSeg(c, v, this.c, s.p, INK, { width: 1, dash: [3, 3] });
    }
    drawMarker(c, v, s);
    const P = v.toScreen(s.p); drawChip(c, P.x, P.y, this.c ? 'Promień ' + fmtLength(this.r()) : s.label);
  }
}

/* ---------- wielokąt foremny ---------- */
export class PolygonTool extends CircleTool {
  constructor(app) { super(app); this.sides = 6; }
  hint() { return this.c ? `Przesuń, żeby ustalić promień (do wierzchołka), i kliknij — albo wpisz promień. Liczba boków: ${this.sides}; wpisz np. <kbd>8s</kbd>, żeby zmienić.` : `Kliknij środek wielokąta (${this.sides} boków; <kbd>8s</kbd> zmienia liczbę). Strzałki ustawiają płaszczyznę.`; }
  create(r, a0 = this.angle()) {
    if (r < 1e-6) return;
    this.app.checkpoint();
    makeShape(this.model, { o: this.c, u: this.plane.u, v: this.plane.v }, circlePts(r, this.sides, a0), 0);
    this.app.changed();
    this.last = { c: this.c, plane: this.plane, r, a0, seq: this.app.opSeq };
    this.reset();
  }
  value(str) {
    const m = String(str).trim().match(/^(\d+)\s*s$/i);
    if (m) { this.sides = Math.max(3, Math.min(100, +m[1])); this.app.refresh(); return true; }
    return super.value(str);
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.c) {
      drawPoly(c, v, circlePts(this.r(), this.sides, this.angle()).map(q => fromPlane(this.plane, q)), INK, true, { width: 1.5 });
      drawSeg(c, v, this.c, s.p, INK, { width: 1, dash: [3, 3] });
    }
    drawMarker(c, v, s);
    const P = v.toScreen(s.p); drawChip(c, P.x, P.y, this.c ? this.sides + ' boków · promień ' + fmtLength(this.r()) : s.label);
  }
}

/* ---------- prostokąt obrócony (trzy punkty, w dowolnej płaszczyźnie) ---------- */
export class RotRectTool extends Tool {
  reset() { this.p0 = null; this.p1 = null; this.cur = null; }
  hint() { return !this.p0 ? 'Kliknij pierwszy narożnik obróconego prostokąta.' : !this.p1 ? 'Kliknij koniec pierwszego boku albo wpisz jego długość.' : 'Przesuń w bok, żeby ustalić szerokość (także pod kątem, w dowolnej płaszczyźnie), i kliknij — albo wpisz szerokość.'; }
  vcb() { return { label: this.p1 ? 'Szerokość' : 'Długość', value: this.p1 ? fmtLength(Math.abs(this.w() || 0)) : this.p0 && this.cur ? fmtLength(V.dist(this.p0, this.cur.p)) : '' }; }
  move(e, x, y) {
    this.cur = this.app.snapper.find(x, y, { model: this.model, anchor: this.p1 || this.p0, lockAxis: this.app.lockAxis, plane: this.p1 && this.plane ? this.plane : null });
  }
  frame() {
    const u = V.norm(V.sub(this.p1, this.p0));
    let d = this.cur ? V.sub(this.cur.p, this.p1) : [0, 0, 0];
    d = V.sub(d, V.mul(u, V.dot(d, u)));
    let v = V.len(d) > 1e-6 ? V.norm(d) : null;
    if (!v) { const w = V.cross([0, 0, 1], u); v = V.len(w) > 1e-6 ? V.norm(w) : [0, 1, 0]; }
    return { u, v, L: V.dist(this.p0, this.p1), W: V.len(d) };
  }
  w() { return this.p1 && this.cur ? this.frame().W : 0; }
  down() {
    if (!this.cur) return;
    if (!this.p0) { this.p0 = this.cur.p.slice(); return; }
    if (!this.p1) { if (V.dist(this.cur.p, this.p0) > 1e-6) { this.p1 = this.cur.p.slice(); this.plane = null; } return; }
    this.create(this.frame());
  }
  create(f) {
    if (f.W < 1e-6 || f.L < 1e-6) return;
    this.app.checkpoint();
    makeShape(this.model, { o: this.p0, u: f.u, v: f.v }, [[0, 0], [f.L, 0], [f.L, f.W], [0, f.W]], 0);
    this.app.changed(); this.reset(); this.app.lockAxis = null;
  }
  value(str) {
    const L = parseLength(str); if (L == null || L <= 0) return false;
    if (this.p1) { const f = this.frame(); f.W = L; this.create(f); return true; }
    if (this.p0 && this.cur) { const d = V.sub(this.cur.p, this.p0); if (V.len(d) < 1e-9) return false; this.p1 = V.add(this.p0, V.mul(V.norm(d), L)); this.app.lockAxis = null; return true; }
    return false;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p1) {
      const f = this.frame(), a = this.p0, b = this.p1, cc = V.add(b, V.mul(f.v, f.W)), d = V.add(a, V.mul(f.v, f.W));
      drawPoly(c, v, [a, b, cc, d], INK, true, { width: 1.6 });
    } else if (this.p0) drawSeg(c, v, this.p0, s.p, INK, { width: 1.6 });
    drawMarker(c, v, s);
    const P = v.toScreen(s.p);
    drawChip(c, P.x, P.y, this.p1 ? fmtLength(V.dist(this.p0, this.p1)) + ' × ' + fmtLength(this.w()) : this.p0 ? fmtLength(V.dist(this.p0, s.p)) : s.label);
  }
}

/* ---------- łuk ze środka i wycinek koła ---------- */
export class CenterArcTool extends Tool {
  constructor(app, pie) { super(app); this.pie = pie; }
  reset() { this.c = null; this.p1 = null; this.plane = null; this.cur = null; this.ang = 0; }
  hint() {
    const what = this.pie ? 'wycinka koła' : 'łuku';
    return !this.c ? `Kliknij środek ${what}. Strzałki ustawiają płaszczyznę: <kbd>↑</kbd> pozioma, <kbd>→</kbd> <kbd>←</kbd> pionowe.` : !this.p1 ? 'Kliknij początek (promień i kierunek) albo wpisz promień.' : 'Obróć do końca i kliknij — albo wpisz kąt w stopniach. Kątomierz przyciąga co 15°.';
  }
  vcb() { return { label: this.p1 ? 'Kąt' : 'Promień', value: this.p1 ? (Math.round(this.ang * 1800 / Math.PI) / 10 + '°').replace('.', ',') : this.c && this.cur ? fmtLength(V.dist(this.c, this.cur.p)) : '' }; }
  move(e, x, y) {
    if (!this.c) { this.cur = this.app.snapper.find(x, y, { model: this.model }); return; }
    this.cur = this.app.snapper.find(x, y, { model: this.model, plane: this.plane, anchor: this.p1 ? null : this.c });
    if (!this.cur || !this.p1) return;
    const a = toPlane(this.plane, this.p1), b = toPlane(this.plane, this.cur.p);
    let t = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
    // ciągłość: kąt narasta w tę stronę, w którą kursor już poszedł
    const prev = this.ang || 0;
    while (t - prev > Math.PI) t -= 2 * Math.PI;
    while (t - prev < -Math.PI) t += 2 * Math.PI;
    const deg = t * 180 / Math.PI, sn = Math.round(deg / 15) * 15;
    if (Math.abs(deg - sn) < 2.5) t = sn * Math.PI / 180;
    this.ang = Math.max(-2 * Math.PI, Math.min(2 * Math.PI, t));
  }
  points() {
    const a = toPlane(this.plane, this.p1), r = Math.hypot(a[0], a[1]), a0 = Math.atan2(a[1], a[0]);
    const n = Math.max(2, Math.round(Math.abs(this.ang) / (2 * Math.PI) * CIRCLE_SEGMENTS));
    const pts = []; for (let i = 0; i <= n; i++) { const t = a0 + this.ang * i / n; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
    return pts;
  }
  down() {
    if (!this.cur) return;
    if (!this.c) { this.plane = planeAt(this.app, this.cur); this.c = this.cur.p.slice(); this.plane.o = this.c; return; }
    if (!this.p1) { if (V.dist(this.cur.p, this.c) > 1e-6) { this.p1 = this.cur.p.slice(); this.ang = 0; } return; }
    this.create();
  }
  create() {
    if (Math.abs(this.ang) < 1e-4) return;
    const pts = this.points();
    this.app.checkpoint();
    if (this.pie) {
      const full = Math.abs(Math.abs(this.ang) - 2 * Math.PI) < 1e-6;
      const poly = full ? pts.slice(0, -1) : [[0, 0], ...pts];
      const sh = makeShape(this.model, { o: this.c, u: this.plane.u, v: this.plane.v }, this.ang < 0 ? poly.reverse() : poly, 0);
      if (full) sh.soft = true;
    } else {
      let last = null;
      const P = pts.map(q => fromPlane(this.plane, q));
      for (let i = 0; i + 1 < P.length; i++) { last = { id: this.model.next++, a: P[i].slice(), b: P[i + 1].slice() }; this.model.lines.push(last); }
      if (last) closeLoop(this.model, last);
    }
    this.app.changed(); this.reset();
  }
  value(str) {
    if (this.p1) {
      const m = String(str).trim().replace(',', '.').match(/^(-?\d+(?:\.\d+)?)\s*°?$/); if (!m) return false;
      const deg = +m[1]; this.ang = (Math.sign(this.ang) || 1) * Math.min(360, Math.abs(deg)) * Math.PI / 180 * (deg < 0 ? -1 : 1);
      this.create(); return true;
    }
    if (this.c && this.cur) { const L = parseLength(str); if (L == null || L <= 0) return false; const d = V.sub(this.cur.p, this.c); if (V.len(d) < 1e-9) return false; this.p1 = V.add(this.c, V.mul(V.norm(d), L)); this.ang = 0; return true; }
    return false;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p1) {
      const P = this.points().map(q => fromPlane(this.plane, q));
      drawPoly(c, v, this.pie ? [this.c, ...P] : P, INK, !!this.pie, { width: 1.6 });
      drawSeg(c, v, this.c, this.p1, INK, { width: 1, dash: [3, 3] });
    } else if (this.c) drawSeg(c, v, this.c, s.p, INK, { width: 1, dash: [3, 3] });
    drawMarker(c, v, this.p1 ? null : s);
    const Q = v.toScreen(s.p);
    drawChip(c, Q.x, Q.y, this.p1 ? (Math.round(Math.abs(this.ang) * 180 / Math.PI) + '°') : this.c ? 'Promień ' + fmtLength(V.dist(this.c, s.p)) : s.label);
  }
}

/* ---------- wymiar ---------- */
export class DimTool extends Tool {
  reset() { this.a = null; this.b = null; this.cur = null; this.off = null; }
  hint() { return !this.a ? 'Kliknij pierwszy punkt wymiaru (koniec, środek, krawędź).' : !this.b ? 'Kliknij drugi punkt.' : 'Odsuń linię wymiarową i kliknij — albo wpisz odsunięcie.'; }
  vcb() { return { label: this.b ? 'Odsunięcie' : 'Długość', value: this.b && this.off ? fmtLength(V.len(this.off)) : this.a && this.cur ? fmtLength(V.dist(this.a, this.cur.p)) : '' }; }
  move(e, x, y) {
    if (!this.b) { this.cur = this.app.snapper.find(x, y, { model: this.model, anchor: this.a, lockAxis: this.app.lockAxis }); return; }
    // odsunięcie wzdłuż tej osi (prostopadłej do odcinka), w którą stronę kursor odsuwa się od niego na ekranie
    const ab = V.norm(V.sub(this.b, this.a)), mid = V.lerp(this.a, this.b, 0.5), M = this.v.toScreen(mid), A = this.v.toScreen(this.a), B = this.v.toScreen(this.b);
    let lx = B.x - A.x, ly = B.y - A.y; const ll = Math.hypot(lx, ly) || 1; lx /= ll; ly /= ll;
    const mx0 = x - M.x, my0 = y - M.y, mdot = mx0 * lx + my0 * ly, mx = mx0 - lx * mdot, my = my0 - ly * mdot, mlen = Math.hypot(mx, my);
    const eps = Math.max(0.01, 50 * this.v.pixelSize(mid));
    let best = null;
    for (const ax of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      let w = V.sub(ax, V.mul(ab, V.dot(ax, ab))); if (V.len(w) < 0.2) continue; w = V.norm(w);
      const W = this.v.toScreen(V.add(mid, V.mul(w, eps))); if (W.behind) continue;
      let sx = (W.x - M.x) / eps, sy = (W.y - M.y) / eps; const sd = sx * lx + sy * ly; sx -= lx * sd; sy -= ly * sd;
      const sl = Math.hypot(sx, sy); if (sl < 1e-6) continue;
      const score = mlen > 1e-6 ? Math.abs(mx * sx + my * sy) / (mlen * sl) : 0;
      if (!best || score > best.score + 0.05 || (Math.abs(score - best.score) <= 0.05 && sl > best.sl)) best = { w, score, sl, amt: (mx * sx + my * sy) / (sl * sl) };
    }
    if (!best) return;
    this.off = V.mul(best.w, best.amt);
    this.cur = { p: V.add(mid, this.off) };
  }
  down() {
    if (!this.a) { if (!this.cur) return; this.a = this.cur.p.slice(); return; }
    if (!this.b) { if (!this.cur || V.dist(this.cur.p, this.a) < 1e-6) return; this.b = this.cur.p.slice(); return; }
    if (this.off) this.create(this.off);
  }
  create(off) {
    this.app.checkpoint();
    this.model.dims.push({ id: this.model.next++, a: this.a.slice(), b: this.b.slice(), off });
    this.app.changed(); this.reset(); this.app.lockAxis = null;
  }
  value(str) {
    const L = parseLength(str); if (L == null) return false;
    if (this.b && this.off) { const n = V.len(this.off) > 1e-9 ? V.norm(this.off) : [0, 0, 1]; this.create(V.mul(n, L)); return true; }
    return false;
  }
  draw(c, v) {
    const s = this.cur;
    if (this.b && this.off) drawAnnotations(c, p => v.toScreen(p), { dims: [{ id: 0, a: this.a, b: this.b, off: this.off }], texts: [] }, { dark: v.dark, paper: v.st().paper });
    else if (this.a && s) { drawSeg(c, v, this.a, s.p, INK, { width: 1, dash: [3, 3] }); }
    if (s && !this.b) { drawMarker(c, v, s); const P = v.toScreen(s.p); drawChip(c, P.x, P.y, this.a ? fmtLength(V.dist(this.a, s.p)) : s.label); }
  }
}

/* ---------- opis z odnośnikiem ---------- */
export class TextTool extends Tool {
  reset() { this.p = null; this.cur = null; }
  hint() { return !this.p ? 'Kliknij punkt, który opisujesz (albo dwa razy w to samo miejsce — opis bez strzałki).' : 'Kliknij, gdzie ma stać tekst, a potem go wpisz. <kbd>Enter</kbd> kończy, <kbd>⇧</kbd><kbd>Enter</kbd> — nowy wiersz.'; }
  move(e, x, y) { this.cur = this.p ? this.app.snapper.find(x, y, { model: this.model, plane: { o: this.p, n: V.norm(this.v.getCamera().f) } }) : this.app.snapper.find(x, y, { model: this.model }); }
  down() {
    if (!this.cur) return;
    if (!this.p) { this.p = this.cur.p.slice(); return; }
    const t = { id: this.model.next++, p: this.p.slice(), q: this.cur.p.slice(), text: '' };
    this.reset();
    this.app.editText(t, true);
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p) { drawSeg(c, v, this.p, s.p, INK, { width: 1 }); const P = v.toScreen(this.p); c.fillStyle = INK; c.beginPath(); c.arc(P.x, P.y, 2.2, 0, 7); c.fill(); }
    else drawMarker(c, v, s);
  }
}

/* ---------- kątomierz: prowadnica pod kątem ---------- */
export class ProtractorTool extends CenterArcTool {
  constructor(app) { super(app, false); }
  hint() { return !this.c ? 'Kliknij wierzchołek kąta. Strzałki ustawiają płaszczyznę: <kbd>↑</kbd> pozioma, <kbd>→</kbd> <kbd>←</kbd> pionowe.' : !this.p1 ? 'Kliknij punkt na ramieniu odniesienia (np. na krawędzi).' : 'Obróć i kliknij — albo wpisz kąt w stopniach. Powstanie prowadnica pod tym kątem.'; }
  create() {
    const a = toPlane(this.plane, this.p1), a0 = Math.atan2(a[1], a[0]) + this.ang;
    const d = V.norm(V.add(V.mul(this.plane.u, Math.cos(a0)), V.mul(this.plane.v, Math.sin(a0))));
    this.app.checkpoint();
    this.model.guides.push({ id: this.model.next++, o: this.c.slice(), d });
    this.app.changed(); this.reset();
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p1) {
      const a = toPlane(this.plane, this.p1), r = Math.hypot(a[0], a[1]), a0 = Math.atan2(a[1], a[0]);
      const R = Math.max(r, 40 * v.pixelSize(this.c)), pts = [];
      for (let i = 0; i <= 24; i++) { const t = a0 + this.ang * i / 24; pts.push(fromPlane(this.plane, [R * 0.6 * Math.cos(t), R * 0.6 * Math.sin(t)])); }
      drawPoly(c, v, pts, INK, false, { width: 1 });
      const e = fromPlane(this.plane, [R * 3 * Math.cos(a0 + this.ang), R * 3 * Math.sin(a0 + this.ang)]);
      drawSeg(c, v, this.c, this.p1, INK, { width: 1 });
      drawSeg(c, v, this.c, e, INK, { width: 1, dash: [5, 4] });
    } else if (this.c) drawSeg(c, v, this.c, s.p, INK, { width: 1, dash: [3, 3] });
    drawMarker(c, v, this.p1 ? null : s);
    const Q = v.toScreen(s.p);
    drawChip(c, Q.x, Q.y, this.p1 ? (Math.round(Math.abs(this.ang) * 1800 / Math.PI) / 10 + '°').replace('.', ',') : s.label);
  }
}

/* ---------- płaszczyzna przekroju ---------- */
export class SectionTool extends Tool {
  reset() { this.o = null; this.n = null; this.cur = null; this.depth = 0; }
  hint() { return !this.o ? 'Najedź na ścianę i kliknij — przekrój stanie równolegle do niej. Strzałki ustawiają przekrój prostopadle do osi: <kbd>→</kbd> czerwonej, <kbd>←</kbd> zielonej, <kbd>↑</kbd> niebieskiej.' : 'Przesuń w głąb i kliknij — albo wpisz głębokość. Zdjęta zostaje strona, w którą wskazują strzałki.'; }
  vcb() { return { label: 'Głębokość', value: this.o ? fmtLength(this.depth) : '' }; }
  normalAt(s) {
    if (this.app.lockAxis) return AXES[this.app.lockAxis];
    if (s.face) { const sh = this.model.shapes.find(q => q.id === s.face.shapeId), f = sh && faceByKey(sh, s.face.key); if (f) return f.normal; }
    // bez ściany: pionowy przekrój zwrócony do kamery
    const f = this.v.getCamera().f; const h = [-f[0], -f[1], 0];
    return V.len(h) > 1e-6 ? (Math.abs(h[0]) > Math.abs(h[1]) ? [Math.sign(h[0]), 0, 0] : [0, Math.sign(h[1]), 0]) : [0, 0, 1];
  }
  move(e, x, y) {
    if (!this.o) { this.cur = this.app.snapper.find(x, y, { model: this.model }); if (this.cur) this.prevN = this.normalAt(this.cur); return; }
    // głębokość: najbliższy punkt prostej normalnej do promienia kursora
    const r = this.v.ray(x, y), d0 = r.direction.toArray(), o0 = r.origin.toArray(), n = this.n;
    const w = V.sub(this.o, o0), a = V.dot(n, n), b = V.dot(n, d0), c = V.dot(d0, d0), dd = V.dot(n, w), e2 = V.dot(d0, w), den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return;
    this.depth = Math.max(0, -(b * e2 - c * dd) / den);
    const step = 0.05; if (Math.abs(this.depth - Math.round(this.depth / step) * step) < 4 * this.v.pixelSize(this.o)) this.depth = Math.round(this.depth / step) * step;
  }
  down() {
    if (!this.o) { if (!this.cur) return; this.o = this.cur.p.slice(); this.n = V.norm(this.normalAt(this.cur)); this.depth = 0; return; }
    this.create(this.depth);
  }
  create(depth) {
    this.app.checkpoint();
    for (const q of this.model.sections) q.on = false;
    const q = { id: this.model.next++, o: V.sub(this.o, V.mul(this.n, depth)), n: this.n, on: true };
    this.model.sections.push(q);
    this.app.changed(); this.reset(); this.app.lockAxis = null;
    this.app.toast?.('Przekrój włączony. Przesuń go narzędziem W albo wyłącz w okienku Widok.');
  }
  value(str) { const L = parseLength(str); if (L == null || !this.o) return false; this.create(Math.abs(L)); return true; }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    const o = this.o ? V.sub(this.o, V.mul(this.n, this.depth)) : s.p, n = this.o ? this.n : this.prevN || [0, 0, 1];
    const R = 60 * v.pixelSize(o), u = V.norm(Math.abs(n[2]) > 0.9 ? V.cross([1, 0, 0], n) : V.cross([0, 0, 1], n)), w = V.cross(n, u);
    const Q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => V.add(o, V.add(V.mul(u, a * R), V.mul(w, b * R))));
    drawPoly(c, v, Q, '#c0752f', true, { width: 1.4 });
    drawSeg(c, v, o, V.sub(o, V.mul(n, R * 0.8)), '#c0752f', { width: 1.4 });
    if (this.o) drawSeg(c, v, this.o, o, INK, { width: 1, dash: [3, 3] });
    if (!this.o) drawMarker(c, v, s);
    const P = v.toScreen(o); drawChip(c, P.x, P.y, this.o ? 'Głębokość ' + fmtLength(this.depth) : 'Przekrój');
  }
}

/* ---------- wstawianie modelu z biblioteki ---------- */
export class PlaceTool extends Tool {
  reset() { this.cur = null; }
  setItem(item) { this.item = item; this.edges = item.shapes.flatMap(sh => shapeEdges(sh).map(e => [e.a, e.b])).concat((item.lines || []).map(l => [l.a, l.b])); }
  hint() { if (this.item && this.item.paste) return 'Kliknij, gdzie wkleić. <kbd>Esc</kbd> przerywa.'; return this.item ? `Kliknij, gdzie postawić: <b>${this.item.name}</b>. Model trafia do szkicu jako komponent — kopie (W z ${this.app.isMac ? '⌥' : 'Ctrl'}) zmieniają się razem. <kbd>Esc</kbd> przerywa.` : ''; }
  move(e, x, y) { this.cur = this.app.snapper.find(x, y, { model: this.model }); }
  down() { if (!this.cur || !this.item) return; this.app.placeItem(this.item, this.cur.p.slice()); }
  draw(c, v) {
    const s = this.cur; if (!s || !this.edges) return;
    // figury 2D w podglądzie też zwrócone do kamery
    const f = v.getCamera().f, a = Math.atan2(-f[1], -f[0]) + Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const bill = this.item.shapes.length === 1 && this.item.shapes[0].bill;
    const tr = p => bill ? V.add(s.p, [p[0] * ca - p[1] * sa, p[0] * sa + p[1] * ca, p[2]]) : V.add(s.p, p);
    for (const [a1, b1] of this.edges) drawSeg(c, v, tr(a1), tr(b1), INK, { width: 1 });
    drawMarker(c, v, s);
  }
}

/* ---------- łuk dwupunktowy ---------- */
export class ArcTool extends Tool {
  reset() { this.p1 = null; this.p2 = null; this.plane = null; this.cur = null; this.h = 0; }
  hint() {
    return !this.p1 ? 'Kliknij początek łuku.' : !this.p2 ? 'Kliknij koniec łuku albo wpisz długość cięciwy.' : 'Przesuń, żeby wygiąć łuk, i kliknij — albo wpisz wysokość wygięcia. Przy połowie cięciwy łuk staje się półokręgiem.';
  }
  vcb() { return { label: this.p2 ? 'Wygięcie' : 'Długość', value: this.p2 ? fmtLength(Math.abs(this.h)) : this.p1 && this.cur ? fmtLength(V.dist(this.p1, this.cur.p)) : '' }; }
  move(e, x, y) {
    if (!this.p1) { this.cur = this.app.snapper.find(x, y, { model: this.model }); return; }
    this.cur = this.app.snapper.find(x, y, { model: this.model, plane: this.plane });
    if (!this.cur || !this.p2) return;
    const ch = V.sub(this.p2, this.p1), L = V.len(ch), dir = V.mul(ch, 1 / L), m = V.cross(this.plane.n, dir);
    let h = V.dot(V.sub(this.cur.p, this.p1), m);
    // przyciąganie do półokręgu
    if (Math.abs(Math.abs(h) - L / 2) < 8 * this.v.pixelSize(this.cur.p)) { h = Math.sign(h) * L / 2; this.semi = true; } else this.semi = false;
    this.h = h;
  }
  points() {
    const ch = V.sub(this.p2, this.p1), L = V.len(ch), dir = V.mul(ch, 1 / L), m = V.cross(this.plane.n, dir), h = this.h;
    if (Math.abs(h) < 1e-6) return [this.p1, this.p2];
    const r = (L * L / 4 + h * h) / (2 * Math.abs(h)), sg = Math.sign(h);
    const mid = V.lerp(this.p1, this.p2, 0.5), ctr = V.add(mid, V.mul(m, sg * (Math.abs(h) - r)));
    const a1 = V.sub(this.p1, ctr), sweep = 2 * Math.asin(Math.min(1, L / (2 * r))) * (Math.abs(h) > r ? -1 : 1);
    const total = Math.abs(h) > r ? 2 * Math.PI - Math.abs(sweep) : Math.abs(sweep);
    const n = Math.max(4, Math.round(total / (2 * Math.PI) * CIRCLE_SEGMENTS));
    const axis = V.mul(this.plane.n, -sg);
    const pts = []; for (let i = 0; i <= n; i++) pts.push(V.add(ctr, rotVec3(a1, axis, total * i / n)));
    pts[n] = this.p2.slice();
    return pts;
  }
  down() {
    if (!this.cur) return;
    if (!this.p1) { this.plane = planeAt(this.app, this.cur); this.p1 = this.cur.p.slice(); this.plane.o = this.p1; return; }
    if (!this.p2) { if (V.dist(this.cur.p, this.p1) > 1e-6) { this.p2 = this.cur.p.slice(); this.h = 0; } return; }
    this.create();
  }
  create() {
    const pts = this.points();
    this.app.checkpoint();
    let last = null;
    for (let i = 0; i + 1 < pts.length; i++) { last = { id: this.model.next++, a: pts[i].slice(), b: pts[i + 1].slice() }; this.model.lines.push(last); }
    if (last) closeLoop(this.model, last);
    this.app.changed(); this.reset();
  }
  value(str) {
    const L = parseLength(str); if (L == null) return false;
    if (this.p2) { this.h = (Math.sign(this.h) || 1) * Math.abs(L); this.create(); return true; }
    if (this.p1 && this.cur) { const d = V.sub(this.cur.p, this.p1); if (V.len(d) < 1e-9) return false; this.p2 = V.add(this.p1, V.mul(V.norm(d), L)); this.h = 0; return true; }
    return false;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p2) drawPoly(c, v, this.points(), INK, false, { width: 1.6 });
    else if (this.p1) drawSeg(c, v, this.p1, s.p, INK, { width: 1, dash: [3, 3] });
    drawMarker(c, v, this.p2 ? null : s);
    const P = v.toScreen(s.p);
    drawChip(c, P.x, P.y, this.p2 ? (this.semi ? 'Półokrąg · ' : '') + 'wygięcie ' + fmtLength(Math.abs(this.h)) : s.label);
  }
}
function rotVec3(v, k, t) { const c = Math.cos(t), s = Math.sin(t); return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c))); }

/* ---------- przesuń (i kopiuj) ---------- */
// elementy: zaznaczenie albo to, co pod kursorem przy pierwszym kliknięciu
function targetsAt(app, x, y) {
  if (app.selection.size) return new Set(app.selection);
  const id = pickEntity(app, x, y);
  return id == null ? null : new Set(app.expand(id));
}
function eachTarget(m, targets, fs, fl, fg) {
  for (const s of m.shapes) if (targets.has(s.id)) fs(s);
  for (const l of m.lines) if (targets.has('l' + l.id)) fl(l);
  for (const g of m.guides) if (targets.has('g' + g.id)) fg(g);
  // wymiary i opisy przekształcamy jak odcinki (przekształcenia są afiniczne)
  for (const d of m.dims || []) if (targets.has('d' + d.id)) {
    const A = { a: d.a.slice(), b: d.b.slice() }, B = { a: V.add(d.a, d.off), b: d.b.slice() };
    fl(A); fl(B); d.a = A.a; d.b = A.b; d.off = V.sub(B.a, A.a);
  }
  for (const t of m.texts || []) if (targets.has('t' + t.id)) { const L = { a: t.p.slice(), b: t.q.slice() }; fl(L); t.p = L.a; t.q = L.b; }
  for (const q of m.sections || []) if (targets.has('s' + q.id)) { const L = { a: q.o.slice(), b: V.add(q.o, q.n) }; fl(L); q.o = L.a; q.n = V.norm(V.sub(L.b, L.a)); }
}
// kopie elementów (nowe id, grupy i komponenty kopiowane w całości); zwraca zbiór id kopii
const duplicate = (m, targets) => duplicateIds(m, targets);
// ramy grup przesuwanych w całości idą razem z nimi
function moveFrames(m, ids, f) { for (const g of groupsWhollyIn(m, ids)) if (g.frame) g.frame = transformFrame(g.frame, f); }

export class MoveTool extends Tool {
  reset() { this.p0 = null; this.targets = null; this.cur = null; this.start = null; this.sub = null; }
  hint() {
    const k = copyKey(this.app);
    if (this.app.editSolid != null && !this.p0) return 'Edycja bryły: chwyć wierzchołek, krawędź albo ścianę i przesuń. Strzałki blokują oś, wymiar wpiszesz z klawiatury.';
    if (this.app.sub.length && !this.app.selection.size && !this.p0) return 'Kliknij punkt, za który chwytasz zaznaczoną ścianę albo krawędź — przesunie się tylko ona, a bryła się odkształci.';
    return this.p0
      ? `Kliknij punkt docelowy albo wpisz odległość. <kbd>${k}</kbd> — ${this.copy ? '<b>włączone: kopia</b>' : 'kopia'}. Po kopii wpisz <kbd>x3</kbd>, żeby zrobić szyk, albo <kbd>/3</kbd>, żeby podzielić odstęp.`
      : `Kliknij punkt, za który chwytasz zaznaczenie (albo bryłę pod kursorem). <kbd>${k}</kbd> — ${this.copy ? '<b>włączone: kopia</b>' : 'kopia'}.`;
  }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  vcb() { return { label: 'Odległość', value: this.p0 && this.cur ? fmtLength(V.dist(this.p0, this.cur.p)) : this.lastValid() ? fmtLength(V.len(this.last.d)) : '' }; }
  move(e, x, y) {
    this.mx = x; this.my = y;
    if (!this.p0) { if (!this.app.selection.size) hoverShape(this.app, x, y); else this.v.setHoverFace(null); this.cur = this.app.snapper.find(x, y, { model: this.model }); return; }
    this.cur = this.app.snapper.find(x, y, { model: this.start, anchor: this.p0, lockAxis: this.app.lockAxis, excludeSet: this.copy || this.sub ? null : this.targets });
    if (this.cur) this.apply(V.sub(this.cur.p, this.p0));
  }
  apply(d, count = 1, copy = this.copy) {
    const m = cloneModel(this.start);
    if (this.sub) {
      const s = m.shapes.find(q => q.id === this.sub.id);
      if (s) { toMesh(s, facesOf); moveMeshPoints(s, this.sub.pts, d); }
      this.d = d; this.count = 1; this.result = new Set(); this.app.setModelLive(m); return;
    }
    let sel = this.targets;
    if (copy) {
      sel = new Set();
      for (let k = 1; k <= count; k++) {
        const ids = duplicate(m, this.targets), dk = V.mul(d, k);
        eachTarget(m, ids, s => translateShape(s, dk), l => translateLine(l, dk), g => translateGuide(g, dk));
        moveFrames(m, ids, p => V.add(p, dk));
        ids.forEach(i => sel.add(i));
      }
    } else { eachTarget(m, this.targets, s => translateShape(s, d), l => translateLine(l, d), g => translateGuide(g, d)); moveFrames(m, this.targets, p => V.add(p, d)); }
    this.d = d; this.count = count; this.result = sel;
    this.app.setModelLive(m);
  }
  down(e, x, y) {
    if (!this.cur) return;
    if (!this.p0) {
      // w edycji bryły: chwytasz wierzchołek, krawędź albo ścianę i ją przesuwasz
      let sub = this.app.editSolid != null && this.subAt(this.cur);
      // zaznaczona ściana albo krawędź: przesuwają się jej punkty, a bryła się odkształca
      if (!sub && this.app.sub.length && !this.app.selection.size) {
        const id = this.app.sub[0].id, pts = [];
        for (const q of this.app.sub) if (q.id === id) for (const p of q.pts) if (!pts.some(r => V.dist(r, p) < 1e-5)) pts.push(p.slice());
        sub = { id, pts, what: 'zaznaczenie' };
        this.app.clearSub();
      }
      if (sub) { this.sub = sub; this.targets = new Set(); this.p0 = this.cur.p.slice(); this.start = cloneModel(this.model); this.d = [0, 0, 0]; this.v.setHoverFace(null); return; }
      const t = targetsAt(this.app, x, y); if (!t) return;
      this.targets = t; this.p0 = this.cur.p.slice(); this.start = cloneModel(this.model); this.d = [0, 0, 0];
      this.v.setHoverFace(null);
      return;
    }
    this.finish();
  }
  // co pod kursorem w edytowanej bryle: punkty do przesunięcia
  subAt(c) {
    const s = this.model.shapes.find(q => q.id === this.app.editSolid); if (!s) return null;
    const near = (a, b) => V.dist(a, b) < 1e-5;
    if (c.type === 'end' && vertices(s).some(v => near(v, c.p))) return { id: s.id, pts: [c.p.slice()], what: 'wierzchołek' };
    if (c.type === 'mid' || c.type === 'edge') {
      for (const e of shapeEdges(s)) {
        const L = V.dist(e.a, e.b), t = V.dot(V.sub(c.p, e.a), V.norm(V.sub(e.b, e.a)));
        if (t > -1e-6 && t < L + 1e-6 && V.dist(V.add(e.a, V.mul(V.norm(V.sub(e.b, e.a)), t)), c.p) < 1e-4) return { id: s.id, pts: [e.a.slice(), e.b.slice()], what: 'krawędź' };
      }
    }
    if (c.face && c.face.shapeId === s.id) {
      const f = faceByKey(s, c.face.key); if (!f) return null;
      const pts = []; for (const p of f.region || [f.verts]) for (const v of p) if (!pts.some(q => near(q, v))) pts.push(v.slice());
      return { id: s.id, pts, what: 'ściana' };
    }
    return null;
  }
  finish() {
    if (!this.start) return;
    if (V.len(this.d) < 1e-9) { this.app.setModelLive(this.start); this.reset(); this.app.refresh(); return; }
    this.app.commitLive(this.start);
    if (!this.sub) { this.app.selection.clear(); this.result.forEach(i => this.app.selection.add(i)); this.app.selectionChanged(); }
    this.last = { start: this.start, targets: this.targets, d: this.d, copy: this.copy, count: this.count, sub: this.sub, seq: this.app.opSeq };
    this.reset();
  }
  redo(d, count) {
    // powtórzenie ostatniej operacji z nowym wymiarem albo liczbą kopii
    if (!this.lastValid() || !this.app.revertLast()) return false;
    const l = this.last; this.start = l.start; this.targets = l.targets; this.sub = l.sub;
    this.apply(d, count, l.copy); this.copy = l.copy; this.finish(); this.copy = false; return true;
  }
  value(str) {
    const n = parseCount(str), dv = parseDivide(str);
    if ((n || dv) && this.lastValid() && this.last.copy) return n ? this.redo(this.last.d, n) : this.redo(V.mul(this.last.d, 1 / dv), dv);
    const L = parseLength(str); if (L == null) return false;
    if (this.p0 && this.cur) { const d = V.sub(this.cur.p, this.p0); if (V.len(d) < 1e-9) return false; this.apply(V.mul(V.norm(d), L)); this.finish(); return true; }
    if (this.lastValid()) return this.redo(V.mul(V.norm(this.last.d), L), this.last.count);
    return false;
  }
  key(e) { if (isCopyKey(this.app, e)) { this.copy = !this.copy; if (this.p0 && this.cur) this.apply(V.sub(this.cur.p, this.p0)); this.app.updateHint(); return true; } return false; }
  cancel() { if (this.start) this.app.setModelLive(this.start); super.cancel(); }
  draw(c, v) {
    if (this.copy) drawPlus(c, this.mx, this.my);
    const s = this.cur; if (!s) return;
    if (this.p0) drawSeg(c, v, this.p0, s.p, s.axis ? AXIS_COLOR[s.axis] : INK, { width: 1.2, dash: [4, 3] });
    drawMarker(c, v, s);
    const P = v.toScreen(s.p);
    drawChip(c, P.x, P.y, this.p0 ? (s.label ? s.label + ' · ' : '') + fmtLength(V.dist(this.p0, s.p)) : s.label, s.axis ? AXIS_COLOR[s.axis] : BLUE);
  }
}

/* ---------- obróć ---------- */
export class RotateTool extends Tool {
  reset() { this.c = null; this.n = null; this.ref = null; this.targets = null; this.start = null; this.cur = null; this.ang = 0; this.lockN = null; this.freeN = null; }
  hint() {
    const k = copyKey(this.app);
    if (!this.c) return `Kliknij środek obrotu (na ziemi albo na ścianie). Kątomierz układa się na ścianie pod kursorem — przytrzymaj <kbd>⇧</kbd>, żeby zablokować jego płaszczyznę${this.lockN ? ' (<b>zablokowana</b>)' : ''}. Strzałki ustawiają oś: <kbd>↑</kbd> niebieska, <kbd>→</kbd> czerwona, <kbd>←</kbd> zielona. <kbd>${k}</kbd> — ${this.copy ? '<b>włączone: kopia</b>' : 'kopia'}.`;
    if (!this.ref) return 'Kliknij punkt, od którego liczysz kąt.';
    return `Obróć i kliknij albo wpisz kąt w stopniach. Kątomierz przyciąga co 15°. <kbd>${k}</kbd> — ${this.copy ? '<b>włączone: kopia</b>' : 'kopia'}; po kopii <kbd>x6</kbd> robi szyk.`;
  }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  vcb() { return { label: 'Kąt', value: this.ref ? fmtDeg(this.ang) : this.lastValid() ? fmtDeg(this.last.ang) : '' }; }
  move(e, x, y) {
    this.mx = x; this.my = y;
    if (!this.c) {
      if (!this.app.selection.size) hoverShape(this.app, x, y);
      this.cur = this.app.snapper.find(x, y, { model: this.model });
      // przytrzymany Shift zatrzymuje płaszczyznę kątomierza taką, jaka była tuż przed jego naciśnięciem (jak w SketchUpie)
      if (this.cur) {
        const n = planeAt(this.app, this.cur).n, had = !!this.lockN;
        if (e.shiftKey) this.lockN = this.lockN || this.freeN || n; else { this.lockN = null; this.freeN = n; }
        if (had !== !!this.lockN) this.app.updateHint();
      }
      return;
    }
    this.cur = this.app.snapper.find(x, y, { model: this.start || this.model, plane: { o: this.c, n: this.n }, excludeSet: this.ref && !this.copy ? this.targets : null });
    if (!this.cur || !this.ref) return;
    const d = V.sub(this.cur.p, this.c); if (V.len(d) < 1e-9) return;
    let a = Math.atan2(V.dot(V.cross(this.ref, d), this.n), V.dot(this.ref, d));
    const deg = a * 180 / Math.PI, snap = Math.round(deg / 15) * 15;
    if (Math.abs(deg - snap) < 2.5) a = snap * Math.PI / 180;
    this.apply(a);
  }
  apply(a, count = 1, copy = this.copy) {
    const m = cloneModel(this.start);
    let sel = this.targets;
    if (copy) {
      sel = new Set();
      for (let k = 1; k <= count; k++) {
        const ids = duplicate(m, this.targets), ak = a * k;
        eachTarget(m, ids, s => rotateShape(s, this.c, this.n, ak), l => rotateLine(l, this.c, this.n, ak), g => rotateGuide(g, this.c, this.n, ak));
        moveFrames(m, ids, p => V.add(this.c, rotVec(V.sub(p, this.c), this.n, ak)));
        ids.forEach(i => sel.add(i));
      }
    } else { eachTarget(m, this.targets, s => rotateShape(s, this.c, this.n, a), l => rotateLine(l, this.c, this.n, a), g => rotateGuide(g, this.c, this.n, a)); moveFrames(m, this.targets, p => V.add(this.c, rotVec(V.sub(p, this.c), this.n, a))); }
    this.ang = a; this.count = count; this.result = sel;
    this.app.setModelLive(m);
  }
  down(e, x, y) {
    if (!this.cur) return;
    if (!this.c) {
      const t = targetsAt(this.app, x, y); if (!t) return;
      this.targets = t;
      const pl = planeAt(this.app, this.cur);
      this.c = this.cur.p.slice(); this.n = this.lockN || pl.n; this.v.setHoverFace(null);
      return;
    }
    if (!this.ref) {
      const d = V.sub(this.cur.p, this.c); if (V.len(d) < 1e-6) return;
      this.ref = V.norm(d); this.start = cloneModel(this.model); this.ang = 0; return;
    }
    this.finish();
  }
  finish() {
    if (!this.start) return;
    if (Math.abs(this.ang) < 1e-9) { this.app.setModelLive(this.start); this.reset(); this.app.refresh(); return; }
    this.app.commitLive(this.start);
    this.app.selection.clear(); this.result.forEach(i => this.app.selection.add(i)); this.app.selectionChanged();
    this.last = { start: this.start, targets: this.targets, c: this.c, n: this.n, ref: this.ref, ang: this.ang, copy: this.copy, count: this.count, seq: this.app.opSeq };
    this.reset();
  }
  value(str) {
    const n = parseCount(str), dv = parseDivide(str);
    const redo = (a, count) => {
      if (!this.lastValid() || !this.app.revertLast()) return false;
      const l = this.last; Object.assign(this, { start: l.start, targets: l.targets, c: l.c, n: l.n, ref: l.ref });
      this.apply(a, count, l.copy); const keep = this.copy; this.copy = l.copy; this.finish(); this.copy = keep; return true;
    };
    if ((n || dv) && this.lastValid() && this.last.copy) return n ? redo(this.last.ang, n) : redo(this.last.ang / dv, dv);
    const deg = parseFloat(String(str).replace(',', '.').replace('°', ''));
    if (!isFinite(deg)) return false;
    if (this.ref) { this.apply(deg * Math.PI / 180); this.finish(); return true; }
    if (this.lastValid()) return redo(deg * Math.PI / 180, this.last.count);
    return false;
  }
  key(e) { if (isCopyKey(this.app, e)) { this.copy = !this.copy; if (this.ref) this.apply(this.ang); this.app.updateHint(); return true; } return false; }
  cancel() { if (this.start) this.app.setModelLive(this.start); super.cancel(); }
  draw(c, v) {
    if (this.copy) drawPlus(c, this.mx, this.my);
    const s = this.cur;
    const ctr = this.c || (s && s.p); if (!ctr) return;
    const n = this.n || this.lockN || (s ? planeAt(this.app, s).n : [0, 0, 1]);
    // kątomierz: okrąg z podziałką co 15°
    const R = this.v.pixelSize(ctr) * 70;
    let u = this.ref || (Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)));
    u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
    const w = V.cross(n, u), at = (a, r) => V.add(ctr, V.add(V.mul(u, Math.cos(a) * r), V.mul(w, Math.sin(a) * r)));
    // kolor kątomierza mówi, wokół której osi obracasz (także w podglądzie przed kliknięciem)
    const col = Math.abs(n[2]) > 0.999 ? AXIS_COLOR.z : Math.abs(n[0]) > 0.999 ? AXIS_COLOR.x : Math.abs(n[1]) > 0.999 ? AXIS_COLOR.y : BLUE;
    const ring = []; for (let i = 0; i < 48; i++) ring.push(at(i / 48 * Math.PI * 2, R));
    drawPoly(c, v, ring, col, true, { width: 1.2 });
    for (let i = 0; i < 24; i++) drawSeg(c, v, at(i / 24 * Math.PI * 2, R * (i % 6 ? 0.9 : 0.8)), at(i / 24 * Math.PI * 2, R), col, { width: 1 });
    if (this.ref) {
      drawSeg(c, v, ctr, at(0, R * 1.6), INK, { width: 1, dash: [3, 3] });
      drawSeg(c, v, ctr, at(this.ang, R * 1.6), INK, { width: 1.5 });
    } else if (this.c && s) drawSeg(c, v, ctr, s.p, INK, { width: 1, dash: [3, 3] });
    if (s) { drawMarker(c, v, s); const P = v.toScreen(s.p); drawChip(c, P.x, P.y, this.ref ? fmtDeg(this.ang) : s.label); }
  }
}
const fmtDeg = a => (a * 180 / Math.PI).toFixed(1).replace('.', ',') + '°';

/* ---------- odsunięcie ---------- */
export class OffsetTool extends Tool {
  reset() { this.face = null; this.cur = null; this.d = 0; }
  hint() { return this.face ? 'Przesuń do środka albo na zewnątrz i kliknij — albo wpisz odległość. Powstaje nowa ściana, którą możesz wypchnąć.' : 'Kliknij ścianę, której obrys chcesz odsunąć.'; }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  vcb() { return { label: 'Odległość', value: this.face ? fmtLength(Math.abs(this.d)) : this.lastValid() ? fmtLength(Math.abs(this.last.d)) : '' }; }
  move(e, x, y) {
    if (!this.face) { const hit = this.v.pick(x, y); const s = hit && this.model.shapes.find(q => q.id === hit.shapeId); this.v.setHoverFace(s ? faceByKey(s, hit.key)?.verts : null); this.cur = null; return; }
    const F = this.face;
    this.cur = this.app.snapper.find(x, y, { model: this.model, plane: { o: F.o, n: F.n } });
    if (!this.cur) return;
    this.d = insideDistance(F.pts, toPlane(F, this.cur.p));
  }
  down(e, x, y) {
    if (!this.face) {
      const hit = this.v.pick(x, y); if (!hit) return;
      const s = this.model.shapes.find(q => q.id === hit.shapeId), f = s && faceByKey(s, hit.key); if (!f) return;
      const F = facePlane(f);
      let a = 0; for (let i = 0; i < F.pts.length; i++) { const p = F.pts[i], q = F.pts[(i + 1) % F.pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
      if (a < 0) F.pts.reverse();
      this.face = F; this.soft = !!s.soft; this.color = s.color; this.v.setHoverFace(null);
      return;
    }
    this.create(this.d);
  }
  create(d) {
    const pts = offsetPolygon(this.face.pts, d);
    if (!pts || Math.abs(d) < 1e-6) { this.app.toast?.('Tak daleko nie da się odsunąć tego obrysu.'); return; }
    this.app.checkpoint();
    const s = makeShape(this.model, { o: this.face.o, u: this.face.u, v: this.face.v }, pts, 0, this.color || null);
    if (this.soft) s.soft = true;
    this.app.changed();
    this.last = { face: this.face, d, soft: this.soft, color: this.color, seq: this.app.opSeq };
    this.reset();
  }
  value(str) {
    const L = parseLength(str); if (L == null) return false;
    if (this.face) { this.create((Math.sign(this.d) || 1) * Math.abs(L)); return true; }
    if (this.lastValid() && this.app.revertLast()) { const l = this.last; this.face = l.face; this.soft = l.soft; this.color = l.color; this.create(Math.sign(l.d) * Math.abs(L)); return true; }
    return false;
  }
  draw(c, v) {
    if (!this.face || !this.cur) return;
    const pts = offsetPolygon(this.face.pts, this.d);
    if (pts) drawPoly(c, v, pts.map(q => fromPlane(this.face, q)), INK, true, { width: 1.6 });
    const P = v.toScreen(this.cur.p);
    drawChip(c, P.x, P.y, (this.d >= 0 ? 'do środka ' : 'na zewnątrz ') + fmtLength(Math.abs(this.d)));
  }
}

/* ---------- taśma: pomiar i prowadnice ---------- */
export class TapeTool extends Tool {
  reset() { this.p0 = null; this.dir = null; this.cur = null; }
  hint() {
    if (!this.p0) return 'Kliknij krawędź (albo jej środek), żeby poprowadzić równoległą prowadnicę, albo narożnik, żeby zmierzyć odległość. Prowadnice usuwa gumka.';
    return this.dir ? 'Przesuń i kliknij albo wpisz odległość prowadnicy od krawędzi.' : 'Kliknij drugi punkt pomiaru.';
  }
  vcb() { return { label: this.dir ? 'Odstęp' : 'Długość', value: this.p0 && this.cur ? fmtLength(this.dist()) : this.measured != null ? fmtLength(this.measured) : '' }; }
  off() { const d = V.sub(this.cur.p, this.p0); return V.sub(d, V.mul(this.dir, V.dot(d, this.dir))); }
  dist() { return this.dir ? V.len(this.off()) : V.dist(this.p0, this.cur.p); }
  move(e, x, y) { this.cur = this.app.snapper.find(x, y, { model: this.model, anchor: this.dir ? null : this.p0, lockAxis: this.dir ? null : this.app.lockAxis }); }
  down() {
    if (!this.cur) return;
    if (!this.p0) { this.p0 = this.cur.p.slice(); this.dir = (this.cur.type === 'edge' || this.cur.type === 'mid') && this.cur.dir ? this.cur.dir : null; this.measured = null; return; }
    if (this.dir) this.addGuide(this.off());
    else { this.measured = this.dist(); this.reset(); }
  }
  addGuide(off) {
    this.app.checkpoint();
    this.model.guides.push({ id: this.model.next++, o: V.add(this.p0, off), d: this.dir.slice() });
    this.app.changed(); this.reset();
  }
  value(str) {
    const L = parseLength(str); if (L == null || !this.p0 || !this.dir || !this.cur) return false;
    const o = this.off(); if (V.len(o) < 1e-9) return false;
    this.addGuide(V.mul(V.norm(o), L)); return true;
  }
  draw(c, v) {
    const s = this.cur; if (!s) return;
    if (this.p0 && this.dir) {
      const o = V.add(this.p0, this.off()), R = this.v.pixelSize(o) * 2000;
      drawSeg(c, v, V.sub(o, V.mul(this.dir, R)), V.add(o, V.mul(this.dir, R)), '#6f7c96', { width: 1, dash: [5, 4] });
      drawSeg(c, v, this.p0, o, INK, { width: 1, dash: [2, 3] });
    } else if (this.p0) drawSeg(c, v, this.p0, s.p, s.axis ? AXIS_COLOR[s.axis] : INK, { width: 1.2, dash: [4, 3] });
    drawMarker(c, v, s);
    const P = v.toScreen(s.p);
    drawChip(c, P.x, P.y, this.p0 ? fmtLength(this.dist()) : s.label);
  }
}

/* ---------- gumka ---------- */
// Najbliższa widoczna krawędź pod kursorem: { id, shape?, mark?, a, b }. Krawędzie zasłonięte przez ściany się nie liczą.
export function edgeAt(app, x, y) {
  const v = app.viewer, m = app.model;
  const an = pickAnnotation(m, p => v.toScreen(p), x, y);
  if (an) return { id: an };
  const ray = v.ray(x, y), org = ray.origin.toArray(), hit = v.pick(x, y);
  // punkt krawędzi najbliżej kursora musi leżeć przed pierwszą ścianą pod kursorem (z małym zapasem)
  const visible = p => { if (!hit) return true; const d = V.dist(org, p); return d <= hit.dist + Math.max(0.02, d * 0.004); };
  let best = null, bd = 7;
  const tryEdge = (a, b, make, bias = 0) => {
    const A = v.toScreen(a), B = v.toScreen(b); if (A.behind || B.behind) return;
    const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2));
    const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y) + bias;
    if (d >= bd || !visible(V.lerp(a, b, t))) return;
    bd = d; best = { a, b, ...make() };
  };
  const ctx = id => app.editing == null || app.inEditing(id);
  if (app.editSolid == null) for (const l of m.lines) { if (isHidden(m, l) || l.locked || !ctx('l' + l.id)) continue; tryEdge(l.a, l.b, () => ({ id: 'l' + l.id }), -1.5); }
  for (const s of m.shapes) {
    if (isHidden(m, s) || s.locked || !ctx(s.id) || (app.editSolid != null && s.id !== app.editSolid)) continue;
    for (const e of shapeEdges(s)) {
      if (e.soft) continue;
      tryEdge(e.a, e.b, () => ({ id: s.id, shape: s, edge: e }));
    }
  }
  if (best) return best;
  // prowadnice (bez końców): odcinek wokół miejsca najbliższego kamerze
  bd = 5;
  for (const g of m.guides || []) {
    const c = v.cam.position.toArray(), t = V.dot(V.sub(c, g.o), g.d), mid = V.add(g.o, V.mul(g.d, t)), R = Math.max(20, V.dist(c, mid) * 4);
    for (let i = 0; i < 16; i++) {
      const a = V.add(mid, V.mul(g.d, -R + 2 * R * i / 16)), b = V.add(mid, V.mul(g.d, -R + 2 * R * (i + 1) / 16)), A = v.toScreen(a), B = v.toScreen(b);
      if (A.behind || B.behind) continue;
      const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1, tt = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2));
      const d = Math.hypot(A.x + dx * tt - x, A.y + dy * tt - y);
      if (d < bd) { bd = d; best = { id: 'g' + g.id }; }
    }
  }
  return best;
}
// znacznik (linia dzieląca ścianę bryły), na którym leży krawędź e
function markOf(s, e) {
  if (!s.marks || !s.marks.length) return -1;
  const mid = V.lerp(e.a, e.b, 0.5);
  return s.marks.findIndex(([a, b]) => { const L = V.dist(a, b); if (L < 1e-9) return false; const d = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(mid, a), d); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(d, t)), mid) < 1e-5; });
}

export class EraserTool extends Tool {
  reset() { this.hover = null; this.erasing = false; }
  hint() { return 'Kliknij krawędź albo linię, żeby ją usunąć; przeciągnij, żeby usuwać kolejne. Gumka łapie tylko widoczne krawędzie: linia dzieląca ścianę znika i ściana się scala, krawędź płaskiej ściany usuwa ścianę (pozostałe krawędzie zostają), krawędź bryły usuwa bryłę.'; }
  move(e, x, y) {
    this.hover = edgeAt(this.app, x, y);
    if (this.erasing && (e.buttons & 1)) this.erase(x, y);
  }
  down(e, x, y) { this.erasing = true; this.started = false; this.erase(x, y); }
  up() { this.erasing = false; }
  erase(x, y) {
    const h = edgeAt(this.app, x, y); if (!h) return;
    const m = this.model, begin = () => { if (!this.started) { this.app.checkpoint(); this.started = true; } };
    const s = h.shape;
    // linia dzieląca ścianę: znika, a ściana się scala
    if (s && s.kind === 'mesh') {
      const k = markOf(s, h.edge);
      if (k >= 0) { begin(); s.marks = s.marks.filter((_, i) => i !== k); this.hover = null; this.app.changed(); return; }
    }
    const grouped = this.app.expand(h.id);
    // krawędź płaskiej ściany (poza grupą): ściana znika, pozostałe krawędzie zostają jako linie
    if (s && s.h === 0 && grouped.length === 1) {
      begin();
      const same = (p, q) => V.dist(p, q) < 1e-6, e0 = h.edge;
      for (const e of shapeEdges(s)) {
        if ((same(e.a, e0.a) && same(e.b, e0.b)) || (same(e.a, e0.b) && same(e.b, e0.a))) continue;
        const l = { id: m.next++, a: e.a.slice(), b: e.b.slice() }; if (s.g != null) l.g = s.g;
        m.lines.push(l);
      }
      m.shapes = m.shapes.filter(q => q !== s); this.app.selection.delete(s.id);
      this.hover = null; this.app.changed(); return;
    }
    // w edycji bryły prawdziwej krawędzi nie usuwamy — bryła przestałaby być zamknięta
    if (s && this.app.editSolid === s.id) { if (!this.warned) { this.warned = true; this.app.toast?.('Tej krawędzi nie da się usunąć bez otwarcia bryły. Gumka w edycji bryły usuwa linie dzielące ściany.'); } return; }
    begin();
    const ids = new Set(grouped);
    removeIds(m, ids);
    ids.forEach(id => this.app.selection.delete(id));
    this.hover = null; this.app.changed();
  }
  draw(c, v) {
    const h = this.hover; if (!h || !h.a) return;
    drawSeg(c, v, h.a, h.b, '#c2452d', { width: 3 });
  }
}

/* ---------- skaluj ---------- */
// Skalowanie niejednolite: kv[i] to współczynnik wzdłuż osi E[i] (osie prostopadłe), c — punkt, który zostaje w miejscu.
// Bryła wyciągnięta zostaje bryłą wyciągniętą, jeśli osie skalowania pasują do jej kierunków; w przeciwnym razie staje się siatką.
export function scaleTargets(m, targets, c, E, kv) {
  const f = p => { const d = V.sub(p, c); let q = c; for (let i = 0; i < 3; i++) q = V.add(q, V.mul(E[i], V.dot(d, E[i]) * kv[i])); return q; };
  const uni = Math.abs(kv[0] - kv[1]) < 1e-12 && Math.abs(kv[1] - kv[2]) < 1e-12;
  eachTarget(m, targets, s => {
    if (isMesh(s)) return transformMesh(s, f);
    if (uni) return scaleShape(s, c, kv[0], null);
    const t = JSON.parse(JSON.stringify(s)); let ok = true;
    for (let i = 0; i < 3; i++) if (Math.abs(kv[i] - 1) > 1e-12) ok = scaleShape(t, c, kv[i], E[i]) && ok;
    if (ok) { for (const k of Object.keys(s)) delete s[k]; Object.assign(s, t); }
    else { toMesh(s, facesOf); transformMesh(s, f); }
  }, l => { l.a = f(l.a); l.b = f(l.b); }, g => { const o = f(g.o), d = V.sub(f(V.add(g.o, g.d)), o); g.o = o; if (V.len(d) > 1e-12) g.d = V.norm(d); });
  moveFrames(m, targets, f);
}
// Ramka wokół elementów: osie E, połowy wymiarów i środek. Jedna bryła wyciągnięta dostaje ramkę we własnych
// kierunkach (żeby obrócona bryła skalowała się wzdłuż swoich boków); reszta — w osiach świata.
export function targetBox(m, targets, world = false) {
  const pts = []; let single = null, n = 0;
  eachTarget(m, targets, s => { n++; single = s; for (const p of vertices(s)) pts.push(p); }, l => { n += 2; pts.push(l.a, l.b); }, g => { n += 2; pts.push(g.o); });
  if (!pts.length) return null;
  const E = !world && n === 1 && single && !isMesh(single) ? [single.u, single.v, single.n] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { const t = V.dot(p, E[i]); lo[i] = Math.min(lo[i], t); hi[i] = Math.max(hi[i], t); }
  const half = [0, 1, 2].map(i => (hi[i] - lo[i]) / 2);
  let c = [0, 0, 0]; for (let i = 0; i < 3; i++) c = V.add(c, V.mul(E[i], (lo[i] + hi[i]) / 2));
  return { E, half, c };
}
const boxPoint = (b, sg) => { let p = b.c; for (let i = 0; i < 3; i++) p = V.add(p, V.mul(b.E[i], sg[i] * b.half[i])); return p; };

/* ---------- skaluj: ramka z uchwytami jak w SketchUpie ---------- */
// Narożnik skaluje całość, środek krawędzi — dwa kierunki, środek ściany — jeden kierunek. Punkt naprzeciwko
// uchwytu zostaje w miejscu (z ⌥ / Ctrl — środek ramki). Shift przełącza skalowanie na jednolite.
export class ScaleTool extends Tool {
  reset() { this.active = null; this.hover = null; this.cur = null; this.k = 1; this.downAt = null; }
  targets() { return new Set(this.app.selection); }
  box() { return this.app.selection.size ? targetBox(this.model, this.targets()) : null; }
  grips(b) {
    const out = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const sg = [x, y, z];
      if (!x && !y && !z) continue;
      if (sg.some((q, i) => q && b.half[i] < 1e-7)) continue;   // płaski kierunek nie ma uchwytów
      out.push({ sg, pos: boxPoint(b, sg), act: sg.map(q => q !== 0) });
    }
    return out;
  }
  hint() {
    const k = copyKey(this.app);
    if (this.active) return `Przesuń i kliknij albo wpisz współczynnik (np. <kbd>2</kbd>, <kbd>0,5</kbd>; <kbd>-1</kbd> odbija) albo wymiar z jednostką (np. <kbd>6m</kbd>). <kbd>${k}</kbd> — ${this.copy ? '<b>od środka</b>' : 'od środka'}, <kbd>⇧</kbd> — jednolicie.`;
    if (!this.app.selection.size) return 'Kliknij bryłę, linię albo grupę, którą chcesz skalować.';
    return `Chwyć uchwyt ramki: narożnik skaluje całość, środek krawędzi — dwa kierunki, środek ściany — jeden kierunek. <kbd>${k}</kbd> — ${this.copy ? '<b>włączone: od środka</b>' : 'od środka'}, <kbd>⇧</kbd> — jednolicie.`;
  }
  lastValid() { return this.last && this.last.seq === this.app.opSeq; }
  vcb() { return { label: 'Skala', value: this.active ? fmtK(this.k) : this.lastValid() ? fmtK(this.last.k) : '' }; }
  move(e, x, y) {
    this.mx = x; this.my = y; this.shift = e.shiftKey;
    const A = this.active;
    if (A) {
      this.cur = this.app.snapper.find(x, y, { model: A.start, line: { o: A.anchor, d: A.dir }, excludeSet: A.targets });
      if (this.cur) this.apply(V.dot(V.sub(this.cur.p, A.anchor), A.dir) / A.d0);
      return;
    }
    const b = this.box();
    if (!b) { hoverShape(this.app, x, y); this.hover = null; return; }
    this.v.setHoverFace(null);
    // uchwyt najbliżej kursora; przy remisie na ekranie wygrywa bliższy kamerze
    const cam = this.v.cam.position.toArray();
    let best = null, bd = 11;
    for (const g of this.grips(b)) {
      const P = this.v.toScreen(g.pos); if (P.behind) continue;
      const d = Math.hypot(P.x - x, P.y - y) + V.dist(cam, g.pos) * 1e-4;
      if (d < bd) { bd = d; best = g; }
    }
    this.hover = best;
  }
  // punkt stały i kierunek ciągnięcia dla uchwytu
  aim(A) {
    A.anchor = this.copy ? A.box.c : boxPoint(A.box, A.sg.map(q => -q));
    A.d0 = V.dist(A.pos, A.anchor); A.dir = V.mul(V.sub(A.pos, A.anchor), 1 / A.d0);
  }
  begin(g, b) {
    this.active = { start: cloneModel(this.model), targets: this.targets(), box: b, sg: g.sg, pos: g.pos, act: g.act };
    this.aim(this.active); this.k = 1; this.kv = [1, 1, 1];
  }
  apply(k) {
    const A = this.active; if (!A) return;
    if (Math.abs(k) < 1e-3) k = k < 0 ? -1e-3 : 1e-3;
    const kv = A.act.map(on => on || this.shift ? k : 1), m = cloneModel(A.start);
    scaleTargets(m, A.targets, A.anchor, A.box.E, kv);
    this.k = k; this.kv = kv;
    this.app.setModelLive(m);
  }
  down(e, x, y) {
    if (this.active) return this.finish();
    const b = this.box();
    if (b && this.hover) { this.begin(this.hover, b); this.downAt = { x, y }; return; }
    // klik poza uchwytami wybiera inny element (albo odznacza)
    const id = pickEntity(this.app, x, y), sel = this.app.selection;
    sel.clear(); if (id != null) this.app.expand(id).forEach(i => sel.add(i));
    this.hover = null; this.app.selectionChanged();
  }
  up(e, x, y) {
    // przeciągnięcie uchwytu zamiast dwóch kliknięć
    if (this.active && this.downAt && Math.hypot(x - this.downAt.x, y - this.downAt.y) > 6) this.finish();
    this.downAt = null;
  }
  finish() {
    const A = this.active; if (!A) return;
    this.active = null; this.hover = null;
    if (Math.abs(this.k - 1) < 1e-9) { this.app.setModelLive(A.start); this.app.refresh(); return; }
    this.app.commitLive(A.start);
    this.last = { ...A, k: this.k, shift: this.shift, center: this.copy, seq: this.app.opSeq };
  }
  value(str) {
    const t = String(str).trim();
    let k = null, len = null;
    if (/^[-+]?\d*[.,]?\d+$/.test(t)) k = parseFloat(t.replace(',', '.')); else len = parseLength(t);
    if (k == null && len == null) return false;
    // wymiar z jednostką: tyle ma mieć ramka wzdłuż kierunku uchwytu
    const go = () => { const A = this.active; this.apply(k != null ? k : len / (A.d0 * (this.copy ? 2 : 1))); this.finish(); return true; };
    if (this.active) return go();
    if (this.lastValid() && this.app.revertLast()) {
      const l = this.last, keep = [this.copy, this.shift];
      this.copy = l.center; this.shift = l.shift; this.active = { ...l };
      const r = go(); [this.copy, this.shift] = keep; return r;
    }
    return false;
  }
  key(e) {
    if (isCopyKey(this.app, e)) { this.copy = !this.copy; if (this.active) { this.aim(this.active); this.apply(this.k); } this.app.updateHint(); return true; }
    if (e.key === 'Shift' && this.active && !this.shift) { this.shift = true; this.apply(this.k); }
    return false;
  }
  cancel() { if (this.active) this.app.setModelLive(this.active.start); this.reset(); this.app.refresh(); }
  draw(c, v) {
    const A = this.active, b = A ? A.box : this.box(); if (!b) return;
    // podczas skalowania ramka rośnie razem z elementami
    const f = A ? p => { const d = V.sub(p, A.anchor); let q = A.anchor; for (let i = 0; i < 3; i++) q = V.add(q, V.mul(b.E[i], V.dot(d, b.E[i]) * this.kv[i])); return q; } : p => p;
    const corner = (x, y, z) => f(boxPoint(b, [x, y, z]));
    const frame = v.dark ? '#c9b86a' : '#a08a2e';
    for (const [a, d] of [[0, 1], [1, 2], [2, 0]]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
      const p = [0, 0, 0], q = [0, 0, 0], o = 3 - a - d;
      p[a] = s1; p[d] = s2; p[o] = -1; q[a] = s1; q[d] = s2; q[o] = 1;
      drawSeg(c, v, corner(...p), corner(...q), frame, { width: 1 });
    }
    const dot = (p, col, r = 3.5) => { const P = v.toScreen(p); if (P.behind) return; c.save(); c.fillStyle = col; c.strokeStyle = v.dark ? '#111' : '#fff'; c.lineWidth = 1; c.beginPath(); c.rect(P.x - r, P.y - r, 2 * r, 2 * r); c.fill(); c.stroke(); c.restore(); };
    const GREEN = '#4f8a46', RED = '#c0533f';
    if (A) {
      drawSeg(c, v, A.anchor, f(A.pos), INK, { width: 1, dash: [3, 3] });
      dot(A.anchor, RED, 4); dot(f(A.pos), RED, 4.5);
      const P = v.toScreen(f(A.pos));
      drawChip(c, P.x, P.y, 'Skala ' + fmtK(this.k) + (this.shift && !A.act.every(Boolean) ? ' · jednolicie' : '') + (this.copy ? ' · od środka' : ''));
      return;
    }
    for (const g of this.grips(b)) dot(g.pos, GREEN);
    if (this.hover) {
      const anchor = this.copy ? b.c : boxPoint(b, this.hover.sg.map(q => -q));
      dot(anchor, RED, 4); dot(this.hover.pos, RED, 4.5);
      const n = this.hover.act.filter(Boolean).length, P = v.toScreen(this.hover.pos);
      drawChip(c, P.x, P.y, n === 3 ? 'Cała bryła' : n === 2 ? 'Dwa kierunki' : 'Jeden kierunek');
    }
  }
}
const fmtK = k => (Math.round(k * 1000) / 1000).toString().replace('.', ',') + '×';
