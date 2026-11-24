// Eksport do OBJ + MTL (3ds Max, Rhino, Blender, SketchUp). Każda bryła to osobny obiekt z nazwą
// (ścieżka grup i komponentów + nazwa bryły), wycięcia są już odjęte, materiał niesie kolor i krycie.
// Oś Y w górę, jak oczekują importery OBJ (3ds Max przy domyślnym „Flip ZY-axis” obróci model z powrotem).

import { isHidden, triangulate, boxOf, boxesTouch, isSolid, chainOf, V, edges as shapeEdges } from './model.js';
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

// Eksport do DXF (wersja R12 — otwiera go każdy program CAD, także AutoCAD). Ściany brył to ściany 3D (3DFACE)
// z ukrytymi przekątnymi podziału na trójkąty, linie to LINE, warstwy Modo to warstwy DXF (bez polskich liter —
// ani kropek — R12 ich nie przyjmuje; wielkimi literami, bo CAD nie rozróżnia wielkości liter). Oś Z w górę jak w Modo;
// wymiary w jednostce szkicu (m, cm albo mm). Jednostka jest też w nagłówku ($INSUNITS) — to zmienna z nowszych wersji
// DXF, więc starsze czytniki mogą ją pominąć; komunikat po zapisie podaje jednostkę. Wycięcia są już odjęte. Teksty, wymiary i prowadnice nie trafiają do pliku.
const DXF_UNITS = { m: [1, 6], cm: [100, 5], mm: [1000, 4] };
export function exportDxf(model, unit = 'm') {
  const [k, insunits] = DXF_UNITS[unit] || DXF_UNITS.m;
  const out = [], put = (code, val) => out.push(String(code), String(val));
  const num = x => { const v = Math.round(x * k * 1e6) / 1e6; return Object.is(v, -0) ? '0' : String(v); };
  const layerName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9_$-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31).toUpperCase() || '0';
  // warstwa elementu: jego własna, a gdy jej nie ma — najbliższej grupy, która ją ma
  const tagOf = e => { if (e.tag != null) return e.tag; for (const g of e.g != null ? chainOf(model, e.g) : []) if (g.tag != null) return g.tag; return null; };
  const layers = new Map([['0', '0']]);
  const layerOf = e => { const id = tagOf(e); if (id == null) return '0'; const t = model.tags.find(q => q.id === id); const n = layerName(t && t.name); layers.set(n, n); return n; };
  const ents = [];
  const face = (layer, P, flags) => { ents.push(['3DFACE', layer, P.length === 3 ? [...P, P[2]] : P, flags]); };
  const cutters = model.shapes.filter(s => s.op === 'cut' && !isHidden(model, s) && isSolid(s)).map(s => ({ s, box: boxOf(s) }));
  // trójkąty zwrócone zgodnie z normalną ściany (jak w exportObj — CSG bierze stronę „wewnątrz” z kolejności wierzchołków)
  const trisOf = s => triangulate(s).flatMap(f => f.tris.map(t => { const g = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])); return { vs: V.dot(g, f.normal) < 0 ? [t[0], t[2], t[1]] : t, shared: null }; }));
  let count = 0;
  for (const s of model.shapes) {
    if (isHidden(model, s) || s.op === 'cut') continue;
    const layer = layerOf(s), cut = isSolid(s) ? cutters.filter(c => boxesTouch(c.box, boxOf(s))) : [];
    // widoczne w CAD są te krawędzie, które rysuje Modo (bez wygładzonych i ukrytych); reszta boków trójkątów jest niewidoczna
    const own = segIndex(); for (const e of shapeEdges(s)) if (!e.soft && !e.hid) own.add(e.a, e.b, null);
    let tris;
    if (cut.length) {
      tris = [];
      for (const p of subtractAll(trisOf(s), cut.map(c => trisOf(c.s)))) for (let i = 1; i + 1 < p.vs.length; i++) tris.push([p.vs[0], p.vs[i], p.vs[i + 1]]);
    } else tris = triangulate(s).flatMap(f => f.tris);
    // po wycięciu dochodzą nowe krawędzie (brzeg otworu): bok jest widoczny, gdy styka się z trójkątem w innej płaszczyźnie
    const nb = cut.length ? segIndex() : null, nrm = t => V.norm(V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0])));
    if (nb) for (const t of tris) { const n = nrm(t); for (let i = 0; i < 3; i++) nb.add(t[i], t[(i + 1) % 3], n); }
    const visible = (a, b, n) => own.on(a, b).length > 0 || (nb && nb.covered(a, b, m => Math.abs(V.dot(m, n)) < 1 - 1e-6));
    for (const t of tris) {
      const n = cut.length ? nrm(t) : null;
      // trzeci bok trójkąta zapisanego jako czworokąt (wierzchołek 3 = 4) ma zerową długość: flaga 4
      const flags = (visible(t[0], t[1], n) ? 0 : 1) | (visible(t[1], t[2], n) ? 0 : 2) | 4 | (visible(t[2], t[0], n) ? 0 : 8);
      face(layer, t, flags);
    }
    const n = tris.length;
    if (n) count++;
  }
  let lines = 0;
  for (const l of model.lines) { if (isHidden(model, l)) continue; ents.push(['LINE', layerOf(l), [l.a, l.b]]); lines++; }
  // nagłówek, tabele (rodzaj linii i warstwy), elementy
  put(0, 'SECTION'); put(2, 'HEADER'); put(9, '$ACADVER'); put(1, 'AC1009'); put(9, '$INSUNITS'); put(70, insunits); put(0, 'ENDSEC');
  put(0, 'SECTION'); put(2, 'TABLES');
  put(0, 'TABLE'); put(2, 'LTYPE'); put(70, 1); put(0, 'LTYPE'); put(2, 'CONTINUOUS'); put(70, 0); put(3, 'Solid line'); put(72, 65); put(73, 0); put(40, '0.0'); put(0, 'ENDTAB');
  put(0, 'TABLE'); put(2, 'LAYER'); put(70, layers.size);
  for (const n of layers.keys()) { put(0, 'LAYER'); put(2, n); put(70, 0); put(62, 7); put(6, 'CONTINUOUS'); }
  put(0, 'ENDTAB'); put(0, 'ENDSEC');
  put(0, 'SECTION'); put(2, 'ENTITIES');
  for (const [type, layer, P, flags] of ents) {
    put(0, type); put(8, layer);
    P.forEach((p, i) => { put(10 + i, num(p[0])); put(20 + i, num(p[1])); put(30 + i, num(p[2])); });
    if (type === '3DFACE' && flags) put(70, flags);
  }
  put(0, 'ENDSEC'); put(0, 'EOF');
  return { dxf: out.join('\r\n') + '\r\n', count, lines };
}

// odcinki z szybkim pytaniem „które z nich zawierają odcinek a–b” (wspólna prosta, a i b na odcinku); kubełki po środkach
function segIndex() {
  const list = [], grid = new Map(), C = 0.5, key = (x, y, z) => x + ',' + y + ',' + z, cell = v => Math.floor(v / C);
  const on = (p, a, b) => { const L = V.dist(a, b); if (L < 1e-9) return false; const d = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), d); return t > -1e-6 && t < L + 1e-6 && V.dist(V.add(a, V.mul(d, t)), p) < 1e-6; };
  return {
    add(a, b, data) {
      const i = list.length; list.push([a, b, data]);
      const lo = [0, 1, 2].map(k => cell(Math.min(a[k], b[k]))), hi = [0, 1, 2].map(k => cell(Math.max(a[k], b[k])));
      if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 512) { (grid.get('big') || grid.set('big', []).get('big')).push(i); return; }
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = key(x, y, z); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
    },
    on(a, b) {
      const m = V.lerp(a, b, 0.5), ids = [...(grid.get(key(cell(m[0]), cell(m[1]), cell(m[2]))) || []), ...(grid.get('big') || [])];
      return ids.map(i => list[i]).filter(([p, q]) => on(a, p, q) && on(b, p, q) && on(m, p, q)).map(e => e[2]);
    },
    // czy każdy z kilku punktów a–b leży na odcinku tej samej prostej spełniającym ok(dane) — boki trójkątów po wycięciu
    // nie zawsze pokrywają się w całości, więc odcinek może być przykryty kilkoma krótszymi
    covered(a, b, ok) {
      const d = V.norm(V.sub(b, a));
      return [0.1, 0.5, 0.9].every(t => {
        const m = V.lerp(a, b, t), ids = [...(grid.get(key(cell(m[0]), cell(m[1]), cell(m[2]))) || []), ...(grid.get('big') || [])];
        return ids.some(i => { const [p, q, data] = list[i]; return on(m, p, q) && Math.abs(Math.abs(V.dot(V.norm(V.sub(q, p)), d)) - 1) < 1e-6 && ok(data); });
      });
    }
  };
}
