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
  const polys = facesOf(s).map(f => f.verts.map(v => v.slice()));
  for (const k of ['o', 'u', 'v', 'n', 'pts', 'h']) delete s[k];
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
  const c = edgeCache.get(s.polys); if (c && c.marks === s.marks) return c.edges;
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
  if (s.softs && s.softs.length) {
    const K = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4);
    const key = (p, q) => { const x = K(p), y = K(q); return x < y ? x + '|' + y : y + '|' + x; };
    const set = new Set(s.softs.map(([p, q]) => key(p, q)));
    for (const e of edges) if (e.n2 && set.has(key(e.a, e.b))) e.soft = true;
  }
  edgeCache.set(s.polys, { marks: s.marks, edges });
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
export function regions(s) {
  const pl = s.polys.map(planeOf), n = s.polys.length, par = [...Array(n).keys()];
  const find = i => par[i] === i ? i : (par[i] = find(par[i]));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (find(i) === find(j) || !coplanar(pl[i], pl[j])) continue;
    if (sharedSegment(s.polys[i], s.polys[j], s.marks)) par[find(i)] = find(j);
  }
  return s.polys.map((_, i) => find(i));
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
  const solid = csgPolys(s);
  const res = d > 0 ? union(solid, tool) : subtract(solid, tool);
  s.polys = res.map(p => p.vs.map(v => v.slice()));
  return simplify(s);
}
export function booleanMesh(a, b, op) {
  const A = csgPolys(a), B = csgPolys(b);
  const res = op === 'union' ? union(A, B) : op === 'intersect' ? intersect(A, B) : subtract(A, B);
  a.polys = res.map(p => p.vs.map(v => v.slice()));
  a.marks = [];
  return simplify(a);
}

// linia narysowana po ścianie: jeśli oba końce leżą na brzegu tej samej ściany, a środek w niej — dzieli ją
export function splitMesh(s, a, b) {
  const mid = V.lerp(a, b, 0.5);
  const pi = s.polys.findIndex(p => { const n = newell(p); return Math.abs(V.dot(n, V.sub(a, p[0]))) < 1e-5 && Math.abs(V.dot(n, V.sub(b, p[0]))) < 1e-5 && inPoly(mid, p, n); });
  if (pi < 0) return false;
  const idx = regionOf(s, pi), n = newell(s.polys[pi]);
  const loops = regionLoops(s, idx);
  const onBoundary = p => loops.some(loop => loop.some((q, i) => { const r = loop[(i + 1) % loop.length], L = V.dist(q, r); if (L < EPS) return false; const e = V.mul(V.sub(r, q), 1 / L), t = V.dot(V.sub(p, q), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(q, V.mul(e, t)), p) < 1e-5; }));
  if (!onBoundary(a) || !onBoundary(b)) return false;
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
  s.polys = out;
  s.marks = [...(s.marks || []), [a.slice(), b.slice()]];
  // sąsiednie ściany dostają te same punkty na wspólnych krawędziach (bryła musi pozostać szczelna)
  insertPoint(s, a); insertPoint(s, b);
  simplify(s);
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
export function moveMeshPoints(s, pts, d) {
  const K = v => v.map(x => Math.round(x * 1e5)).join(','), set = new Set(pts.map(K));
  const mv = v => set.has(K(v)) ? V.add(v, d) : v.slice();
  const out = [];
  for (const p of s.polys) {
    if (!p.some(v => set.has(K(v)))) { out.push(p); continue; }
    const q = p.map(mv), n = newell(q);
    const flat = q.every(v => Math.abs(V.dot(n, V.sub(v, q[0]))) < 1e-6);
    if (flat) out.push(q); else for (const t of triangulatePoly(p)) out.push(t.map(mv));
  }
  s.polys = out;
  s.marks = (s.marks || []).map(([a, b]) => [mv(a), mv(b)]);
  return s;
}

export function meshVolume(s) { let v = 0; for (const p of s.polys) for (const t of triangulatePoly(p)) v += V.dot(t[0], V.cross(t[1], t[2])) / 6; return v; }
export function transformMesh(s, f) {
  const v0 = meshVolume(s);
  s.polys = s.polys.map(p => p.map(f));
  s.marks = (s.marks || []).map(([a, b]) => [f(a), f(b)]);
  if (s.softs) s.softs = s.softs.map(([a, b]) => [f(a), f(b)]);
  if (Math.sign(meshVolume(s)) !== Math.sign(v0)) s.polys = s.polys.map(p => p.slice().reverse());   // odbicie lustrzane
  return s;
}
export function meshArea(s) { return s.polys.reduce((a, p) => a + polyArea(p), 0); }
