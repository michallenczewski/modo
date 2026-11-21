// Odejmowanie brył (CSG) metodą drzew BSP — na wzór csg.js Evana Wallace'a (licencja MIT).
// Wielokąty są wypukłe (wejście to trójkąty), każdy niesie `shared`: skąd pochodzi (bryła, ściana).
// Wynik: lista wielokątów do narysowania oraz krawędzie (bez szwów między kawałkami jednej płaszczyzny).

import { V } from './model.js';
import { solidBoolean } from './solid.js';

const EPS = 1e-5;
const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

class Plane {
  constructor(n, w) { this.n = n; this.w = w; }
  static from(a, b, c) { const n = V.norm(V.cross(V.sub(b, a), V.sub(c, a))); return new Plane(n, V.dot(n, a)); }
  clone() { return new Plane(this.n.slice(), this.w); }
  flip() { this.n = V.mul(this.n, -1); this.w = -this.w; }
  split(poly, cf, cb, f, b) {
    let type = 0; const types = [];
    for (const v of poly.vs) { const t = V.dot(this.n, v) - this.w; const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR; type |= ty; types.push(ty); }
    if (type === COPLANAR) (V.dot(this.n, poly.plane.n) > 0 ? cf : cb).push(poly);
    else if (type === FRONT) f.push(poly);
    else if (type === BACK) b.push(poly);
    else {
      const F = [], B = [], n = poly.vs.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ti = types[i], tj = types[j], vi = poly.vs[i], vj = poly.vs[j];
        if (ti !== BACK) F.push(vi);
        if (ti !== FRONT) B.push(vi);
        if ((ti | tj) === SPANNING) {
          const t = (this.w - V.dot(this.n, vi)) / V.dot(this.n, V.sub(vj, vi));
          const v = V.lerp(vi, vj, t); F.push(v); B.push(v);
        }
      }
      if (F.length >= 3) f.push(new Poly(F, poly.shared, poly.plane));
      if (B.length >= 3) b.push(new Poly(B, poly.shared, poly.plane));
    }
  }
}

class Poly {
  constructor(vs, shared, plane) { this.vs = vs; this.shared = shared; this.plane = plane ? plane.clone() : Plane.from(vs[0], vs[1], vs[2]); }
  flip() { this.vs = this.vs.slice().reverse(); this.plane.flip(); }
}

class Node {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys) this.build(polys); }
  invert() {
    for (const p of this.polys) p.flip();
    this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  clipPolys(polys) {
    if (!this.plane) return polys.slice();
    let f = [], b = [];
    for (const p of polys) this.plane.split(p, f, b, f, b);
    if (this.front) f = this.front.clipPolys(f);
    b = this.back ? this.back.clipPolys(b) : [];
    return f.concat(b);
  }
  clipTo(bsp) { this.polys = bsp.clipPolys(this.polys); if (this.front) this.front.clipTo(bsp); if (this.back) this.back.clipTo(bsp); }
  all() { let out = this.polys.slice(); if (this.front) out = out.concat(this.front.all()); if (this.back) out = out.concat(this.back.all()); return out; }
  build(polys) {
    if (!polys.length) return;
    if (!this.plane) this.plane = polys[0].plane.clone();
    const f = [], b = [];
    for (const p of polys) this.plane.split(p, this.polys, this.polys, f, b);
    if (f.length) { if (!this.front) this.front = new Node(); this.front.build(f); }
    if (b.length) { if (!this.back) this.back = new Node(); this.back.build(b); }
  }
}

// polys: [{ vs: [[x,y,z]...], shared }] (wypukłe, przeciwnie do wskazówek zegara patrząc z zewnątrz)
const mk = list => list.map(p => new Poly(p.vs.map(v => v.slice()), p.shared));
const clone = list => list.map(p => new Poly(p.vs.map(v => v.slice()), p.shared, p.plane));

function bspSubtract(aPolys, bPolys) {
  const a = new Node(mk(aPolys)), b = new Node(mk(bPolys));
  a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert();
  return a.all().map(p => ({ vs: p.vs, shared: p.shared, n: p.plane.n, w: p.plane.w }));
}
function bspUnion(aPolys, bPolys) {
  const a = new Node(mk(aPolys)), b = new Node(mk(bPolys));
  a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all());
  return a.all().map(p => ({ vs: p.vs, shared: p.shared, n: p.plane.n, w: p.plane.w }));
}
function bspIntersect(aPolys, bPolys) {
  const a = new Node(mk(aPolys)), b = new Node(mk(bPolys));
  a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.all()); a.invert();
  return a.all().map(p => ({ vs: p.vs, shared: p.shared, n: p.plane.n, w: p.plane.w }));
}
// odejmowanie kilku brył po kolei
// najpierw Manifold (szczelny wynik, szybki); gdy go nie ma albo bryła wejściowa nie jest szczelna — drzewa BSP
export const subtract = (a, b) => solidBoolean(a, [b], 'subtract') || bspSubtract(a, b);
export const union = (a, b) => solidBoolean(a, [b], 'union') || bspUnion(a, b);
export const intersect = (a, b) => solidBoolean(a, [b], 'intersect') || bspIntersect(a, b);
export function subtractAll(aPolys, cutters) {
  const fast = solidBoolean(aPolys, cutters, 'subtract'); if (fast) return fast;
  let cur = aPolys;
  for (const c of cutters) cur = bspSubtract(cur, c);
  return cur;
}

/* ---------- krawędzie wyniku ---------- */
// Krawędź wielokąta jest prawdziwą krawędzią bryły, jeśli tuż za nią (w tej samej płaszczyźnie) nie ma innego kawałka tej płaszczyzny.
// Druga normalna (do grubości konturu) to normalna kawałka po drugiej stronie krawędzi pod kątem.
const inConvex = (poly, p, n) => {
  for (let i = 0; i < poly.vs.length; i++) {
    const a = poly.vs[i], b = poly.vs[(i + 1) % poly.vs.length];
    if (V.dot(V.cross(V.sub(b, a), V.sub(p, a)), n) < -1e-7) return false;
  }
  return true;
};
// siatka przestrzenna: przy dużych bryłach (np. import ze SketchUpa) sąsiadów szukamy tylko w pobliskich komórkach
function spatialIndex(polys, VS) {
  if (polys.length < 150) return { near: () => polys, vertsOn: () => VS };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const v of VS) for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  const res = Math.max(4, Math.min(48, Math.round(Math.cbrt(polys.length))));
  const cs = [0, 1, 2].map(k => Math.max((hi[k] - lo[k]) / res, 1e-3));
  const ci = (x, k) => Math.max(0, Math.min(res - 1, Math.floor((x - lo[k]) / cs[k])));
  const key = (i, j, k) => (i * 64 + j) * 64 + k;
  const pc = new Map(), vc = new Map(), big = [];
  const push = (m, k, x) => { let l = m.get(k); if (!l) m.set(k, l = []); l.push(x); };
  for (const P of polys) {
    const a = [Infinity, Infinity, Infinity], b = [-Infinity, -Infinity, -Infinity];
    for (const v of P.vs) for (let k = 0; k < 3; k++) { if (v[k] < a[k]) a[k] = v[k]; if (v[k] > b[k]) b[k] = v[k]; }
    const i0 = ci(a[0] - 1e-3, 0), i1 = ci(b[0] + 1e-3, 0), j0 = ci(a[1] - 1e-3, 1), j1 = ci(b[1] + 1e-3, 1), k0 = ci(a[2] - 1e-3, 2), k1 = ci(b[2] + 1e-3, 2);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 64) { big.push(P); continue; }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) push(pc, key(i, j, k), P);
  }
  for (const v of VS) push(vc, key(ci(v[0], 0), ci(v[1], 1), ci(v[2], 2)), v);
  const none = [];
  return {
    near: p => { const l = pc.get(key(ci(p[0], 0), ci(p[1], 1), ci(p[2], 2))) || none; return big.length ? (l.length ? l.concat(big) : big) : l; },
    vertsOn: (a, b) => {
      const i0 = ci(Math.min(a[0], b[0]) - 1e-4, 0), i1 = ci(Math.max(a[0], b[0]) + 1e-4, 0), j0 = ci(Math.min(a[1], b[1]) - 1e-4, 1), j1 = ci(Math.max(a[1], b[1]) + 1e-4, 1), k0 = ci(Math.min(a[2], b[2]) - 1e-4, 2), k1 = ci(Math.max(a[2], b[2]) + 1e-4, 2);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) * (k1 - k0 + 1) > 512) return VS;
      const out = [];
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) { const l = vc.get(key(i, j, k)); if (l) for (const v of l) out.push(v); }
      return out;
    }
  };
}
export function resultEdges(polys) {
  const coplanar = (p, q) => V.dot(p.n, q.n) > 1 - 1e-6 && Math.abs(p.w - q.w) < 1e-5;
  const R = v => v.map(x => Math.round(x * 1e4)).join(',');
  // wszystkie wierzchołki — krawędzie dzielimy w miejscach, gdzie leży na nich cudzy wierzchołek (złącza T)
  const verts = new Map(); for (const P of polys) for (const v of P.vs) verts.set(R(v), v);
  const VS = [...verts.values()];
  const ix = spatialIndex(polys, VS);
  const pieces = [], seen = new Set();
  for (const P of polys) {
    for (let i = 0; i < P.vs.length; i++) {
      const a = P.vs[i], b = P.vs[(i + 1) % P.vs.length];
      const L = V.dist(a, b); if (L < 1e-6) continue;
      const e = V.mul(V.sub(b, a), 1 / L);
      const ts = [0, 1];
      for (const v of ix.vertsOn(a, b)) {
        const t = V.dot(V.sub(v, a), e) / L; if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        if (V.dist(V.add(a, V.mul(e, t * L)), v) < 1e-5) ts.push(t);
      }
      ts.sort((x, y) => x - y);
      const out2 = V.cross(e, P.n);   // w płaszczyźnie, na zewnątrz wielokąta
      for (let k = 0; k + 1 < ts.length; k++) {
        if (ts[k + 1] - ts[k] < 1e-6) continue;
        const p = V.add(a, V.mul(e, ts[k] * L)), q = V.add(a, V.mul(e, ts[k + 1] * L));
        const key = R(p) < R(q) ? R(p) + '|' + R(q) : R(q) + '|' + R(p);
        const mid = V.lerp(p, q, 0.5), probe = V.add(mid, V.mul(out2, 2e-4));
        if (ix.near(probe).some(Q => Q !== P && coplanar(P, Q) && inConvex(Q, probe, Q.n))) continue;   // szew w jednej płaszczyźnie
        if (seen.has(key)) continue;
        seen.add(key);
        let n2 = null, soft = false;
        for (const Q of ix.near(mid)) {
          if (Q === P || coplanar(P, Q) || Math.abs(V.dot(Q.n, mid) - Q.w) > 1e-5) continue;
          const inward = V.cross(Q.n, e);
          if (inConvex(Q, V.add(mid, V.mul(inward, 2e-4)), Q.n) || inConvex(Q, V.sub(mid, V.mul(inward, 2e-4)), Q.n)) {
            n2 = Q.n; soft = !!(P.shared?.soft && Q.shared?.soft && V.dot(P.n, Q.n) > 0.94); break;
          }
        }
        pieces.push({ a: p, b: q, e, n1: P.n, n2, soft });
      }
    }
  }
  // łączenie kawałków leżących w jednej linii w całe krawędzie
  const byEnd = new Map();
  const addEnd = (k, s) => { let l = byEnd.get(k); if (!l) byEnd.set(k, l = []); l.push(s); };
  for (const s of pieces) { addEnd(R(s.a), s); addEnd(R(s.b), s); }
  const used = new Set(), out = [];
  const same = (s, t) => Math.abs(Math.abs(V.dot(s.e, t.e)) - 1) < 1e-6 && s.soft === t.soft && !!s.n2 === !!t.n2;
  for (const s of pieces) {
    if (used.has(s)) continue;
    used.add(s);
    let a = s.a, b = s.b, grow = true;
    while (grow) {
      grow = false;
      for (const [end, set] of [[b, 'b'], [a, 'a']]) {
        const nb = (byEnd.get(R(end)) || []).find(t => !used.has(t) && same(s, t));
        if (!nb) continue;
        used.add(nb); grow = true;
        const other = R(nb.a) === R(end) ? nb.b : nb.a;
        if (set === 'b') b = other; else a = other;
      }
    }
    out.push({ a, b, n1: s.n1, n2: s.n2, soft: s.soft });
  }
  return out;
}
