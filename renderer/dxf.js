// Czytnik DXF (tekstowy) do podkładu: linie, polilinie (także z łukami), okręgi, łuki, elipsy, splajny
// i bloki (INSERT z przesunięciem, skalą i obrotem). Wynik to odcinki w rzucie, w metrach, pogrupowane w warstwy.
// Teksty, kreskowania i wymiary jako napisy są pomijane — podkład ma być lekki.

const UNITS = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

// barwy ACI → stonowane odcienie (podkład ma być cichy)
function aciColor(i) {
  i = Math.abs(i | 0);
  const base = { 1: [200, 60, 50], 2: [190, 170, 40], 3: [70, 150, 70], 4: [60, 150, 160], 5: [60, 90, 170], 6: [160, 70, 150], 7: [60, 60, 60], 8: [128, 128, 128], 9: [170, 170, 170] };
  let rgb = base[i];
  if (!rgb) {
    if (i >= 250) { const g = 50 + (i - 250) * 40; rgb = [g, g, g]; }
    else {
      const h = (Math.floor((i - 10) / 10) * 15) / 360, l = (i % 2 ? 0.45 : 0.55);
      const f = n => { const k = (n + h * 12) % 12; return l - 0.5 * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
      rgb = [f(0) * 255, f(8) * 255, f(4) * 255];
    }
  }
  // przygaszenie w stronę szaroniebieskiego
  const m = [93, 115, 150];
  const c = rgb.map((v, k) => Math.round(v * 0.45 + m[k] * 0.55));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

function pairs(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i], 10), lines[i + 1].trim()]);
  return out;
}

export function parseDxf(input, { unitsOverride } = {}) {
  let text = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
  if (text.startsWith('AutoCAD Binary DXF')) throw new Error('Binarny DXF — zapisz plik jako DXF tekstowy (ASCII)');
  if (text.includes('�') && typeof input !== 'string') text = new TextDecoder('windows-1250').decode(input);
  const P = pairs(text);
  let i = 0;
  const header = {}, layerInfo = new Map(), blocks = new Map(), entities = [];

  // zbiera encję zaczynającą się od pary (0, TYP)
  const readEntity = () => {
    const type = P[i][1]; const e = { type, codes: [] }; i++;
    while (i < P.length && P[i][0] !== 0) { e.codes.push(P[i]); i++; }
    return e;
  };

  while (i < P.length) {
    if (P[i][0] === 0 && P[i][1] === 'SECTION') {
      const name = P[i + 1] && P[i + 1][1]; i += 2;
      if (name === 'HEADER') {
        let key = null;
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 9) key = P[i][1]; else if (key) (header[key] ||= []).push(P[i]);
          i++;
        }
      } else if (name === 'TABLES') {
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 0 && P[i][1] === 'LAYER') {
            const e = readEntity(); const g = c => (e.codes.find(p => p[0] === c) || [])[1];
            const nm = g(2); if (nm != null) layerInfo.set(nm, { color: parseInt(g(62) || '7', 10), flags: parseInt(g(70) || '0', 10) });
          } else i++;
        }
      } else if (name === 'BLOCKS') {
        let cur = null;
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 0 && P[i][1] === 'BLOCK') {
            const e = readEntity(); const g = c => (e.codes.find(p => p[0] === c) || [])[1];
            cur = { name: g(2), base: [parseFloat(g(10) || 0), parseFloat(g(20) || 0)], ents: [] };
            blocks.set(cur.name, cur);
          } else if (P[i][0] === 0 && P[i][1] === 'ENDBLK') { readEntity(); cur = null; }
          else if (P[i][0] === 0) { const e = readEntity(); if (cur) cur.ents.push(e); }
          else i++;
        }
      } else if (name === 'ENTITIES') {
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) {
          if (P[i][0] === 0) entities.push(readEntity()); else i++;
        }
      } else {
        while (i < P.length && !(P[i][0] === 0 && P[i][1] === 'ENDSEC')) i++;
      }
    }
    i++;
  }

  const insunits = header.$INSUNITS ? parseInt(header.$INSUNITS[0][1], 10) : 0;
  const out = new Map();   // warstwa → tablica odcinków (w jednostkach pliku)
  const push = (layer, a, b) => { let s = out.get(layer); if (!s) out.set(layer, s = []); s.push(a[0], a[1], b[0], b[1]); };
  let count = 0; const LIMIT = 600000;

  const arcPts = (cx, cy, r, a0, a1) => {
    while (a1 <= a0) a1 += Math.PI * 2;
    const n = Math.max(4, Math.min(96, Math.ceil((a1 - a0) / (Math.PI / 24))));
    const pts = []; for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  };
  // odcinek polilinii z wypukłością (bulge) → łuk: θ = 4·atan(b), dodatnie b = łuk przeciwnie do wskazówek zegara
  const bulgePts = (p, q, b) => {
    if (!b) return [q];
    const th = 4 * Math.atan(b), dx = q[0] - p[0], dy = q[1] - p[1], c = Math.hypot(dx, dy);
    if (c < 1e-12) return [q];
    const s = (c / 2) / Math.tan(th / 2);
    const cx = (p[0] + q[0]) / 2 - dy / c * s, cy = (p[1] + q[1]) / 2 + dx / c * s;
    const r = Math.hypot(p[0] - cx, p[1] - cy), a0 = Math.atan2(p[1] - cy, p[0] - cx);
    const n = Math.max(2, Math.min(64, Math.ceil(Math.abs(th) / (Math.PI / 24))));
    const pts = []; for (let k = 1; k < n; k++) { const a = a0 + th * k / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    pts.push(q);
    return pts;
  };

  const emit = (ents, T, inheritLayer, depth) => {
    if (depth > 8) return;
    for (let k = 0; k < ents.length && count < LIMIT; k++) {
      const e = ents[k], c = e.codes;
      const g = (code, d = 0) => { const p = c.find(x => x[0] === code); return p ? parseFloat(p[1]) : d; };
      const gs = code => { const p = c.find(x => x[0] === code); return p ? p[1] : null; };
      let layer = gs(8) || '0';
      if (layer === '0' && inheritLayer) layer = inheritLayer;
      const mir = g(230, 1) < 0 ? -1 : 1;   // encje odbite lustrzanie (normalna −Z)
      const tp = (x, y) => T([x * mir, y]);
      const poly = (pts, closed) => {
        for (let j = 0; j + 1 < pts.length; j++) { push(layer, tp(...pts[j]), tp(...pts[j + 1])); count++; }
        if (closed && pts.length > 2) { push(layer, tp(...pts[pts.length - 1]), tp(...pts[0])); count++; }
      };
      switch (e.type) {
        case 'LINE': push(layer, T([g(10), g(20)]), T([g(11), g(21)])); count++; break;
        case 'LWPOLYLINE': {
          const closed = (g(70) & 1) === 1, vs = [];
          let cur = null;
          for (const [code, val] of c) {
            if (code === 10) { cur = { x: parseFloat(val), y: 0, b: 0 }; vs.push(cur); }
            else if (code === 20 && cur) cur.y = parseFloat(val);
            else if (code === 42 && cur) cur.b = parseFloat(val);
          }
          const pts = [];
          for (let j = 0; j < vs.length; j++) {
            const p = [vs[j].x, vs[j].y]; if (!j) pts.push(p);
            const q = vs[j + 1] ? [vs[j + 1].x, vs[j + 1].y] : closed ? [vs[0].x, vs[0].y] : null;
            if (q) pts.push(...bulgePts(p, q, vs[j].b));
          }
          poly(pts, false);
          break;
        }
        case 'POLYLINE': {
          const closed = (g(70) & 1) === 1, vs = [];
          while (k + 1 < ents.length && ents[k + 1].type === 'VERTEX') { k++; const vc = ents[k].codes; const vg = (cc, d = 0) => { const p = vc.find(x => x[0] === cc); return p ? parseFloat(p[1]) : d; }; vs.push({ x: vg(10), y: vg(20), b: vg(42) }); }
          if (k + 1 < ents.length && ents[k + 1].type === 'SEQEND') k++;
          const pts = [];
          for (let j = 0; j < vs.length; j++) {
            const p = [vs[j].x, vs[j].y]; if (!j) pts.push(p);
            const q = vs[j + 1] ? [vs[j + 1].x, vs[j + 1].y] : closed ? [vs[0].x, vs[0].y] : null;
            if (q) pts.push(...bulgePts(p, q, vs[j].b));
          }
          poly(pts, false);
          break;
        }
        case 'CIRCLE': poly(arcPts(g(10), g(20), g(40), 0, Math.PI * 2), false); break;
        case 'ARC': poly(arcPts(g(10), g(20), g(40), g(50) * Math.PI / 180, g(51) * Math.PI / 180), false); break;
        case 'ELLIPSE': {
          const cx = g(10), cy = g(20), mx = g(11), my = g(21), ratio = g(40, 1);
          let t0 = g(41, 0), t1 = g(42, Math.PI * 2); while (t1 <= t0) t1 += Math.PI * 2;
          const R = Math.hypot(mx, my), ang = Math.atan2(my, mx), n = Math.max(8, Math.ceil((t1 - t0) / (Math.PI / 24)));
          const pts = []; for (let j = 0; j <= n; j++) { const t = t0 + (t1 - t0) * j / n, x = R * Math.cos(t), y = R * ratio * Math.sin(t); pts.push([cx + x * Math.cos(ang) - y * Math.sin(ang), cy + x * Math.sin(ang) + y * Math.cos(ang)]); }
          poly(pts, false); break;
        }
        case 'SPLINE': {
          // przybliżenie: punkty dopasowania, a gdy ich nie ma — punkty kontrolne
          const fit = [], ctl = [];
          let cur = null, curF = null;
          for (const [code, val] of c) {
            if (code === 10) { cur = [parseFloat(val), 0]; ctl.push(cur); } else if (code === 20 && cur) cur[1] = parseFloat(val);
            if (code === 11) { curF = [parseFloat(val), 0]; fit.push(curF); } else if (code === 21 && curF) curF[1] = parseFloat(val);
          }
          poly(fit.length > 1 ? fit : ctl, (g(70) & 1) === 1); break;
        }
        case 'INSERT': {
          const b = blocks.get(gs(2)); if (!b) break;
          const ix = g(10), iy = g(20), sx = g(41, 1) * mir, sy = g(42, 1), rot = g(50) * Math.PI / 180;
          const cs = Math.cos(rot), sn = Math.sin(rot);
          const T2 = p => { const x = (p[0] - b.base[0]) * sx, y = (p[1] - b.base[1]) * sy; return T([ix * mir + x * cs - y * sn, iy + x * sn + y * cs]); };
          emit(b.ents, T2, layer, depth + 1);
          break;
        }
        default: break;
      }
    }
  };
  emit(entities, p => p, null, 0);

  // jednostki i przesunięcie do okolic początku układu (współrzędne geodezyjne bywają ogromne)
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const s of out.values()) for (let j = 0; j < s.length; j += 2) { if (s[j] < lo[0]) lo[0] = s[j]; if (s[j] > hi[0]) hi[0] = s[j]; if (s[j + 1] < lo[1]) lo[1] = s[j + 1]; if (s[j + 1] > hi[1]) hi[1] = s[j + 1]; }
  if (lo[0] === Infinity) throw new Error('W pliku nie ma linii do pokazania');
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1]);
  let unitKey = unitsOverride || (UNITS[insunits] ? { 1: 'in', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm', 14: 'dm' }[insunits] : (ext > 3000 ? 'mm' : 'm'));
  const scale = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, in: 0.0254, ft: 0.3048 }[unitKey] || 1;
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  const layers = [];
  for (const [name, s] of out) {
    const info = layerInfo.get(name) || { color: 7, flags: 0 };
    const segs = new Float32Array(s.length);
    for (let j = 0; j < s.length; j += 2) { segs[j] = (s[j] - cx) * scale; segs[j + 1] = (s[j + 1] - cy) * scale; }
    layers.push({ name, color: aciColor(info.color), visible: info.color >= 0 && !(info.flags & 1), segs: Array.from(segs, v => Math.round(v * 1000) / 1000) });
  }
  layers.sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return { units: unitKey, fileUnits: insunits, offset: [cx * scale, cy * scale], layers, truncated: count >= LIMIT, raw: null };
}
