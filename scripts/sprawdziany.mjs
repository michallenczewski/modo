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
const { absorb } = await import(R + 'geo.js');
const { regions, regionOf, meshVolume, newell, inPoly } = await import(R + 'mesh.js');

/* ---------- szkic i kroki ---------- */
class Szkic {
  constructor() { this.m = newModel(); }
  get geo() { return this.m.shapes.find(s => s.geo) || null; }
  // jak postEdit w app.js
  edit(fn) { const prev = cloneModel(this.m); fn(this.m); stitch(this.m, prev, 200); absorb(this.m, null); return this; }
  // prostokąt: narożnik o, kierunki u, v (jednostkowe), wymiary a × b
  rect(o, u, v, a, b) { return this.edit(m => makeShape(m, { o, u, v }, [[0, 0], [a, 0], [a, b], [0, b]], 0)); }
  rectXY(x, y, z, a, b) { return this.rect([x, y, z], [1, 0, 0], [0, 1, 0], a, b); }
  rectXZ(x, y, z, a, b) { return this.rect([x, y, z], [1, 0, 0], [0, 0, 1], a, b); }   // na ścianie y = const
  rectYZ(x, y, z, a, b) { return this.rect([x, y, z], [0, 1, 0], [0, 0, 1], a, b); }   // na ścianie x = const
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
}
const onBorder = (p, P) => P.some((a, i) => { const b = P[(i + 1) % P.length], L = V.dist(a, b); if (L < 1e-9) return false; const e = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), e); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(e, t)), p) < 1e-6; });
function polyArea(P) { const n = newell(P); let s = [0, 0, 0]; for (let i = 0; i < P.length; i++) s = V.add(s, V.cross(P[i], P[(i + 1) % P.length])); return Math.abs(V.dot(s, n)) / 2; }
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
przypadek('dom z dachem — okno i drzwi', 'Pudło, linia kalenicy przesunięta w górę o 1,5, potem okno i drzwi we froncie (wnęki 0,3).', () => {
  const s = dom(); s.line([3, 0, 3], [3, 4, 3]);
  s.edit(m => { const g = m.shapes.find(q => q.geo); g.polys = g.polys.map(P => P.map(p => (Math.abs(p[0] - 3) < 1e-9 && Math.abs(p[2] - 3) < 1e-9) ? [p[0], p[1], 4.5] : p)); });
  const v0 = s.volume; s.rectXZ(3.5, 0, 1, 1, 1); s.push([4, 0, 1.5], -0.3, mY); s.rectXZ(1, 0, 0, 1, 2); s.push([1.5, 0, 1], -0.3, mY);
  return { 'objętość domu': [v0, 72 + 18], objętość: [s.volume, 90 - 0.3 - 0.6], otwarte: [s.open, 0], 'tył okna': [s.has([4, 0.3, 1.5], mY), true], 'tył drzwi': [s.has([1.5, 0.3, 1], mY), true], 'stara ściana drzwi': [s.has([1.5, 0, 1]), false] };
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
  try { res = c.fn(); } catch (e) { err = e; }
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
