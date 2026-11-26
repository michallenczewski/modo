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
import { addLoop, push, facesOf as topoFaces, writeFaces } from './topo.js';

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

/* ---------- okręgi i łuki: liczba odcinków ---------- */
// Okrąg i łuk po narysowaniu to zwykłe odcinki geometrii (jak w SketchUpie, ale bez osobnego obiektu „krzywej”).
// Krzywą rozpoznajemy po krawędziach (curveOf w tools.js): punkty po kolei, środek i promień z trzech punktów; wszystkie
// punkty muszą leżeć na okręgu. Zmiana liczby odcinków wymienia punkty krzywej w obrysach ścian leżących w jej płaszczyźnie,
// a gdy krzywa jest wyciągnięta prosto (walec, zaokrąglona ściana) — także w drugiej podstawie i w bokach.
const KC = p => Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5);
export function curveInfo(edges) {
  if (!edges || edges.length < 3) return null;
  const nb = new Map(), pt = new Map();
  for (const e of edges) for (const [p, q] of [[e.a, e.b], [e.b, e.a]]) { const k = KC(p); pt.set(k, p); if (!nb.has(k)) nb.set(k, []); nb.get(k).push(KC(q)); }
  if ([...nb.values()].some(l => l.length > 2)) return null;
  const ends = [...nb.keys()].filter(k => nb.get(k).length === 1), closed = !ends.length;
  if (!closed && ends.length !== 2) return null;
  const order = [closed ? nb.keys().next().value : ends[0]], seen = new Set(order);
  for (;;) { const nx = nb.get(order[order.length - 1]).find(k => !seen.has(k)); if (!nx) break; order.push(nx); seen.add(nx); }
  if (order.length !== nb.size) return null;
  const pts = order.map(k => pt.get(k)), m = pts.length;
  const p0 = pts[0], p1 = pts[Math.floor(m / 3)], p2 = pts[Math.floor(2 * m / 3)];
  const a = V.sub(p1, p0), b = V.sub(p2, p0), ab = V.cross(a, b), L = V.dot(ab, ab); if (L < 1e-14) return null;
  const c = V.add(p0, V.mul(V.cross(V.sub(V.mul(b, V.dot(a, a)), V.mul(a, V.dot(b, b))), ab), 1 / (2 * L)));
  const r = V.dist(c, p0), n = V.norm(ab);
  if (pts.some(p => Math.abs(V.dist(p, c) - r) > 1e-4 * Math.max(1, r) || Math.abs(V.dot(V.sub(p, c), n)) > 1e-5)) return null;
  const u = V.mul(V.sub(p0, c), 1 / r), v = V.cross(n, u), ang = p => Math.atan2(V.dot(V.sub(p, c), v), V.dot(V.sub(p, c), u));
  let sweep = 0; for (let i = 1; i < m + (closed ? 1 : 0); i++) { let d = ang(pts[i % m]) - ang(pts[i - 1]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; }
  return { pts, closed, c, r, n, u, v, sweep, segs: closed ? m : m - 1 };
}
// nowe punkty krzywej (ten sam początek, ten sam kierunek obiegu, łuk — te same końce)
function curvePoints(C, segs) {
  const out = [], k = C.closed ? segs : segs + 1;
  for (let i = 0; i < k; i++) { const t = C.sweep * i / segs; out.push(V.add(C.c, V.add(V.mul(C.u, C.r * Math.cos(t)), V.mul(C.v, C.r * Math.sin(t))))); }
  if (!C.closed) { out[0] = C.pts[0].slice(); out[segs] = C.pts[C.pts.length - 1].slice(); }
  return out;
}
// w pętli L ciąg punktów O (cały, po kolei, w jedną albo w drugą stronę) zamieniony na N; null — gdy L zawiera punkty O inaczej
function swapRun(L, O, N, closed) {
  const n = L.length, m = O.length, at = L.findIndex(p => KC(p) === KC(O[0]));
  if (at < 0) return null;
  for (const dir of [1, -1]) {
    let ok = true; for (let k = 0; k < m && ok; k++) ok = KC(L[((at + dir * k) % n + n) % n]) === KC(O[k]);
    if (!ok) continue;
    if (closed && n !== m) return null;
    const rest = []; for (let k = m; k < n; k++) rest.push(L[((at + dir * k) % n + n) % n]);
    const out = [...N.map(p => p.slice()), ...rest];
    return dir > 0 ? out : out.reverse();
  }
  return null;
}
// Zmiana liczby odcinków krzywej w bryle s. Zwraca true, albo napis z przyczyną, dlaczego się nie da (nic nie zmienia).
export function respaceCurve(s, edges, segs) {
  const C = curveInfo(edges); if (!C) return 'curve';
  segs = Math.round(segs); if (!(segs >= 3) || segs > 1000) return 'segs';
  if (segs === C.segs) return 'same';
  const faces = topoFaces(s), O = C.pts, N = curvePoints(C, segs);
  const inner = new Set((C.closed ? O : O.slice(1, -1)).map(KC));
  const touches = (L, set) => L.some(p => set.has(KC(p)));
  const flat = f => Math.abs(Math.abs(V.dot(f.n, C.n)) - 1) < 1e-6;
  const inPl = (f, o) => flat(f) && Math.abs(V.dot(V.sub(f.outer[0], o), C.n)) < 1e-5;
  // ściany boczne wyciągnięcia: czworokąty O[k], O[k+1], O[k+1]+d, O[k]+d — to samo d dla wszystkich
  let d = null; const sides = [];
  for (const f of faces) {
    const loops = [f.outer, ...f.holes]; if (!loops.some(L => touches(L, inner))) continue;
    if (inPl(f, C.c)) continue;
    if (f.holes.length || f.outer.length !== 4) return 'shape';
    const on = f.outer.map(p => O.findIndex(q => KC(q) === KC(p))), k = on.findIndex((x, i) => x >= 0 && on[(i + 1) % 4] >= 0);
    if (k < 0) return 'shape';
    const A = f.outer[k], B = f.outer[(k + 1) % 4], Bd = f.outer[(k + 2) % 4], Ad = f.outer[(k + 3) % 4], dd = V.sub(Ad, A);
    if (V.dist(V.sub(Bd, B), dd) > 1e-5 || Math.abs(V.dot(dd, C.n)) < 1e-6) return 'shape';
    if (d && V.dist(d, dd) > 1e-5) return 'shape';
    d = d || dd; sides.push({ f, fwd: on[(k + 1) % 4] === (on[k] + 1) % O.length });
  }
  if (sides.length && sides.length !== C.segs) return 'shape';
  const Od = d ? O.map(p => V.add(p, d)) : null, Nd = d ? N.map(p => V.add(p, d)) : null, innerD = d ? new Set((C.closed ? Od : Od.slice(1, -1)).map(KC)) : null;
  const out = [];
  for (const f of faces) {
    if (sides.some(q => q.f === f)) continue;
    let loops = [f.outer, ...f.holes];
    for (const [set, OO, NN, o] of [[inner, O, N, C.c], ...(d ? [[innerD, Od, Nd, V.add(C.c, d)]] : [])]) {
      if (!loops.some(L => touches(L, set))) continue;
      if (!inPl(f, o)) return 'shape';
      loops = loops.map(L => touches(L, set) ? swapRun(L, OO, NN, C.closed) : L);
      if (loops.some(L => !L)) return 'shape';
    }
    out.push({ ...f, outer: loops[0], holes: loops.slice(1) });
  }
  if (d) {
    // bok dostaje materiał starego boku, który leży w tym samym miejscu (najbliższy środek)
    const fwd = sides[0].fwd, mid = q => V.mul(q.reduce((t, p) => V.add(t, p), [0, 0, 0]), 1 / q.length);
    const old = sides.map(q => ({ m: mid(q.f.outer), paint: q.f.paint }));
    for (let i = 0; i < segs; i++) {
      const A = N[i], B = N[(i + 1) % N.length];
      const q = fwd ? [A, B, V.add(B, d), V.add(A, d)] : [B, A, V.add(A, d), V.add(B, d)], m = mid(q);
      const paint = old.reduce((b, o) => V.dist(o.m, m) < V.dist(b.m, m) ? o : b).paint;
      out.push({ outer: q.map(p => p.slice()), holes: [], n: newell(q), paint });
    }
  }
  // krawędzie wygładzone i ukryte przy starych punktach krzywej wypadają; boki nowej krzywej są gładkie jak po wypchnięciu
  // (skręt między bokami mniejszy niż ok. 25°)
  const gone = new Set([...inner, ...(innerD || [])]), hit = ([a, b]) => gone.has(KC(a)) || gone.has(KC(b));
  for (const k of ['softs', 'hid']) if (s[k]) { s[k] = s[k].filter(e => !hit(e)); if (!s[k].length) delete s[k]; }
  if (d && Math.cos(Math.abs(C.sweep) / segs) > 0.9) {
    const soft = []; for (let i = C.closed ? 0 : 1; i < (C.closed ? segs : segs); i++) soft.push([N[i].slice(), V.add(N[i], d)]);
    if (soft.length) s.softs = [...(s.softs || []), ...soft];
  }
  writeFaces(s, out);
  return true;
}
// Krawędzie krzywej od krawędzi (a, b): w każdym wierzchołku dalej idzie jedyna krawędź tej samej długości, która skręca
// łagodnie (do 60° — sześciokąt), o ten sam kąt, w płaszczyźnie krzywej i w tę samą stronę co poprzednie. Inne krawędzie w wierzchołku (boki walca, przekątne)
// nie przerywają krzywej, ale dwie pasujące — tak (rozwidlenie).
export function curveEdges(s, a, b) {
  const all = edgesOf(s).filter(e => !e.hid), at = new Map(), ek = (p, q) => { const x = KC(p), y = KC(q); return x < y ? x + '|' + y : y + '|' + x; };
  for (const e of all) for (const p of [e.a, e.b]) { const k = KC(p); if (!at.has(k)) at.set(k, []); at.get(k).push(e); }
  const start = all.find(e => ek(e.a, e.b) === ek(a, b)); if (!start) return [];
  const out = [start], seen = new Set([ek(start.a, start.b)]), cos = Math.cos(61 * Math.PI / 180);
  let n = null, turn0 = 0; const len0 = V.dist(start.a, start.b);
  const step = (p, q) => {
    const d1 = V.norm(V.sub(q, p)), cand = [];
    for (const e of at.get(KC(q)) || []) {
      if (seen.has(ek(e.a, e.b))) continue;
      const r = KC(e.a) === KC(q) ? e.b : e.a, d2 = V.norm(V.sub(r, q)), c = V.dot(d1, d2);
      if (c < cos || c > 1 - 1e-9) continue;
      const t = V.norm(V.cross(d1, d2)), turn = Math.acos(Math.min(1, c));
      if (n && (Math.abs(V.dot(d2, n)) > 1e-5 || V.dot(t, n) < 0.999)) continue;
      // odcinki krzywej są równe i skręcają o ten sam kąt — prosta styczna do łuku już do niego nie należy
      if (Math.abs(V.dist(q, r) - len0) > 0.05 * len0 + 1e-6 || (turn0 && Math.abs(turn - turn0) > 0.15 * turn0 + 1e-4)) continue;
      cand.push({ e, r, t, turn });
    }
    return cand.length === 1 ? cand[0] : null;
  };
  for (const dir of [0, 1]) {
    let p = dir ? start.b : start.a, q = dir ? start.a : start.b;
    if (dir && n) n = V.mul(n, -1);
    for (let g = 0; g < 10000; g++) {
      const nx = step(p, q); if (!nx) break;
      if (!n) { n = nx.t; turn0 = nx.turn; }
      seen.add(ek(nx.e.a, nx.e.b)); out.push(nx.e); p = q; q = nx.r;
    }
  }
  return out;
}

/* ---------- przecięcie (Intersect with Model / Selection) ---------- */
// Krawędzie, wzdłuż których ściany z A przechodzą przez ściany z B (jak „Przetnij z modelem / z zaznaczeniem” w SketchUpie).
// A i B: listy { s, idx } — bryła i numery jej wielokątów (null = cała). Działa także wewnątrz jednej wspólnej geometrii
// (płaszczyzna przechodząca przez walec): pomijane są tylko odcinki leżące na brzegu obu ścian naraz — to już jest krawędź.
// Ściany są w układzie świata (grupy w Modo nie mają własnego przekształcenia). Zwraca odcinki [[a, b], …].
const ibox = pts => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return { lo, hi }; };
const ihit = (a, b, e = 1e-5) => [0, 1, 2].every(k => a.lo[k] <= b.hi[k] + e && b.lo[k] <= a.hi[k] + e);
function ispans(P, n, o, d) {
  const mm = V.cross(n, d), ts = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], sp = V.dot(V.sub(p, o), mm), sq = V.dot(V.sub(q, o), mm);
    if (Math.abs(sp) < 1e-7) ts.push(V.dot(V.sub(p, o), d));
    if ((sp > 1e-7 && sq < -1e-7) || (sp < -1e-7 && sq > 1e-7)) ts.push(V.dot(V.sub(V.lerp(p, q, sp / (sp - sq)), o), d));
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i + 1 < ts.length; i++) { if (ts[i + 1] - ts[i] < 1e-6) continue; if (inPoly(V.add(o, V.mul(d, (ts[i] + ts[i + 1]) / 2)), P, n)) out.push([ts[i], ts[i + 1]]); }
  return out;
}
const onSegI = (p, a, b) => { const L = V.dist(a, b); if (L < 1e-9) return false; const d = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), d); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(d, t)), p) < 1e-5; };
// ściany bryły: kawałki (do liczenia odcinków) i obrysy (do sprawdzania brzegu)
function ifaces(s, idx) {
  const t = isMesh(s) ? s : (() => { const c = JSON.parse(JSON.stringify(s)); toMesh(c, facesOf); return c; })();
  const want = idx ? new Set(idx) : null, out = [];
  for (const f of topoFaces(t)) {
    if (want && !(f.src || []).some(i => want.has(i))) continue;
    const pieces = (f.src || []).map(i => t.polys[i]).filter(Boolean); if (!pieces.length) continue;
    const loops = [f.outer, ...f.holes], n = newell(f.outer), w = V.dot(n, f.outer[0]);
    out.push({ s, src: f.src || [], pieces, loops, n, w, box: ibox(f.outer) });
  }
  return out;
}
export function intersectWith(A, B) {
  // ściany każdej bryły liczone raz; ta sama ściana w A i w B to ten sam obiekt (para ze sobą odpada, para liczona raz)
  const cache = new Map(), facesOfS = s => { if (!cache.has(s)) cache.set(s, ifaces(s, null).map((f, i) => ({ ...f, i: cache.size * 1e6 + i }))); return cache.get(s); };
  const pickF = L => { const out = new Set(); for (const x of L) { const all = facesOfS(x.s), want = x.idx ? new Set(x.idx) : null; for (const f of all) if (!want || (f.src || []).some(i => want.has(i))) out.add(f); } return [...out]; };
  const union = F => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const f of F) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], f.box.lo[k]); hi[k] = Math.max(hi[k], f.box.hi[k]); } return { lo, hi }; };
  let FA = pickF(A), FB = pickF(B);
  const uA = union(FA), uB = union(FB);
  FA = FA.filter(f => ihit(f.box, uB)); FB = FB.filter(f => ihit(f.box, uA));
  // siatka przestrzenna z kratką ok. 2× typowej ściany: para jest liczona tylko dla ścian z sąsiednich kratek
  // (duże ściany, które zajęłyby za dużo kratek, idą na osobną listę sprawdzaną z każdą)
  const sizes = FB.map(f => Math.max(f.box.hi[0] - f.box.lo[0], f.box.hi[1] - f.box.lo[1], f.box.hi[2] - f.box.lo[2])).sort((x, y) => x - y);
  const cell = Math.max(2 * (sizes[sizes.length >> 1] || 1), 1e-3), grid = new Map(), big = [];
  const range = b => [0, 1, 2].map(k => [Math.floor((b.lo[k] - 1e-5) / cell), Math.floor((b.hi[k] + 1e-5) / cell)]);
  const cells = (r, fn) => { for (let x = r[0][0]; x <= r[0][1]; x++) for (let y = r[1][0]; y <= r[1][1]; y++) for (let z = r[2][0]; z <= r[2][1]; z++) fn(x + ',' + y + ',' + z); };
  const count = r => (r[0][1] - r[0][0] + 1) * (r[1][1] - r[1][0] + 1) * (r[2][1] - r[2][0] + 1);
  for (const Q of FB) { const r = range(Q.box); if (count(r) > 64) { big.push(Q); continue; } cells(r, k => { let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(Q); }); }
  const near = P => { const r = range(P.box), out = new Set(big); if (count(r) > 512) return FB; cells(r, k => { const a = grid.get(k); if (a) for (const Q of a) out.add(Q); }); return out; };
  const lines = [], seen = new Set();
  const onB = (F, p) => F.loops.some(L => L.some((a, i) => onSegI(p, a, L[(i + 1) % L.length])));
  // ta sama prosta z różnych par ścian: klucz z kierunku i punktu zaokrąglonych do 0,01 mm (zbiega się z dokładnością modelu)
  const byKey = new Map(), lineOf = (o, d) => { const k = d.map(v => Math.round(v * 1e6)).join(',') + '|' + o.map(v => Math.round(v * 1e5)).join(','); let l = byKey.get(k); if (!l) { l = { o, d, iv: [] }; byKey.set(k, l); lines.push(l); } return l; };
  for (const P of FA) {
    for (const Q of near(P)) {
      if (P === Q || !ihit(P.box, Q.box)) continue;
      const pk = Math.min(P.i, Q.i) + ':' + Math.max(P.i, Q.i); if (seen.has(pk)) continue; seen.add(pk);
      const x = V.cross(P.n, Q.n), l2 = V.dot(x, x); if (l2 < 1e-10) continue;
      let d = V.mul(x, 1 / Math.sqrt(l2)); if (d[0] < -1e-9 || (Math.abs(d[0]) < 1e-9 && (d[1] < -1e-9 || (Math.abs(d[1]) < 1e-9 && d[2] < 0)))) d = V.mul(d, -1);
      let o = V.mul(V.cross(V.sub(V.mul(Q.n, P.w), V.mul(P.n, Q.w)), x), 1 / l2);
      o = V.sub(o, V.mul(d, V.dot(o, d)));
      const a = P.pieces.flatMap(p => ispans(p, P.n, o, d)), b = Q.pieces.flatMap(p => ispans(p, Q.n, o, d));
      for (const [a0, a1] of a) for (const [b0, b1] of b) {
        const lo = Math.max(a0, b0), hi = Math.min(a1, b1); if (hi - lo < 1e-5) continue;
        const mid = V.add(o, V.mul(d, (lo + hi) / 2));
        if (onB(P, mid) && onB(Q, mid)) continue;   // wspólna krawędź obu ścian — już jest
        lineOf(o, d).iv.push([lo, hi]);   // d ma ustalony zwrot, a o — punkt prostej najbliższy początkowi układu: ta sama prosta ma te same parametry
      }
    }
  }
  const out = [];
  for (const { o, d, iv } of lines) {
    iv.sort((x, y) => x[0] - y[0]);
    let cur = iv[0].slice();
    const put = c => out.push([V.add(o, V.mul(d, c[0])), V.add(o, V.mul(d, c[1]))]);
    for (const [lo, hi] of iv.slice(1)) { if (lo <= cur[1] + 1e-5) cur[1] = Math.max(cur[1], hi); else { put(cur); cur = [lo, hi]; } }
    put(cur);
  }
  return out;
}
// Zamknięte pętle z odcinków przecięcia, które leżą na ścianie bryły s, dzielą tę ścianę jak narysowany na niej okrąg
// (same linie dzielą ścianę tylko wtedy, gdy biegną od brzegu do brzegu). Zwraca liczbę wstawionych pętli.
export function intersectLoops(s, segs) {
  const nb = new Map(), pt = new Map(), K = KC;
  for (const [a, b] of segs) for (const [p, q] of [[a, b], [b, a]]) { const k = K(p); pt.set(k, p); if (!nb.has(k)) nb.set(k, []); nb.get(k).push(K(q)); }
  const used = new Set(), loops = [];
  for (const start of nb.keys()) {
    if (used.has(start) || nb.get(start).length !== 2) continue;
    const L = [start]; used.add(start); let prev = null, cur = start, ok = false;
    for (let g = 0; g < 100000; g++) {
      const nx = nb.get(cur).find(k => k !== prev && (k === start ? L.length > 2 : !used.has(k)));
      if (!nx || nb.get(nx).length !== 2) break;
      if (nx === start) { ok = true; break; }
      L.push(nx); used.add(nx); prev = cur; cur = nx;
    }
    if (ok && L.length >= 3) loops.push(L.map(k => pt.get(k)));
  }
  let n = 0, faces = null;
  const onL = (p, L) => L.some((a, i) => onSegI(p, a, L[(i + 1) % L.length]));
  // punkt na ścianie: w obrysie (albo na nim) i nie w głębi otworu
  const inFace = (f, p) => (inPoly(p, f.outer, f.n) || onL(p, f.outer)) && !f.holes.some(h => inPoly(p, h, f.n) && !onL(p, h));
  for (const loop of loops) {
    const nn = newell(loop), w = V.dot(nn, loop[0]);
    if (loop.some(p => Math.abs(V.dot(nn, p) - w) > 1e-5)) continue;
    // cała pętla (punkty i środki boków) musi leżeć na jednej ścianie — inaczej addFace dołożyłby ścianę w pustym miejscu
    const probe = [...loop, ...loop.map((p, i) => V.lerp(p, loop[(i + 1) % loop.length], 0.5))];
    faces = faces || topoFaces(s);
    const host = faces.find(f => Math.abs(Math.abs(V.dot(f.n, nn)) - 1) < 1e-6 && Math.abs(V.dot(f.n, f.outer[0]) - V.dot(f.n, loop[0])) < 1e-5 && probe.every(p => inFace(f, p)));
    if (!host) continue;
    addFace(s, loop); n++; faces = null;
  }
  return n;
}
