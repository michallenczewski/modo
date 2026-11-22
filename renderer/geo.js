// Wspólna geometria (jak w SketchUpie): wszystko, co narysowane luzem w jednym kontekście (cały szkic albo wnętrze
// edytowanej grupy), jest jedną bryłą-siatką z flagą `geo` — zbiorem ścian połączonych wspólnymi punktami.
// Osobnym obiektem jest tylko grupa albo komponent. Ten plik to działania na takiej siatce:
//   rebuildPlane — porządkuje jedną płaszczyznę: ściany zwrócone w przeciwne strony, które na siebie nachodzą, znoszą się
//                  (dno wybitego otworu, ściany wnęki wyciągniętej z powrotem, bryły zlane przez absorb), reszta zostaje;
//                  wyjątek: bryła wyciągnięta z wolnej ściany obok innej zostawia wspólną przegrodę (jak w SketchUpie),
//   addFace      — dokłada płaską ścianę: tam, gdzie już jest ściana, tylko ją dzieli krawędziami,
//   pushFace     — wypchnij / wciśnij: przesuwa ścianę, dokłada boki i porządkuje dotknięte płaszczyzny,
//   absorb       — zlewa luźne bryły kontekstu w jedną geometrię,
//   eraseFaces, component, liftFaces — usuwanie ścian z zachowaniem krawędzi, części spójne, wyjęcie ścian do osobnej bryły.
// Ściana to nadal „obszar” siatki: wielokąty w jednej płaszczyźnie, zwrócone w tę samą stronę i nierozdzielone znacznikiem.

import { V, faces as facesOf, edges as edgesOf, isHidden } from './model.js';
import { isMesh, toMesh, newell, planeOf, inPoly, triangulatePoly, triangulateHoles, regionOf, regions, regionLoops, simplify, keepPaint, splitMesh, segKey } from './mesh.js';
import { arrange, inLoop, inner, tidy } from './stitch.js';

const basisOf = n => { let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n)))); return { u, v: V.cross(n, u) }; };
function frame(n, w) {
  const { u, v } = basisOf(n), o = V.mul(n, w);
  return { to2: p => { const d = V.sub(p, o); return [V.dot(d, u), V.dot(d, v)]; }, to3: q => V.add(o, V.add(V.mul(u, q[0]), V.mul(v, q[1]))) };
}
const planeKey = (n, w) => { let m = n; if (m[2] < -1e-6 || (Math.abs(m[2]) < 1e-6 && (m[1] < -1e-6 || (Math.abs(m[1]) < 1e-6 && m[0] < 0)))) { m = V.mul(m, -1); w = -w; } return m.map(x => Math.round(x * 1e4)).join(',') + '|' + Math.round(w * 1e4); };
const inPlane = (p, n, w) => { const q = newell(p), d = V.dot(q, n); return Math.abs(Math.abs(d) - 1) < 1e-6 && Math.abs(V.dot(n, p[0]) - w) < 1e-5 ? (d > 0 ? 1 : -1) : 0; };
// pola układu z otworami: wyspa (osobna część układu) jest otworem najmniejszego pola, w którym leży
function cellsOf(A) {
  const cells = A.cycles.filter(c => c.area > 1e-9 && !c.bridge).map(c => ({ ...c, holes: [] }));
  const outer = new Map();
  for (const c of A.cycles) if (c.area < 0 && !c.bridge) { const o = outer.get(c.comp); if (!o || c.area < o.area) outer.set(c.comp, c); }
  for (const [comp, o] of outer) {
    const host = cells.filter(c => c.comp !== comp && inLoop(o.pts[0], c.pts)).sort((x, y) => x.area - y.area)[0];
    if (host) host.holes.push(o.pts);
  }
  return cells;
}
const setPolys = (s, polys, fc) => { s.polys = polys; if (fc && Object.keys(fc).length) s.fc = fc; else delete s.fc; };

/* ---------- porządek w płaszczyźnie ---------- */
// Wszystkie wielokąty leżące w płaszczyźnie (n, w), zwrócone w obie strony, są cięte nawzajem na pola. Pole przykryte
// tylko z jednej strony zostaje ścianą zwróconą w tę stronę; przykryte z obu — znika. Zwraca true, gdy coś zmieniono.
// fresh — boki świeżo wyciągniętej bryły (WeakSet wielokątów): tam, gdzie bok przykrywa istniejącą ścianę zwróconą przeciwnie,
// zostaje istniejąca ściana jako wspólna przegroda (jak w SketchUpie: bryła wyciągnięta obok drugiej nie zjada ich wspólnej ściany).
export function rebuildPlane(s, n, w, fresh) {
  const idx = [], sign = [];
  s.polys.forEach((p, i) => { const sg = inPlane(p, n, w); if (sg) { idx.push(i); sign.push(sg); } });
  if (!sign.includes(1) || !sign.includes(-1)) return false;
  const { to2, to3 } = frame(n, w), P2 = idx.map(i => s.polys[i].map(to2));
  const box = L => { let a = [1e9, 1e9, -1e9, -1e9]; for (const p of L) a = [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[2], p[0]), Math.max(a[3], p[1])]; return a; }, B = P2.map(box);
  let clash = false;
  for (let i = 0; i < idx.length && !clash; i++) for (let j = i + 1; j < idx.length; j++) if (sign[i] !== sign[j] && B[i][0] < B[j][2] - 1e-6 && B[j][0] < B[i][2] - 1e-6 && B[i][1] < B[j][3] - 1e-6 && B[j][1] < B[i][3] - 1e-6) { clash = true; break; }
  if (!clash) return false;
  const segs = [];
  P2.forEach((L, k) => L.forEach((a, i) => segs.push({ a, b: L[(i + 1) % L.length], src: k })));
  const out = [], fc = {}, put = (poly, paint) => { if (paint) fc['p:' + out.length] = paint; out.push(poly); };
  const drop = new Set(idx);
  s.polys.forEach((p, i) => { if (!drop.has(i)) put(p, s.fc && s.fc['p:' + i]); });
  for (const c of cellsOf(arrange(segs))) {
    const ip = inner(c.pts), up = P2.findIndex((L, k) => sign[k] > 0 && inLoop(ip, L)), down = P2.findIndex((L, k) => sign[k] < 0 && inLoop(ip, L));
    let keepUp = up >= 0;
    if (up >= 0 && down >= 0) {
      // obie strony: pole znika — chyba że to bok nowej bryły na istniejącej ścianie (wtedy zostaje ta ściana)
      const fu = !!fresh && fresh.has(s.polys[idx[up]]), fd = !!fresh && fresh.has(s.polys[idx[down]]);
      if (fu === fd) continue;
      keepUp = fd;
    } else if (up < 0 && down < 0) continue;   // nic
    const k = keepUp ? up : down, rev = L => (keepUp ? L : L.slice().reverse());
    const o3 = rev(tidy(c.pts).map(to3)), h3 = c.holes.map(h => rev(tidy(h).map(to3)));
    for (const piece of h3.length ? triangulateHoles(o3, h3) : [o3]) put(piece, s.fc && s.fc['p:' + idx[k]]);
  }
  setPolys(s, out, fc);
  return true;
}

/* ---------- dokładanie ściany ---------- */
// Płaska ściana (obrys i otwory w 3D). Część, która leży na istniejącej ścianie, nie staje się drugą ścianą — jej krawędzie
// dzielą tamtą (jak prostokąt narysowany na ścianie w SketchUpie). Reszta jest nową ścianą. Po serii wywołań: finish(s).
export function addFace(s, outer, holes = [], paint = null) {
  // punkty nowej ściany, które trafiają w istniejące wierzchołki, biorą ich dokładne współrzędne (bez „pływania” o ułamki)
  const have = new Map(); for (const p of s.polys) for (const v of p) have.set(VK(v), v);
  const weld = L => L.map(p => (have.get(VK(p)) || p).slice());
  outer = weld(outer); holes = holes.map(weld);
  const n = newell(outer), w = V.dot(n, outer[0]);
  const idx = []; s.polys.forEach((p, i) => { if (inPlane(p, n, w)) idx.push(i); });
  const pieces = () => holes.length ? triangulateHoles(outer, holes) : [outer.map(p => p.slice())];
  const push = list => { const fc = { ...(s.fc || {}) }; let k = s.polys.length; for (const p of list) { if (paint) fc['p:' + k] = paint; k++; } setPolys(s, [...s.polys, ...list], fc); };
  if (!idx.length) { push(pieces()); return; }
  const { to2, to3 } = frame(n, w), P2 = idx.map(i => s.polys[i].map(to2)), L2 = outer.map(to2), H2 = holes.map(h => h.map(to2));
  const segs = [];
  P2.forEach((L, k) => L.forEach((a, i) => segs.push({ a, b: L[(i + 1) % L.length], src: k })));
  [L2, ...H2].forEach(L => L.forEach((a, i) => segs.push({ a, b: L[(i + 1) % L.length], src: 'new' })));
  const A = arrange(segs), fresh = [];
  for (const c of cellsOf(A)) {
    const ip = inner(c.pts);
    if (!inLoop(ip, L2) || H2.some(h => inLoop(ip, h)) || P2.some(L => inLoop(ip, L))) continue;
    const o3 = tidy(c.pts).map(to3), h3 = c.holes.map(h => tidy(h).map(to3));
    fresh.push(...(h3.length ? triangulateHoles(o3, h3) : [o3]));
  }
  // krawędzie nowej ściany biegnące przez istniejącą ścianę dzielą ją
  const cuts = [];
  for (const e of A.all.values()) {
    if (!e.src.includes('new') || e.src.some(q => q !== 'new')) continue;
    const m = [(e.a.p[0] + e.b.p[0]) / 2, (e.a.p[1] + e.b.p[1]) / 2];
    if (P2.some(L => inLoop(m, L))) cuts.push([to3(e.a.p), to3(e.b.p)]);
  }
  // Krawędź nowej ściany, która biegnie po brzegu istniejącej ściany w tej samej płaszczyźnie (dwa prostokąty obok siebie,
  // nakładające się obrysy), zostaje krawędzią — inaczej obie ściany zlałyby się w jedną (jak w SketchUpie: narysowana krawędź zostaje).
  const keep = [];
  for (const e of A.all.values()) {
    const both = e.src.includes('new') && e.src.some(q => q !== 'new');
    // brzeg istniejącej ściany, który po dodaniu nowej ściany ma ścianę po obu stronach (obrysy zachodzą na siebie)
    const m = [(e.a.p[0] + e.b.p[0]) / 2, (e.a.p[1] + e.b.p[1]) / 2];
    // (tylko brzeg: krawędź jednego wielokąta; przekątne podziału ściany na trójkąty należą do dwóch i nie są krawędziami)
    const inside = !e.src.includes('new') && new Set(e.src).size === 1 && inLoop(m, L2) && !H2.some(h => inLoop(m, h));
    if (both || inside) keep.push([to3(e.a.p), to3(e.b.p)]);
  }
  if (fresh.length) push(fresh);
  if (keep.length) s.marks = [...(s.marks || []), ...keep];
  for (const [a, b] of cuts) splitMesh(s, a, b, true, true);
}
export function finish(s) { keepPaint(s, () => simplify(s)); return s; }

/* ---------- wypchnij / wciśnij ---------- */
// Czy w punkcie o (patrząc w stronę dir) jest materiał: parzystość przecięć promienia ze ścianami. Wewnętrzna przegroda
// (wspólna ściana dwóch brył stojących obok siebie) się nie liczy — po obu jej stronach jest materiał. Przegrodę poznajemy
// po tym, że tuż przed nią (po stronie, w którą jest zwrócona) też jest materiał; to samo pytanie, o poziom głębiej.
function insideAt(s, skip, o, dir, depth) {
  let hits = 0;
  s.polys.forEach((P, i) => {
    if (skip.has(i)) return;
    for (const t of triangulatePoly(P)) {
      const e1 = V.sub(t[1], t[0]), e2 = V.sub(t[2], t[0]), h = V.cross(dir, e2), a = V.dot(e1, h); if (Math.abs(a) < 1e-12) continue;
      const f = 1 / a, q = V.sub(o, t[0]), uu = f * V.dot(q, h); if (uu < 0 || uu > 1) continue;
      const r = V.cross(q, e1), vv = f * V.dot(dir, r); if (vv < 0 || uu + vv > 1) continue;
      const d = f * V.dot(e2, r); if (d <= 1e-9) continue;
      if (depth > 0) {
        // za ścianą zawsze jest materiał; jeśli przed nią (po stronie, w którą jest zwrócona) też — to przegroda, pomijamy
        const n = newell(P), hp = V.add(o, V.mul(dir, d)), { u, v } = basisOf(n);
        const d2 = V.norm(V.add(n, V.add(V.mul(u, 0.0113), V.mul(v, 0.0089))));
        if (insideAt(s, new Set([i]), V.add(hp, V.mul(d2, 1e-5)), d2, depth - 1)) continue;
      }
      hits++;
    }
  });
  return hits % 2 === 1;
}
// czy tuż za ścianą (po stronie przeciwnej do normalnej) jest materiał
function solidBehind(s, skip, p, n) {
  const { u, v } = basisOf(n), dir = V.norm(V.add(V.mul(n, -1), V.add(V.mul(u, 0.0137), V.mul(v, 0.0071))));
  return insideAt(s, skip, V.add(p, V.mul(dir, 1e-5)), dir, 2);
}
// Ściana `pi` (cały jej obszar) przesunięta o d wzdłuż normalnej. Jak w SketchUpie:
//  – wyciągana ze ściany bryły dokłada materiał, wciskana — wybiera go (do przeciwległej ściany: otwór na wylot),
//  – wolna płaska ściana staje się bryłą; jej pierwotne miejsce zostaje jako druga podstawa,
//  – keep (⌥ / Ctrl): pierwotna ściana zostaje na miejscu.
export function pushFace(s, pi, d, keep) {
  if (Math.abs(d) < 1e-9) return s;
  const idx = regionOf(s, pi), n = newell(s.polys[pi]), sweep = V.mul(n, d), R = new Set(idx);
  const loops = regionLoops(s, idx), paint = s.fc && s.fc['p:' + pi];
  const t0 = triangulatePoly(s.polys[pi])[0], mat = solidBehind(s, R, V.mul(V.add(V.add(t0[0], t0[1]), t0[2]), 1 / 3), n);
  const back = d < 0 && !mat;   // wolna ściana ciągnięta do tyłu: bryła rośnie po tej stronie
  const out = [], fc = {}, put = (poly, pt) => { if (pt) fc['p:' + out.length] = pt; out.push(poly); };
  const rev = p => p.slice().reverse();
  s.polys.forEach((p, i) => {
    const pt = s.fc && s.fc['p:' + i];
    if (!R.has(i)) return put(p, pt);
    // pierwotne miejsce ściany: zostaje, gdy za nią nie ma materiału (staje się spodem nowej bryły) albo na życzenie
    if (keep || !mat) put(d > 0 && !mat ? rev(p) : p, pt);
  });
  // denko: ściana w nowym miejscu
  for (const i of idx) { const q = s.polys[i].map(p => V.add(p, sweep)); put(back ? rev(q) : q, paint); }
  // boki; kolor biorą od ściany, którą przedłużają
  const softs = [], sides = new WeakSet();
  for (const L of loops) {
    const round = L.length >= 12;
    L.forEach((a, i) => {
      const b = L[(i + 1) % L.length], q = [a, b, V.add(b, sweep), V.add(a, sweep)], side = back ? rev(q) : q, sn = newell(side);
      let pt = null;
      s.polys.some((P, k) => { if (R.has(k) || !(s.fc && s.fc['p:' + k])) return false; const pn = newell(P); if (V.dot(pn, sn) < 1 - 1e-6 || Math.abs(V.dot(pn, V.sub(a, P[0]))) > 1e-5) return false; const onEdge = P.some((c, j) => { const e = P[(j + 1) % P.length], l = V.dist(c, e); if (l < 1e-9) return false; const k2 = V.mul(V.sub(e, c), 1 / l), m = V.lerp(a, b, 0.5), t = V.dot(V.sub(m, c), k2); return t > -1e-6 && t < l + 1e-6 && V.dist(V.add(c, V.mul(k2, t)), m) < 1e-5; }); if (onEdge) pt = s.fc['p:' + k]; return onEdge; });
      put(side, pt); sides.add(side);
      // obły obrys (okrąg, łuk): krawędzie między bokami są wygładzone
      if (round) { const p0 = L[(i - 1 + L.length) % L.length], e1 = V.norm(V.sub(a, p0)), e2 = V.norm(V.sub(b, a)); if (V.dot(e1, e2) > 0.9) softs.push([a.slice(), V.add(a, sweep)]); }
    });
  }
  setPolys(s, out, fc);
  if (softs.length) s.softs = [...(s.softs || []), ...softs];
  // porządek we wszystkich dotkniętych płaszczyznach: denka, pierwotnej ściany i boków
  const planes = new Map(), add = (m, p) => { const w = V.dot(m, p); planes.set(planeKey(m, w), [m, w]); };
  add(n, loops[0][0]); add(n, V.add(loops[0][0], sweep));
  for (const L of loops) L.forEach((a, i) => { const b = L[(i + 1) % L.length], m = V.cross(V.sub(b, a), n); if (V.len(m) > 1e-9) add(V.norm(m), a); });
  // wolna ściana (np. prostokąt narysowany na ziemi obok bryły) staje się nową bryłą: jej boki nie kasują ścian sąsiedniej
  // bryły, na które trafiają — zostaje wspólna przegroda. Przy ścianie bryły (wciskanie, wyciąganie z powrotem wnęki) boki
  // i ściany, na które trafiają, znoszą się jak dawniej.
  for (const [m, w] of planes.values()) rebuildPlane(s, m, w, mat ? null : sides);
  return finish(s);
}

/* ---------- części spójne, usuwanie, wyjmowanie ---------- */
const VK = p => Math.round(p[0] * 1e4) + ',' + Math.round(p[1] * 1e4) + ',' + Math.round(p[2] * 1e4);
// numery wielokątów połączonych z `pi` wspólnymi punktami (to, co w SketchUpie zaznacza potrójny klik)
export function component(s, pi) {
  const at = new Map();
  s.polys.forEach((p, i) => { for (const v of p) { const k = VK(v); let a = at.get(k); if (!a) at.set(k, a = []); a.push(i); } });
  const seen = new Set([pi]), q = [pi];
  while (q.length) { const i = q.pop(); for (const v of s.polys[i]) for (const j of at.get(VK(v))) if (!seen.has(j)) { seen.add(j); q.push(j); } }
  return [...seen];
}
// ściany (obszary) z listy wielokątów: [{ key, polys, pts }]
export function facesOfPolys(s, idx) {
  const r = regions(s), by = new Map();
  for (const i of idx) { let a = by.get(r[i]); if (!a) by.set(r[i], a = []); a.push(i); }
  // obszar bierzemy w całości, nawet gdy na liście był tylko jego kawałek
  return [...by.keys()].map(g => { const all = r.map((x, i) => x === g ? i : -1).filter(i => i >= 0), polys = all.map(i => s.polys[i].map(p => p.slice())), pts = []; const seen = new Set(); for (const p of polys) for (const v of p) { const k = VK(v); if (!seen.has(k)) { seen.add(k); pts.push(v); } } return { key: 'p:' + all[0], idx: all, polys, pts }; });
}
// Usuwa wielokąty; krawędzie, które przestały należeć do jakiejkolwiek ściany, zwraca jako odcinki (zostają jako linie,
// jak w SketchUpie po usunięciu ściany). `skip` — odcinek, który właśnie jest wymazywany.
export function eraseFaces(s, idx, skip) {
  const R = new Set(idx), gone = [];
  for (const i of R) s.polys[i].forEach((a, k) => gone.push([a, s.polys[i][(k + 1) % s.polys[i].length]]));
  const out = [], fc = {};
  s.polys.forEach((p, i) => { if (R.has(i)) return; if (s.fc && s.fc['p:' + i]) fc['p:' + out.length] = s.fc['p:' + i]; out.push(p); });
  setPolys(s, out, fc);
  const onLine = (m, a, b) => { const l = V.dist(a, b); if (l < 1e-9) return false; const e = V.mul(V.sub(b, a), 1 / l), t = V.dot(V.sub(m, a), e); return t > -1e-6 && t < l + 1e-6 && V.dist(V.add(a, V.mul(e, t)), m) < 1e-5; };
  const left = [], seen = new Set();
  for (const [a, b] of gone) {
    const k = segKey(a, b), m = V.lerp(a, b, 0.5); if (seen.has(k) || V.dist(a, b) < 1e-6) continue; seen.add(k);
    if (skip && onLine(m, skip[0], skip[1])) continue;
    if (out.some(P => P.some((c, j) => onLine(m, c, P[(j + 1) % P.length])))) continue;
    left.push([a.slice(), b.slice()]);
  }
  s.marks = (s.marks || []).filter(([a, b]) => { const m = V.lerp(a, b, 0.5); return out.some(P => Math.abs(V.dot(newell(P), V.sub(m, P[0]))) < 1e-5 && inPoly(m, P)); });
  return left;
}
// Wyjmuje wielokąty do osobnej bryły (do poleceń działających na całych obiektach: grupa, ukryj, kopiuj, skaluj…).
export function liftFaces(m, s, idx) {
  const R = new Set(idx), polys = [], fc = {}, rest = [], rfc = {};
  s.polys.forEach((p, i) => { const pt = s.fc && s.fc['p:' + i]; if (R.has(i)) { if (pt) fc['p:' + polys.length] = pt; polys.push(p); } else { if (pt) rfc['p:' + rest.length] = pt; rest.push(p); } });
  const on = (a, b, list) => { const mid = V.lerp(a, b, 0.5); return list.some(P => Math.abs(V.dot(newell(P), V.sub(mid, P[0]))) < 1e-5 && inPoly(mid, P)); };
  const t = { id: m.next++, kind: 'mesh', polys, marks: (s.marks || []).filter(([a, b]) => on(a, b, polys)), open: true, apart: true };
  if (Object.keys(fc).length) t.fc = fc;
  for (const k of ['softs', 'hid']) if (s[k]) { const mine = s[k].filter(([a, b]) => polys.some(P => P.some(v => V.dist(v, a) < 1e-5)) && polys.some(P => P.some(v => V.dist(v, b) < 1e-5))); if (mine.length) t[k] = mine; }
  for (const k of ['g', 'tag']) if (s[k] != null) t[k] = s[k];
  setPolys(s, rest, rfc);
  s.marks = (s.marks || []).filter(([a, b]) => on(a, b, rest));
  m.shapes.push(t);
  if (!rest.length) m.shapes = m.shapes.filter(q => q !== s);
  return t;
}

/* ---------- zlewanie luźnych brył w jedną geometrię ---------- */
const loose = (m, s, G) => (s.g ?? null) === G && !s.bill && s.op !== 'cut' && !s.locked && !s.apart && !isHidden(m, s);
// kolor i krycie całej bryły przechodzą na jej ściany (w geometrii wspólnej kolor należy do ściany)
function paintToFaces(s) {
  if (s.color || s.tex || (s.alpha != null && s.alpha < 0.999)) {
    const base = { c: s.color || null, t: s.tex || null }; if (s.alpha != null && s.alpha < 0.999) base.a = s.alpha;
    const fc = { ...(s.fc || {}) }; s.polys.forEach((_, i) => { if (!fc['p:' + i]) fc['p:' + i] = base; }); s.fc = fc;
  }
  delete s.color; delete s.tex; delete s.alpha;
}
function asGeo(s) {
  const wasRound = !isMesh(s) && s.soft, softs = wasRound ? edgesOf(s).filter(e => e.soft).map(e => [e.a.slice(), e.b.slice()]) : null;
  toMesh(s, facesOf);
  if (softs && softs.length) s.softs = [...(s.softs || []), ...softs];
  if (wasRound) delete s.soft;
  paintToFaces(s); s.open = true;
  return s;
}
// Wszystkie luźne bryły kontekstu G (null = cały szkic) stają się jedną geometrią. Zwraca ją (albo null) i listę id brył,
// które w nią weszły.
export function absorb(m, G = null) {
  const all = m.shapes.filter(s => loose(m, s, G)); if (!all.length) return { geo: null, gone: [] };
  let geo = all.find(s => s.geo);
  const rest = all.filter(s => s !== geo), gone = [];
  if (!geo) { if (!rest.length) return { geo: null, gone }; geo = asGeo(rest.shift()); geo.geo = true; }
  if (!rest.length) return { geo, gone };
  const planes = new Map();
  for (const o of rest) {
    const isFlat = !isMesh(o) && o.h === 0, base = { c: o.color || null, t: o.tex || null }, painted = !!(o.color || o.tex || (o.alpha != null && o.alpha < 0.999));
    if (o.alpha != null && o.alpha < 0.999) base.a = o.alpha;
    if (isFlat) {
      // płaska ściana: na istniejącej ścianie tylko ją dzieli
      const f = facesOf(o)[0];
      addFace(geo, f.verts.map(p => p.slice()), (f.holes || []).map(h => h.map(p => p.slice())), painted ? base : null);
    } else {
      asGeo(o);
      const fc = { ...(geo.fc || {}) }, at = geo.polys.length;
      o.polys.forEach((p, i) => { if (o.fc && o.fc['p:' + i]) fc['p:' + (at + i)] = o.fc['p:' + i]; const q = planeOf(p); planes.set(planeKey(q.n, q.w), [q.n, q.w]); });
      setPolys(geo, [...geo.polys, ...o.polys], fc);
      geo.marks = [...(geo.marks || []), ...(o.marks || [])];
      for (const k of ['softs', 'hid']) if (o[k]) geo[k] = [...(geo[k] || []), ...o[k]];
    }
    gone.push(o.id);
  }
  const dead = new Set(rest); m.shapes = m.shapes.filter(s => !dead.has(s));
  for (const [n, w] of planes.values()) rebuildPlane(geo, n, w);
  finish(geo);
  return { geo, gone };
}
