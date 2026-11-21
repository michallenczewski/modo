// Model szkicu: bryły (wyciągnięte wielokąty) i luźne linie. Każda bryła jest osobna, jak grupa w SketchUpie.
//
// Bryła: { id, o, u, v, n, pts, h, color }
//   o — punkt początkowy płaszczyzny podstawy, u i v — osie tej płaszczyzny, n = u × v — kierunek wyciągnięcia,
//   pts — wielokąt podstawy we współrzędnych (u, v), zawsze przeciwnie do ruchu wskazówek zegara względem n,
//   h — wysokość wyciągnięcia (0 = płaska ściana, np. świeżo narysowany prostokąt).
// Linia: { id, a, b } — odcinek w przestrzeni.
// Wszystkie wymiary w metrach, oś Z w górę.

import { ShapeUtils, Vector2 } from './vendor/three.module.js';

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  eq: (a, b, e = 1e-6) => Math.abs(a[0] - b[0]) < e && Math.abs(a[1] - b[1]) < e && Math.abs(a[2] - b[2]) < e
};

export const EPS = 1e-6;
const area2 = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

export function newModel() { return { shapes: [], lines: [], guides: [], next: 1 }; }
// starsze pliki nie miały prowadnic
export function fixModel(m) { m.shapes ||= []; m.lines ||= []; m.guides ||= []; m.next ||= 1; return m; }
export const cloneModel = m => JSON.parse(JSON.stringify(m));

// punkt (a, b, c) w układzie bryły → świat
export const at = (s, a, b, c = 0) => [
  s.o[0] + s.u[0] * a + s.v[0] * b + s.n[0] * c,
  s.o[1] + s.u[1] * a + s.v[1] * b + s.n[1] * c,
  s.o[2] + s.u[2] * a + s.v[2] * b + s.n[2] * c
];

// porządek: h ≥ 0 i wielokąt przeciwnie do wskazówek zegara
export function normalizeShape(s) {
  if (s.h < 0) { s.o = V.add(s.o, V.mul(s.n, s.h)); s.h = -s.h; }
  if (area2(s.pts) < 0) s.pts = s.pts.slice().reverse();
  if (s.h < 1e-7) s.h = 0;
  return s;
}

export function makeShape(model, plane, pts, h = 0, color = null) {
  const s = normalizeShape({ id: model.next++, o: plane.o.slice(), u: V.norm(plane.u), v: V.norm(plane.v), n: V.norm(V.cross(plane.u, plane.v)), pts: pts.map(p => [p[0], p[1]]), h, color });
  model.shapes.push(s);
  return s;
}

/* ---------- ściany i krawędzie bryły ---------- */
// klucze ścian: 'top', 'bottom' (dla płaskiej: 'face'), 'side:i' — bok nad krawędzią i → i+1
export function faces(s) {
  const n = s.pts.length, out = [];
  const bot = s.pts.map(p => at(s, p[0], p[1], 0));
  if (s.h === 0) { out.push({ key: 'face', normal: s.n.slice(), verts: bot, poly: s.pts }); return out; }
  const top = s.pts.map(p => at(s, p[0], p[1], s.h));
  out.push({ key: 'top', normal: s.n.slice(), verts: top, poly: s.pts });
  out.push({ key: 'bottom', normal: V.mul(s.n, -1), verts: bot.slice().reverse(), poly: s.pts.slice().reverse() });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({ key: 'side:' + i, normal: sideNormal(s, i), verts: [bot[i], bot[j], top[j], top[i]] });
  }
  return out;
}
export function sideNormal(s, i) {
  const p = s.pts[i], q = s.pts[(i + 1) % s.pts.length];
  const e = V.norm(V.add(V.mul(s.u, q[0] - p[0]), V.mul(s.v, q[1] - p[1])));
  return V.norm(V.cross(e, s.n));
}
export function faceByKey(s, key) { return faces(s).find(f => f.key === key) || null; }

// krawędzie z normalnymi przyległych ścian (do grubości konturu sylwetki)
export function edges(s) {
  const n = s.pts.length, out = [];
  const bot = s.pts.map(p => at(s, p[0], p[1], 0));
  if (s.h === 0) {
    for (let i = 0; i < n; i++) out.push({ a: bot[i], b: bot[(i + 1) % n], n1: s.n, n2: null });
    return out;
  }
  const top = s.pts.map(p => at(s, p[0], p[1], s.h)), up = s.n, down = V.mul(s.n, -1);
  const sn = [...Array(n)].map((_, i) => sideNormal(s, i));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, k = (i - 1 + n) % n;
    out.push({ a: top[i], b: top[j], n1: up, n2: sn[i] });
    out.push({ a: bot[i], b: bot[j], n1: down, n2: sn[i] });
    // krawędź pionowa między bokami w jednej płaszczyźnie nie jest rysowana; na walcu (s.soft) tylko jako kontur
    const c = V.dot(sn[k], sn[i]);
    if (c < 0.9999) out.push({ a: bot[i], b: top[i], n1: sn[k], n2: sn[i], soft: !!s.soft && c > 0.94 });
  }
  return out;
}

// czy punkt leży na górnej ścianie bryły t (do styku brył postawionych jedna na drugiej)
export function onTopOf(p, t) {
  if (t.h === 0) return false;
  const top = at(t, 0, 0, t.h), d = V.sub(p, top);
  if (Math.abs(V.dot(d, t.n)) > 1e-4) return false;
  const x = V.dot(d, t.u), y = V.dot(d, t.v), P = t.pts;
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
  }
  return inside;
}

export function vertices(s) {
  const v = s.pts.map(p => at(s, p[0], p[1], 0));
  if (s.h > 0) for (const p of s.pts) v.push(at(s, p[0], p[1], s.h));
  return v;
}

// trójkąty ścian do siatki: [{ key, normal, tris: [[a,b,c],...] }]
export function triangulate(s) {
  return faces(s).map(f => {
    if (f.poly) {
      const contour = f.poly.map(p => new Vector2(p[0], p[1]));
      const idx = ShapeUtils.triangulateShape(contour, []);
      // ShapeUtils zwraca trójkąty zgodne z orientacją wielokąta; dla spodu wierzchołki są odwrócone
      const tris = idx.map(t => t.map(i => f.verts[i]));
      return { key: f.key, normal: f.normal, tris };
    }
    const [a, b, c, d] = f.verts;
    return { key: f.key, normal: f.normal, tris: [[a, b, c], [a, c, d]] };
  });
}

/* ---------- operacje ---------- */
const isect2 = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };

// push/pull ściany o odległość d wzdłuż jej zewnętrznej normalnej; zmienia bryłę w miejscu
export function pushPull(s, key, d) {
  if (key === 'top' || key === 'face') { s.h += d; normalizeShape(s); return s; }
  if (key === 'bottom') { s.o = V.add(s.o, V.mul(s.n, -d)); s.h += d; normalizeShape(s); return s; }
  const i = +key.split(':')[1], n = s.pts.length, j = (i + 1) % n;
  const p = s.pts[i], q = s.pts[j];
  const e = [q[0] - p[0], q[1] - p[1]], el = Math.hypot(e[0], e[1]) || 1;
  const out = [e[1] / el, -e[0] / el];
  const p2 = [p[0] + out[0] * d, p[1] + out[1] * d];
  const prev = s.pts[(i - 1 + n) % n], next = s.pts[(j + 1) % n];
  const a = isect2(p2, e, prev, [p[0] - prev[0], p[1] - prev[1]]) || p2;
  const b = isect2(p2, e, next, [q[0] - next[0], q[1] - next[1]]) || [q[0] + out[0] * d, q[1] + out[1] * d];
  s.pts = s.pts.slice(); s.pts[i] = a; s.pts[j] = b;
  normalizeShape(s);
  return s;
}

// nowa bryła wyciągnięta ze ściany (push/pull z Ctrl / ⌥)
export function extrudeFace(model, s, key, d) {
  const f = faceByKey(s, key); if (!f) return null;
  if (f.poly) {
    const top = key === 'top' || key === 'face';
    const plane = top ? { o: at(s, 0, 0, s.h), u: s.u, v: s.v } : { o: s.o, u: s.v, v: s.u };
    const pts = top ? s.pts : s.pts.map(p => [p[1], p[0]]);
    const ns = makeShape(model, plane, pts, d, s.color);
    if (s.soft) ns.soft = true;
    return ns;
  }
  const [a, b, , dTop] = f.verts;
  const u = V.norm(V.sub(b, a)), up = V.sub(dTop, a), hgt = V.len(up), v = V.norm(up);
  // n = u × v ma wskazywać na zewnątrz bryły
  const flip = V.dot(V.cross(u, v), f.normal) < 0;
  const w = V.dist(a, b);
  const plane = flip ? { o: b, u: V.mul(u, -1), v } : { o: a, u, v };
  return makeShape(model, plane, [[0, 0], [w, 0], [w, hgt], [0, hgt]], d, s.color);
}

// zamknięta pętla punktów leżących w jednej płaszczyźnie → płaska ściana
export function faceFromLoop(model, loop) {
  if (loop.length < 3) return null;
  // normalna metodą Newella
  let n = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) { const p = loop[i], q = loop[(i + 1) % loop.length]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); }
  if (V.len(n) < 1e-9) return null;
  n = V.norm(n);
  if (n[2] < -1e-6 || (Math.abs(n[2]) < 1e-6 && (n[1] < 0 || (Math.abs(n[1]) < 1e-6 && n[0] < 0)))) n = V.mul(n, -1);
  const o = loop[0];
  if (loop.some(p => Math.abs(V.dot(V.sub(p, o), n)) > 1e-4)) return null;   // nie w jednej płaszczyźnie
  let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n));
  u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
  const v = V.cross(n, u);
  const pts = loop.map(p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; });
  return makeShape(model, { o, u, v }, pts, 0);
}

export function bounds(model, extra) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = p => { for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } };
  for (const s of model.shapes) vertices(s).forEach(add);
  for (const l of model.lines) { add(l.a); add(l.b); }
  if (extra) extra.forEach(add);
  if (lo[0] === Infinity) return null;
  return { lo, hi, center: V.lerp(lo, hi, 0.5), radius: Math.max(V.dist(lo, hi) / 2, 1) };
}

/* ---------- okrąg, przesunięcie, obrót, odsunięcie ---------- */
export const CIRCLE_SEGMENTS = 24;
export function circlePts(r, n = CIRCLE_SEGMENTS, a0 = 0) {
  const pts = []; for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return pts;
}

export function translateShape(s, d) { s.o = V.add(s.o, d); return s; }
export function translateLine(l, d) { l.a = V.add(l.a, d); l.b = V.add(l.b, d); return l; }
export function translateGuide(g, d) { g.o = V.add(g.o, d); return g; }

// obrót wektora v wokół osi k (jednostkowej) o kąt t (wzór Rodriguesa)
export function rotVec(v, k, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}
const rotPt = (p, c, k, t) => V.add(c, rotVec(V.sub(p, c), k, t));
export function rotateShape(s, c, k, t) { s.o = rotPt(s.o, c, k, t); s.u = rotVec(s.u, k, t); s.v = rotVec(s.v, k, t); s.n = rotVec(s.n, k, t); return s; }
export function rotateLine(l, c, k, t) { l.a = rotPt(l.a, c, k, t); l.b = rotPt(l.b, c, k, t); return l; }
export function rotateGuide(g, c, k, t) { g.o = rotPt(g.o, c, k, t); g.d = rotVec(g.d, k, t); return g; }

// wielokąt (przeciwnie do wskazówek zegara) odsunięty o d: d > 0 do środka; null, gdy się wywija albo znika
export function offsetPolygon(pts, d) {
  const n = pts.length, out = [];
  const nrm = (p, q) => { const e = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(e[0], e[1]) || 1; return [-e[1] / l, e[0] / l]; };   // w lewo = do środka
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const n1 = nrm(a, b), n2 = nrm(b, c);
    const p1 = [a[0] + n1[0] * d, a[1] + n1[1] * d], p2 = [b[0] + n1[0] * d, b[1] + n1[1] * d];
    const q1 = [b[0] + n2[0] * d, b[1] + n2[1] * d], q2 = [c[0] + n2[0] * d, c[1] + n2[1] * d];
    const x = isect2(p1, [p2[0] - p1[0], p2[1] - p1[1]], q1, [q2[0] - q1[0], q2[1] - q1[1]]);
    out.push(x || q1);
  }
  const A0 = area2(pts), A1 = area2(out);
  if (A1 <= 1e-9 || Math.sign(A1) !== Math.sign(A0)) return null;
  // każda krawędź musi zachować kierunek (inaczej wielokąt się wywinął)
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], P = out[i], Q = out[(i + 1) % n];
    if ((q[0] - p[0]) * (Q[0] - P[0]) + (q[1] - p[1]) * (Q[1] - P[1]) <= 0) return null;
  }
  return out;
}

// płaszczyzna i wielokąt 2D dowolnej ściany (do odsunięcia)
export function facePlane(f) {
  const n = f.normal, o = f.verts[0];
  let u = V.norm(V.sub(f.verts[1], f.verts[0]));
  u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
  const v = V.cross(n, u);
  let pts = f.verts.map(p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; });
  return { o, u, v, n, pts };
}
// odległość punktu (2D) od brzegu wielokąta, dodatnia w środku
export function insideDistance(pts, p) {
  let dmin = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[j], b = pts[i];
    if ((b[1] > p[1]) !== (a[1] > p[1]) && p[0] < (a[0] - b[0]) * (p[1] - b[1]) / (a[1] - b[1]) + b[0]) inside = !inside;
    const ex = b[0] - a[0], ey = b[1] - a[1], L2 = ex * ex + ey * ey || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / L2));
    dmin = Math.min(dmin, Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]));
  }
  return inside ? dmin : -dmin;
}

/* ---------- zamknięte obrysy z luźnych linii ---------- */
// szuka najkrótszego cyklu przez linię `l` (po końcach innych luźnych linii); gdy leży w jednej płaszczyźnie — tworzy ścianę
export function closeLoop(model, l) {
  const key = p => p.map(v => Math.round(v * 1e5)).join(',');
  const adj = new Map();
  const add = (k, e) => { let a = adj.get(k); if (!a) adj.set(k, a = []); a.push(e); };
  for (const e of model.lines) { if (e.id === l.id) continue; add(key(e.a), { line: e, to: e.b }); add(key(e.b), { line: e, to: e.a }); }
  const start = key(l.b), goal = key(l.a);
  // szukanie wszerz od końca nowej linii do jej początku
  const prev = new Map([[start, null]]), q = [l.b];
  let found = false;
  while (q.length && !found) {
    const p = q.shift(), k = key(p);
    for (const e of adj.get(k) || []) {
      const k2 = key(e.to); if (prev.has(k2)) continue;
      prev.set(k2, { from: k, line: e.line, p: e.to }); q.push(e.to);
      if (k2 === goal) { found = true; break; }
    }
    if (prev.size > 5000) break;
  }
  if (!found) return null;
  const loop = [l.b], ids = [l.id];
  let k = goal; const path = [];
  while (k !== start) { const s = prev.get(k); path.push(s); k = s.from; }
  for (let i = path.length - 1; i >= 0; i--) { loop.push(path[i].p); ids.push(path[i].line.id); }
  loop.pop();   // ostatni punkt to początek nowej linii, ten sam co pierwszy w pętli po obróceniu
  loop.unshift(l.a);
  const pts = loop.filter((p, i) => i === 0 || !V.eq(p, loop[i - 1], 1e-6));
  if (V.eq(pts[0], pts[pts.length - 1], 1e-6)) pts.pop();
  const f = faceFromLoop(model, pts);
  if (!f) return null;
  model.lines = model.lines.filter(e => !ids.includes(e.id));
  return f;
}
