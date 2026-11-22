// Rdzeń geometrii (jak w SketchUpie): ściany jako obrysy z otworami na zespawanych punktach.
//
// Wspólna geometria (bryła `geo`) przechowuje wielokąty `s.polys` i numer ściany każdego z nich `s.fid` — kawałki
// jednej ściany (ściana z otworem musi być pocięta na trójkąty) mają ten sam numer. Krawędzie to granice między
// ścianami: nic nie jest odgadywane z położenia (dawniej przekątne podziału na trójkąty wychodziły na wierzch, a linie
// narysowane na ścianie trzeba było pamiętać osobno jako „znaczniki”).
//
//   facesOf(s)            — ściany: [{ outer, holes, n, paint }] (z `fid`, a w starych szkicach — z obszarów),
//   writeFaces(s, faces)  — z powrotem do s.polys / s.fid / s.fc; punkty leżące na cudzym boku są w nim wstawiane,
//   addLoop(s, …)         — dokłada płaską ścianę: dzieli ściany, na których leży (prostokąt na ścianie),
//   push(s, pi, d, keep)  — wypchnij / wciśnij ścianę (keep = ⌥ / Ctrl: pierwotna ściana zostaje).
//
// Wypychanie bez zgadywania, gdzie jest materiał:
//   – sąsiednia ściana prostopadła do ruchu się rozciąga (dach pudła) albo dostaje wcięcie (drzwi od podłogi wcinają podłogę),
//   – przy pozostałych krawędziach powstaje bok (komin, wnęka okna),
//   – podstawa w pierwotnym miejscu zostaje tylko pod ścianą wolną (której krawędź nie ma sąsiada) albo z ⌥,
//   – ściany w jednej płaszczyźnie zwrócone przeciwnie znoszą się (otwór na wylot, wnęka wypchnięta do równa); wyjątek:
//     świeży bok nowej bryły nie kasuje istniejącej ściany (wspólna przegroda dwóch brył obok siebie).

import { V, area2 } from './model.js';
import { newell, triangulateHoles, fidValid, polySig } from './mesh.js';
import { arrange, inLoop, inner } from './stitch.js';

const EPS = 1e-6;
const K = p => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5);
const basisOf = n => { let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n)))); return { u, v: V.cross(n, u) }; };
const loopArea3 = (L, n) => { let s = [0, 0, 0]; for (let i = 0; i < L.length; i++) s = V.add(s, V.cross(L[i], L[(i + 1) % L.length])); return V.dot(s, n) / 2; };
const dedupe = L => { const out = []; for (const p of L) if (!out.length || V.dist(out[out.length - 1], p) > EPS) out.push(p); while (out.length > 1 && V.dist(out[0], out[out.length - 1]) <= EPS) out.pop(); return out; };
// szpilki: punkt, w którym obrys zawraca po tej samej prostej (zostaje po wcięciu sąsiada przy narożniku) — wypada
const despike = L => {
  let p = dedupe(L), ch = true;
  while (ch && p.length > 3) {
    ch = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length], u = V.sub(b, a), v = V.sub(c, b);
      if (V.len(V.cross(u, v)) < 1e-9 * Math.max(1, V.len(u) * V.len(v)) && V.dot(u, v) < 0) { p.splice(i, 1); p = dedupe(p); ch = true; break; }
    }
  }
  return p;
};
const faceArea = f => Math.abs(loopArea3(f.outer, f.n)) - f.holes.reduce((a, h) => a + Math.abs(loopArea3(h, f.n)), 0);
const maxEdge = L => { let m = 0; for (let i = 0; i < L.length; i++) m = Math.max(m, V.dist(L[i], L[(i + 1) % L.length])); return m; };
const degenerate = f => f.outer.length < 3 || faceArea(f) <= Math.max(1e-9, 1e-6 * maxEdge(f.outer) ** 2);
const planeKey = (n, w) => { let m = n; if (m[2] < -1e-6 || (Math.abs(m[2]) < 1e-6 && (m[1] < -1e-6 || (Math.abs(m[1]) < 1e-6 && m[0] < 0)))) { m = V.mul(m, -1); w = -w; } return m.map(x => Math.round(x * 1e4)).join(',') + '|' + Math.round(w * 1e4); };
const planeOfFace = f => ({ n: f.n, w: V.dot(f.n, f.outer[0]) });
const samePlane = (f, n, w) => Math.abs(Math.abs(V.dot(f.n, n)) - 1) < 1e-6 && f.outer.every(p => Math.abs(V.dot(n, p) - w) < 1e-5);

/* ---------- ściany z bryły i z powrotem ---------- */

// obrys zbioru wielokątów jednej ściany (kawałki dzielą boki dokładnie): boki nienakryte przez inny kawałek, w pętle
function piecesLoops(polys, n) {
  const half = new Map();
  for (const P of polys) for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if (V.dist(a, b) <= EPS) continue; half.set(K(a) + '>' + K(b), [a, b]); }
  const segs = [];
  for (const [k, [a, b]] of half) if (!half.has(K(b) + '>' + K(a))) segs.push([a, b]);
  return chain(segs, n);
}
// odcinki skierowane → pętle (w węźle z kilkoma wyjściami: najbliższy zakręt w prawo, jak przy obchodzeniu pola po lewej)
function chain(segs, n) {
  const { u, v } = basisOf(n), ang = (a, b) => Math.atan2(V.dot(V.sub(b, a), v), V.dot(V.sub(b, a), u));
  const out = new Map();
  for (const s of segs) { const k = K(s[0]); if (!out.has(k)) out.set(k, []); out.get(k).push(s); }
  const used = new Set(), loops = [];
  for (const s0 of segs) {
    if (used.has(s0)) continue;
    const L = []; let s = s0, guard = 0;
    while (s && !used.has(s) && guard++ < 100000) {
      used.add(s); L.push(s[0]);
      const cand = (out.get(K(s[1])) || []).filter(q => !used.has(q));
      if (cand.length <= 1) { s = cand[0]; continue; }
      const back = ang(s[1], s[0]);
      // pierwszy zgodnie z ruchem wskazówek od kierunku powrotnego
      let best = null, bd = Infinity;
      for (const q of cand) { let d = back - ang(q[0], q[1]); while (d <= 1e-9) d += 2 * Math.PI; if (d < bd) { bd = d; best = q; } }
      s = best;
    }
    if (L.length >= 3) loops.push(L);
  }
  return loops;
}
// pętle ściany → obrys (największe pole, zgodny z normalną) i otwory (przeciwnie)
function toFace(loops, n, paint) {
  if (!loops.length) return null;
  loops.sort((a, b) => Math.abs(loopArea3(b, n)) - Math.abs(loopArea3(a, n)));
  let outer = loops[0]; if (loopArea3(outer, n) < 0) outer = outer.slice().reverse();
  const holes = loops.slice(1).map(h => loopArea3(h, n) > 0 ? h.slice().reverse() : h);
  return { outer, holes, n, paint: paint || null };
}

export function facesOf(s) {
  const out = [];
  if (fidValid(s)) {
    const groups = new Map();
    s.polys.forEach((P, i) => { const g = s.fid[i]; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); });
    for (const idx of groups.values()) {
      const n = newell(s.polys[idx[0]]), polys = idx.map(i => s.polys[i]);
      const f = toFace(idx.length === 1 ? [polys[0].slice()] : piecesLoops(polys, n), n, s.fc && s.fc['p:' + idx[0]]);
      if (f) { f.src = idx; out.push(f); }
    }
    return out;
  }
  // stary szkic (albo po poleceniu, które nie zna numerów ścian): kawałki składane w ściany. Najpierw boki kawałków są
  // wyrównane (punkt leżący na cudzym boku jest w nim wstawiany), potem kawałki w jednej płaszczyźnie, zwrócone zgodnie
  // i dzielące bok łączą się — chyba że po tym boku biegnie narysowana linia (znacznik) albo krawędź ściany z innej płaszczyzny.
  const P = [];
  s.polys.forEach((poly, i) => { const f = { outer: dedupe(poly.map(p => p.slice())), holes: [], n: newell(poly), src: [i] }; if (!degenerate(f)) P.push(f); });
  conform(P);
  const par = P.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
  const seg = new Map(), ek = (a, b) => { const x = K(a), y = K(b); return x < y ? x + '|' + y : y + '|' + x; };
  P.forEach((f, i) => f.outer.forEach((a, j) => { const k = ek(a, f.outer[(j + 1) % f.outer.length]); if (!seg.has(k)) seg.set(k, []); seg.get(k).push(i); }));
  const marks = (s.marks || []).map(([a, b]) => [a, b]);
  const onMark = (a, b) => { const m = V.lerp(a, b, 0.5); return marks.some(([p, q]) => { const L = V.dist(p, q); if (L < EPS) return false; const e = V.mul(V.sub(q, p), 1 / L), t = V.dot(V.sub(m, p), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(p, V.mul(e, t)), m) < 1e-5; }); };
  const coplanar = (f, g) => V.dot(f.n, g.n) > 1 - 1e-6 && Math.abs(V.dot(f.n, V.sub(g.outer[0], f.outer[0]))) < 1e-5;
  for (const [k, L] of seg) {
    if (L.length < 2) continue;
    if (L.some(i => L.some(j => !coplanar(P[i], P[j]) && !coplanar(P[i], { ...P[j], n: V.mul(P[j].n, -1) })))) continue;   // krawędź z ścianą z innej płaszczyzny
    const [ka, kb] = k.split('|'), f0 = P[L[0]], a = f0.outer.find(p => K(p) === ka), b = f0.outer.find(p => K(p) === kb);
    if (a && b && onMark(a, b)) continue;
    for (let x = 1; x < L.length; x++) if (coplanar(P[L[0]], P[L[x]])) par[find(L[x])] = find(L[0]);
  }
  const groups = new Map(); P.forEach((f, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); });
  for (const idx of groups.values()) {
    const n = P[idx[0]].n, src = idx.flatMap(i => P[i].src);
    const f = toFace(idx.length === 1 ? [P[idx[0]].outer] : piecesLoops(idx.map(i => P[i].outer), n), n, s.fc && s.fc['p:' + src[0]]);
    if (f) { f.src = src; out.push(f); }
  }
  return out;
}

// punkty leżące na cudzym boku są w nim wstawiane — sąsiednie ściany dzielą boki dokładnie (bez „T” na krawędziach)
function conform(faces) {
  const pts = new Map();
  for (const f of faces) for (const L of [f.outer, ...f.holes]) for (const p of L) pts.set(K(p), p);
  const all = [...pts.values()];
  // kubełki po osiach do szybkiego szukania punktów przy boku
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of all) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
  const h = Math.max(1e-3, Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 32), cell = x => Math.floor(x / h), grid = new Map();
  for (const p of all) { const key = cell(p[0]) + ',' + cell(p[1]) + ',' + cell(p[2]); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p); }
  const near = (a, b) => {
    const res = [], c0 = [0, 1, 2].map(k => cell(Math.min(a[k], b[k]) - 1e-5)), c1 = [0, 1, 2].map(k => cell(Math.max(a[k], b[k]) + 1e-5));
    if ((c1[0] - c0[0] + 1) * (c1[1] - c0[1] + 1) * (c1[2] - c0[2] + 1) > 4000) return all;
    for (let x = c0[0]; x <= c1[0]; x++) for (let y = c0[1]; y <= c1[1]; y++) for (let z = c0[2]; z <= c1[2]; z++) for (const p of grid.get(x + ',' + y + ',' + z) || []) res.push(p);
    return res;
  };
  const fix = L => {
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = L[(i + 1) % L.length], len = V.dist(a, b); out.push(a);
      if (len <= EPS) continue;
      const e = V.mul(V.sub(b, a), 1 / len), ins = [];
      for (const q of near(a, b)) { const t = V.dot(V.sub(q, a), e); if (t > 1e-6 && t < len - 1e-6 && V.dist(V.add(a, V.mul(e, t)), q) < 1e-6) ins.push([t, q]); }
      ins.sort((x, y) => x[0] - y[0]); for (const [, q] of ins) out.push(q);
    }
    return dedupe(out);
  };
  for (const f of faces) { f.outer = fix(f.outer); f.holes = f.holes.map(fix); }
}

export function writeFaces(s, faces) {
  faces = faces.filter(f => !degenerate(f));
  conform(faces);
  const polys = [], fid = [], fc = {};
  faces.forEach((f, i) => {
    const pieces = f.holes.length ? triangulateHoles(f.outer, f.holes) : [f.outer];
    for (const P of pieces) { if (f.paint) fc['p:' + polys.length] = f.paint; polys.push(P.map(p => p.slice())); fid.push(i); }
  });
  if (Object.keys(fc).length) s.fc = fc; else delete s.fc;
  // Znaczniki: krawędzie między ścianami w jednej płaszczyźnie (okno narysowane na ścianie, linia dzieląca dach) są też
  // zapisane jako znaczniki — polecenia, które jeszcze nie znają numerów ścian (linia na ścianie, gumka, usuwanie),
  // składają ściany od nowa i bez znaczników zlałyby je w jedną. Linie w środku ściany (nie na brzegu) zostają.
  const seg = new Map(), ek = (a, b) => { const x = K(a), y = K(b); return x < y ? x + '|' + y : y + '|' + x; };
  faces.forEach((f, i) => { for (const L of [f.outer, ...f.holes]) L.forEach((a, j) => { const b = L[(j + 1) % L.length], k = ek(a, b); if (!seg.has(k)) seg.set(k, { a, b, f: [] }); seg.get(k).f.push(i); }); });
  const marks = [];
  for (const e of seg.values()) if (e.f.length === 2 && Math.abs(Math.abs(V.dot(faces[e.f[0]].n, faces[e.f[1]].n)) - 1) < 1e-6) marks.push([e.a.slice(), e.b.slice()]);
  for (const m of s.marks || []) if (!seg.has(ek(m[0], m[1]))) marks.push(m);
  if (marks.length) s.marks = marks; else delete s.marks;
  s.polys = polys; s.fid = fid; s.fidSig = polySig(polys, s.marks);
  return s;
}

/* ---------- płaszczyzna: podział na pola i nowe ściany ---------- */
// inputs: [{ outer, holes }] w płaszczyźnie (n, w). label(cover) → etykieta pola albo null (pole puste); cover — numery
// wejść, które przykrywają pole. Wynik: [{ label, outer, holes }] (obrysy zgodne z n), pola o jednej etykiecie scalone.
// join(a, b) — czy dwie różne etykiety po obu stronach boku scalić w jedną ścianę.
function labelPlane(n, w, inputs, label, join, blocked) {
  const { u, v } = basisOf(n), o = V.mul(n, w);
  const to2 = p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; };
  const to3 = q => V.add(o, V.add(V.mul(u, q[0]), V.mul(v, q[1])));
  const exact = new Map(), K2 = q => Math.round(q[0] * 1e5) + ',' + Math.round(q[1] * 1e5);
  const segs = [], in2 = inputs.map((f, k) => {
    const loops = [f.outer, ...f.holes].map(L => L.map(p => { const q = to2(p); exact.set(K2(q), p); return q; }));
    for (const L of loops) L.forEach((a, i) => segs.push({ a, b: L[(i + 1) % L.length], src: k }));
    return loops;
  });
  const P3 = q => exact.get(K2(q)) || to3(q);
  const A = arrange(segs);
  // pola: dodatnie cykle; otwory — ujemne cykle innych spójnych części leżące w środku
  const cells = A.cycles.filter(c => c.area > 1e-12 && !c.bridge).map(c => ({ ...c, holes: [] }));
  const outerOf = new Map();
  for (const c of A.cycles) if (c.area < 0 && !c.bridge) { const q = outerOf.get(c.comp); if (!q || c.area < q.area) outerOf.set(c.comp, c); }
  for (const [comp, oc] of outerOf) { const host = cells.filter(c => c.comp !== comp && inLoop(oc.pts[0], c.pts)).sort((x, y) => x.area - y.area)[0]; if (host) host.holes.push(oc.pts); }
  const inside = (p, loops) => inLoop(p, loops[0]) && !loops.slice(1).some(h => inLoop(p, h));
  const dirLabel = new Map(), lab = [];
  cells.forEach((c, i) => {
    let ip = inner(c.pts);
    if (c.holes.some(h => inLoop(ip, h))) ip = inner(c.pts.slice().reverse()).map(x => x);   // (rzadkie: punkt trafił w otwór)
    const cover = []; in2.forEach((L, k) => { if (inside(ip, L)) cover.push(k); });
    lab[i] = label(cover);
    for (const L of [c.pts, ...c.holes]) L.forEach((a, j) => { const b = L[(j + 1) % L.length]; dirLabel.set(K2(a) + '>' + K2(b), i); });
  });
  // etykiety do scalenia (np. świeży bok ze ścianą w tej samej płaszczyźnie)
  const par = new Map(), find = x => { while (par.has(x) && par.get(x) !== x) x = par.get(x); return x; };
  const pt2 = new Map(); for (const c of cells) for (const L of [c.pts, ...c.holes]) for (const q of L) pt2.set(K2(q), q);
  if (join) for (const [key, i] of dirLabel) {
    const [a, b] = key.split('>'), j = dirLabel.get(b + '>' + a), la = lab[i], lb = j == null ? null : lab[j];
    if (la == null || lb == null || find(la) === find(lb) || !join(find(la), find(lb))) continue;
    if (blocked && blocked(P3(pt2.get(a)), P3(pt2.get(b)))) continue;
    par.set(find(la), find(lb));
  }
  const L = i => lab[i] == null ? null : find(lab[i]);
  // brzegi: boki pól, po których drugiej stronie jest inna etykieta
  const byLabel = new Map();
  for (const [key, i] of dirLabel) {
    const li = L(i); if (li == null) continue;
    const [a, b] = key.split('>'), j = dirLabel.get(b + '>' + a);
    if (j != null && L(j) === li) continue;
    if (!byLabel.has(li)) byLabel.set(li, []);
    byLabel.get(li).push([P3(pt2.get(a)), P3(pt2.get(b))]);
  }
  const outFaces = [];
  for (const [l, sg] of byLabel) {
    const loops = chain(sg, n).map(dedupe).filter(x => x.length >= 3);
    const outers = loops.filter(x => loopArea3(x, n) > 0), holes = loops.filter(x => loopArea3(x, n) < 0);
    const res = outers.map(x => ({ label: l, outer: x, holes: [] }));
    for (const hl of holes) {
      const p = to2(V.lerp(hl[0], hl[1], 0.5));
      const host = res.filter(f => inLoop(p, f.outer.map(to2))).sort((a, b) => Math.abs(loopArea3(a.outer, n)) - Math.abs(loopArea3(b.outer, n)))[0];
      if (host) host.holes.push(hl);
    }
    outFaces.push(...res);
  }
  return outFaces;
}
const orient = (f, n) => V.dot(f.n, n) > 0 ? 1 : -1;
const flip = f => ({ ...f, outer: f.outer.slice().reverse(), holes: f.holes.map(h => h.slice().reverse()), n: V.mul(f.n, -1) });

// ściany w płaszczyźnie po zmianie: zwrócone przeciwnie znoszą się (wyjątek: świeży bok na istniejącej ścianie), świeże
// boki scalają się z sąsiednią ścianą w tej samej płaszczyźnie i zwróconą w tę samą stronę
function resolvePlane(faces, n, w, freshWins = false) {
  const idx = faces.map((f, i) => i).filter(i => samePlane(faces[i], n, w));
  if (idx.length < 2) return faces;
  const F = idx.map(i => faces[i]), up = F.map(f => orient(f, n) > 0);
  // płaszczyzna bez nakładania się i bez świeżych boków — bez zmian
  if (!F.some(f => f.fresh)) {
    const box = f => { const q = f.outer.map(p => [V.dot(p, basisOf(n).u), V.dot(p, basisOf(n).v)]); return [Math.min(...q.map(x => x[0])), Math.min(...q.map(x => x[1])), Math.max(...q.map(x => x[0])), Math.max(...q.map(x => x[1]))]; };
    const B = F.map(box); let clash = false;
    for (let i = 0; i < F.length && !clash; i++) for (let j = i + 1; j < F.length; j++) if (up[i] !== up[j] && B[i][0] < B[j][2] - 1e-6 && B[j][0] < B[i][2] - 1e-6 && B[i][1] < B[j][3] - 1e-6 && B[j][1] < B[i][3] - 1e-6) { clash = true; break; }
    if (!clash) return faces;
  }
  const flat = F.map(f => up[F.indexOf(f)] ? f : flip(f));   // wszystkie w tej samej orientacji do podziału
  const label = cover => {
    const U = cover.filter(k => up[k]), D = cover.filter(k => !up[k]);
    const pick = L => (L.find(k => !F[k].fresh) ?? L[0]);
    if (U.length && D.length) {
      const uf = U.every(k => F[k].fresh), df = D.every(k => F[k].fresh);
      // dokładanie materiału: istniejąca ściana zostaje (wspólna przegroda); wybieranie: świeży bok zastępuje ją
      // (odsłonięta część przegrody staje się ścianą zewnętrzną zwróconą w stronę powstałej pustki)
      if (uf !== df) { const fresh = uf ? U : D, old = uf ? D : U; return freshWins ? pick(fresh) : pick(old); }
      return null;
    }
    return cover.length ? pick(cover) : null;
  };
  const join = (a, b) => up[a] === up[b] && (F[a].fresh || F[b].fresh);
  // bok, po którym biegnie krawędź ściany z innej płaszczyzny (np. stary dach po ⌥), zostaje krawędzią
  const rest = faces.filter((_, i) => !idx.includes(i)), segs = [];
  for (const f of rest) for (const L of [f.outer, ...f.holes]) L.forEach((a, i) => segs.push([a, L[(i + 1) % L.length]]));
  const blocked = (a, b) => { const m = V.lerp(a, b, 0.5); return segs.some(([p, q]) => { const L = V.dist(p, q); if (L < EPS) return false; const e = V.mul(V.sub(q, p), 1 / L), t = V.dot(V.sub(m, p), e); return t > 1e-6 && t < L - 1e-6 && V.dist(V.add(p, V.mul(e, t)), m) < 1e-6; }); };
  const res = labelPlane(n, w, flat, label, join, blocked).map(r => {
    const src = F[r.label], g = { outer: r.outer, holes: r.holes, n, paint: src.paint };
    return up[r.label] ? g : flip(g);
  });
  const keep = faces.filter((_, i) => !idx.includes(i));
  return [...keep, ...res];
}

/* ---------- dokładanie ściany ---------- */
// outer / holes w 3D; orientacja jak podana. Ściany w tej samej płaszczyźnie, na które trafia, są dzielone.
export function addLoop(s, outer, holes = [], paint = null) {
  const faces = facesOf(s), n = newell(outer), w = V.dot(n, outer[0]);
  const loop = { outer: outer.map(p => p.slice()), holes: holes.map(h => h.map(p => p.slice())), n, paint };
  const idx = faces.map((f, i) => i).filter(i => samePlane(faces[i], n, w));
  if (!idx.length) return writeFaces(s, [...faces, loop]);
  const C = idx.map(i => faces[i]), sign = C.map(f => orient(f, n));
  const flat = [...C.map((f, k) => sign[k] > 0 ? f : flip(f)), loop];
  const NEW = C.length;
  const label = cover => {
    const old = cover.find(k => k < NEW), isNew = cover.includes(NEW);
    if (old != null) return 'f' + old + (isNew ? '+' : '');
    return isNew ? 'n' : null;
  };
  // część nowej ściany poza istniejącymi przyjmuje ich stronę (jak w SketchUpie: ściany w jednej płaszczyźnie zwrócone zgodnie)
  const side = sign[0];
  const res = labelPlane(n, w, flat, label, null).map(r => {
    if (r.label === 'n') { const g = { outer: r.outer, holes: r.holes, n, paint }; return side > 0 ? g : flip(g); }
    const k = +r.label.slice(1).replace('+', ''), src = C[k];
    const g = { outer: r.outer, holes: r.holes, n, paint: src.paint };
    return sign[k] > 0 ? g : flip(g);
  });
  const keep = faces.filter((_, i) => !idx.includes(i));
  return writeFaces(s, [...keep, ...res]);
}

/* ---------- wypchnij / wciśnij ---------- */
export function push(s, pi, d, keep = false) {
  if (Math.abs(d) < 1e-9) return s;
  let faces = facesOf(s);
  conform(faces);
  const F = faces.find(f => f.src.includes(pi)); if (!F) return s;
  const n = F.n, D = V.mul(n, d), others = faces.filter(f => f !== F);
  // kto używa punktu i boku
  const useV = new Map(), useE = new Map(), ek = (a, b) => { const x = K(a), y = K(b); return x < y ? x + '|' + y : y + '|' + x; };
  for (const f of others) for (const L of [f.outer, ...f.holes]) L.forEach((p, i) => {
    const k = K(p); if (!useV.has(k)) useV.set(k, new Set()); useV.get(k).add(f);
    const e = ek(p, L[(i + 1) % L.length]); if (!useE.has(e)) useE.set(e, new Set()); useE.get(e).add(f);
  });
  const perp = f => Math.abs(V.dot(f.n, n)) < 1e-6;
  const loopsF = [F.outer, ...F.holes];
  const free = loopsF.some(L => L.some((p, i) => !(useE.get(ek(p, L[(i + 1) % L.length])) || new Set()).size));
  // punkt przesuwa się razem ze ścianą, gdy wszystkie jego inne ściany są prostopadłe do ruchu (rozciągają się); inaczej
  // ściana dostaje nowy punkt, a stary zostaje sąsiadom
  const moved = new Map();
  for (const L of loopsF) for (const p of L) { const us = useV.get(K(p)); moved.set(K(p), !keep && !free && !!us && us.size > 0 && [...us].every(perp)); }
  const to = p => V.add(p, D);
  const back = free && !keep && d < 0;   // wolna ściana ciągnięta do tyłu: bryła rośnie po tej stronie
  const created = [], softs = [];
  // boki i wcięcia sąsiadów
  for (const L of loopsF) L.forEach((a, i) => {
    const b = L[(i + 1) % L.length], ma = moved.get(K(a)), mb = moved.get(K(b));
    if (ma && mb) return;
    // (wolna ściana — np. prostokąt na ziemi — nie rusza sąsiadów: stawia własne boki, a podstawa zostaje)
    const nb = [...(useE.get(ek(a, b)) || [])];
    // wcięcie / rozciągnięcie sąsiada tylko wtedy, gdy przy boku nie ma ściany w płaszczyźnie wypychanej (wtedy ściana
    // jest wpuszczona w powierzchnię i potrzebny jest bok — np. front bryły obok przegrody)
    const G = free || nb.some(f => !perp(f)) ? null : nb.find(perp);
    if (!keep && G) {
      // sąsiad prostopadły: jego brzeg obchodzi przesunięty bok (wcięcie albo przedłużenie)
      for (const GL of [G.outer, ...G.holes]) for (let j = 0; j < GL.length; j++) {
        const x = GL[j], y = GL[(j + 1) % GL.length];
        if (K(x) === K(a) && K(y) === K(b)) { GL.splice(j + 1, 0, ...[ma ? null : to(a), mb ? null : to(b)].filter(Boolean)); return; }
        if (K(x) === K(b) && K(y) === K(a)) { GL.splice(j + 1, 0, ...[mb ? null : to(b), ma ? null : to(a)].filter(Boolean)); return; }
      }
      return;
    }
    // obły obrys (okrąg, łuk): krawędzie między bokami są wygładzone, jak w SketchUpie
    if (L.length >= 12) { const p0 = L[(i - 1 + L.length) % L.length], e1 = V.norm(V.sub(a, p0)), e2 = V.norm(V.sub(b, a)); if (V.dot(e1, e2) > 0.9) softs.push([ma ? to(a) : a, to(a)]); }
    const q = dedupe([ma ? to(a) : a, mb ? to(b) : b, to(b), to(a)]);
    if (q.length >= 3) { const side = { outer: back ? q.slice().reverse() : q, holes: [], n: newell(back ? q.slice().reverse() : q), paint: F.paint, fresh: true }; created.push(side); }
  });
  // punkty przesuwane razem ze ścianą — u sąsiadów też
  for (const f of others) for (const L of [f.outer, ...f.holes]) for (let i = 0; i < L.length; i++) if (moved.get(K(L[i]))) L[i] = to(L[i]);
  const base = (free || keep) ? { outer: F.outer.map(p => p.slice()), holes: F.holes.map(h => h.map(p => p.slice())), n: F.n, paint: F.paint } : null;
  F.outer = F.outer.map(to); F.holes = F.holes.map(h => h.map(to));
  let out = [...faces, ...created];
  if (base) out.push(keep || back ? base : flip(base));
  if (back) { const i = out.indexOf(F); out[i] = flip(F); }
  // porządek w dotkniętych płaszczyznach
  for (const f of out) for (const L of [f.outer, ...f.holes]) { const c = despike(L); L.length = 0; L.push(...c); }
  out = out.filter(f => f.outer.length >= 3 && !degenerate(f)).map(f => ({ ...f, n: newell(f.outer) }));
  const planes = new Map(), add = f => { const p = planeOfFace(f), q = planeKey(p.n, p.w); if (!planes.has(q)) planes.set(q, p); };
  add(out.find(f => f === F) || F); if (base) add(base); created.forEach(add);
  for (const f of out) if (f !== F && f.outer.some(p => moved.get(K(p)) !== undefined || loopsF.some(L => L.some(q => V.dist(q, p) < EPS)))) add(f);
  const removing = !free && !keep && d < 0;
  for (const { n: pn, w } of planes.values()) out = resolvePlane(out, pn, w, removing);
  if (softs.length) s.softs = [...(s.softs || []), ...softs];
  return writeFaces(s, out.map(f => { const g = { ...f }; delete g.fresh; return g; }));
}
