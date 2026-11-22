// Bryły o dowolnym kształcie (kind: 'mesh'): lista wielokątów-ścian (każdy przeciwnie do wskazówek zegara,
// patrząc z zewnątrz) i lista „znaczników” — krawędzi narysowanych na ścianie, które dzielą ją na części.
// Taka bryła powstaje z wyciągniętego wielokąta, gdy przesuwasz jej wierzchołek albo krawędź, dzielisz ścianę
// linią, wypychasz część ściany albo łączysz bryły. Wypychanie i narzędzia brył liczą się przez CSG,
// a ściany w jednej płaszczyźnie są potem scalane z powrotem w jeden wielokąt (simplify).

import { V } from './model.js';
import { subtract, union, intersect, resultEdges } from './csg.js';
import { ShapeUtils, Vector2 } from './vendor/three.module.js';

export const isMesh = s => s && s.kind === 'mesh';
const EPS = 1e-6;

export function newell(p) {
  let n = [0, 0, 0];
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
  const l = V.len(n); return l < 1e-12 ? [0, 0, 1] : V.mul(n, 1 / l);
}
export const planeOf = p => { const n = newell(p); return { n, w: V.dot(n, p[0]) }; };
const basis = n => { let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n)))); return { u, v: V.cross(n, u) }; };
export const polyArea = p => { let a = [0, 0, 0]; for (let i = 1; i + 1 < p.length; i++) a = V.add(a, V.cross(V.sub(p[i], p[0]), V.sub(p[i + 1], p[0]))); return V.len(a) / 2; };

// trójkąty wielokąta (także wklęsłego) w jego płaszczyźnie, z zachowaną orientacją
export function triangulatePoly(p) {
  if (p.length === 3) return [p];
  const n = newell(p), { u, v } = basis(n);
  const idx = ShapeUtils.triangulateShape(p.map(q => new Vector2(V.dot(q, u), V.dot(q, v))), []);
  return idx.map(t => {
    const tri = t.map(i => p[i]);
    const g = V.cross(V.sub(tri[1], tri[0]), V.sub(tri[2], tri[0]));
    return V.dot(g, n) < 0 ? [tri[0], tri[2], tri[1]] : tri;
  });
}
// ściana z otworami → trójkąty (zwrot jak w obrysie zewnętrznym)
export function triangulateHoles(outer, holes) {
  const n = newell(outer), { u, v } = basis(n);
  const to2 = q => new Vector2(V.dot(q, u), V.dot(q, v));
  const all = [...outer, ...holes.flat()];
  let c = outer.map(to2), hs = holes.map(h => h.map(to2));
  const idx = ShapeUtils.triangulateShape(c, hs);
  return idx.map(t => {
    const tri = t.map(i => all[i]);
    const g = V.cross(V.sub(tri[1], tri[0]), V.sub(tri[2], tri[0]));
    return V.dot(g, n) < 0 ? [tri[0], tri[2], tri[1]] : tri;
  }).filter(t => V.len(V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0]))) > 1e-10);
}
// punkt w wielokącie (punkt leży w jego płaszczyźnie)
export function inPoly(p, poly, n = newell(poly)) {
  const { u, v } = basis(n), x = V.dot(p, u), y = V.dot(p, v);
  const P = poly.map(q => [V.dot(q, u), V.dot(q, v)]);
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) inside = !inside;
  }
  return inside;
}

/* ---------- zamiana i wejście do CSG ---------- */
// bryła z wyciągniętego wielokąta → bryła dowolna (w miejscu; zachowuje id, kolor, grupę, tag…)
export function toMesh(s, facesOf) {
  if (isMesh(s)) return s;
  // ściana z otworami nie jest jednym wielokątem — wchodzi do siatki jako trójkąty (w jednej płaszczyźnie i tak zlewają się w jedną ścianę)
  const fs = facesOf(s), polys = [], fc = {};
  for (const f of fs) {
    const parts = f.holes && f.holes.length ? triangulateHoles(f.verts, f.holes) : [f.verts];
    for (const q of parts) { if (s.fc && s.fc[f.key]) fc['p:' + polys.length] = s.fc[f.key]; polys.push(q.map(v => v.slice())); }
  }
  if (Object.keys(fc).length) s.fc = fc; else delete s.fc;
  for (const k of ['o', 'u', 'v', 'n', 'pts', 'h', 'holes']) delete s[k];
  s.kind = 'mesh'; s.polys = polys; s.marks = [];
  return s;
}
export function csgPolys(s) {
  const out = [];
  s.polys.forEach((p, i) => { for (const t of triangulatePoly(p)) out.push({ vs: t, shared: { id: s.id, key: 'p:' + i, soft: !!s.soft } }); });
  return out;
}
export function meshTriangles(s) {
  return s.polys.map((p, i) => ({ key: 'p:' + i, normal: newell(p), tris: triangulatePoly(p) }));
}

/* ---------- krawędzie i ściany ---------- */
const edgeCache = new WeakMap();
export function meshEdges(s) {
  const c = edgeCache.get(s.polys); if (c && c.marks === s.marks && c.softs === s.softs && c.hid === s.hid) return c.edges;
  const tris = [];
  for (const p of s.polys) for (const t of triangulatePoly(p)) { const n = newell(t); tris.push({ vs: t, n, w: V.dot(n, t[0]), shared: { soft: !!s.soft } }); }
  const edges = resultEdges(tris);
  const onEdge = m => edges.some(e => { const L = V.dist(e.a, e.b); if (L < EPS) return false; const d = V.mul(V.sub(e.b, e.a), 1 / L), t = V.dot(V.sub(m, e.a), d); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(e.a, V.mul(d, t)), m) < 1e-5; });
  for (const [a, b] of s.marks || []) {
    if (onEdge(V.lerp(a, b, 0.5))) continue;   // znacznik stał się prawdziwą krawędzią
    const mid = V.lerp(a, b, 0.5), f = s.polys.find(p => Math.abs(V.dot(newell(p), V.sub(mid, p[0]))) < 1e-5);
    const n = f ? newell(f) : [0, 0, 1];
    edges.push({ a, b, n1: n, n2: n });
  }
  flagEdges(s, edges);
  edgeCache.set(s.polys, { marks: s.marks, softs: s.softs, hid: s.hid, edges });
  return edges;
}
// krawędzie wygładzone (s.softs) i ukryte (s.hid) — listy odcinków; pasująca krawędź dostaje flagę
export const segKey = (p, q) => { const K = v => Math.round(v[0] * 1e4) + ',' + Math.round(v[1] * 1e4) + ',' + Math.round(v[2] * 1e4), x = K(p), y = K(q); return x < y ? x + '|' + y : y + '|' + x; };
export function flagEdges(s, edges) {
  if (s.softs && s.softs.length) { const set = new Set(s.softs.map(([p, q]) => segKey(p, q))); for (const e of edges) if (set.has(segKey(e.a, e.b))) e.soft = true; }
  if (s.hid && s.hid.length) { const set = new Set(s.hid.map(([p, q]) => segKey(p, q))); for (const e of edges) if (set.has(segKey(e.a, e.b))) e.hid = true; }
  return edges;
}
export function meshVertices(s) {
  const m = new Map(); for (const p of s.polys) for (const v of p) m.set(v.map(x => Math.round(x * 1e5)).join(','), v);
  return [...m.values()];
}

// ściany: wielokąty w jednej płaszczyźnie, połączone wspólnym odcinkiem, którego nie zajmuje znacznik
const coplanar = (a, b) => V.dot(a.n, b.n) > 1 - 1e-6 && Math.abs(a.w - b.w) < 1e-5;
function sharedSegment(P, Q, marks) {
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < EPS) continue;
    const e = V.mul(V.sub(b, a), 1 / L);
    for (let j = 0; j < Q.length; j++) {
      const c = Q[j], d = Q[(j + 1) % Q.length];
      const off = p => V.len(V.sub(V.sub(p, a), V.mul(e, V.dot(V.sub(p, a), e))));
      if (off(c) > 1e-5 || off(d) > 1e-5) continue;
      const t1 = V.dot(V.sub(c, a), e), t2 = V.dot(V.sub(d, a), e);
      const lo = Math.max(0, Math.min(t1, t2)), hi = Math.min(L, Math.max(t1, t2));
      if (hi - lo < 1e-5) continue;
      const mid = V.add(a, V.mul(e, (lo + hi) / 2));
      if ((marks || []).some(([m1, m2]) => { const ml = V.dist(m1, m2); if (ml < EPS) return false; const me = V.mul(V.sub(m2, m1), 1 / ml), t = V.dot(V.sub(mid, m1), me); return t > -1e-6 && t < ml + 1e-6 && V.dist(V.add(m1, V.mul(me, t)), mid) < 1e-5; })) continue;
      return true;
    }
  }
  return false;
}
const regionCache = new WeakMap();
export function regions(s) {
  const c = regionCache.get(s.polys); if (c && c.marks === s.marks) return c.r;
  const pl = s.polys.map(planeOf), n = s.polys.length, par = [...Array(n).keys()];
  const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  // porównujemy tylko wielokąty z tej samej płaszczyzny (kubełki) — inaczej duża geometria liczyłaby się kwadratowo
  const R = x => Math.round(x * 1e3), buckets = new Map();
  pl.forEach((q, i) => { const k = R(q.n[0]) + ',' + R(q.n[1]) + ',' + R(q.n[2]) + ',' + Math.round(q.w * 1e2); let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(i); });
  for (const B of buckets.values()) for (let x = 0; x < B.length; x++) for (let y = x + 1; y < B.length; y++) {
    const i = B[x], j = B[y];
    if (find(i) === find(j) || !coplanar(pl[i], pl[j])) continue;
    if (sharedSegment(s.polys[i], s.polys[j], s.marks)) par[find(i)] = find(j);
  }
  const r = s.polys.map((_, i) => find(i));
  regionCache.set(s.polys, { marks: s.marks, r });
  return r;
}
export function regionOf(s, pi) { const r = regions(s); return r.map((x, i) => x === r[pi] ? i : -1).filter(i => i >= 0); }

// obrys ściany złożonej z kilku wielokątów: pętle zewnętrznego brzegu (i otworów)
export function regionLoops(s, idx, keep) {
  const polys = idx.map(i => s.polys[i]), n = newell(polys[0]);
  const R = v => v.map(x => Math.round(x * 1e5)).join(',');
  const pts = new Map(); for (const p of polys) for (const v of p) pts.set(R(v), v);
  const VS = [...pts.values()], segs = [];
  for (const P of polys) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < EPS) continue;
    const e = V.mul(V.sub(b, a), 1 / L), ts = [0, 1];
    for (const v of VS) { const t = V.dot(V.sub(v, a), e) / L; if (t > 1e-6 && t < 1 - 1e-6 && V.dist(V.add(a, V.mul(e, t * L)), v) < 1e-5) ts.push(t); }
    ts.sort((x, y) => x - y);
    const out = V.cross(e, n);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = V.add(a, V.mul(e, ts[k] * L)), q = V.add(a, V.mul(e, ts[k + 1] * L));
      const probe = V.add(V.lerp(p, q, 0.5), V.mul(out, 2e-4));
      if (polys.some(Q => Q !== P && inPoly(probe, Q, n))) continue;
      segs.push([p, q]);
    }
  }
  const byStart = new Map(); for (const sg of segs) byStart.set(R(sg[0]), sg);
  const used = new Set(), loops = [];
  for (const sg of segs) {
    if (used.has(sg)) continue;
    const loop = []; let cur = sg, guard = 0;
    while (cur && !used.has(cur) && guard++ < 10000) { used.add(cur); loop.push(cur[0]); cur = byStart.get(R(cur[1])); }
    if (loop.length >= 3) loops.push(dropCollinear(loop, keep));
  }
  return loops.filter(l => l.length >= 3);
}
function dropCollinear(loop, keep) {
  let p = loop, changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (keep && keep(b, loop)) continue;
      if (V.len(V.cross(V.sub(b, a), V.sub(c, b))) < 1e-9 * Math.max(1, V.dist(a, c) ** 2) || V.dist(a, b) < 1e-7) { p = p.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return p;
}

// scala kawałki jednej ściany w jeden wielokąt (gdy ściana nie ma otworów) i usuwa zdegenerowane
export function simplify(s) {
  s.polys = s.polys.filter(p => p.length >= 3 && polyArea(p) > 1e-9);
  // punkty używane przez ściany w innej płaszczyźnie zostają (złącza z sąsiednimi ścianami)
  const keep = pointKeeper(s);
  const r = regions(s), groups = new Map();
  r.forEach((g, i) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
  const out = [];
  for (const idx of groups.values()) {
    if (idx.length === 1) { out.push(dropCollinear(s.polys[idx[0]], keep)); continue; }
    const loops = regionLoops(s, idx, keep);
    if (loops.length === 1) out.push(loops[0]); else for (const i of idx) out.push(s.polys[i]);
  }
  s.polys = out.filter(p => p.length >= 3);
  // znaczniki, które nie leżą już na żadnej ścianie, znikają
  s.marks = (s.marks || []).filter(([a, b]) => { const m = V.lerp(a, b, 0.5); return s.polys.some(p => Math.abs(V.dot(newell(p), V.sub(m, p[0]))) < 1e-5 && inPolyOrEdge(m, p)); });
  return s;
}
const inPolyOrEdge = (m, p) => inPoly(m, p) || p.some((a, i) => { const b = p[(i + 1) % p.length], L = V.dist(a, b); if (L < EPS) return false; const e = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(m, a), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(e, t)), m) < 1e-5; });

// czy punkt b jest wierzchołkiem jakiejś ściany w innej płaszczyźnie niż pętla (wtedy nie wolno go usuwać)
function pointKeeper(s) {
  const K = v => v.map(x => Math.round(x * 1e5)).join(',');
  const owners = new Map();
  for (const p of s.polys) { const pl = planeOf(p); for (const v of p) { const k = K(v); if (!owners.has(k)) owners.set(k, []); owners.get(k).push(pl); } }
  return (b, loop) => {
    const pl = planeOf(loop), list = owners.get(K(b)) || [];
    return list.some(q => !coplanar(q, pl));
  };
}

/* ---------- kolor na ścianie ---------- */
// s.fc: klucz ściany ('p:i') → { c, t } (kolor, tekstura). Po operacji, która układa wielokąty na nowo, nowy wielokąt
// dziedziczy po starym, w którego płaszczyźnie leży i w którym leży jego punkt wewnętrzny.
const innerPoint = p => { const t = triangulatePoly(p)[0]; return V.mul(V.add(V.add(t[0], t[1]), t[2]), 1 / 3); };
export function keepPaint(s, fn) {
  const old = s.fc ? Object.entries(s.fc).map(([k, v]) => { const p = s.polys[+k.split(':')[1]]; return p ? { p, pl: planeOf(p), v } : null; }).filter(Boolean) : [];
  const r = fn();
  if (s.fc) delete s.fc;
  if (old.length) {
    const fc = {};
    s.polys.forEach((p, i) => { const pl = planeOf(p), c = innerPoint(p), o = old.find(q => coplanar(q.pl, pl) && inPoly(c, q.p, q.pl.n)); if (o) fc['p:' + i] = o.v; });
    if (Object.keys(fc).length) s.fc = fc;
  }
  return r;
}
// usuwa wielokąty spełniające warunek: bryła staje się otwartą powłoką (jak po usunięciu ściany w SketchUpie)
export function removePolys(s, test) {
  const keep = [], fc = {};
  s.polys.forEach((p, i) => { if (test(p, i)) return; if (s.fc && s.fc['p:' + i]) fc['p:' + keep.length] = s.fc['p:' + i]; keep.push(p); });
  if (keep.length === s.polys.length) return false;
  s.polys = keep; if (Object.keys(fc).length) s.fc = fc; else delete s.fc;
  s.open = true;
  s.marks = (s.marks || []).filter(([a, b]) => { const m = V.lerp(a, b, 0.5); return s.polys.some(p => Math.abs(V.dot(newell(p), V.sub(m, p[0]))) < 1e-5 && inPolyOrEdge(m, p)); });
  return true;
}
// numery wielokątów, których bok leży na odcinku a–b (razem z całą ścianą, do której należą)
export function polysOnEdge(s, a, b) {
  const L = V.dist(a, b); if (L < EPS) return [];
  const e = V.mul(V.sub(b, a), 1 / L), out = new Set();
  s.polys.forEach((P, i) => {
    for (let k = 0; k < P.length; k++) {
      const c = P[k], d = P[(k + 1) % P.length];
      const off = p => V.len(V.sub(V.sub(p, a), V.mul(e, V.dot(V.sub(p, a), e))));
      if (off(c) > 1e-5 || off(d) > 1e-5) continue;
      const t1 = V.dot(V.sub(c, a), e), t2 = V.dot(V.sub(d, a), e);
      if (Math.min(L, Math.max(t1, t2)) - Math.max(0, Math.min(t1, t2)) > 1e-5) { for (const j of regionOf(s, i)) out.add(j); return; }
    }
  });
  return [...out];
}

/* ---------- operacje ---------- */
// graniastosłup z pętli (w płaszczyźnie o normalnej n) wyciągniętej o d, jako zamknięta bryła do CSG
function prism(loop, n, d) {
  const top = loop.map(p => V.add(p, V.mul(n, d))), faces = [];
  const k = loop.length;
  if (d > 0) {
    faces.push(loop.slice().reverse(), top);
    for (let i = 0; i < k; i++) { const j = (i + 1) % k; faces.push([loop[i], loop[j], top[j], top[i]]); }
  } else {
    faces.push(loop, top.slice().reverse());
    for (let i = 0; i < k; i++) { const j = (i + 1) % k; faces.push([top[i], top[j], loop[j], loop[i]]); }
  }
  const out = []; for (const f of faces) for (const t of triangulatePoly(f)) out.push({ vs: t, shared: null });
  return out;
}
// push/pull ściany (kawałka ściany wydzielonego linią) bryły dowolnej: na zewnątrz dokleja, do środka wycina
export function pushPullMesh(s, pi, d) {
  if (Math.abs(d) < EPS) return s;
  const idx = regionOf(s, pi), n = newell(s.polys[pi]);
  const loops = regionLoops(s, idx);
  let tool = null;
  if (loops.length === 1) tool = prism(loops[0], n, d);
  else for (const i of idx) { const pr = prism(s.polys[i], n, d); tool = tool ? union(tool, pr) : pr; }
  // kolor wypychanej ściany jedzie razem z nią
  const paint = s.fc && s.fc['p:' + pi], was = idx.map(i => s.polys[i]), w1 = V.dot(n, s.polys[pi][0]) + d;
  keepPaint(s, () => {
    const solid = csgPolys(s);
    const res = d > 0 ? union(solid, tool) : subtract(solid, tool);
    s.polys = res.map(p => p.vs.map(v => v.slice()));
    simplify(s);
  });
  if (paint) s.polys.forEach((p, i) => {
    const pl = planeOf(p); if (V.dot(pl.n, n) < 1 - 1e-6 || Math.abs(pl.w - w1) > 1e-5) return;
    const c = V.sub(innerPoint(p), V.mul(n, d));
    if (was.some(q => inPoly(c, q, n))) (s.fc ||= {})['p:' + i] = paint;
  });
  return s;
}
export function booleanMesh(a, b, op) {
  const A = csgPolys(a), B = csgPolys(b);
  const res = op === 'union' ? union(A, B) : op === 'intersect' ? intersect(A, B) : subtract(A, B);
  return keepPaint(a, () => { a.polys = res.map(p => p.vs.map(v => v.slice())); a.marks = []; return simplify(a); });
}

// linia narysowana po ścianie: jeśli oba końce leżą na brzegu tej samej ściany, a środek w niej — dzieli ją
// force: odcinek jest częścią łamanej albo obrysu — nie musi sam sięgać od brzegu do brzegu
// (defer: nie scalaj jeszcze kawałków — po wszystkich odcinkach łamanej trzeba wywołać simplify)
export function splitMesh(s, a, b, force, defer) {
  const mid = V.lerp(a, b, 0.5);
  const pi = s.polys.findIndex(p => { const n = newell(p); return Math.abs(V.dot(n, V.sub(a, p[0]))) < 1e-5 && Math.abs(V.dot(n, V.sub(b, p[0]))) < 1e-5 && inPoly(mid, p, n); });
  if (pi < 0) return false;
  const idx = regionOf(s, pi), n = newell(s.polys[pi]);
  const loops = regionLoops(s, idx);
  const onBoundary = p => loops.some(loop => loop.some((q, i) => { const r = loop[(i + 1) % loop.length], L = V.dist(q, r); if (L < EPS) return false; const e = V.mul(V.sub(r, q), 1 / L), t = V.dot(V.sub(p, q), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(q, V.mul(e, t)), p) < 1e-5; }));
  if (!force && (!onBoundary(a) || !onBoundary(b))) return false;
  const dir = V.norm(V.sub(b, a)), m = V.norm(V.cross(n, dir)), w = V.dot(m, a), L = V.dist(a, b);
  const out = [];
  for (let i = 0; i < s.polys.length; i++) {
    if (!idx.includes(i)) { out.push(s.polys[i]); continue; }
    for (const t of triangulatePoly(s.polys[i])) {
      const ds = t.map(v => V.dot(m, v) - w);
      if (!(ds.some(x => x > 1e-7) && ds.some(x => x < -1e-7))) { out.push(t); continue; }
      // trójkąt przecina prostą — dzielimy tylko, jeśli przecięcie leży na odcinku a–b
      const F = [], B = [], cut = [];
      for (let k = 0; k < 3; k++) {
        const p = t[k], q = t[(k + 1) % 3], dp = ds[k], dq = ds[(k + 1) % 3];
        if (dp >= -1e-7) F.push(p); if (dp <= 1e-7) B.push(p);
        if ((dp > 1e-7 && dq < -1e-7) || (dp < -1e-7 && dq > 1e-7)) { const x = V.lerp(p, q, dp / (dp - dq)); F.push(x); B.push(x); cut.push(x); }
        else if (Math.abs(dp) <= 1e-7) cut.push(p);
      }
      const ts = cut.map(x => V.dot(V.sub(x, a), dir));
      const inside = ts.length >= 2 && Math.max(...ts) > 1e-6 && Math.min(...ts) < L - 1e-6;
      if (inside && F.length >= 3 && B.length >= 3) { out.push(F, B); } else out.push(t);
    }
  }
  keepPaint(s, () => {
    s.polys = out;
    s.marks = [...(s.marks || []), [a.slice(), b.slice()]];
    // sąsiednie ściany dostają te same punkty na wspólnych krawędziach (bryła musi pozostać szczelna)
    insertPoint(s, a); insertPoint(s, b);
    if (!defer) simplify(s);
  });
  return true;
}
// wstawia punkt p w każdą krawędź wielokąta, na której leży (wewnątrz odcinka)
export function insertPoint(s, p) {
  s.polys = s.polys.map(P => {
    if (P.some(v => V.dist(v, p) < 1e-6)) return P;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < EPS) continue;
      const e = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), e);
      if (t > 1e-6 && t < L - 1e-6 && V.dist(V.add(a, V.mul(e, t)), p) < 1e-5) { const q = P.slice(); q.splice(i + 1, 0, p.slice()); return q; }
    }
    return P;
  });
}

// przesunięcie punktów bryły (wierzchołek, krawędź, ściana); wielokąty, które przestałyby być płaskie, dzielimy na trójkąty
export function moveMeshPoints(s, pts, d) { return mapMeshPoints(s, pts, v => V.add(v, d)); }
// to samo dla dowolnego przekształcenia punktów (np. obrót zaznaczonej ściany)
export function mapMeshPoints(s, pts, f) {
  const K = v => v.map(x => Math.round(x * 1e5)).join(','), set = new Set(pts.map(K));
  const mv = v => set.has(K(v)) ? f(v) : v.slice();
  const out = [], fc = {};
  s.polys.forEach((p, i) => {
    // (punkty, które po przesunięciu zeszły się w jeden, nie zostają podwójnie; ściana ściśnięta do odcinka znika)
    const paint = s.fc && s.fc['p:' + i], put = q => { q = q.filter((v, k) => V.dist(v, q[(k + 1) % q.length]) > 1e-7); if (q.length < 3 || polyArea(q) < 1e-10) return; if (paint) fc['p:' + out.length] = paint; out.push(q); };
    if (!p.some(v => set.has(K(v)))) { put(p); return; }
    const q = p.map(mv), n = newell(q);
    const flat = q.every(v => Math.abs(V.dot(n, V.sub(v, q[0]))) < 1e-6);
    if (flat) { put(q); return; }
    // Ściana przestała być płaska: składa się w trójkąty. Krawędzie złożenia są zwykłymi, widocznymi krawędziami
    // (jak przy „autofold” w SketchUpie) — wygładzić je można gumką z ⌥ / Ctrl.
    for (const t of triangulatePoly(p)) put(t.map(mv));
  });
  s.polys = out; if (Object.keys(fc).length) s.fc = fc; else delete s.fc;
  s.marks = (s.marks || []).map(([a, b]) => [mv(a), mv(b)]);
  for (const k of ['softs', 'hid']) if (s[k]) s[k] = s[k].map(([a, b]) => [mv(a), mv(b)]);
  return s;
}

export function meshVolume(s) { let v = 0; for (const p of s.polys) for (const t of triangulatePoly(p)) v += V.dot(t[0], V.cross(t[1], t[2])) / 6; return v; }
export function transformMesh(s, f) {
  const o = f([0, 0, 0]), det = V.dot(V.sub(f([1, 0, 0]), o), V.cross(V.sub(f([0, 1, 0]), o), V.sub(f([0, 0, 1]), o)));
  s.polys = s.polys.map(p => p.map(f));
  s.marks = (s.marks || []).map(([a, b]) => [f(a), f(b)]);
  if (s.softs) s.softs = s.softs.map(([a, b]) => [f(a), f(b)]);
  if (s.hid) s.hid = s.hid.map(([a, b]) => [f(a), f(b)]);
  if (det < 0) s.polys = s.polys.map(p => p.slice().reverse());   // odbicie lustrzane
  return s;
}
export function meshArea(s) { return s.polys.reduce((a, p) => a + polyArea(p), 0); }
