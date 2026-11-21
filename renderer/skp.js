// Import plików SketchUpa (.skp) przez OpenSKP (czytnik odtworzony z formatu, bez SDK Trimble).
// Model SketchUpa → elementy Modo:
//  - definicja komponentu albo grupy → grupa / komponent Modo (zagnieżdżenia zachowane, kopie komponentu zmieniają się razem),
//  - ściany połączone krawędziami → jedna bryła z dowolnych ścian (kind: 'mesh'); miękkie krawędzie zostają miękkie,
//  - luźne krawędzie → linie, warstwy (tagi) → warstwy, sceny → sceny, materiał → kolor i krycie (bez tekstur).
// Wszystko w SketchUpie jest w calach; Modo liczy w metrach.

import { V } from './model.js';
import { triangulateHoles } from './mesh.js';

const IN = 0.0254;
const r6 = x => Math.round(x * 1e6) / 1e6;
const hex = c => '#' + [c.r, c.g, c.b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');

// macierz instancji (13 liczb: 3×3 wierszami, przesunięcie, skala; albo 16 kolumnami) → { x, y, z, o } w calach
function axesOf(m) {
  if (!m || m.length < 12) return { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], o: [0, 0, 0] };
  if (m.length === 16) return { x: [m[0], m[1], m[2]], y: [m[4], m[5], m[6]], z: [m[8], m[9], m[10]], o: [m[12], m[13], m[14]] };
  const s = m.length >= 13 && m[12] ? m[12] : 1;
  return { x: [m[0] * s, m[3] * s, m[6] * s], y: [m[1] * s, m[4] * s, m[7] * s], z: [m[2] * s, m[5] * s, m[8] * s], o: [m[9] * s, m[10] * s, m[11] * s] };
}
const apply = (F, p) => [F.o[0] + F.x[0] * p[0] + F.y[0] * p[1] + F.z[0] * p[2], F.o[1] + F.x[1] * p[0] + F.y[1] * p[1] + F.z[1] * p[2], F.o[2] + F.x[2] * p[0] + F.y[2] * p[1] + F.z[2] * p[2]];
const lin = (F, p) => [F.x[0] * p[0] + F.y[0] * p[1] + F.z[0] * p[2], F.x[1] * p[0] + F.y[1] * p[1] + F.z[1] * p[2], F.x[2] * p[0] + F.y[2] * p[1] + F.z[2] * p[2]];
const compose = (A, B) => ({ x: lin(A, B.x), y: lin(A, B.y), z: lin(A, B.z), o: apply(A, B.o) });   // najpierw B, potem A
const det = F => V.dot(F.x, V.cross(F.y, F.z));

// geometria definicji w jej własnym układzie (cale): bryły (spójne kawałki ścian) i luźne linie
function localGeometry(def) {
  const vert = new Map(); for (const v of def.vertices) vert.set(v.id, [v.x, v.y, v.z]);
  const edge = new Map(); for (const e of def.edges) edge.set(e.id, e);
  const loopPts = loop => {
    const ids = [];
    for (const ce of loop) { const e = edge.get(ce.edgeId); if (!e) continue; const a = ce.orientation === 1 ? e.v1Id : e.v2Id; if (!ids.length || ids[ids.length - 1] !== a) ids.push(a); }
    if (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
    return ids.map(i => vert.get(i)).filter(Boolean);
  };
  // łączenie ścian przez wspólne krawędzie
  const faces = def.faces.filter(f => !f.hidden && f.loops && f.loops.length);
  const parent = faces.map((_, i) => i), find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const byEdge = new Map(), used = new Set(), uses = new Map();
  faces.forEach((f, i) => { for (const l of f.loops) for (const ce of l) { used.add(ce.edgeId); uses.set(ce.edgeId, (uses.get(ce.edgeId) || 0) + 1); const j = byEdge.get(ce.edgeId); if (j === undefined) byEdge.set(ce.edgeId, i); else parent[find(i)] = find(j); } });
  const comps = new Map();
  faces.forEach((f, i) => {
    const r = find(i); let c = comps.get(r); if (!c) comps.set(r, c = { polys: [], softs: [], mats: new Map(), edges: new Set() });
    const outer = loopPts(f.loops[0]); if (outer.length < 3) return;
    const holes = f.loops.slice(1).map(loopPts).filter(h => h.length >= 3);
    // obrys zgodny z normalną ściany (kierunek na zewnątrz)
    let n = [0, 0, 0]; for (let k = 0; k < outer.length; k++) { const a = outer[k], b = outer[(k + 1) % outer.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
    if (V.len(n) < 1e-9) return;
    const flip = f.normal && V.dot(n, f.normal) < 0;
    if (holes.length) { let tris; try { tris = triangulateHoles(outer, holes); } catch (e) { tris = []; } for (const t of tris) c.polys.push(flip ? [t[0], t[2], t[1]] : t); }
    else c.polys.push(flip ? outer.slice().reverse() : outer);
    const mid = f.materialId ?? f.backMaterialId;
    c.mats.set(mid, (c.mats.get(mid) || 0) + 1);
    for (const l of f.loops) for (const ce of l) c.edges.add(ce.edgeId);
  });
  const solids = [];
  for (const c of comps.values()) {
    if (!c.polys.length) continue;
    for (const id of c.edges) { const e = edge.get(id); if (e && (e.soft || e.smooth || e.hidden)) { const a = vert.get(e.v1Id), b = vert.get(e.v2Id); if (a && b) c.softs.push([a, b]); } }
    let best = null, bn = -1; for (const [m, k] of c.mats) if (k > bn) { bn = k; best = m; }
    let open = false; for (const id of c.edges) if (uses.get(id) !== 2) { open = true; break; }
    solids.push({ polys: c.polys, softs: c.softs, mat: best, open });
  }
  const lines = [];
  for (const e of def.edges) { if (used.has(e.id) || e.hidden) continue; const a = vert.get(e.v1Id), b = vert.get(e.v2Id); if (a && b && V.dist(a, b) > 1e-6) lines.push([a, b]); }
  return { solids, lines };
}

// skp: wynik parseSkp; nextId: funkcja dająca kolejne id; zwraca elementy gotowe do dołożenia do modelu
export function skpToModo(skp, nextId, name = 'SketchUp') {
  const out = { shapes: [], lines: [], groups: [], tags: [], scenes: [], stats: { faces: 0, instances: 0, skipped: 0 } };
  const cache = new Map(), geom = d => { let g = cache.get(d); if (!g) cache.set(d, g = localGeometry(d)); return g; };
  const mats = skp.materialsById || new Map();
  const tagId = new Map(), hiddenLayer = new Set((skp.layers || []).filter(l => l.hidden).map(l => l.name));
  const tagOf = nm => {
    if (!nm || /^(layer0|untagged|bez tagu)$/i.test(nm)) return undefined;
    if (!tagId.has(nm)) { const t = { id: nextId(), name: nm }; if (hiddenLayer.has(nm)) t.hidden = true; out.tags.push(t); tagId.set(nm, t.id); }
    return tagId.get(nm);
  };
  const root = { id: nextId(), kind: 'group', name };
  out.groups.push(root);
  const active = new Set();
  const M = F => p => { const q = apply(F, p); return [r6(q[0] * IN), r6(q[1] * IN), r6(q[2] * IN)]; };
  function place(def, F, gid, inheritMat, hidden) {
    const g = geom(def), f = M(F), mirror = det(F) < 0;
    for (const s of g.solids) {
      const polys = [];
      for (const p of s.polys) {
        const q = p.map(f), d = [];
        for (const v of q) if (!d.length || V.dist(d[d.length - 1], v) > 1e-6) d.push(v);
        if (d.length > 1 && V.dist(d[0], d[d.length - 1]) <= 1e-6) d.pop();
        if (d.length >= 3) polys.push(mirror ? d.reverse() : d);
      }
      if (!polys.length) continue;
      const sh = { id: nextId(), kind: 'mesh', polys, marks: [], g: gid };
      if (s.open) sh.open = true;
      if (s.softs.length) sh.softs = s.softs.map(([a, b]) => [f(a), f(b)]);
      const m = mats.get(s.mat ?? inheritMat) || mats.get(inheritMat);
      if (m && m.color) { sh.color = hex(m.color); const a = Math.min((m.color.a ?? 255) / 255, m.transparency ?? 1); if (a < 0.995) sh.alpha = Math.max(0.05, r6(a)); }
      if (hidden) sh.hidden = true;
      out.shapes.push(sh); out.stats.faces += polys.length;
    }
    for (const [a, b] of g.lines) { const l = { id: nextId(), a: f(a), b: f(b), g: gid }; if (hidden) l.hidden = true; out.lines.push(l); }
    for (const inst of def.instances || []) {
      const child = skp.definitions.get(inst.refIdx);
      if (!child || child.isImage || active.has(inst.refIdx)) { out.stats.skipped++; continue; }
      const G = compose(F, axesOf(inst.matrix));
      const rec = { id: nextId(), kind: child.isGroup ? 'group' : 'comp', p: gid, name: inst.name || child.name || undefined };
      if (rec.kind === 'comp') { rec.def = 'skp' + root.id + '_' + inst.refIdx; rec.frame = { o: G.o.map(x => r6(x * IN)), x: G.x.map(r6), y: G.y.map(r6), z: G.z.map(r6) }; }
      const t = tagOf(inst.layer); if (t !== undefined) rec.tag = t;
      out.groups.push(rec); out.stats.instances++;
      active.add(inst.refIdx);
      place(child, G, rec.id, inst.materialId ?? inheritMat, hidden || !!inst.hidden);
      active.delete(inst.refIdx);
    }
  }
  place(skp.root, axesOf(null), root.id, null, false);
  // grupy, które zostały puste (np. sam obraz albo ukryte ściany), znikają razem z pustymi rodzicami
  const usedG = new Set(); for (const e of [...out.shapes, ...out.lines]) usedG.add(e.g);
  const byId = new Map(out.groups.map(g => [g.id, g]));
  for (const id of [...usedG]) { let g = byId.get(id); while (g && g.p != null && !usedG.has(g.p)) { usedG.add(g.p); g = byId.get(g.p); } }
  out.groups = out.groups.filter(g => usedG.has(g.id));
  for (const pg of skp.pages || []) {
    if (!pg.eye || !pg.target) continue;
    const p = pg.eye.map(x => x * IN), f = V.sub(pg.target.map(x => x * IN), p); if (V.len(f) < 1e-9) continue;
    out.scenes.push({ name: pg.name || 'Scena', camera: { p, f: V.norm(f), fov: pg.fov > 1 ? pg.fov : 35, ortho: !!pg.parallel, orthoH: pg.orthoHeight ? pg.orthoHeight * IN / 2 : undefined } });
  }
  return out;
}
