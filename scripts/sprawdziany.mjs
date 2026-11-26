// Sprawdziany modelowania: przypadki z SketchUpa 2017 wykonane na rdzeniu geometrii Modo (bez przeglądarki).
// Każdy przypadek to kilka kroków (prostokąt, linia, okrąg, wypchnij / wciśnij, ⌥) i oczekiwany wynik
// liczony tak, jak w SketchUpie: liczba ścian, objętość, obecność konkretnych ścian.
//
//   node scripts/sprawdziany.mjs            — wszystkie przypadki, kod wyjścia 1 przy błędzie
//   node scripts/sprawdziany.mjs drzwi      — tylko przypadki, których nazwa zawiera „drzwi”
//   node scripts/sprawdziany.mjs -v         — także szczegóły udanych przypadków
//
// Kroki naśladują program: po każdej zmianie działa to samo co w app.js (postEdit): stitch + absorb.

globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const R = new URL('../renderer/', import.meta.url).href;
const { V, newModel, cloneModel, makeShape, pushPull, circlePts } = await import(R + 'model.js');
const { stitch } = await import(R + 'stitch.js');
const { absorb, reverseFaces, orientFaces, facesOfPolys, curveEdges, curveInfo, respaceCurve } = await import(R + 'geo.js');
const { deleteEdge, deleteFace, curveOf, moveSub, subFaces } = await import(R + 'tools.js');
const { regions, regionOf, meshVolume, newell, inPoly, meshEdges } = await import(R + 'mesh.js');

/* ---------- szkic i kroki ---------- */
let ostatni = null;   // szkic bieżącego przypadku (do wspólnych kontroli)
class Szkic {
  constructor() { this.m = newModel(); ostatni = this; }
  get geo() { return this.m.shapes.find(s => s.geo) || null; }
  // jak postEdit w app.js
  edit(fn) { const prev = cloneModel(this.m); fn(this.m); stitch(this.m, prev, 200); absorb(this.m, null); return this; }
  // prostokąt: narożnik o, kierunki u, v (jednostkowe), wymiary a × b
  rect(o, u, v, a, b) { return this.edit(m => makeShape(m, { o, u, v }, [[0, 0], [a, 0], [a, b], [0, b]], 0)); }
  rectXY(x, y, z, a, b) { return this.rect([x, y, z], [1, 0, 0], [0, 1, 0], a, b); }
  rectXZ(x, y, z, a, b) { return this.rect([x, y, z], [1, 0, 0], [0, 0, 1], a, b); }   // na ścianie y = const
  rectYZ(x, y, z, a, b) { return this.rect([x, y, z], [0, 1, 0], [0, 0, 1], a, b); }   // na ścianie x = const
  // czworokąt z czterech punktów 3D (jak z kliknięć myszą — mogą być minimalnie poza płaszczyzną ściany)
  quad(a, b, c, d) {
    const u = V.norm(V.sub(b, a)), w0 = V.sub(d, a), n = V.norm(V.cross(u, w0)), v = V.cross(n, u);
    const to = p => [V.dot(V.sub(p, a), u), V.dot(V.sub(p, a), v)];
    return this.edit(m => makeShape(m, { o: a, u, v }, [a, b, c, d].map(to), 0));
  }
  circle(o, u, v, r, n = 24) { return this.edit(m => makeShape(m, { o, u, v }, circlePts(r, n), 0)); }
  line(a, b) { return this.edit(m => m.lines.push({ id: m.next++, a, b })); }
  // ściana pod punktem p (opcjonalnie zwrócona w stronę n): indeks wielokąta
  faceAt(p, n) {
    const s = this.geo; if (!s) return -1;
    let best = -1;
    s.polys.forEach((P, i) => {
      const q = newell(P);
      if (Math.abs(V.dot(q, V.sub(p, P[0]))) > 1e-6) return;
      if (n && V.dot(q, n) < 0.999) return;
      if (inPoly(p, P, q) || onBorder(p, P)) best = best < 0 ? i : best;
    });
    return best;
  }
  // wypchnij / wciśnij ścianę pod p o d (dodatnie: na zewnątrz, wzdłuż normalnej ściany); keep = ⌥ / Ctrl
  push(p, d, n, keep = false) {
    const i = this.faceAt(p, n); if (i < 0) throw new Error('brak ściany w punkcie ' + p.join(', '));
    return this.edit(m => pushPull(m.shapes.find(s => s.geo), 'p:' + i, d, keep));
  }
  /* pomiary */
  get faces() { const s = this.geo; return s ? new Set(regions(s)).size : 0; }
  // (liczona ze wszystkich ścian — wewnętrzna ściana, np. przegroda albo stary dach po ⌥, zawyża wynik; tam jej nie używamy)
  get volume() { const s = this.geo; return s ? Math.abs(meshVolume(s)) : 0; }
  has(p, n) { return this.faceAt(p, n) >= 0; }
  // wielokąt ściany pod p: liczba wierzchołków obszaru
  faceArea(p, n) { const s = this.geo, i = this.faceAt(p, n); if (i < 0) return 0; return regionOf(s, i).reduce((a, j) => a + polyArea(s.polys[j]), 0); }
  // domknięcie: każdy odcinek krawędzi (po podziale na wszystkich wierzchołkach) użyty tyle samo razy w obie strony
  get open() { return openEdges(this.geo); }
  // krawędzie, które program rysuje (granice ścian i linie na ścianach)
  get edges() { const s = this.geo; return s ? meshEdges(s).filter(e => !e.hid).length : 0; }
  // śmieci: wielokąty o zerowym polu (punkty na jednej prostej) i podwójne wielokąty — sprawdzane w każdym przypadku
  get junk() { const s = this.geo; if (!s) return 0; const seen = new Set(); let n = 0; for (const P of s.polys) { const k = P.map(p => p.map(x => Math.round(x * 1e5)).join(',')).sort().join(';'); let L = 0; for (let i = 0; i < P.length; i++) L = Math.max(L, V.dist(P[i], P[(i + 1) % P.length])); if (polyArea(P) <= Math.max(1e-9, 1e-6 * L * L) || seen.has(k)) n++; seen.add(k); } return n; }
}
const onBorder = (p, P) => P.some((a, i) => { const b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < 1e-9) return false; const e = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(e, t)), p) < 1e-6; });
// (długość sumy iloczynów wektorowych — działa też dla wielokąta z punktów na jednej prostej, gdzie normalnej nie ma)
function polyArea(P) { let s = [0, 0, 0]; for (let i = 0; i < P.length; i++) s = V.add(s, V.cross(P[i], P[(i + 1) % P.length])); return V.len(s) / 2; }
function openEdges(s) {
  if (!s) return 0;
  const K = p => p.map(x => Math.round(x * 1e5)).join(','), pts = new Map();
  for (const P of s.polys) for (const p of P) pts.set(K(p), p);
  const all = [...pts.values()], count = new Map();
  for (const P of s.polys) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < 1e-9) continue;
    const e = V.mul(V.sub(b, a), 1 / L), ts = [0, L];
    for (const q of all) { const t = V.dot(V.sub(q, a), e); if (t > 1e-6 && t < L - 1e-6 && V.dist(V.add(a, V.mul(e, t)), q) < 1e-6) ts.push(t); }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const p = K(V.add(a, V.mul(e, ts[k]))), q = K(V.add(a, V.mul(e, ts[k + 1])));
      const key = p < q ? p + '|' + q : q + '|' + p, sg = p < q ? 1 : -1;
      count.set(key, (count.get(key) || 0) + sg);
    }
  }
  let open = 0; for (const v of count.values()) if (v !== 0) open++;
  return open;
}

/* ---------- przypadki ---------- */
// Wymiary w metrach. Oś z w górę. Pudło A: 4 × 3 × 2,5 na ziemi.
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1], mX = [-1, 0, 0], mY = [0, -1, 0], mZ = [0, 0, -1];
const pudlo = (a = 4, b = 3, h = 2.5) => new Szkic().rectXY(0, 0, 0, a, b).push([a / 2, b / 2, 0], h, mZ, false);
// wypchnięcie ściany na ziemi: normalna patrzy w dół (jak w SketchUpie prostokąt na ziemi jest odwrócony), więc
// wyciągnięcie w górę to wypchnięcie „do tyłu” — pushPull z ujemnym d względem normalnej w dół
const wyciagnij = (s, p, h) => { const i = s.faceAt(p); const n = newell(s.geo.polys[i]); return s.push(p, n[2] < 0 ? -h : h); };

const P = [];
const przypadek = (nazwa, opis, fn) => P.push({ nazwa, opis, fn });

przypadek('pudło', 'Prostokąt na ziemi wyciągnięty w górę: 6 ścian, domknięte, objętość a·b·h.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5);
  return { ściany: [s.faces, 6], objętość: [s.volume, 30], otwarte: [s.open, 0] };
});
przypadek('dach w górę', 'Dach pudła wyciągnięty o 1: wyższe pudło, 6 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.push([2, 1.5, 2.5], 1, Z);
  return { ściany: [s.faces, 6], objętość: [s.volume, 42], otwarte: [s.open, 0] };
});
przypadek('dach w dół', 'Dach pudła wciśnięty o 1: niższe pudło, 6 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.push([2, 1.5, 2.5], -1, Z);
  return { ściany: [s.faces, 6], objętość: [s.volume, 18], otwarte: [s.open, 0] };
});
przypadek('prostokąt na dachu', 'Prostokąt narysowany na dachu dzieli go: 7 ścian, objętość bez zmian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(1, 1, 2.5, 1, 1);
  return { ściany: [s.faces, 7], objętość: [s.volume, 30], otwarte: [s.open, 0] };
});
przypadek('komin', 'Prostokąt na dachu wyciągnięty o 1: 11 ścian (dach z otworem + 5 ścian komina).', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(1, 1, 2.5, 1, 1); s.push([1.5, 1.5, 2.5], 1, Z);
  return { ściany: [s.faces, 11], objętość: [s.volume, 31], otwarte: [s.open, 0] };
});
przypadek('wnęka', 'Prostokąt na dachu wciśnięty o 1: 11 ścian, objętość mniejsza o 1.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(1, 1, 2.5, 1, 1); s.push([1.5, 1.5, 2.5], -1, Z);
  return { ściany: [s.faces, 11], objętość: [s.volume, 29], otwarte: [s.open, 0] };
});
przypadek('wnęka z powrotem', 'Wnęka wyciągnięta z powrotem do równa: 7 ścian (zostaje narysowany kwadrat), objętość jak na początku.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(1, 1, 2.5, 1, 1); s.push([1.5, 1.5, 2.5], -1, Z); s.push([1.5, 1.5, 1.5], 1, Z);
  return { ściany: [s.faces, 7], objętość: [s.volume, 30], otwarte: [s.open, 0] };
});
przypadek('otwór na wylot', 'Prostokąt na dachu wciśnięty do samego spodu: otwór przez bryłę, 10 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(1, 1, 2.5, 1, 1); s.push([1.5, 1.5, 2.5], -2.5, Z);
  return { ściany: [s.faces, 10], objętość: [s.volume, 27.5], otwarte: [s.open, 0], 'dno otworu': [s.has([1.5, 1.5, 0]), false] };
});
przypadek('wcięcie przy krawędzi', 'Kwadrat w rogu dachu wciśnięty o 1: narożnik wycięty, 9 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.rectXY(0, 0, 2.5, 1, 1); s.push([0.5, 0.5, 2.5], -1, Z);
  return { ściany: [s.faces, 9], objętość: [s.volume, 29], otwarte: [s.open, 0] };
});
przypadek('linia dzieli dach', 'Linia od krawędzi do krawędzi dachu dzieli go na dwie ściany; połowa wyciągnięta o 1: stopień, 8 ścian (przód i tył w kształcie L).', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.line([2, 0, 2.5], [2, 3, 2.5]);
  const f1 = s.faces; s.push([1, 1.5, 2.5], 1, Z);
  return { 'ściany po linii': [f1, 7], ściany: [s.faces, 8], objętość: [s.volume, 36], otwarte: [s.open, 0] };
});
przypadek('okrąg na dachu', 'Okrąg na dachu wyciągnięty o 1: walec na pudle, objętość + π·r²·1 (dla 24 boków).', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.circle([2, 1.5, 2.5], X, Y, 1); s.push([2, 1.5, 2.5], 1, Z);
  const pole = 24 / 2 * Math.sin(2 * Math.PI / 24);
  return { objętość: [s.volume, 30 + pole], otwarte: [s.open, 0], 'górna ściana walca': [s.has([2, 1.5, 3.5], Z), true] };
});
przypadek('⌥ dach', 'Dach wyciągnięty z ⌥: pierwotny dach zostaje w środku jako ściana; boki dzielą się na dwie części, 11 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.push([2, 1.5, 2.5], 1, Z, true);
  return { ściany: [s.faces, 11], 'stary dach': [s.has([2, 1.5, 2.5]), true], 'nowy dach': [s.has([2, 1.5, 3.5], Z), true] };
});
przypadek('prostokąty obok siebie', 'Dwa prostokąty na ziemi ze wspólnym bokiem: dwie ściany; wyciągnięty jeden.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2).rectXY(2, 0, 0, 2, 2);
  const f1 = s.faces; wyciagnij(s, [1, 1, 0], 2);
  return { 'ściany na ziemi': [f1, 2], objętość: [s.volume, 8], 'druga ściana zostaje': [s.has([3, 1, 0]), true] };
});
przypadek('prostokąty nakładające się', 'Dwa nakładające się prostokąty na ziemi: trzy ściany.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2).rectXY(1, 1, 0, 2, 2);
  return { ściany: [s.faces, 3] };
});
przypadek('bryły obok siebie', 'Prostokąt obok pudła wyciągnięty na tę samą wysokość: wspólna przegroda zostaje, dach to dwie ściany.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2); wyciagnij(s, [1, 1, 0], 2); s.rectXY(2, 0, 0, 2, 2); wyciagnij(s, [3, 1, 0], 2);
  return { 'przegroda': [s.has([2, 1, 1]), true], 'dach lewy osobno': [s.faceArea([1, 1, 2], Z), 4], ściany: [s.faces, 11] };
});
przypadek('bryły obok siebie — dach jednej', 'Jak wyżej, potem dach lewej bryły wyciągnięty o 1: prawa się nie zmienia.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2); wyciagnij(s, [1, 1, 0], 2); s.rectXY(2, 0, 0, 2, 2); wyciagnij(s, [3, 1, 0], 2); s.push([1, 1, 2], 1, Z);
  return { 'dach prawej na 2': [s.has([3, 1, 2], Z), true], 'dach lewej na 3': [s.has([1, 1, 3], Z), true], 'brak dachu lewej na 2': [s.has([1, 1, 2], Z), false] };
});
przypadek('pudło na podłodze — dach w dół', 'Podłoga 20×20, na niej prostokąt wyciągnięty na 2, potem jego dach wciśnięty o 0,5.', () => {
  const s = new Szkic().rectXY(-10, -10, 0, 20, 20).rectXY(0, 0, 0, 2, 2); wyciagnij(s, [1, 1, 0], 2); s.push([1, 1, 2], -0.5, Z);
  return { 'dach na 1,5': [s.has([1, 1, 1.5], Z), true], 'brak dachu na 2': [s.has([1, 1, 2]), false] };
});

/* ściany budynku: pudło 6 × 4 × 3, ściana przednia y = 0 */
const dom = () => { const s = new Szkic().rectXY(0, 0, 0, 6, 4); wyciagnij(s, [3, 2, 0], 3); return s; };
przypadek('drzwi — wnęka do podłogi', 'Prostokąt na ścianie od podłogi (1 × 2) wciśnięty o 0,3: wnęka, podłoga wycięta, objętość − 0,6.', () => {
  const s = dom(); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { objętość: [s.volume, 72 - 0.6], otwarte: [s.open, 0], 'tył wnęki': [s.has([1.5, 0.3, 1], mY), true], 'stara ściana drzwi': [s.has([1.5, 0, 1]), false], ściany: [s.faces, 10] };
});
przypadek('drzwi — na wylot', 'Prostokąt na ścianie od podłogi wciśnięty na całą głębokość (4): przejście przez bryłę.', () => {
  const s = dom(); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -4, mY);
  return { objętość: [s.volume, 72 - 8], otwarte: [s.open, 0], 'ściana drzwi': [s.has([1.5, 0, 1]), false], 'ściana z tyłu': [s.has([1.5, 4, 1]), false] };
});
przypadek('okno — wnęka', 'Prostokąt w środku ściany (1 × 1) wciśnięty o 0,3: wnęka okienna, 11 ścian.', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.push([2.5, 0, 1.5], -0.3, mY);
  return { objętość: [s.volume, 72 - 0.3], otwarte: [s.open, 0], 'tył wnęki': [s.has([2.5, 0.3, 1.5], mY), true], ściany: [s.faces, 11] };
});
przypadek('okno — na wylot', 'Prostokąt w środku ściany wciśnięty na całą głębokość: otwór przez bryłę, 10 ścian.', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.push([2.5, 0, 1.5], -4, mY);
  return { objętość: [s.volume, 72 - 4], otwarte: [s.open, 0], ściany: [s.faces, 10] };
});
przypadek('okno i drzwi', 'Najpierw okno (wnęka 0,3), potem drzwi (wnęka 0,3) w tej samej ścianie.', () => {
  const s = dom(); s.rectXZ(3, 0, 1, 1, 1); s.push([3.5, 0, 1.5], -0.3, mY); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { objętość: [s.volume, 72 - 0.3 - 0.6], otwarte: [s.open, 0], 'tył okna': [s.has([3.5, 0.3, 1.5], mY), true], 'tył drzwi': [s.has([1.5, 0.3, 1], mY), true] };
});

przypadek('okno — wnęka pogłębiona', 'Wnęka okienna 0,3, potem jej dno wciśnięte jeszcze o 2: jedna głęboka wnęka 2,3.', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.push([2.5, 0, 1.5], -0.3, mY); s.push([2.5, 0.3, 1.5], -2, mY);
  return { objętość: [s.volume, 72 - 2.3], otwarte: [s.open, 0], 'dno na 2,3': [s.has([2.5, 2.3, 1.5], mY), true], 'brak dna na 0,3': [s.has([2.5, 0.3, 1.5]), false], ściany: [s.faces, 11] };
});
przypadek('okno pogłębione, potem drzwi', 'Jak wyżej, potem drzwi od podłogi wciśnięte o 0,3.', () => {
  const s = dom(); s.rectXZ(3, 0, 1, 1, 1); s.push([3.5, 0, 1.5], -0.3, mY); s.push([3.5, 0.3, 1.5], -2, mY); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { objętość: [s.volume, 72 - 2.3 - 0.6], otwarte: [s.open, 0], 'tył drzwi': [s.has([1.5, 0.3, 1], mY), true], 'stara ściana drzwi': [s.has([1.5, 0, 1]), false] };
});
przypadek('okno wyciągnięte na zewnątrz', 'Prostokąt na ścianie wyciągnięty na zewnątrz o 0,3 (wykusz), potem wciśnięty o 0,6 (wnęka 0,3).', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.push([2.5, 0, 1.5], 0.3, mY); const v1 = s.volume; s.push([2.5, -0.3, 1.5], -0.6, mY);
  return { 'objętość z wykuszem': [v1, 72.3], objętość: [s.volume, 72 - 0.3], otwarte: [s.open, 0] };
});
// kalenica: linia przez środek dachu przesunięta w górę o 1,5 (jak narzędzie Przesuń na krawędzi — punkty i znaczniki razem)
const kalenica = s => s.edit(m => { const g = m.shapes.find(q => q.geo), up = p => (Math.abs(p[0] - 3) < 1e-9 && Math.abs(p[2] - 3) < 1e-9) ? [p[0], p[1], 4.5] : p; g.polys = g.polys.map(P => P.map(up)); if (g.marks) g.marks = g.marks.map(e => e.map(up)); });
przypadek('dom z dachem — okno i drzwi', 'Pudło, linia kalenicy przesunięta w górę o 1,5, potem okno i drzwi we froncie (wnęki 0,3).', () => {
  const s = dom(); s.line([3, 0, 3], [3, 4, 3]); kalenica(s);
  const v0 = s.volume; s.rectXZ(3.5, 0, 1, 1, 1); s.push([4, 0, 1.5], -0.3, mY); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { 'objętość domu': [v0, 72 + 18], objętość: [s.volume, 90 - 0.3 - 0.6], otwarte: [s.open, 0], 'tył okna': [s.has([4, 0.3, 1.5], mY), true], 'tył drzwi': [s.has([1.5, 0.3, 1], mY), true], 'stara ściana drzwi': [s.has([1.5, 0, 1]), false] };
});

przypadek('drzwi, potem okno obok', 'Prostokąt drzwi od podłogi, potem prostokąt okna obok (oba przed wciśnięciem) — tak rysował Michał 22.11.2026.', () => {
  const s = dom(); s.rectXZ(1, 0, 0, 1, 2); s.rectXZ(3, 0, 1, 1, 1.05);
  const f1 = s.faces; s.push([3.5, 0, 1.5], -0.3, mY); s.push([1.5, 0, 1], -0.3, mY);
  return { 'ściany po narysowaniu': [f1, 8], objętość: [s.volume, 72 - 0.315 - 0.6], otwarte: [s.open, 0], ściany: [s.faces, 15] };
});

// liczby z okna programu (22.11.2026): ściana y ≈ 2,1741246, a narożniki narysowanych prostokątów odstają od niej o ~1e-7
// i każdy o inną wartość — tak zwraca je przyciąganie do ściany (dokładność karty graficznej)
przypadek('krzywe liczby z myszy — drzwi i okno', 'Dom Michała: drzwi i okno narysowane punktami minimalnie poza ścianą, potem wciśnięte.', () => {
  const Y = 2.1741246285270037, s = new Szkic().rectXY(-0.7489504364185677, Y, 0, 17.03506532244527 + 0.7489504364185677, 19.82594116633527 - Y);
  wyciagnij(s, [8, 10, 0], 11.609957863303794);
  const D = [4.5289013048765625, 8.143057443013351, 0, 8.314740785552182], yd = 2.1741247177124015;
  s.quad([D[0], yd, D[2]], [D[1], yd, D[2]], [D[1], yd, D[3]], [D[0], yd, D[3]]);
  const W = [11.121418747571987, 14.1676377963004, 3.982904048124059, 8.211496241371739];
  s.quad([W[0], 2.1741247242216026, W[2]], [W[1], 2.174124726660702, W[2]], [W[1], 2.1741247201515015, W[3]], [W[0], 2.1741247177124023, W[3]]);
  const f1 = s.faces, j1 = s.junk;
  s.push([(W[0] + W[1]) / 2, Y, (W[2] + W[3]) / 2], -1.43, mY); s.push([(D[0] + D[1]) / 2, Y, 4], -1.41, mY);
  const front = s.geo.polys.filter(P => P.every(p => Math.abs(p[1] - Y) < 1e-4));
  return { 'ściany po narysowaniu': [f1, 8], 'śmieci po narysowaniu': [j1, 0], otwarte: [s.open, 0], ściany: [s.faces, 15],
    'przód dokładnie w płaszczyźnie ściany': [front.every(P => P.every(p => p[1] === Y)), true],
    'tył okna': [s.has([12.6, Y + 1.43, 6], mY), true], 'tył drzwi': [s.has([6.3, Y + 1.41, 4], mY), true] };
});

przypadek('okrąg na ścianie', 'Okrąg (24 boki) na przedniej ścianie: 7 ścian, rysowane krawędzie = 12 pudła + 24 okręgu.', () => {
  const s = dom(); s.circle([3, 0, 1.5], X, Z, 0.8);
  return { ściany: [s.faces, 7], krawędzie: [s.edges, 36], otwarte: [s.open, 0] };
});
przypadek('okrąg wciśnięty w ścianę', 'Okrąg na ścianie wciśnięty o 0,3: wnęka walcowa; krawędzie: 12 + 24 brzeg + 24 dno + 24 boczne.', () => {
  const s = dom(); s.circle([3, 0, 1.5], X, Z, 0.8); s.push([3, 0, 1.5], -0.3, mY);
  return { ściany: [s.faces, 6 + 1 + 24], krawędzie: [s.edges, 12 + 24 * 3], otwarte: [s.open, 0], 'dno wnęki': [s.has([3, 0.3, 1.5], mY), true] };
});
przypadek('trzy okręgi na domu z dachem', 'Dom z dachem dwuspadowym; okrąg na froncie, na boku i na połaci dachu — żadnych krawędzi poza okręgami.', () => {
  const s = dom(); s.line([3, 0, 3], [3, 4, 3]);
  kalenica(s);
  const e0 = s.edges, f0 = s.faces;
  s.circle([2, 0, 1.5], X, Z, 0.7); s.circle([6, 2, 1.5], Y, Z, 0.7);
  const n = V.norm([-1.5, 0, 3]), u = [0, 1, 0], v = V.cross(n, u); s.circle([1.5, 2, 3.75], u, v, 0.5);
  return { 'krawędzie domu': [e0, 15], 'ściany domu': [f0, 7], ściany: [s.faces, 10], krawędzie: [s.edges, 15 + 72], otwarte: [s.open, 0] };
});

// polecenia spoza rdzenia (linia na ścianie, gumka, usuwanie ściany) — ściany w jednej płaszczyźnie nie mogą się zlać
przypadek('okno, potem linia na dachu', 'Prostokąt okna na froncie, potem linia przez dach: okno zostaje osobną ścianą (8 ścian).', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.line([3, 0, 3], [3, 4, 3]);
  return { ściany: [s.faces, 8], 'okno': [s.faceArea([2.5, 0, 1.5], mY), 1] };
});
przypadek('gumka na krawędzi okna', 'Gumka na dolnej krawędzi narysowanego okna: okno wraca do ściany (6 ścian), bryła domknięta.', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.edit(m => deleteEdge(m, m.shapes.find(q => q.geo), [2, 0, 1], [3, 0, 1], true));
  return { ściany: [s.faces, 6], otwarte: [s.open, 0], 'front cały': [s.faceArea([1, 0, 0.5], mY), 18] };
});
przypadek('gumka między prostokątami', 'Dwa prostokąty na ziemi, gumka na wspólnym boku: jedna ściana 4 × 2.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2).rectXY(2, 0, 0, 2, 2); s.edit(m => deleteEdge(m, m.shapes.find(q => q.geo), [2, 0, 0], [2, 2, 0], true));
  return { ściany: [s.faces, 1], pole: [s.faceArea([1, 1, 0]), 8] };
});
// zgłoszenie Michała: dwa (trzy) przecinające się okręgi, gumką wewnętrzne łuki — zostaje jedna ściana do wypchnięcia.
// Gumka bierze cały łuk między przecięciami (jak w SketchUpie), więc nie trzeba przeciągać po odcinkach tuż przy obrysie.
const lukGumka = (s, c, r, inside) => s.edit(m => {
  const g = m.shapes.find(q => q.geo);
  const e = meshEdges(g).find(e => { const mid = V.lerp(e.a, e.b, 0.5); return Math.abs(V.dist(mid, c) - r * Math.cos(Math.PI / 24)) < 1e-3 && inside(mid); });
  if (!e) throw new Error('brak łuku do wymazania');
  for (const k of curveOf(g, e.a, e.b)) if (m.shapes.includes(g)) deleteEdge(m, g, k.a, k.b, true);
});
przypadek('przecinające się okręgi — gumka na łukach', 'Dwa okręgi (r 0,7) na froncie, środki 0,8 od siebie; gumka na obu wewnętrznych łukach: jedna ściana w kształcie sumy, osobna od frontu; wciśnięta o 0,3 robi wnękę.', () => {
  const s = dom(), A = [2.5, 0, 1.5], B = [3.3, 0, 1.5], r = 0.7;
  s.circle(A, X, Z, r); s.circle(B, X, Z, r);
  const f0 = s.faces;
  lukGumka(s, A, r, p => V.dist(p, B) < r - 1e-3); lukGumka(s, B, r, p => V.dist(p, A) < r - 1e-3);
  const f1 = s.faces, frontOsobno = s.faceArea([0.5, 0, 0.5], mY) < 18 - 1;
  s.push([2.9, 0, 1.5], -0.3, mY);
  return { 'ściany po narysowaniu': [f0, 6 + 3], 'ściany po gumce': [f1, 6 + 1], 'front osobno od okręgów': [frontOsobno, true], otwarte: [s.open, 0], 'dno wnęki': [s.has([2.9, 0.3, 1.5], mY), true], 'dno wnęki pod łukami': [s.has([2.5, 0.3, 1.0], mY), true] };
});
// strony ścian: „Odwróć ściany” i „Ujednolić orientację” (jak w SketchUpie)
przypadek('strony ścian — odwróć i ujednolić', 'Pudło 4×3×2: dach odwrócony patrzy w dół, objętość i ściany bez zmian; ujednolicenie od podłogi przywraca dach; odwrócony sam front i ujednolicenie od niego odwraca całą resztę.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2);
  const g = () => s.geo, v0 = meshVolume(g()), f0 = s.faces, dach = () => facesOfPolys(g(), [s.faceAt([2, 1.5, 2])])[0].idx;
  const stare = g().polys; reverseFaces(g(), dach()); const nowa = stare !== g().polys;
  const wDol = s.has([2, 1.5, 2], mZ), ileDach = s.faces;
  const r1 = orientFaces(g(), [s.faceAt([2, 1.5, 0])]), n1 = reverseFaces(g(), r1);
  const wGore = s.has([2, 1.5, 2], Z), v1 = meshVolume(g());
  reverseFaces(g(), facesOfPolys(g(), [s.faceAt([2, 0, 1])])[0].idx);
  const n2 = reverseFaces(g(), orientFaces(g(), [s.faceAt([2, 0, 1], Y)]));
  return { 'nowa tablica ścian (widok ją przebuduje)': [nowa, true], 'dach w dół po odwróceniu': [wDol, true], 'ściany po odwróceniu': [ileDach, f0], 'ujednolicenie odwraca dach': [n1 > 0 && wGore, true], 'objętość po ujednoliceniu': [Math.round(v1 * 1e6) / 1e6, Math.round(v0 * 1e6) / 1e6], 'całość odwrócona od frontu': [Math.round(meshVolume(g()) * 1e6) / 1e6, -Math.round(v0 * 1e6) / 1e6], 'odwróconych przy całości': [n2 > 0, true] };
});
// liczba odcinków okręgu i łuku (panel Element, jak „Segmenty” w Informacjach o elemencie SketchUpa)
przypadek('odcinki okręgu i łuku', 'Walec r=1 z 24 odcinków zmieniony na 8: obie podstawy po 8 odcinków, 10 ścian. Okrąg w prostokącie 12 → 36: dalej 2 ściany. Zaokrąglony narożnik (łuk 90°, 6 odcinków) wyciągnięty o 1,5 → 3 odcinki: 9 ścian, prosta styczna nie należy do łuku.', () => {
  const krzywa = (g, p) => { let best, bd = 1e9; for (const e of meshEdges(g)) { const d = V.dist(V.lerp(e.a, e.b, 0.5), p); if (d < bd) { bd = d; best = e; } } return curveEdges(g, best.a, best.b); };
  const w = new Szkic().circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 24); wyciagnij(w, [0, 0, 0], 2);
  const okW = w.edit(() => respaceCurve(w.geo, krzywa(w.geo, [0.99, 0.13, 0]), 8));
  const gora = curveInfo(krzywa(w.geo, [0.92, 0.38, 2]))?.segs, dol = curveInfo(krzywa(w.geo, [0.92, 0.38, 0]))?.segs, scW = w.faces;
  const o = new Szkic().rectXY(0, 0, 0, 4, 3).circle([2, 1.5, 0], [1, 0, 0], [0, 1, 0], 1, 12);
  o.edit(() => respaceCurve(o.geo, krzywa(o.geo, [2.97, 1.63, 0]), 36));
  const P = [[0, 0], [3, 0]]; for (let i = 0; i <= 6; i++) { const t = i / 6 * Math.PI / 2; P.push([2 + Math.cos(t), 1 + Math.sin(t)]); } P.push([0, 2]);
  const z = new Szkic().edit(m => makeShape(m, { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, P, 0)); wyciagnij(z, [1, 1, 0], 1.5);
  const luk = curveInfo(krzywa(z.geo, [2.71, 1.71, 0]));
  z.edit(() => respaceCurve(z.geo, krzywa(z.geo, [2.71, 1.71, 0]), 3));
  const w2 = new Szkic().circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 24); wyciagnij(w2, [0, 0, 0], 2);
  { const g = w2.geo, i = g.polys.findIndex(P => P.length === 4 && P.some(p => Math.abs(p[0] - 1) < 1e-6 && Math.abs(p[1]) < 1e-6)); g.fc = { ...(g.fc || {}), ['p:' + i]: { c: '#ff0000' } }; }
  w2.edit(() => respaceCurve(w2.geo, krzywa(w2.geo, [0.99, 0.13, 0]), 36));
  const g2 = w2.geo, miekkie = (g2.softs || []).length, czerwone = g2.polys.filter((_, i) => g2.fc && g2.fc['p:' + i] && g2.fc['p:' + i].c === '#ff0000').length;
  return { 'walec 36: gładkie krawędzie boku': [miekkie, 36], 'walec 36: czerwony tylko w miejscu starego boku': [czerwone > 0 && czerwone <= 3, true], 'walec: podstawa górna': [gora, 8], 'walec: dolna': [dol, 8], 'walec: ściany': [scW, 10], 'walec: objętość < π·2': [w.volume < Math.PI * 2 && w.volume > 5.6, true], 'okrąg w prostokącie: ściany': [o.faces, 2], 'okrąg: odcinki': [curveInfo(krzywa(o.geo, [2.997, 1.54, 0]))?.segs, 36], 'łuk rozpoznany (6, 90°)': [luk && luk.segs === 6 && Math.round(luk.sweep * 180 / Math.PI) === 90, true], 'łuk po zmianie: ściany': [z.faces, 9], otwarte: [z.open, 0] };
});
// skalowanie samej ściany (narzędzie Skaluj z zaznaczoną ścianą): ściana zostaje w geometrii, bryła się odkształca
przypadek('skalowanie górnej ściany walca', 'Walec r=1, h=2 (24 odcinki), górna ściana zmniejszona o połowę od środka: stożek ścięty, nadal jedna zamknięta bryła (26 ścian), objętość ok. 2π/3·1,75.', () => {
  const s = new Szkic().circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 24); wyciagnij(s, [0, 0, 0], 2);
  const g = s.geo, i = s.faceAt([0, 0, 2]), sub = subFaces(g, [i])[0], pts = sub.pts;
  const f = p => [p[0] * 0.5, p[1] * 0.5, p[2]];
  s.edit(m => moveSub(m, m.shapes.find(q => q.id === g.id), { id: g.id, pts, polys: sub.polys }, () => f));
  const v = Math.round(s.volume * 100) / 100, oczek = Math.round(2 * Math.PI / 3 * 1.75 * 24 / (2 * Math.PI) * Math.sin(2 * Math.PI / 24) * 100) / 100;
  const gl = s.geo.softs || [], naBoku = gl.filter(([a, b]) => Math.abs(a[2]) < 1e-6 && Math.abs(b[2] - 2) < 1e-6 && Math.abs(Math.hypot(b[0], b[1]) - 0.5) < 1e-6).length;
  return { 'boki gładkie po skalowaniu': [naBoku, 24], ściany: [s.faces, 26], otwarte: [s.open, 0], 'jedna bryła': [s.m.shapes.length, 1], objętość: [v, oczek], 'górna ściana mniejsza': [s.faceArea([0, 0, 2]) < 0.8, true] };
});
przypadek('okno, potem usunięty dach', 'Prostokąt okna na froncie, potem usunięty dach: okno zostaje (6 ścian).', () => {
  const s = dom(); s.rectXZ(2, 0, 1, 1, 1); s.edit(m => { const g = m.shapes.find(q => q.geo), i = g.polys.findIndex(P => P.every(p => Math.abs(p[2] - 3) < 1e-9)); deleteFace(m, g, [g.polys[i]]); });
  return { ściany: [s.faces, 6], 'okno': [s.faceArea([2.5, 0, 1.5], mY), 1] };
});
przypadek('bryły obok siebie — front jednej wciśnięty', 'Dwie bryły 2×2×2 obok siebie, front lewej wciśnięty o 1: odsłonięta część przegrody staje się ścianą prawej bryły.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 2, 2); wyciagnij(s, [1, 1, 0], 2); s.rectXY(2, 0, 0, 2, 2); wyciagnij(s, [3, 1, 0], 2); s.push([1, 0, 1], -1, mY);
  return { 'bok prawej bryły': [s.has([2, 0.5, 1], mX), true], 'przegroda dalej': [s.has([2, 1.5, 1]), true], 'nowy front lewej': [s.has([1, 1, 1], mY), true] };
});

/* cienka ściana budynku: płyta 6 × 0,3 × 3 */
const sciana = () => { const s = new Szkic().rectXY(0, 0, 0, 6, 0.3); wyciagnij(s, [3, 0.15, 0], 3); return s; };
przypadek('cienka ściana — okno', 'Okno w ścianie grubości 0,3: prostokąt wciśnięty o 0,3 robi otwór na wylot.', () => {
  const s = sciana(); s.rectXZ(2, 0, 1, 1, 1); s.push([2.5, 0, 1.5], -0.3, mY);
  return { objętość: [s.volume, 5.4 - 0.3], otwarte: [s.open, 0], 'szyba z tyłu': [s.has([2.5, 0.3, 1.5]), false], ściany: [s.faces, 10] };
});
przypadek('cienka ściana — drzwi', 'Drzwi od podłogi w ścianie grubości 0,3: otwór na wylot, podłoga i ściana pod drzwiami wycięte.', () => {
  const s = sciana(); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { objętość: [s.volume, 5.4 - 0.6], otwarte: [s.open, 0], 'ściana drzwi': [s.has([1.5, 0, 1]), false], 'ściana z tyłu': [s.has([1.5, 0.3, 1]), false] };
});
przypadek('ściana — boczna wyciągnięta', 'Bok pudła wyciągnięty o 1 w bok: dłuższe pudło, 6 ścian.', () => {
  const s = new Szkic().rectXY(0, 0, 0, 4, 3); wyciagnij(s, [2, 1.5, 0], 2.5); s.push([4, 1.5, 1], 1, X);
  return { ściany: [s.faces, 6], objętość: [s.volume, 37.5], otwarte: [s.open, 0] };
});

/* ---------- uruchomienie ---------- */
const args = process.argv.slice(2), verbose = args.includes('-v'), filt = args.filter(a => a !== '-v').join(' ').toLowerCase();
const near = (a, b) => typeof b === 'number' ? Math.abs(a - b) < 1e-4 * Math.max(1, Math.abs(b)) : a === b;
const fmt = x => typeof x === 'number' ? (Number.isInteger(x) ? String(x) : x.toFixed(3)) : String(x);
let bad = 0, n = 0;
for (const c of P) {
  if (filt && !c.nazwa.toLowerCase().includes(filt)) continue;
  n++;
  let res, err = null;
  try { ostatni = null; res = c.fn(); if (ostatni) res['śmieci (zerowe i podwójne wielokąty)'] = [ostatni.junk, 0]; } catch (e) { err = e; }
  const fails = err ? [] : Object.entries(res).filter(([, [got, want]]) => !near(got, want));
  if (err || fails.length) {
    bad++;
    console.log(`✗ ${c.nazwa} — ${c.opis}`);
    if (err) console.log(`    błąd: ${err.message}`);
    for (const [k, [got, want]] of fails) console.log(`    ${k}: jest ${fmt(got)}, powinno być ${fmt(want)}`);
  } else {
    console.log(`✓ ${c.nazwa}`);
    if (verbose) for (const [k, [got]] of Object.entries(res)) console.log(`    ${k}: ${fmt(got)}`);
  }
}
console.log(`\n${n - bad} z ${n} przypadków zgodnych z SketchUpem.`);
process.exit(bad ? 1 : 0);
