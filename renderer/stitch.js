// Łączenie geometrii po narysowaniu (jak „lepka” geometria SketchUpa), w obrębie luźnych linii i płaskich ścian:
//  1. nowa linia dzieli linie, których dotyka albo które przecina, i sama jest dzielona w tych miejscach,
//  2. linia narysowana po ścianie bryły od krawędzi do krawędzi dzieli tę ścianę,
//  3. w każdej płaszczyźnie, w której nowa linia styka się z inną krawędzią, liczony jest układ płaski
//     (wszystkie krawędzie pocięte w przecięciach, pola obchodzone półkrawędziami): zamknięte pole staje się ścianą,
//     linia przez istniejącą ścianę dzieli ją na części, a obrys leżący w środku ściany robi w niej otwór.
// Sposób (układ płaski z otworami zamiast szukania najkrótszego cyklu) jest wzorowany na IngeTrazo (GPL-3.0-or-later).

import { V, at, makeShape, normalizeShape, edges as shapeEdges, vertices, isHidden, isSolid, splitByLine, area2 } from './model.js';
import { isMesh } from './mesh.js';
import { closestLines } from './snap.js';

const EPS = 1e-5;
const K2 = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4);

/* ---------- układ płaski ---------- */
// segs: [{ a, b (2D), src }] → { cycles: [{ pts, area, edges:Set, comp, bridge }], edges: Map, comps }
// Każde pole wychodzi jako cykl dodatni (przeciwnie do wskazówek zegara); zewnętrzny obrys każdej spójnej części — jako ujemny.
export function arrange(segs) {
  const src = segs.filter(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-6).map(s => ({ ...s, ts: [0, 1] }));
  for (let i = 0; i < src.length; i++) {
    const A = src[i], ax = A.b[0] - A.a[0], ay = A.b[1] - A.a[1], al2 = ax * ax + ay * ay;
    const lo = [Math.min(A.a[0], A.b[0]) - 1e-6, Math.min(A.a[1], A.b[1]) - 1e-6], hi = [Math.max(A.a[0], A.b[0]) + 1e-6, Math.max(A.a[1], A.b[1]) + 1e-6];
    for (let j = i + 1; j < src.length; j++) {
      const B = src[j];
      if (Math.max(B.a[0], B.b[0]) < lo[0] || Math.min(B.a[0], B.b[0]) > hi[0] || Math.max(B.a[1], B.b[1]) < lo[1] || Math.min(B.a[1], B.b[1]) > hi[1]) continue;
      const bx = B.b[0] - B.a[0], by = B.b[1] - B.a[1], den = ax * by - ay * bx, bl2 = bx * bx + by * by;
      if (Math.abs(den) < 1e-9 * Math.sqrt(al2 * bl2)) {
        // odcinki na jednej prostej: końce jednego dzielą drugi (wspólny kawałek stanie się jedną krawędzią)
        if (Math.abs((B.a[0] - A.a[0]) * ay - (B.a[1] - A.a[1]) * ax) > 1e-6 * Math.sqrt(al2)) continue;
        for (const q of [B.a, B.b]) { const t = ((q[0] - A.a[0]) * ax + (q[1] - A.a[1]) * ay) / al2; if (t > 1e-7 && t < 1 - 1e-7) A.ts.push(t); }
        for (const q of [A.a, A.b]) { const t = ((q[0] - B.a[0]) * bx + (q[1] - B.a[1]) * by) / bl2; if (t > 1e-7 && t < 1 - 1e-7) B.ts.push(t); }
        continue;
      }
      const t = ((B.a[0] - A.a[0]) * by - (B.a[1] - A.a[1]) * bx) / den, s = ((B.a[0] - A.a[0]) * ay - (B.a[1] - A.a[1]) * ax) / den;
      const ta = 1e-5 / Math.sqrt(al2), tb = 1e-5 / Math.sqrt(bl2);
      if (t < -ta || t > 1 + ta || s < -tb || s > 1 + tb) continue;
      A.ts.push(Math.max(0, Math.min(1, t))); B.ts.push(Math.max(0, Math.min(1, s)));
    }
  }
  const nodes = new Map(), node = p => { const k = K2(p); if (!nodes.has(k)) nodes.set(k, { k, p, out: [] }); return nodes.get(k); };
  const edges = new Map(), pieces = new Map();   // pieces: źródło → liczba kawałków
  for (const s of src) {
    const ts = [...new Set(s.ts.map(t => Math.round(t * 1e7) / 1e7))].sort((x, y) => x - y);
    let n = 0;
    for (let k = 0; k + 1 < ts.length; k++) {
      const A = node([s.a[0] + (s.b[0] - s.a[0]) * ts[k], s.a[1] + (s.b[1] - s.a[1]) * ts[k]]), B = node([s.a[0] + (s.b[0] - s.a[0]) * ts[k + 1], s.a[1] + (s.b[1] - s.a[1]) * ts[k + 1]]);
      if (A === B) continue;
      const key = A.k < B.k ? A.k + '|' + B.k : B.k + '|' + A.k;
      if (!edges.has(key)) edges.set(key, { a: A, b: B, src: [] });
      edges.get(key).src.push(s.src); n++;
    }
    pieces.set(s.src, (pieces.get(s.src) || 0) + n);
  }
  // wolne końce nie ograniczają żadnego pola
  const deg = new Map(); for (const e of edges.values()) for (const x of [e.a, e.b]) deg.set(x, (deg.get(x) || 0) + 1);
  const all = new Map(edges);
  let cut = true;
  while (cut) { cut = false; for (const [key, e] of edges) if (deg.get(e.a) < 2 || deg.get(e.b) < 2) { edges.delete(key); deg.set(e.a, deg.get(e.a) - 1); deg.set(e.b, deg.get(e.b) - 1); cut = true; } }
  const half = [];
  for (const e of edges.values()) {
    const h1 = { from: e.a, to: e.b, e }, h2 = { from: e.b, to: e.a, e }; h1.twin = h2; h2.twin = h1;
    for (const h of [h1, h2]) { h.ang = Math.atan2(h.to.p[1] - h.from.p[1], h.to.p[0] - h.from.p[0]); h.from.out.push(h); half.push(h); }
  }
  for (const nd of nodes.values()) nd.out.sort((x, y) => x.ang - y.ang);
  // spójne części (do rozpoznania wysp: obrysów leżących w środku innej ściany)
  const par = new Map(); const find = x => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const e of edges.values()) for (const x of [e.a, e.b]) if (!par.has(x)) par.set(x, x);
  for (const e of edges.values()) par.set(find(e.a), find(e.b));
  for (const e of edges.values()) e.comp = find(e.a);
  // następna półkrawędź pola po lewej: w węźle docelowym pierwsza zgodnie z ruchem wskazówek od krawędzi powrotnej
  const next = h => { const out = h.to.out, i = out.indexOf(h.twin); return out[(i - 1 + out.length) % out.length]; };
  const cycles = [], seen = new Set();
  for (const h0 of half) {
    if (seen.has(h0)) continue;
    const loop = []; let h = h0, guard = 0;
    while (!seen.has(h) && guard++ < 200000) { seen.add(h); loop.push(h); h = next(h); }
    if (h !== h0 || loop.length < 3) continue;
    const set = new Set(loop), pts = loop.map(q => q.from.p);
    cycles.push({ pts, area: area2(pts), edges: new Set(loop.map(q => q.e)), comp: loop[0].e.comp, bridge: loop.some(q => set.has(q.twin)) });
  }
  return { cycles, edges, all, pieces };
}
const inLoop = (p, L) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) if ((L[i][1] > p[1]) !== (L[j][1] > p[1]) && p[0] < (L[j][0] - L[i][0]) * (p[1] - L[i][1]) / (L[j][1] - L[i][1]) + L[i][0]) c = !c; return c; };
// punkt na pewno w środku pętli: tuż obok środka boku, po lewej stronie obiegu (dla pętli przeciwnej do wskazówek zegara)
function inner(L) {
  let best = null, bl = -1;
  for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = [a, b]; } }
  const [a, b] = best, nx = -(b[1] - a[1]) / bl, ny = (b[0] - a[0]) / bl, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (const e of [1e-3, 1e-4, 1e-5]) { const p = [m[0] + nx * e, m[1] + ny * e]; if (inLoop(p, L)) return p; }
  return [m[0] + nx * 1e-4, m[1] + ny * 1e-4];
}
// pętla bez zbędnych punktów na prostych bokach
function tidy(L) {
  let p = L.slice(), ch = true;
  while (ch && p.length > 3) {
    ch = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
      if (Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])) < 1e-9 * Math.max(1, Math.hypot(c[0] - a[0], c[1] - a[1])) && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0) { p.splice(i, 1); ch = true; break; }
    }
  }
  return p;
}
const canon = n => (n[2] < -1e-6 || (Math.abs(n[2]) < 1e-6 && (n[1] < -1e-6 || (Math.abs(n[1]) < 1e-6 && n[0] < 0)))) ? V.mul(n, -1) : n;
const basis = n => { let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n)))); return { u, v: V.cross(n, u) }; };
const flat = s => !isMesh(s) && s.h === 0 && !s.bill && s.op !== 'cut';

/* ---------- po narysowaniu ---------- */
// prev — model sprzed zmiany (nowe są elementy o id ≥ prev.next). Zwraca { made, split } albo null, gdy nic nie zrobiono.
export function stitch(m, prev, limit = 200) {
  if (!prev) return null;
  const ok = e => !isHidden(m, e) && !e.locked;
  let fresh = m.lines.filter(l => l.id >= prev.next && ok(l));
  const freshFaces = m.shapes.filter(s => s.id >= prev.next && flat(s) && ok(s));
  if (!fresh.length && !freshFaces.length) return null;
  if (fresh.length + freshFaces.length > limit) return null;
  const G = (fresh[0] || freshFaces[0]).g ?? null, same = e => (e.g ?? null) === G;
  fresh = fresh.filter(same);
  let split = 0, made = 0;

  // 1. linie dzielą się nawzajem w miejscach styku i przecięcia
  const isFresh = new Set(fresh);
  for (const N of [...fresh]) {
    const Ln = V.dist(N.a, N.b); if (Ln < EPS) continue;
    const dn = V.mul(V.sub(N.b, N.a), 1 / Ln), cuts = [], count = m.lines.length;
    for (let i = 0; i < count; i++) {
      const E = m.lines[i]; if (E === N || !same(E) || !ok(E)) continue;
      const Le = V.dist(E.a, E.b); if (Le < EPS) continue;
      const de = V.mul(V.sub(E.b, E.a), 1 / Le), q = closestLines(N.a, dn, E.a, de);
      if (!q || q.gap > EPS || q.s < -EPS || q.s > Ln + EPS || q.t < -EPS || q.t > Le + EPS) continue;
      if (q.t > 1e-4 && q.t < Le - 1e-4) {
        // koniec nowej linii przyklejony do istniejącej krawędzi dzieli ją dokładnie w tym punkcie
        const pt = q.s < 1e-4 ? N.a.slice() : q.s > Ln - 1e-4 ? N.b.slice() : q.q.slice();
        const E2 = { ...E, id: m.next++, a: pt.slice(), b: E.b }; E.b = pt;
        m.lines.push(E2); if (isFresh.has(E)) { isFresh.add(E2); } split++;
      }
      if (q.s > 1e-4 && q.s < Ln - 1e-4) cuts.push(q.s);
    }
    if (cuts.length) {
      cuts.sort((x, y) => x - y);
      const ps = [N.a, ...cuts.filter((c, i) => !i || c - cuts[i - 1] > 1e-4).map(c => V.add(N.a, V.mul(dn, c))), N.b];
      N.b = ps[1].slice();
      for (let k = 1; k + 1 < ps.length; k++) { const P = { ...N, id: m.next++, a: ps[k].slice(), b: ps[k + 1].slice() }; m.lines.push(P); isFresh.add(P); split++; }
    }
  }

  // 2. linia po ścianie bryły, od krawędzi do krawędzi, dzieli tę ścianę
  for (const N of [...isFresh]) {
    for (const s of m.shapes) {
      if (!same(s) || !ok(s) || !isSolid(s) || s.op === 'cut' || s.bill || flat(s)) continue;
      const vs = vertices(s); let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
      for (const p of vs) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      if ([N.a, N.b].some(p => p.some((x, k) => x < lo[k] - 1e-4 || x > hi[k] + 1e-4))) continue;
      if (splitByLine(m, s, N.a, N.b)) { m.lines = m.lines.filter(l => l !== N); isFresh.delete(N); split++; break; }
    }
  }

  // 3. płaszczyzny, w których nowe krawędzie stykają się z innymi
  const ctx = [];   // { a, b, line | face | solid, loop }
  for (const l of m.lines) if (same(l) && ok(l)) ctx.push({ a: l.a, b: l.b, line: l, fresh: isFresh.has(l) });
  const newFace = new Set(freshFaces.filter(same));
  for (const s of m.shapes) {
    if (!same(s) || !ok(s) || s.bill || s.op === 'cut') continue;
    if (flat(s)) [s.pts, ...(s.holes || [])].forEach((L, li) => L.forEach((p, i) => { const q = L[(i + 1) % L.length]; ctx.push({ a: at(s, p[0], p[1], 0), b: at(s, q[0], q[1], 0), face: s, loop: li, fresh: newFace.has(s) }); }));
    else for (const e of shapeEdges(s)) ctx.push({ a: e.a, b: e.b, solid: s });
  }
  const planes = new Map();
  const addPlane = (n, o) => { n = canon(V.norm(n)); const w = V.dot(n, o), k = n.map(x => Math.round(x * 1e3)).join(',') + '|' + Math.round(w * 1e3); if (!planes.has(k)) planes.set(k, { n, w }); };
  for (const s of newFace) addPlane(s.n, s.o);
  for (const N of isFresh) {
    const Ln = V.dist(N.a, N.b); if (Ln < EPS) continue; const dn = V.mul(V.sub(N.b, N.a), 1 / Ln);
    for (const c of ctx) {
      if (c.line === N) continue;
      const Lc = V.dist(c.a, c.b); if (Lc < EPS) continue; const dc = V.mul(V.sub(c.b, c.a), 1 / Lc);
      const x = V.cross(dn, dc); if (V.len(x) < 1e-4) continue;
      const q = closestLines(N.a, dn, c.a, dc);
      if (!q || q.gap > 1e-4 || q.s < -1e-4 || q.s > Ln + 1e-4 || q.t < -1e-4 || q.t > Lc + 1e-4) continue;
      addPlane(x, N.a);
    }
  }
  for (const { n, w } of planes.values()) {
    const on = p => Math.abs(V.dot(n, p) - w) < 1e-4, { u, v } = basis(n), o = V.mul(n, w);
    const to2 = p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; }, to3 = q => V.add(o, V.add(V.mul(u, q[0]), V.mul(v, q[1])));
    const segs = ctx.filter(c => on(c.a) && on(c.b) && (!c.line || m.lines.includes(c.line)));
    if (!segs.some(c => c.fresh) || segs.length > 4000) continue;
    const A = arrange(segs.map(c => ({ a: to2(c.a), b: to2(c.b), src: c })));
    const isNew = e => e.src.some(c => c.fresh), active = new Set();
    for (const e of A.edges.values()) if (isNew(e)) active.add(e.comp);
    if (!active.size) continue;
    // istniejące płaskie ściany w tej płaszczyźnie: obrys 2D, pole, część układu, do której należy obrys
    const Fs = [...new Set(segs.filter(c => c.face).map(c => c.face))].map(s => {
      const L = s.pts.map(p => to2(at(s, p[0], p[1], 0))), H = (s.holes || []).map(h => h.map(p => to2(at(s, p[0], p[1], 0))));
      let comp = null; for (const e of A.edges.values()) if (e.src.some(c => c.face === s && c.loop === 0)) { comp = e.comp; break; }
      return { s, L, H, area: Math.abs(area2(L)), comp, has: p => inLoop(p, L) && !H.some(h => inLoop(p, h)) };
    });
    const out = [];   // pola, które są albo zostają ścianami: { pts, area, keep | parent, comp, edges }
    const replace = new Set();
    for (const c of A.cycles) {
      if (c.area < 1e-8 || c.bridge || !active.has(c.comp)) continue;
      const ip = inner(c.pts), own = Fs.filter(F => F.comp === c.comp && inLoop(ip, F.L));
      const keep = own.find(F => Math.abs(F.area - c.area) < 1e-6 * Math.max(1, c.area));
      if (keep) { out.push({ ...c, keep: keep.s }); continue; }
      if (own.length) { const P = own.reduce((x, y) => y.area < x.area ? y : x); replace.add(P); out.push({ ...c, parent: P }); continue; }
      if ([...c.edges].some(isNew)) out.push({ ...c });
    }
    if (!out.some(c => !c.keep) && !out.some(c => c.keep && newFace.has(c.keep))) continue;
    // nowe ściany
    for (const c of out) {
      if (c.keep) { c.shape = c.keep; continue; }
      const sh = makeShape(m, { o, u, v }, tidy(c.pts), 0);
      const P = c.parent && c.parent.s;
      if (P) for (const k of ['color', 'tex', 'alpha', 'tag', 'soft']) if (P[k] != null) sh[k] = P[k];
      if (G != null) sh.g = G;
      c.shape = sh; made++;
    }
    // otwory: wyspa (osobna część układu, w której powstała albo została ściana) wycina otwór w ścianie, w której leży
    const holeIn = (loopCW, skipComp) => {
      const p = loopCW[0], cand = out.filter(c => c.comp !== skipComp && inLoop(p, c.pts)).sort((x, y) => x.area - y.area)[0];
      if (cand) return cand.shape;
      const F = Fs.filter(F => !replace.has(F) && F.comp !== skipComp && F.has(p)).sort((x, y) => x.area - y.area)[0];
      return F ? F.s : null;
    };
    const addHole = (sh, loop2) => {
      const L = tidy(loop2).map(q => { const d = V.sub(to3(q), sh.o); return [V.dot(d, sh.u), V.dot(d, sh.v)]; }), a = Math.abs(area2(L));
      if ((sh.holes || []).some(h => Math.abs(Math.abs(area2(h)) - a) < 1e-6 * Math.max(1, a) && inLoop(inner(area2(h) > 0 ? h : h.slice().reverse()), area2(L) > 0 ? L : L.slice().reverse()))) return;
      sh.holes = [...(sh.holes || []), L]; normalizeShape(sh);
    };
    for (const comp of active) {
      if (!out.some(c => c.comp === comp)) continue;
      const outer = A.cycles.filter(c => c.comp === comp && c.area < 0 && !c.bridge).sort((x, y) => x.area - y.area)[0];
      if (!outer) continue;
      const host = holeIn(outer.pts, comp); if (host) addHole(host, outer.pts);
    }
    // otwory dzielonej ściany przechodzą do tej części, w której leżą
    for (const P of replace) for (const h of P.H) {
      const c = out.filter(c => c.parent === P && inLoop(h[0], c.pts)).sort((x, y) => x.area - y.area)[0];
      if (c) addHole(c.shape, h);
    }
    const gone = new Set([...replace].map(P => P.s));
    if (gone.size) m.shapes = m.shapes.filter(s => !gone.has(s));
    // linie, które w całości leżą na brzegu powstałych albo zachowanych ścian, znikają — ściana ma własne krawędzie
    const used = new Map();
    for (const c of out) for (const e of c.edges) for (const q of e.src) if (q.line) { if (!used.has(q)) used.set(q, new Set()); used.get(q).add(e); }
    // linia tylko częściowo na brzegu ściany (np. przeciągnięta przez całą ścianę i dalej): zostają z niej wolne kawałki
    const dead = new Set(), rest = [];
    for (const [q, set] of used) {
      dead.add(q.line);
      if (set.size >= A.pieces.get(q)) continue;
      for (const e of A.all.values()) if (e.src.includes(q) && !set.has(e)) rest.push({ ...q.line, id: m.next++, a: to3(e.a.p), b: to3(e.b.p) });
    }
    if (dead.size) m.lines = m.lines.filter(l => !dead.has(l)).concat(rest);
  }
  return made || split ? { made, split } : null;
}

// Scalenie dwóch płaskich ścian po usunięciu krawędzi, która je dzieliła (ściana „goi się”, jak w SketchUpie).
// Zwraca true, gdy się udało; ściana A zostaje, B znika.
export function healFaces(m, A, B, a, b) {
  const L = V.dist(a, b); if (L < EPS) return false;
  const d = V.mul(V.sub(b, a), 1 / L), n = A.n, o = A.o, u = A.u, v = A.v, to2 = p => { const q = V.sub(p, o); return [V.dot(q, u), V.dot(q, v)]; };
  const onCut = (p, q) => [p, q].every(x => { const t = V.dot(V.sub(x, a), d); return t > -1e-4 && t < L + 1e-4 && V.dist(V.add(a, V.mul(d, t)), x) < 1e-4; });
  const segs = [];
  for (const s of [A, B]) [s.pts, ...(s.holes || [])].forEach(Lp => Lp.forEach((p, i) => { const q = Lp[(i + 1) % Lp.length], P = at(s, p[0], p[1], 0), Q = at(s, q[0], q[1], 0); if (!onCut(P, Q)) segs.push({ a: to2(P), b: to2(Q), src: s }); }));
  const R = arrange(segs), pos = R.cycles.filter(c => c.area > 1e-8 && !c.bridge).sort((x, y) => y.area - x.area);
  if (!pos.length) return false;
  const outer = pos[0];
  A.pts = tidy(outer.pts); delete A.holes;
  const holes = R.cycles.filter(c => c.area < 0 && !c.bridge && c.comp !== outer.comp && inLoop(c.pts[0], outer.pts)).map(c => tidy(c.pts));
  if (holes.length) A.holes = holes;
  normalizeShape(A);
  m.shapes = m.shapes.filter(s => s !== B);
  return true;
}
