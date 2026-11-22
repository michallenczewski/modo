// Model do sprawdzianu wydajności: wieża w stylu Turning Torso (Malmö), zbudowana tymi samymi poleceniami co w programie.
// Panel elewacji (pas podokienny, szyba, słupek) jest komponentem; piętro = 56 paneli wzdłuż zaokrąglonego pięciokąta + strop;
// segment = 5 pięter obróconych o 1,67°, pas techniczny, kręgosłup z zastrzałami; 9 segmentów co 10°; trzon jako grupa.
// Wynik: ok. 2575 grup i 42 tys. ścian. Uruchomienie: await modoTest.tower()  (zwraca czasy kroków w ms).
import { V, makeShape, membersOf, duplicateIds, transformShape, transformFrame, groupsWhollyIn, circlePts, area2 } from '../model.js';
import { subFaces } from '../tools.js';

export async function buildTower(app, { segments = 9, panels = 56 } = {}) {
  const m = () => app.model, out = {}, now = () => performance.now(), T0 = now();
  const geo = () => m().shapes.find(s => s.geo && s.g == null);
  const selAllLoose = () => { const s = geo(); app.sub = s ? subFaces(s, s.polys.map((_, i) => i)) : []; };
  const xform = (ids, f) => { const set = new Set(ids); for (const s of m().shapes) if (set.has(s.id)) transformShape(s, f); for (const g of groupsWhollyIn(m(), set)) if (g.frame) g.frame = transformFrame(g.frame, f); };
  const copyGroup = (gid, f) => { const nu = duplicateIds(m(), new Set(membersOf(m(), gid))); xform([...nu], f); };
  const rotZ = a => p => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
  const box = (o, a, b, h, color, alpha) => { const s = makeShape(m(), { o, u: [1, 0, 0], v: [0, 1, 0] }, [[0, 0], [a, 0], [a, b], [0, b]], h); if (color) s.color = color; if (alpha) s.alpha = alpha; return s; };
  const selectTop = () => { app.selection.clear(); for (const g of m().groups.filter(g => g.p == null)) for (const id of membersOf(m(), g.id)) app.selection.add(id); selAllLoose(); app.selectionChanged(); };
  const named = n => { const g = m().groups.filter(g => g.p == null).pop(); g.name = n; app.selection.clear(); app.selectionChanged(); return g; };
  const tube = (a, b, r, n = 8) => {
    const d = V.sub(b, a), L = V.len(d), z = V.norm(d), x = Math.abs(z[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], z)), y = V.cross(z, x);
    const s = makeShape(m(), { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, circlePts(r, n), L); s.soft = true;
    transformShape(s, p => V.add(a, V.add(V.add(V.mul(x, p[0]), V.mul(y, p[1])), V.mul(z, p[2]))));
  };
  // zarys piętra: zaokrąglony pięciokąt o polu ok. 400 m²
  let P = [[-12, -8], [12, -8], [14, 5], [0, 14], [-14, 5]]; const kk = Math.sqrt(400 / Math.abs(area2(P))); P = P.map(p => [p[0] * kk, p[1] * kk]);
  for (let it = 0; it < 3; it++) { const Q = []; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } P = Q; }
  const per = P.map((p, i) => Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1])), total = per.reduce((a, b) => a + b, 0), N = panels, outline = [];
  for (let k = 0; k < N; k++) { let d = total * k / N, i = 0; while (d > per[i]) { d -= per[i]; i++; } const a = P[i], b = P[(i + 1) % P.length], t = d / per[i]; outline.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  const L = total / N * 0.985;
  // panel → komponent
  app.checkpoint(); box([0, -0.12, 0], L, 0.12, 1.0, null); box([0.03, -0.07, 1.0], L - 0.03, 0.03, 2.2, '#7f9aab', 0.4); box([0, -0.15, 1.0], 0.06, 0.15, 2.2, '#8d8980');
  app.changed(); app.selection.clear(); selAllLoose(); app.selectionChanged(); app.run('comp'); const panel = named('Panel');
  // piętro: kopie panelu wzdłuż zarysu + strop
  app.checkpoint(); let f0 = null;
  for (let k = 0; k < N; k++) {
    const a = outline[k], b = outline[(k + 1) % N], th = Math.atan2(b[1] - a[1], b[0] - a[0]), R = rotZ(th), f = p => V.add(R(p), [a[0], a[1], 0]);
    if (k === 0) { xform(membersOf(m(), panel.id), f); f0 = { a, th }; }
    else { const inv = p => rotZ(-f0.th)(V.sub(p, [f0.a[0], f0.a[1], 0])); copyGroup(panel.id, p => f(inv(p))); }
  }
  makeShape(m(), { o: [0, 0, -0.3], u: [1, 0, 0], v: [0, 1, 0] }, outline, 0.3); app.changed(); selectTop(); app.run('comp'); const floor = named('Piętro'); out.floor = Math.round(now() - T0);
  // segment: 5 pięter, pas techniczny, kręgosłup z zastrzałami
  app.checkpoint(); const step = 10 / 6 * Math.PI / 180; for (let i = 1; i < 5; i++) copyGroup(floor.id, p => V.add(rotZ(step * i)(p), [0, 0, 3.5 * i]));
  const band = makeShape(m(), { o: [0, 0, 17.2], u: [1, 0, 0], v: [0, 1, 0] }, outline.map(p => [p[0] * 0.86, p[1] * 0.86]), 3.5); band.color = '#8d8980';
  const apex = outline.reduce((a, p) => p[1] > a[1] ? p : a), sp = [apex[0], apex[1] + 3.4]; tube([sp[0], sp[1], 0], [sp[0], sp[1], 21], 0.6, 12);
  for (const z of [1.2, 8, 14.8]) { tube([sp[0], sp[1], z], [apex[0] - 5, apex[1] - 1.2, z], 0.22, 8); tube([sp[0], sp[1], z], [apex[0] + 5, apex[1] - 1.2, z], 0.22, 8); }
  tube([sp[0], sp[1], 1.2], [apex[0] - 5, apex[1] - 1.2, 8], 0.2, 8); tube([sp[0], sp[1], 14.8], [apex[0] + 5, apex[1] - 1.2, 8], 0.2, 8);
  app.changed(); selectTop(); app.run('comp'); const seg = named('Segment'); out.segment = Math.round(now() - T0);
  // wieża: kopie segmentu, każda obrócona o 10° i 21 m wyżej
  let t = now(); app.checkpoint(); for (let i = 1; i < segments; i++) copyGroup(seg.id, p => V.add(rotZ(i * 10 * Math.PI / 180)(p), [0, 0, 21 * i])); app.changed(); out.copies = Math.round(now() - t);
  // trzon
  t = now(); app.checkpoint(); const c = makeShape(m(), { o: [0, 0, -0.3], u: [1, 0, 0], v: [0, 1, 0] }, circlePts(5.3, 48), 21 * segments + 3); c.soft = true;
  app.changed(); app.selection.clear(); selAllLoose(); app.selectionChanged(); app.run('group'); named('Trzon'); out.core = Math.round(now() - t);
  out.total = Math.round(now() - T0);
  app.viewer.zoomExtents();
  return out;
}
