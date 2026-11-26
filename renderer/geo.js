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
import { addLoop, push } from './topo.js';

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
  let n = newell(outer), w = V.dot(n, outer[0]);
  // Ściana narysowana na istniejącej ścianie trafia dokładnie w jej płaszczyznę. Punkty z kliknięć odstają od ściany
  // o ułamki (~1e-7, dokładność karty graficznej), każdy o inną wartość — bez dociśnięcia zostają drzazgi i ściany
  // „prawie” płaskie, które psują następne kroki (wypychanie, podział na ściany).
  // (tylko gdy każdy punkt nowej ściany leży od tamtej płaszczyzny najwyżej o szum — prawie równoległa ściana daleko
  // stąd, np. z importu, nie może przechylić nowej)
  const off = (q, p) => Math.abs(V.dot(q.n, p) - q.w);
  const host = s.polys.map(planeOf).find(q => Math.abs(Math.abs(V.dot(q.n, n)) - 1) < 1e-6 && [outer, ...holes].every(L => L.every(p => off(q, p) < 1e-5)));
  if (host) {
    const q = host, side = V.dot(q.n, n) < 0 ? -1 : 1;
    const put = p => have.get(VK(p)) || V.sub(p, V.mul(q.n, V.dot(q.n, p) - q.w));
    outer = outer.map(put); holes = holes.map(h => h.map(put));
    n = V.mul(q.n, side); w = q.w * side;
  }
  // podział ścian, na których leży nowa — rdzeń topo.js (pola z właścicielem, czyste obrysy z otworami)
  if (V.dot(newell(outer), n) < 0) { outer = outer.slice().reverse(); holes = holes.map(h => h.slice().reverse()); }
  addLoop(s, outer, holes, paint);
}
export function finish(s) { keepPaint(s, () => simplify(s)); return s; }

/* ---------- wypchnij / wciśnij ---------- */
// Ściana `pi` (cały jej obszar) przesunięta o d wzdłuż normalnej — rdzeń topo.js (jak w SketchUpie, bez zgadywania,
// gdzie jest materiał). keep (⌥ / Ctrl): pierwotna ściana zostaje na miejscu.
export function pushFace(s, pi, d, keep) { return push(s, pi, d, keep); }

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

/* ---------- strony ścian ---------- */
// Strona ściany wynika z kolejności punktów jej wielokątów (przód tam, skąd obieg jest przeciwny do wskazówek zegara).
// Odwrócenie ściany to odwrócenie kolejności — numery ścian (fid) zostają, bo podpis nie zależy od kolejności. Tablice
// polys i fc są nowe, bo widok i pamięć krawędzi poznają zmianę po tożsamości tablic. Oś tekstury liczona z normalnej
// po odwróceniu idzie w drugą stronę (w pionie oś pozioma, w poziomie pionowa), więc tekstura dostaje znacznik odbicia
// (tx.fu / tx.fw) i wygląda tak samo jak przedtem.
export function reverseFaces(s, idx) {
  const R = new Set(idx); if (!R.size) return 0;
  const fc = s.fc ? { ...s.fc } : null;
  s.polys = s.polys.map((P, i) => {
    if (!R.has(i)) return P;
    const k = 'p:' + i, f = fc && fc[k];
    if (f && f.t) { const n = newell(P), L = Math.hypot(n[0], n[1], n[2]) || 1, tx = { ...(f.tx || {}) }, a = Math.abs(n[2] / L) > 0.9 ? 'fw' : 'fu';
      if (tx[a]) delete tx[a]; else tx[a] = true; fc[k] = { ...f, tx }; }
    return P.slice().reverse();
  });
  if (fc) s.fc = fc;
  return R.size;
}
// „Ujednolić orientację” (jak w SketchUpie): od wielokątów `seeds` przez wspólne krawędzie do sąsiadów — sąsiad ma przejść
// wspólną krawędź w przeciwną stronę, inaczej trzeba go odwrócić. Krawędzie, na których styka się więcej niż dwie ściany,
// nie przenoszą orientacji (nie wiadomo, która strona jest właściwa). Ziarno, do którego doszło już wcześniejsze,
// nie zmienia wyniku (decyduje pierwsza zaznaczona ściana). Zwraca numery wielokątów do odwrócenia (nic nie zmienia).
export function orientFaces(s, seeds) {
  const at = new Map();   // krawędź (bez kierunku) → [[wielokąt, kierunek zgodny z kluczem]]
  s.polys.forEach((P, i) => P.forEach((a, k) => {
    const b = P[(k + 1) % P.length], x = VK(a), y = VK(b); if (x === y) return;
    const key = x < y ? x + '|' + y : y + '|' + x; let L = at.get(key); if (!L) at.set(key, L = []); L.push([i, x < y]);
  }));
  const flip = new Map();
  for (const pi of [].concat(seeds)) {
    if (flip.has(pi) || !s.polys[pi]) continue;
    flip.set(pi, false); const q = [pi];
    while (q.length) {
      const i = q.pop(), fi = flip.get(i), P = s.polys[i];
      P.forEach((a, k) => {
        const b = P[(k + 1) % P.length], x = VK(a), y = VK(b); if (x === y) return;
        const L = at.get(x < y ? x + '|' + y : y + '|' + x); if (!L || L.length !== 2) return;
        const [me, other] = L[0][0] === i ? L : [L[1], L[0]]; if (other[0] === i || flip.has(other[0])) return;
        // ten sam kierunek obu wielokątów na wspólnej krawędzi = przeciwne strony; uwzględniamy, czy ten już jest odwracany
        flip.set(other[0], (me[1] === other[1]) !== fi); q.push(other[0]);
      });
    }
  }
  return [...flip].filter(([, f]) => f).map(([i]) => i);
}
