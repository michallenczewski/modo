// Model szkicu: bryły (wyciągnięte wielokąty) i luźne linie. Każda bryła jest osobna, jak grupa w SketchUpie.
//
// Bryła: { id, o, u, v, n, pts, h, color }
//   o — punkt początkowy płaszczyzny podstawy, u i v — osie tej płaszczyzny, n = u × v — kierunek wyciągnięcia,
//   pts — wielokąt podstawy we współrzędnych (u, v), zawsze przeciwnie do ruchu wskazówek zegara względem n,
//   h — wysokość wyciągnięcia (0 = płaska ściana, np. świeżo narysowany prostokąt).
// Linia: { id, a, b } — odcinek w przestrzeni.
// Wszystkie wymiary w metrach, oś Z w górę.

import { ShapeUtils, Vector2 } from './vendor/three.module.js';
import { triangulateHoles } from './mesh.js';
import { pushFace } from './geo.js';
import { isMesh, toMesh, meshEdges, meshVertices, meshTriangles, pushPullMesh, transformMesh, newell, regionOf, regionLoops, flagEdges } from './mesh.js';

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
export const area2 = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };

export function newModel() { return { shapes: [], lines: [], guides: [], groups: [], dims: [], texts: [], sections: [], tags: [], next: 1 }; }
// starsze pliki nie miały prowadnic
export function fixModel(m) { m.shapes ||= []; m.lines ||= []; m.guides ||= []; m.groups ||= []; m.dims ||= []; m.texts ||= []; m.sections ||= []; m.tags ||= []; m.next ||= 1; return m; }
// usuwa elementy o podanych id: liczba — bryła, 'l' linia, 'g' prowadnica, 'd' wymiar, 't' opis
export function removeIds(m, ids) {
  const has = x => ids.has(x);
  m.shapes = m.shapes.filter(s => !has(s.id));
  m.lines = m.lines.filter(l => !has('l' + l.id));
  m.guides = m.guides.filter(g => !has('g' + g.id));
  m.dims = (m.dims || []).filter(d => !has('d' + d.id));
  m.texts = (m.texts || []).filter(t => !has('t' + t.id));
  m.sections = (m.sections || []).filter(q => !has('s' + q.id));
}
export const cloneModel = m => JSON.parse(JSON.stringify(m));
// element niewidoczny: ukryty sam albo leży na wyłączonej warstwie (własnej albo którejś z grup, w których jest)
// Widok może chwilowo chować część modelu bez zapisywania tego w pliku (np. reszta modelu przy edycji grupy):
// `viewHide.fn(e)` zwraca true dla elementów, których teraz nie widać. Wszystko, co pomija ukryte, idzie przez isHidden.
export const viewHide = { fn: null };
export function isHidden(m, e) {
  if (e.hidden) return true;
  if (viewHide.fn && viewHide.fn(e)) return true;
  const tags = m.tags; if (!tags || !tags.length) return false;
  const off = id => id != null && tags.some(t => t.id === id && t.hidden);
  if (off(e.tag)) return true;
  if (e.g != null) for (const g of chainOf(m, e.g)) if (off(g.tag)) return true;
  return false;
}

// punkt (a, b, c) w układzie bryły → świat
export const at = (s, a, b, c = 0) => [
  s.o[0] + s.u[0] * a + s.v[0] * b + s.n[0] * c,
  s.o[1] + s.u[1] * a + s.v[1] * b + s.n[1] * c,
  s.o[2] + s.u[2] * a + s.v[2] * b + s.n[2] * c
];

// porządek: h ≥ 0 i wielokąt przeciwnie do wskazówek zegara
export function normalizeShape(s) {
  if (isMesh(s)) return s;
  if (s.h < 0) { s.o = V.add(s.o, V.mul(s.n, s.h)); s.h = -s.h; }
  // obrys przeciwnie do wskazówek zegara, otwory (s.holes) zgodnie — materiał jest zawsze po lewej stronie obiegu
  if (area2(s.pts) < 0) s.pts = s.pts.slice().reverse();
  if (s.holes) { s.holes = s.holes.filter(h => h.length >= 3).map(h => area2(h) > 0 ? h.slice().reverse() : h); if (!s.holes.length) delete s.holes; }
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
  if (isMesh(s)) return s.polys.map((p, i) => ({ key: 'p:' + i, normal: newell(p), verts: p }));
  const n = s.pts.length, out = [], H = s.holes || [];
  const bot = s.pts.map(p => at(s, p[0], p[1], 0)), hb = H.map(h => h.map(p => at(s, p[0], p[1], 0)));
  if (s.h === 0) { out.push({ key: 'face', normal: s.n.slice(), verts: bot, poly: s.pts, holes: hb, holes2: H }); return out; }
  const top = s.pts.map(p => at(s, p[0], p[1], s.h)), ht = H.map(h => h.map(p => at(s, p[0], p[1], s.h)));
  out.push({ key: 'top', normal: s.n.slice(), verts: top, poly: s.pts, holes: ht, holes2: H });
  out.push({ key: 'bottom', normal: V.mul(s.n, -1), verts: bot.slice().reverse(), poly: s.pts.slice().reverse(), holes: hb.map(h => h.slice().reverse()), holes2: H.map(h => h.slice().reverse()) });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push({ key: 'side:' + i, normal: sideNormal(s, i), verts: [bot[i], bot[j], top[j], top[i]] });
  }
  // ściany otworów: klucz 'hole:<otwór>:<bok>'
  H.forEach((h, k) => { for (let i = 0; i < h.length; i++) { const j = (i + 1) % h.length; out.push({ key: 'hole:' + k + ':' + i, normal: sideNormal(s, i, h), verts: [hb[k][i], hb[k][j], ht[k][j], ht[k][i]] }); } });
  return out;
}
export function sideNormal(s, i, loop = s.pts) {
  const p = loop[i], q = loop[(i + 1) % loop.length];
  const e = V.norm(V.add(V.mul(s.u, q[0] - p[0]), V.mul(s.v, q[1] - p[1])));
  return V.norm(V.cross(e, s.n));
}
export function faceByKey(s, key) {
  if (isMesh(s)) {
    // ściana bryły dowolnej to cały obszar w jednej płaszczyźnie — zwracamy jej obrys
    const i = +String(key).split(':')[1]; if (!s.polys[i]) return null;
    const idx = regionOf(s, i), loops = idx.length > 1 ? regionLoops(s, idx) : [s.polys[i]];
    const region = idx.map(j => s.polys[j]), verts = loops.length === 1 ? loops[0] : s.polys[i].slice();
    // ściana z otworami składa się z kilku kawałków: podświetlenie ma objąć wszystkie, nie jeden trójkąt
    if (loops.length !== 1) verts.region = region;
    return { key, normal: newell(s.polys[i]), verts, region };
  }
  const f = faces(s).find(f => f.key === key) || null;
  if (f && f.holes && f.holes.length) f.verts.region = triangulateHoles(f.verts, f.holes);
  return f;
}

// krawędzie z normalnymi przyległych ścian (do grubości konturu sylwetki)
export function edges(s) {
  if (isMesh(s)) return meshEdges(s);
  const out = [], up = s.n, down = V.mul(s.n, -1);
  // obrys i każdy otwór to pętla; w otworze materiał też jest po lewej, więc wzory są te same
  [s.pts, ...(s.holes || [])].forEach((L, li) => {
    const n = L.length, bot = L.map(p => at(s, p[0], p[1], 0));
    if (s.h === 0) { for (let i = 0; i < n; i++) out.push({ a: bot[i], b: bot[(i + 1) % n], n1: s.n, n2: null }); return; }
    const top = L.map(p => at(s, p[0], p[1], s.h)), sn = [...Array(n)].map((_, i) => sideNormal(s, i, L));
    const round = li ? n >= 12 : !!s.soft;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, k = (i - 1 + n) % n;
      out.push({ a: top[i], b: top[j], n1: up, n2: sn[i] });
      out.push({ a: bot[i], b: bot[j], n1: down, n2: sn[i] });
      // krawędź pionowa między bokami w jednej płaszczyźnie nie jest rysowana; na walcu (s.soft) tylko jako kontur
      const c = V.dot(sn[k], sn[i]);
      if (c < 0.9999) out.push({ a: bot[i], b: top[i], n1: sn[k], n2: sn[i], soft: round && c > 0.94 });
    }
  });
  return flagEdges(s, out);
}
// listy krawędzi wygładzonych i ukrytych bryły wyciągniętej leżą w świecie, więc idą razem z nią
const mapFlags = (s, f) => { for (const k of ['softs', 'hid']) if (s[k]) s[k] = s[k].map(([a, b]) => [f(a), f(b)]); };

// czy punkt leży na górnej ścianie bryły t (do styku brył postawionych jedna na drugiej)
export function onTopOf(p, t) {
  if (isMesh(t) || t.h === 0) return false;
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
  if (isMesh(s)) return meshVertices(s);
  const P = [s.pts, ...(s.holes || [])].flat(), v = P.map(p => at(s, p[0], p[1], 0));
  if (s.h > 0) for (const p of P) v.push(at(s, p[0], p[1], s.h));
  return v;
}

// trójkąty ścian do siatki: [{ key, normal, tris: [[a,b,c],...] }]
export function triangulate(s) {
  if (isMesh(s)) return meshTriangles(s);
  return faces(s).map(f => {
    if (f.poly) {
      const contour = f.poly.map(p => new Vector2(p[0], p[1])), holes = (f.holes2 || []).map(h => h.map(p => new Vector2(p[0], p[1])));
      const idx = ShapeUtils.triangulateShape(contour, holes), all = holes.length ? [...f.verts, ...f.holes.flat()] : f.verts;
      // ShapeUtils zwraca trójkąty zgodne z orientacją wielokąta; dla spodu wierzchołki są odwrócone
      const tris = idx.map(t => t.map(i => all[i]));
      return { key: f.key, normal: f.normal, tris };
    }
    const [a, b, c, d] = f.verts;
    return { key: f.key, normal: f.normal, tris: [[a, b, c], [a, c, d]] };
  });
}

/* ---------- operacje ---------- */
const isect2 = (p, d, q, e) => { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 1e-9) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return [p[0] + d[0] * t, p[1] + d[1] * t]; };

// push/pull ściany o odległość d wzdłuż jej zewnętrznej normalnej; zmienia bryłę w miejscu
// keep (⌥ / Ctrl): pierwotna ściana zostaje na miejscu — tylko we wspólnej geometrii
export function pushPull(s, key, d, keep) {
  if (isMesh(s)) return s.geo ? pushFace(s, +key.split(':')[1], d, keep) : pushPullMesh(s, +key.split(':')[1], d);
  if (key === 'top' || key === 'face') { s.h += d; normalizeShape(s); return s; }
  if (key === 'bottom') { s.o = V.add(s.o, V.mul(s.n, -d)); s.h += d; normalizeShape(s); return s; }
  if (key.startsWith('hole:')) { const [, k, e] = key.split(':'); s.holes = s.holes.slice(); s.holes[+k] = pushEdge(s.holes[+k], +e, d); normalizeShape(s); return s; }
  s.pts = pushEdge(s.pts, +key.split(':')[1], d); normalizeShape(s); return s;
}
// bok pętli i → i+1 odsunięty o d na prawo od kierunku obiegu (na zewnątrz materiału); sąsiednie boki się wydłużają
function pushEdge(pts, i, d) {
  const s = { pts };
  const n = s.pts.length, j = (i + 1) % n;
  const p = s.pts[i], q = s.pts[j];
  const e = [q[0] - p[0], q[1] - p[1]], el = Math.hypot(e[0], e[1]) || 1;
  const out = [e[1] / el, -e[0] / el];
  const p2 = [p[0] + out[0] * d, p[1] + out[1] * d];
  const prev = s.pts[(i - 1 + n) % n], next = s.pts[(j + 1) % n];
  const a = isect2(p2, e, prev, [p[0] - prev[0], p[1] - prev[1]]) || p2;
  const b = isect2(p2, e, next, [q[0] - next[0], q[1] - next[1]]) || [q[0] + out[0] * d, q[1] + out[1] * d];
  s.pts = s.pts.slice(); s.pts[i] = a; s.pts[j] = b;
  return s.pts;
}

// nowa bryła wyciągnięta ze ściany (push/pull z Ctrl / ⌥) — działa dla każdej ściany, także bryły dowolnej
export function extrudeFace(model, s, key, d) {
  const f = faceByKey(s, key); if (!f) return null;
  const fp = facePlane(f);
  let a = 0; for (let i = 0; i < fp.pts.length; i++) { const p = fp.pts[i], q = fp.pts[(i + 1) % fp.pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const pts = a < 0 ? fp.pts.slice().reverse() : fp.pts;
  const ns = makeShape(model, { o: fp.o, u: fp.u, v: fp.v }, pts, d, s.color);
  if (s.soft) ns.soft = true;
  if (s.alpha != null) ns.alpha = s.alpha;
  return ns;
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

export function bounds(model, extra, only) {
  if (only) { const ids = new Set(only); model = { shapes: model.shapes.filter(s => ids.has(s.id)), lines: model.lines.filter(l => ids.has('l' + l.id)) }; extra = null; }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const add = p => { for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } };
  for (const s of model.shapes) if (!isHidden(model, s)) vertices(s).forEach(add);
  for (const l of model.lines) if (!isHidden(model, l)) { add(l.a); add(l.b); }
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

export function translateShape(s, d) { if (isMesh(s)) return transformMesh(s, p => V.add(p, d)); mapFlags(s, p => V.add(p, d)); s.o = V.add(s.o, d); return s; }
export function translateLine(l, d) { l.a = V.add(l.a, d); l.b = V.add(l.b, d); return l; }
export function translateGuide(g, d) { g.o = V.add(g.o, d); return g; }

// obrót wektora v wokół osi k (jednostkowej) o kąt t (wzór Rodriguesa)
export function rotVec(v, k, t) {
  const c = Math.cos(t), s = Math.sin(t);
  return V.add(V.add(V.mul(v, c), V.mul(V.cross(k, v), s)), V.mul(k, V.dot(k, v) * (1 - c)));
}
const rotPt = (p, c, k, t) => V.add(c, rotVec(V.sub(p, c), k, t));
export function rotateShape(s, c, k, t) { if (isMesh(s)) return transformMesh(s, p => rotPt(p, c, k, t)); mapFlags(s, p => rotPt(p, c, k, t)); s.o = rotPt(s.o, c, k, t); s.u = rotVec(s.u, k, t); s.v = rotVec(s.v, k, t); s.n = rotVec(s.n, k, t); return s; }
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
export function closeLoop() { return null; }   // zamykanie obrysów przejął układ płaski (stitch.js)
function closeLoopOld(model, l) {
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

/* ---------- podobne bryły (do „ukryj podobne”) ---------- */
// ta sama wysokość, rodzaj i kolor oraz ten sam obrys z dokładnością do przesunięcia, obrotu i punktu startowego
function signature(s) {
  const n = s.pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = s.pts[i], q = s.pts[(i + 1) % n], r = s.pts[(i + 2) % n];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const t = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    out.push(Math.round(L * 1000) + ':' + Math.sign(Math.round(t * 1e6)));
  }
  return out;
}
export function similar(a, b) {
  if (isMesh(a) || isMesh(b)) { if (!isMesh(a) || !isMesh(b) || a.polys.length !== b.polys.length || (a.color || '') !== (b.color || '')) return false; const sz = s => s.polys.map(p => p.length).sort().join(','); const ar = s => Math.round(s.polys.reduce((x, p) => x + p.length, 0)); return sz(a) === sz(b) && ar(a) === ar(b) && Math.abs(meshAreaOf(a) - meshAreaOf(b)) < 1e-3; }
  if (a.pts.length !== b.pts.length || (a.holes || []).length !== (b.holes || []).length || Math.abs(a.h - b.h) > 1e-4 || (a.op || '') !== (b.op || '') || (a.color || '') !== (b.color || '')) return false;
  const A = signature(a), B = signature(b), n = A.length;
  for (let k = 0; k < n; k++) { let ok = true; for (let i = 0; i < n && ok; i++) ok = A[i] === B[(i + k) % n]; if (ok) return true; }
  return false;
}

/* ---------- skalowanie ---------- */
// k — współczynnik; axis — null (jednolicie) albo jednostkowy wektor osi. Zwraca false, gdy bryły nie da się tak przeskalować
// (oś ani prostopadła, ani równoległa do jej podstawy — wtedy bryła przestałaby być prostym wyciągnięciem).
export function scaleShape(s, c, k, axis) {
  if (isMesh(s)) { transformMesh(s, p => scalePoint(p, c, k, axis)); return true; }
  if (Math.abs(Math.abs(axis ? V.dot(axis, s.n) : 1) - 1) < 1e-3 || Math.abs(axis ? V.dot(axis, s.n) : 1) < 1e-3) mapFlags(s, p => scalePoint(p, c, k, axis));
  if (!axis) {
    s.o = V.add(c, V.mul(V.sub(s.o, c), k)); s.pts = s.pts.map(p => [p[0] * k, p[1] * k]); s.h *= k;
    if (s.holes) s.holes = s.holes.map(h => h.map(p => [p[0] * k, p[1] * k]));
    if (k < 0) { s.u = V.mul(s.u, -1); s.v = V.mul(s.v, -1); s.pts = s.pts.map(p => [-p[0], -p[1]]); if (s.holes) s.holes = s.holes.map(h => h.map(p => [-p[0], -p[1]])); }
    normalizeShape(s); return true;
  }
  const along = p => V.add(p, V.mul(axis, V.dot(V.sub(p, c), axis) * (k - 1)));
  const dn = V.dot(axis, s.n);
  if (Math.abs(Math.abs(dn) - 1) < 1e-3) { s.o = along(s.o); s.h *= k; normalizeShape(s); return true; }
  if (Math.abs(dn) < 1e-3) {
    const w = s.pts.map(p => along(at(s, p[0], p[1], 0))), hw = (s.holes || []).map(h => h.map(p => along(at(s, p[0], p[1], 0))));
    s.o = w[0];
    const back = p => { const d = V.sub(p, s.o); return [V.dot(d, s.u), V.dot(d, s.v)]; };
    s.pts = w.map(back); if (s.holes) s.holes = hw.map(h => h.map(back));
    normalizeShape(s); return true;
  }
  return false;
}
export function scalePoint(p, c, k, axis) { return axis ? V.add(p, V.mul(axis, V.dot(V.sub(p, c), axis) * (k - 1))) : V.add(c, V.mul(V.sub(p, c), k)); }

/* ---------- wycięcia ---------- */
// bryła, na której ścianie leży płaska ścianka s (np. prostokąt narysowany na elewacji)
export function hostFace(model, s) {
  if (s.h !== 0) return null;
  let cx = 0, cy = 0; for (const p of s.pts) { cx += p[0]; cy += p[1]; }
  const c = at(s, cx / s.pts.length, cy / s.pts.length, 0);
  for (const t of model.shapes) {
    if (t === s || t.h === 0 || t.op === 'cut' || isHidden(model, t)) continue;
    for (const f of faces(t)) {
      if (Math.abs(Math.abs(V.dot(f.normal, s.n)) - 1) > 1e-4 || Math.abs(V.dot(V.sub(c, f.verts[0]), f.normal)) > 1e-4) continue;
      const fp = facePlane(f);
      let a = 0; for (let i = 0; i < fp.pts.length; i++) { const p = fp.pts[i], q = fp.pts[(i + 1) % fp.pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
      if (a < 0) fp.pts.reverse();
      const d = V.sub(c, fp.o);
      if (insideDistance(fp.pts, [V.dot(d, fp.u), V.dot(d, fp.v)]) > 1e-6) return { shape: t, normal: f.normal };
    }
  }
  return null;
}
export function boxOf(s) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of vertices(s)) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  return { lo, hi };
}
export const boxesTouch = (a, b, e = 1e-4) => a.lo[0] <= b.hi[0] + e && b.lo[0] <= a.hi[0] + e && a.lo[1] <= b.hi[1] + e && b.lo[1] <= a.hi[1] + e && a.lo[2] <= b.hi[2] + e && b.lo[2] <= a.hi[2] + e;

/* ---------- grupy i komponenty ---------- */
// Grupa: { id, kind: 'group' | 'comp', p, def, frame } — p to grupa nadrzędna (grupy mogą być w grupach).
// Bryły i linie należą do najbliższej grupy przez pole g. Komponent to grupa z definicją `def`:
// wszystkie grupy o tym samym `def` są jego wystąpieniami. Geometria każdego wystąpienia leży w modelu
// we współrzędnych świata (narzędzia działają bez zmian), a `frame` (o, x, y, z — przekształcenie afiniczne)
// mówi, jak wystąpienie jest ustawione względem definicji. Po edycji jednego wystąpienia pozostałe są
// przeliczane z niego razem z całym wnętrzem (syncComponent).
const gById = (m, id) => m.groups.find(g => g.id === id) || null;
// id grupy i jej wszystkich podgrup
export function subtreeIds(m, gid) {
  const out = new Set([gid]); let grow = true;
  while (grow) { grow = false; for (const g of m.groups) if (g.p != null && out.has(g.p) && !out.has(g.id)) { out.add(g.id); grow = true; } }
  return out;
}
export function membersOf(m, gid) {
  const t = subtreeIds(m, gid);
  return [...m.shapes.filter(s => t.has(s.g)).map(s => s.id), ...m.lines.filter(l => t.has(l.g)).map(l => 'l' + l.id)];
}
const elem = (m, id) => typeof id === 'number' ? m.shapes.find(s => s.id === id) : m.lines.find(l => 'l' + l.id === id);
export const groupOf = (m, id) => { const e = elem(m, id); return e && e.g ? gById(m, e.g) : null; };
// łańcuch grup od najbliższej do najwyższej
export function chainOf(m, gid) { const out = []; let g = gById(m, gid); while (g) { out.push(g); g = g.p != null ? gById(m, g.p) : null; } return out; }
// grupa, którą klik w element zaznacza, gdy edytujesz grupę E (null = cały model): ta z łańcucha, która leży bezpośrednio w E
export function topUnder(m, id, E) {
  const e = elem(m, id); if (!e || !e.g || e.g === E) return null;
  const ch = chainOf(m, e.g);
  const hit = ch.find(g => (g.p ?? null) === E);
  return hit || ch[ch.length - 1];
}
export const insideGroup = (m, id, E) => { const e = elem(m, id); return !!e && e.g != null && chainOf(m, e.g).some(g => g.id === E); };
export const IDENT = o => ({ o: o.slice(), x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
export const mapPoint = (F, l) => V.add(V.add(V.add(F.o, V.mul(F.x, l[0])), V.mul(F.y, l[1])), V.mul(F.z, l[2]));
export const mapVec = (F, l) => V.add(V.add(V.mul(F.x, l[0]), V.mul(F.y, l[1])), V.mul(F.z, l[2]));
export function unmapPoint(F, p) {
  // odwrotność macierzy o kolumnach x, y, z
  const [a, b, c] = [F.x, F.y, F.z], d = V.sub(p, F.o);
  const det = V.dot(a, V.cross(b, c));
  return [V.dot(d, V.cross(b, c)) / det, V.dot(a, V.cross(d, c)) / det, V.dot(a, V.cross(b, d)) / det];
}
// bryła przekształcona dowolną funkcją punktów (przesunięcie, obrót, skala, przejście między ramami)
export function transformShape(s, f) {
  if (isMesh(s)) return transformMesh(s, f);
  mapFlags(s, f);
  const base = s.pts.map(p => at(s, p[0], p[1], 0)), hbase = (s.holes || []).map(h => h.map(p => at(s, p[0], p[1], 0))), o = f(s.o);
  const top = f(at(s, s.pts[0][0], s.pts[0][1], s.h)), b0 = f(base[0]);
  let u = V.norm(V.sub(f(V.add(s.o, s.u)), o)), v = V.sub(f(V.add(s.o, s.v)), o);
  v = V.norm(V.sub(v, V.mul(u, V.dot(v, u))));
  const n = V.cross(u, v);
  s.o = o; s.u = u; s.v = v; s.n = n;
  s.pts = base.map(p => { const d = V.sub(f(p), o); return [V.dot(d, u), V.dot(d, v)]; });
  if (s.holes) s.holes = hbase.map(h => h.map(p => { const d = V.sub(f(p), o); return [V.dot(d, u), V.dot(d, v)]; }));
  s.h = V.dot(V.sub(top, b0), n);
  normalizeShape(s);
  return s;
}
export function transformFrame(F, f) {
  const o = f(F.o);
  return { o, x: V.sub(f(V.add(F.o, F.x)), o), y: V.sub(f(V.add(F.o, F.y)), o), z: V.sub(f(V.add(F.o, F.z)), o) };
}
// grupy, których wszyscy członkowie są w zbiorze ids (ich ramy przesuwają się razem z nimi)
export function groupsWhollyIn(m, ids) {
  return m.groups.filter(g => { const mem = membersOf(m, g.id); return mem.length && mem.every(i => ids.has(i)); });
}
// kopie elementów; grupy kopiowane w całości (z podgrupami) dostają nowe grupy — wystąpienia tych samych komponentów
export function duplicateIds(m, ids) {
  const out = new Set(), gmap = new Map();
  const whole = groupsWhollyIn(m, ids);
  for (const g of whole) gmap.set(g.id, m.next++);
  for (const g of whole) { const c = JSON.parse(JSON.stringify(g)); c.id = gmap.get(g.id); if (gmap.has(c.p)) c.p = gmap.get(c.p); m.groups.push(c); }
  const S = m.shapes.filter(s => ids.has(s.id)), L = m.lines.filter(l => ids.has('l' + l.id)), G = m.guides.filter(g => ids.has('g' + g.id));
  const fix = c => { if (c.g != null && gmap.has(c.g)) c.g = gmap.get(c.g); };
  for (const s of S) { const c = JSON.parse(JSON.stringify(s)); c.id = m.next++; fix(c); m.shapes.push(c); out.add(c.id); }
  for (const l of L) { const c = JSON.parse(JSON.stringify(l)); c.id = m.next++; fix(c); m.lines.push(c); out.add('l' + c.id); }
  for (const g of G) { const c = JSON.parse(JSON.stringify(g)); c.id = m.next++; m.guides.push(c); out.add('g' + c.id); }
  return out;
}
// przelicz wszystkie wystąpienia komponentu z wystąpienia `gid` (razem z grupami i komponentami w środku)
export function syncComponent(m, gid) {
  const src = gById(m, gid); if (!src || src.kind !== 'comp') return;
  const sub = subtreeIds(m, gid);
  const toLocal = p => unmapPoint(src.frame, p);
  const defGroups = m.groups.filter(g => sub.has(g.id) && g.id !== gid).map(g => ({ ...JSON.parse(JSON.stringify(g)), frame: g.frame ? transformFrame(g.frame, toLocal) : undefined }));
  const defShapes = m.shapes.filter(s => sub.has(s.g)).map(s => transformShape(JSON.parse(JSON.stringify(s)), toLocal));
  const defLines = m.lines.filter(l => sub.has(l.g)).map(l => ({ ...l, a: toLocal(l.a), b: toLocal(l.b) }));
  for (const g of [...m.groups]) {
    if (g.id === gid || g.kind !== 'comp' || g.def !== src.def || sub.has(g.id)) continue;
    const old = subtreeIds(m, g.id);
    const hidden = m.shapes.some(s => old.has(s.g) && s.hidden);
    m.shapes = m.shapes.filter(s => !old.has(s.g)); m.lines = m.lines.filter(l => !old.has(l.g));
    m.groups = m.groups.filter(q => q.id === g.id || !old.has(q.id));
    const toWorld = p => mapPoint(g.frame, p);
    const gmap = new Map([[gid, g.id]]);
    for (const d of defGroups) gmap.set(d.id, m.next++);
    for (const d of defGroups) m.groups.push({ ...JSON.parse(JSON.stringify(d)), id: gmap.get(d.id), p: gmap.get(d.p) ?? d.p, frame: d.frame ? transformFrame(d.frame, toWorld) : undefined });
    for (const d of defShapes) { const c = transformShape(JSON.parse(JSON.stringify(d)), toWorld); c.id = m.next++; c.g = gmap.get(d.g); if (hidden) c.hidden = true; else delete c.hidden; m.shapes.push(c); }
    for (const d of defLines) m.lines.push({ ...d, id: m.next++, g: gmap.get(d.g), a: toWorld(d.a), b: toWorld(d.b) });
  }
}
export function instancesOf(m, def) { return m.groups.filter(g => g.kind === 'comp' && g.def === def); }
// grupy bez członków są usuwane
export function pruneGroups(m) {
  const used = new Set([...m.shapes.map(s => s.g), ...m.lines.map(l => l.g)]);
  let grow = true;
  while (grow) { grow = false; for (const g of m.groups) if (used.has(g.id) && g.p != null && !used.has(g.p)) { used.add(g.p); grow = true; } }
  m.groups = m.groups.filter(g => used.has(g.id));
  for (const g of m.groups) if (g.p != null && !m.groups.some(q => q.id === g.p)) delete g.p;
}

import { meshArea as meshAreaOf } from './mesh.js';
export { toMesh };

/* ---------- dzielenie ścian linią ---------- */
export const isSolid = s => isMesh(s) || s.h > 0;
// płaska ściana przecięta cięciwą a–b → dwie płaskie ściany
function splitFlat(model, s, a, b) {
  const P = s.pts, n = P.length, to2 = p => { const d = V.sub(p, s.o); return [V.dot(d, s.u), V.dot(d, s.v)]; };
  if (Math.abs(V.dot(V.sub(a, s.o), s.n)) > 1e-5 || Math.abs(V.dot(V.sub(b, s.o), s.n)) > 1e-5) return false;
  const A = to2(a), B = to2(b);
  const onEdge = q => { for (let i = 0; i < n; i++) { const p = P[i], r = P[(i + 1) % n], L = Math.hypot(r[0] - p[0], r[1] - p[1]); if (L < 1e-9) continue; const t = ((q[0] - p[0]) * (r[0] - p[0]) + (q[1] - p[1]) * (r[1] - p[1])) / (L * L); const x = p[0] + (r[0] - p[0]) * t, y = p[1] + (r[1] - p[1]) * t; if (t > -1e-7 && t < 1 + 1e-7 && Math.hypot(x - q[0], y - q[1]) < 1e-5) return { i, t }; } return null; };
  const ea = onEdge(A), eb = onEdge(B); if (!ea || !eb) return false;
  const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  if (insideDistance(P, M) <= 1e-6) return false;
  // obwód z wstawionymi punktami a i b
  const ring = []; let ia = -1, ib = -1;
  for (let i = 0; i < n; i++) {
    ring.push(P[i]);
    const ins = [[ea, A, 'a'], [eb, B, 'b']].filter(([e]) => e.i === i).sort((x, y) => x[0].t - y[0].t);
    for (const [e, q, k] of ins) { if (e.t < 1e-7 && k) { if (k === 'a') ia = ring.length - 1; else ib = ring.length - 1; continue; } if (e.t > 1 - 1e-7) continue; ring.push(q); if (k === 'a') ia = ring.length - 1; else ib = ring.length - 1; }
  }
  if (ia < 0) ia = ring.findIndex(q => Math.hypot(q[0] - A[0], q[1] - A[1]) < 1e-5);
  if (ib < 0) ib = ring.findIndex(q => Math.hypot(q[0] - B[0], q[1] - B[1]) < 1e-5);
  if (ia < 0 || ib < 0 || ia === ib) return false;
  const walk = (from, to) => { const out = []; for (let k = from; ; k = (k + 1) % ring.length) { out.push(ring[k]); if (k === to) break; } return out; };
  const p1 = walk(ia, ib), p2 = walk(ib, ia);
  if (p1.length < 3 || p2.length < 3) return false;
  s.pts = p1;
  const c = makeShape(model, { o: s.o, u: s.u, v: s.v }, p2, 0, s.color);
  for (const k of ['g', 'tag', 'alpha', 'soft', 'tex']) if (s[k] != null) c[k] = s[k];
  normalizeShape(s);
  return true;
}
// linia a–b na ścianie bryły s: dzieli ścianę (bryła staje się dowolna); zwraca true, gdy linia została „zużyta”
export function splitByLine(model, s, a, b) {
  if (!isMesh(s) && s.h === 0) return splitFlat(model, s, a, b);
  const test = JSON.parse(JSON.stringify(s));
  toMesh(test, faces);
  if (!splitMeshFn(test, a, b)) return false;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, test);
  return true;
}
import { splitMesh as splitMeshFn } from './mesh.js';

/* ---------- ściany z linii (np. po imporcie rysunku CAD) ---------- */
// Linie leżące w jednej płaszczyźnie są dzielone w miejscach przecięć, a każde zamknięte pole między nimi staje się
// płaską ścianą. Linie, które w całości trafiły na brzeg jakiejś ściany, znikają (ściana ma własne krawędzie).
// Zwraca { faces: [bryły], skipped: liczba linii poza płaszczyzną } albo null, gdy linii jest za dużo.
export function facesFromLines(model, lines, limit = 6000) {
  if (lines.length < 3) return { faces: [], skipped: 0 };
  if (lines.length > limit) return null;
  // płaszczyzna: pierwsze trzy punkty, które nie leżą na jednej prostej
  const o = lines[0].a; let n = null;
  const d0 = V.norm(V.sub(lines[0].b, lines[0].a));
  for (const l of lines) for (const p of [l.a, l.b]) { const c = V.cross(d0, V.sub(p, o)); if (V.len(c) > 1e-6) { n = V.norm(c); break; } if (n) break; }
  if (!n) return { faces: [], skipped: 0 };
  if (n[2] < -1e-6 || (Math.abs(n[2]) < 1e-6 && (n[1] < 0 || (Math.abs(n[1]) < 1e-6 && n[0] < 0)))) n = V.mul(n, -1);
  let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
  const v = V.cross(n, u), to2 = p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; };
  const inPlane = p => Math.abs(V.dot(V.sub(p, o), n)) < 1e-4;
  const src = lines.filter(l => inPlane(l.a) && inPlane(l.b)).map(l => ({ l, a: to2(l.a), b: to2(l.b), ts: [0, 1] })).filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-6);
  // podział w przecięciach i w miejscach, gdzie koniec innej linii leży na odcinku
  for (let i = 0; i < src.length; i++) {
    const A = src[i], ax = A.b[0] - A.a[0], ay = A.b[1] - A.a[1];
    const lo = [Math.min(A.a[0], A.b[0]) - 1e-6, Math.min(A.a[1], A.b[1]) - 1e-6], hi = [Math.max(A.a[0], A.b[0]) + 1e-6, Math.max(A.a[1], A.b[1]) + 1e-6];
    for (let j = i + 1; j < src.length; j++) {
      const B = src[j];
      if (Math.max(B.a[0], B.b[0]) < lo[0] || Math.min(B.a[0], B.b[0]) > hi[0] || Math.max(B.a[1], B.b[1]) < lo[1] || Math.min(B.a[1], B.b[1]) > hi[1]) continue;
      const bx = B.b[0] - B.a[0], by = B.b[1] - B.a[1], den = ax * by - ay * bx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((B.a[0] - A.a[0]) * by - (B.a[1] - A.a[1]) * bx) / den, s = ((B.a[0] - A.a[0]) * ay - (B.a[1] - A.a[1]) * ax) / den;
      if (t < -1e-7 || t > 1 + 1e-7 || s < -1e-7 || s > 1 + 1e-7) continue;
      A.ts.push(Math.max(0, Math.min(1, t))); B.ts.push(Math.max(0, Math.min(1, s)));
    }
  }
  const K = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);
  const nodes = new Map(), node = p => { const k = K(p); if (!nodes.has(k)) nodes.set(k, { k, p, out: [] }); return nodes.get(k); };
  const edges = new Map();   // klucz pary węzłów → { a, b, src: [linie] }
  for (const s of src) {
    const ts = [...new Set(s.ts.map(t => Math.round(t * 1e7) / 1e7))].sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = [s.a[0] + (s.b[0] - s.a[0]) * ts[k], s.a[1] + (s.b[1] - s.a[1]) * ts[k]], q = [s.a[0] + (s.b[0] - s.a[0]) * ts[k + 1], s.a[1] + (s.b[1] - s.a[1]) * ts[k + 1]];
      const A = node(p), B = node(q); if (A === B) continue;
      const key = A.k < B.k ? A.k + '|' + B.k : B.k + '|' + A.k;
      if (!edges.has(key)) edges.set(key, { a: A, b: B, src: [] });
      edges.get(key).src.push(s);
    }
  }
  // wolne końce nie mogą ograniczać ściany
  const deg = new Map(); for (const e of edges.values()) for (const x of [e.a, e.b]) deg.set(x, (deg.get(x) || 0) + 1);
  let cut = true;
  while (cut) { cut = false; for (const [key, e] of edges) if (deg.get(e.a) < 2 || deg.get(e.b) < 2) { edges.delete(key); deg.set(e.a, deg.get(e.a) - 1); deg.set(e.b, deg.get(e.b) - 1); cut = true; } }
  // półkrawędzie; w każdym węźle posortowane po kącie
  const half = [];
  for (const e of edges.values()) {
    const h1 = { from: e.a, to: e.b, e }, h2 = { from: e.b, to: e.a, e }; h1.twin = h2; h2.twin = h1;
    for (const h of [h1, h2]) { h.ang = Math.atan2(h.to.p[1] - h.from.p[1], h.to.p[0] - h.from.p[0]); h.from.out.push(h); half.push(h); }
  }
  for (const nd of nodes.values()) nd.out.sort((x, y) => x.ang - y.ang);
  // następna półkrawędź pola po lewej: w węźle docelowym pierwsza zgodnie z ruchem wskazówek od krawędzi powrotnej
  const next = h => { const out = h.to.out, i = out.indexOf(h.twin); return out[(i - 1 + out.length) % out.length]; };
  const faces = [], usedEdges = new Set(), seen = new Set();
  for (const h0 of half) {
    if (seen.has(h0)) continue;
    const loop = []; let h = h0, guard = 0;
    while (!seen.has(h) && guard++ < 100000) { seen.add(h); loop.push(h); h = next(h); }
    if (h !== h0 || loop.length < 3) continue;
    const set = new Set(loop); if (loop.some(q => set.has(q.twin))) continue;   // pole z „mostem” w środku
    const pts = loop.map(q => q.from.p);
    if (area2(pts) < 1e-8) continue;   // zewnętrzny obrys (zgodny z ruchem wskazówek) albo pole bez powierzchni
    const sh = makeShape(model, { o, u, v }, pts, 0);
    faces.push(sh); for (const q of loop) usedEdges.add(q.e);
  }
  if (faces.length) {
    const pieces = new Map(), usedPieces = new Map();
    for (const e of edges.values()) for (const s of e.src) pieces.set(s.l, (pieces.get(s.l) || 0) + 1);
    for (const e of usedEdges) for (const s of e.src) usedPieces.set(s.l, (usedPieces.get(s.l) || 0) + 1);
    // linia znika tylko wtedy, gdy każdy jej kawałek leży na brzegu ściany i nie został ucięty jako wolny koniec
    const whole = new Map(); for (const s of src) whole.set(s.l, new Set(s.ts.map(t => Math.round(t * 1e7) / 1e7)).size - 1);
    const gone = new Set(); for (const [l, k] of usedPieces) if (k === pieces.get(l) && k === whole.get(l)) gone.add(l);
    model.lines = model.lines.filter(l => !gone.has(l));
    for (const sh of faces) for (const k of ['g', 'tag']) if (lines[0][k] != null && lines.every(l => l[k] === lines[0][k])) sh[k] = lines[0][k];
  }
  return { faces, skipped: lines.length - src.length };
}
