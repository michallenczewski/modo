// Operacje na bryłach przez Manifold (WASM): wynik jest zawsze szczelną bryłą, a liczenie jest dużo szybsze niż w drzewach BSP.
// Moduł ładuje się raz przy starcie; dopóki go nie ma (albo gdy bryła wejściowa nie jest szczelna), wołający
// wraca do własnego algorytmu z csg.js — dlatego każda funkcja tutaj może zwrócić null.

import { V } from './model.js';

import { _t } from './i18n.js';
let M = null;
export async function initSolid(opts) {
  if (M) return true;
  try {
    const Module = (await import('./vendor/manifold/manifold.js')).default;
    const w = await Module(opts || {});
    w.setup(); M = w;
    return true;
  } catch (e) { console.warn(_t('Manifold niedostępny, zostaje wbudowany algorytm brył:'), e && e.message); return false; }
}
export const solidReady = () => !!M;

const Q = 1e5;   // spawanie wierzchołków: 0,01 mm
// wielokąty [{ vs, shared }] (wypukłe albo trójkąty) → Manifold; shared trafia do tabeli, faceID trójkąta to jego indeks
function toManifold(polys, table) {
  const idx = new Map(), pos = [], tri = [], fid = [];
  const vi = p => { const k = Math.round(p[0] * Q) + ',' + Math.round(p[1] * Q) + ',' + Math.round(p[2] * Q); let i = idx.get(k); if (i === undefined) { i = pos.length / 3; idx.set(k, i); pos.push(p[0], p[1], p[2]); } return i; };
  const ids = new Map();
  for (const P of polys) {
    let f = ids.get(P.shared); if (f === undefined) { f = table.length; table.push(P.shared); ids.set(P.shared, f); }
    const i0 = vi(P.vs[0]);
    for (let k = 1; k + 1 < P.vs.length; k++) { const a = vi(P.vs[k]), b = vi(P.vs[k + 1]); if (a === i0 || b === i0 || a === b) continue; tri.push(i0, a, b); fid.push(f); }
  }
  if (!tri.length) return null;
  const mesh = new M.Mesh({ numProp: 3, vertProperties: new Float32Array(pos), triVerts: new Uint32Array(tri), faceID: new Uint32Array(fid), runIndex: new Uint32Array([0, tri.length]), runOriginalID: new Uint32Array([M.Manifold.reserveIDs(1)]) });
  const m = new M.Manifold(mesh);   // rzuca wyjątek, gdy siatka nie jest szczelna
  if (m.isEmpty() || m.volume() <= 1e-12) { m.delete(); return null; }
  return m;
}
const r6 = x => Math.round(x * 1e6) / 1e6;
function fromManifold(m, table) {
  const g = m.getMesh(), P = g.vertProperties, T = g.triVerts, F = g.faceID, n = g.numProp, out = [];
  const pt = i => [r6(P[i * n]), r6(P[i * n + 1]), r6(P[i * n + 2])];
  for (let t = 0; t < T.length; t += 3) {
    const vs = [pt(T[t]), pt(T[t + 1]), pt(T[t + 2])];
    const c = V.cross(V.sub(vs[1], vs[0]), V.sub(vs[2], vs[0])), L = V.len(c);
    if (L < 1e-12) continue;
    const nn = V.mul(c, 1 / L);
    out.push({ vs, n: nn, w: V.dot(nn, vs[0]), shared: F ? table[F[t / 3]] : null });
  }
  return out;
}

// A op B; op: 'union' | 'subtract' | 'intersect'. B może być listą brył (odejmowanych albo dodawanych po kolei).
export function solidBoolean(A, Bs, op) {
  if (!M) return null;
  const made = [];
  try {
    const table = [];
    let a = toManifold(A, table); if (!a) return null; made.push(a);
    for (const B of Bs) {
      const b = toManifold(B, table); if (!b) { if (op === 'intersect') return []; continue; }
      made.push(b);
      a = op === 'union' ? a.add(b) : op === 'intersect' ? a.intersect(b) : a.subtract(b);
      made.push(a);
    }
    return fromManifold(a, table);
  } catch (e) { return null; }
  finally { for (const m of made) try { m.delete(); } catch (e) {} }
}
