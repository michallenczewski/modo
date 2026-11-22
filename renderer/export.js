// Eksport do OBJ + MTL (3ds Max, Rhino, Blender, SketchUp). Każda bryła to osobny obiekt z nazwą
// (ścieżka grup i komponentów + nazwa bryły), wycięcia są już odjęte, materiał niesie kolor i krycie.
// Oś Y w górę, jak oczekują importery OBJ (3ds Max przy domyślnym „Flip ZY-axis” obróci model z powrotem).

import { isHidden, triangulate, boxOf, boxesTouch, isSolid, chainOf, V } from './model.js';
import { subtractAll } from './csg.js';
import { DEFAULT_COLOR } from './viewer.js';
import { TEXTURES } from './textures.js';

import { _t } from './i18n.js';
const clean = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export function exportObj(model, baseName = 'Modo') {
  const lines = ['# Modo — eksport OBJ', _t('# jednostki: metry, oś Y w górę'), `mtllib ${clean(baseName)}.mtl`];
  const mats = new Map();
  // fp — kolor, materiał i krycie pojedynczej ściany (s.fc); tekstura eksportuje się jako jej kolor zastępczy
  const matOf = (s, fp) => {
    const c = (fp ? fp.c || (fp.t && TEXTURES[fp.t] && TEXTURES[fp.t].avg) : s.color || (s.tex && TEXTURES[s.tex] && TEXTURES[s.tex].avg)) || DEFAULT_COLOR, a = (fp && fp.a) ?? s.alpha ?? 1;
    const key = c + '|' + a.toFixed(2);
    if (!mats.has(key)) mats.set(key, { name: 'Modo_' + c.slice(1) + (a < 0.999 ? '_a' + Math.round(a * 100) : ''), c, a });
    return mats.get(key).name;
  };
  const cutters = model.shapes.filter(s => s.op === 'cut' && !isHidden(model, s) && isSolid(s)).map(s => ({ s, box: boxOf(s) }));
  const polysOf = s => {
    const out = [];
    for (const f of triangulate(s)) for (const t of f.tris) { const g = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])); out.push({ vs: V.dot(g, f.normal) < 0 ? [t[0], t[2], t[1]] : t, shared: null }); }
    return out;
  };
  let vi = 1, ni = 1, count = 0;
  const names = new Map();
  for (const s of model.shapes) {
    if (isHidden(model, s) || s.op === 'cut') continue;
    // ściany: zwykle wielokąty bryły; gdy przecina ją wycięcie — wynik CSG
    let faces;
    const cut = isSolid(s) ? cutters.filter(c => boxesTouch(c.box, boxOf(s))) : [];
    if (cut.length) faces = subtractAll(polysOf(s), cut.map(c => polysOf(c.s))).map(p => ({ vs: p.vs, n: p.n }));
    else faces = triangulate(s).flatMap(f => f.tris.map(t => { const g = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])); return { vs: V.dot(g, f.normal) < 0 ? [t[0], t[2], t[1]] : t, n: f.normal, fp: s.fc && s.fc[f.key] }; }));
    if (!faces.length) continue;
    const path = s.g ? chainOf(model, s.g).reverse().map(g => g.name || (g.kind === 'comp' ? _t('Komponent_') + g.def : _t('Grupa_') + g.id)) : [];
    let name = clean([...path, s.name || _t('Bryla_') + s.id].join('__'));
    const k = names.get(name) || 0; names.set(name, k + 1); if (k) name += '_' + (k + 1);
    lines.push(`o ${name}`);
    // ściany z własnym kolorem albo kryciem dostają własny materiał
    let cur = null;
    faces.sort((x, y) => (x.fp ? matOf(s, x.fp) : '').localeCompare(y.fp ? matOf(s, y.fp) : ''));
    for (const f of faces) {
      const mt = matOf(s, f.fp); if (mt !== cur) { lines.push(`usemtl ${mt}`); cur = mt; }
      for (const v of f.vs) lines.push(`v ${v[0].toFixed(5)} ${v[2].toFixed(5)} ${(-v[1]).toFixed(5)}`);
      lines.push(`vn ${f.n[0].toFixed(5)} ${f.n[2].toFixed(5)} ${(-f.n[1]).toFixed(5)}`);
      lines.push('f ' + f.vs.map((_, j) => `${vi + j}//${ni}`).join(' '));
      vi += f.vs.length; ni++;
    }
    count++;
  }
  const mtl = [_t('# Modo — materiały')];
  for (const m of mats.values()) {
    const [r, g, b] = hexRgb(m.c);
    mtl.push(`newmtl ${m.name}`, `Kd ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`, 'Ka 0 0 0', 'Ks 0 0 0', `d ${m.a.toFixed(3)}`, `Tr ${(1 - m.a).toFixed(3)}`, 'illum 1', '');
  }
  return { obj: lines.join('\n') + '\n', mtl: mtl.join('\n') + '\n', count };
}
