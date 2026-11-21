// Narzędzia: zaznacz, linia, prostokąt, wypchnij/wciśnij, wiaderko, orbita, przesuń widok, powiększ.
// Każde narzędzie dostaje zdarzenia z okna (lewy przycisk; środkowy i kółko obsługuje nawigacja w app.js),
// rysuje swoje pomoce na nakładce 2D i może przyjmować wymiary wpisane z klawiatury.

import { V, makeShape, pushPull, extrudeFace, faceFromLoop, faceByKey, cloneModel, edges as shapeEdges } from './model.js';
import { AXIS_COLOR } from './snap.js';
import { parseLength, parseLengths, fmtLength, fmtNum } from './units.js';

const INK = '#1a1a19', BLUE = '#3f5f99';

/* ---------- rysowanie pomocy na nakładce ---------- */
export function drawSeg(c, v, a, b, color = INK, { width = 1.5, dash = null } = {}) {
  const A = v.toScreen(a), B = v.toScreen(b);
  if (A.behind || B.behind) return;
  c.save(); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); c.restore();
}
export function drawMarker(c, v, s) {
  if (!s) return;
  const P = v.toScreen(s.p); if (P.behind) return;
  c.save(); c.lineWidth = 1.4;
  const col = s.type === 'end' ? '#4f8a46' : s.type === 'mid' ? '#2f8c8c' : s.type === 'edge' ? '#c0533f' : s.type === 'face' ? BLUE : s.axis ? AXIS_COLOR[s.axis] : BLUE;
  c.strokeStyle = col; c.fillStyle = '#fff';
  c.beginPath();
  if (s.type === 'end' || s.type === 'from') c.arc(P.x, P.y, 4.5, 0, Math.PI * 2);
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
  c.fillStyle = 'rgba(255,255,255,.96)'; c.strokeStyle = 'rgba(0,0,0,.08)';
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
  hint() { return 'Kliknij bryłę albo linię, żeby ją zaznaczyć. <kbd>⇧</kbd> dodaje do zaznaczenia, <kbd>Delete</kbd> usuwa.'; }
  pickAny(x, y) {
    const hit = this.v.pick(x, y);
    let line = null, ld = 6;
    for (const l of this.model.lines) {
      const A = this.v.toScreen(l.a), B = this.v.toScreen(l.b);
      if (A.behind || B.behind) continue;
      const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2));
      const d = Math.hypot(A.x + dx * t - x, A.y + dy * t - y);
      if (d < ld) { ld = d; line = l; }
    }
    if (line) return 'l' + line.id;
    return hit ? hit.shapeId : null;
  }
  move(e, x, y) {
    const id = this.pickAny(x, y);
    if (id !== this.hoverId) {
      this.hoverId = id;
      const s = typeof id === 'number' && this.model.shapes.find(s => s.id === id);
      const hit = s && this.v.pick(x, y);
      this.v.setHoverFace(hit ? faceByKey(s, hit.key)?.verts : null);
    }
  }
  down(e, x, y) {
    const id = this.pickAny(x, y), sel = this.app.selection;
    if (id == null) { if (!e.shiftKey) sel.clear(); }
    else if (e.shiftKey) { sel.has(id) ? sel.delete(id) : sel.add(id); }
    else { sel.clear(); sel.add(id); }
    this.app.selectionChanged();
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
    const id = this.model.next++;
    this.model.lines.push({ id, a: this.anchor.slice(), b: p.slice() });
    this.ids.push(id); this.chain.push(p);
    // zamknięty obrys w jednej płaszczyźnie → ściana
    if (this.chain.length >= 4 && V.dist(p, this.chain[0]) < 1e-6) {
      const f = faceFromLoop(this.model, this.chain.slice(0, -1));
      if (f) this.model.lines = this.model.lines.filter(l => !this.ids.includes(l.id));
      this.app.changed(); this.reset(); this.app.lockAxis = null; return;
    }
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
      : `Kliknij ścianę i przesuń, żeby wypchnąć. Po zakończeniu możesz wpisać odległość. Dwuklik powtarza ostatnią. <kbd>${mod}</kbd> — ${this.copy ? '<b>włączone: nowa bryła</b>' : 'nowa bryła, krawędzie zostają'}.`;
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
    this.cur = this.app.snapper.find(x, y, { model: A.start, line: { o: A.o, d: A.d }, exclude: A.shapeId });
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
    this.active = { shapeId: s.id, key: hit.key, o: hit.point, d, start: cloneModel(this.model), flip: d !== f.normal };
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
    if (this.active) { this.dist = L; this.apply(L); this.finish(L); return true; }
    // po zakończeniu: wpisana odległość poprawia ostatnie wypchnięcie
    if (this.lastValid() && this.app.revertLast()) {
      const keep = this.copy; this.copy = this.last.copy;
      this.active = { ...this.last }; this.dist = L; this.apply(L); this.finish(L);
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
      c.save(); c.strokeStyle = INK; c.lineWidth = 1.6; c.lineCap = 'round';
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
  hint() { return `Kliknij bryłę, żeby nadać jej kolor. <kbd>${this.app.isMac ? '⌘' : 'Alt'}</kbd> + klik pobiera kolor z bryły.`; }
  move(e, x, y) {
    const hit = this.v.pick(x, y);
    const s = hit && this.model.shapes.find(q => q.id === hit.shapeId);
    this.v.setHoverFace(s ? faceByKey(s, hit.key)?.verts : null);
  }
  down(e, x, y) {
    const hit = this.v.pick(x, y); if (!hit) return;
    const s = this.model.shapes.find(q => q.id === hit.shapeId); if (!s) return;
    if ((this.app.isMac && e.metaKey) || (!this.app.isMac && e.altKey)) { this.app.setPaint(s.color || null); return; }
    if ((s.color || null) === this.app.paint) return;
    this.app.checkpoint(); s.color = this.app.paint; this.app.changed();
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

export { shapeEdges };
