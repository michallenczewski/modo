// Biblioteka prostych modeli: samochód, van, ludzie i drzewa 2D (obracają się do kamery), krzew, ławka.
// Modele są budowane z kodu (bez plików), w metrach, z początkiem w środku podstawy.
// Własne modele użytkownika: zapisane zaznaczenie (bryły, linie, grupy) w pamięci programu.

import { V, normalizeShape, circlePts } from './model.js';

import { _t } from './i18n.js';
// bryła wyciągnięta z profilu: punkty (a, b) w płaszczyźnie u-v, grubość h wzdłuż u × v
const prism = (o, u, v, pts, h, extra = {}) => normalizeShape({ o, u, v, n: V.norm(V.cross(u, v)), pts, h, ...extra });
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
// profil boczny w płaszczyźnie X–Z, wyciągnięty na szerokość w (symetrycznie względem osi X)
const side = (pts, w, yc = 0, extra) => prism([0, yc + w / 2, 0], X, Z, pts, w, extra);
const box = (x0, y0, z0, dx, dy, dz, extra) => prism([x0, y0, z0], X, Y, [[0, 0], [dx, 0], [dx, dy], [0, dy]], dz, extra);
const wheel = (x, y, r, w, extra) => prism([x, y + w / 2, r], X, Z, circlePts(r, 16), w, { soft: true, color: '#4a4844', ...extra });

// łagodny łuk z punktów (do maski i dachu)
function arcPts(cx, cz, r, a0, a1, n) { const out = []; for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(t), cz + r * Math.sin(t)]); } return out; }

function car() {
  const L = 4.45, W = 1.8;
  // profil obchodzimy w jednym kierunku: dół z wnękami kół od przodu do tyłu
  const body = [[-L / 2, 0.32], [-1.72, 0.32], ...arcPts(-1.35, 0.32, 0.37, Math.PI, 0, 6).slice(1, -1), [-0.98, 0.32], [0.98, 0.32], ...arcPts(1.35, 0.32, 0.37, Math.PI, 0, 6).slice(1, -1), [1.72, 0.32], [L / 2, 0.36], [L / 2 - 0.06, 0.8], [1.3, 0.92], [0.55, 1.42], [-0.95, 1.38], [-1.65, 0.86], [-L / 2 + 0.04, 0.76]];
  const shapes = [side(body, W, 0, { color: '#e6e3dc' })];
  for (const x of [-1.35, 1.35]) for (const y of [-W / 2 + 0.16, W / 2 - 0.16]) shapes.push(wheel(x, y, 0.32, 0.22));
  return { shapes };
}

function van() {
  const L = 5.3, W = 2.0;
  const body = [[-L / 2, 0.34], [-1.95, 0.34], ...arcPts(-1.6, 0.34, 0.38, Math.PI, 0, 6).slice(1, -1), [-1.22, 0.34], [1.3, 0.34], ...arcPts(1.68, 0.34, 0.38, Math.PI, 0, 6).slice(1, -1), [2.06, 0.34], [L / 2, 0.38], [L / 2 - 0.02, 1.0], [2.15, 1.25], [1.45, 2.1], [1.3, 2.38], [-L / 2 + 0.05, 2.38], [-L / 2, 2.3]];
  const shapes = [side(body, W, 0, { color: '#e9e7e1' })];
  for (const x of [-1.6, 1.68]) for (const y of [-W / 2 + 0.17, W / 2 - 0.17]) shapes.push(wheel(x, y, 0.34, 0.24));
  return { shapes };
}

function bench() {
  const shapes = [];
  for (let i = 0; i < 3; i++) shapes.push(box(-0.9, -0.22 + i * 0.15, 0.42, 1.8, 0.12, 0.04, { color: '#d8cdb8' }));
  shapes.push(box(-0.9, 0.2, 0.55, 1.8, 0.04, 0.12, { color: '#d8cdb8' }), box(-0.9, 0.2, 0.72, 1.8, 0.04, 0.12, { color: '#d8cdb8' }));
  for (const x of [-0.75, 0.69]) shapes.push(box(x, -0.22, 0, 0.06, 0.44, 0.42, { color: '#6d6a64' }), box(x, 0.18, 0.42, 0.06, 0.06, 0.48, { color: '#6d6a64' }));
  return { shapes };
}

// krzew: nieregularna kula z wielokątów, rysowana tylko konturem
function bush(r = 0.6, seed = 3) {
  let s = seed; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const nu = 9, nv = 5, P = [];
  const top = [0, 0, r * 1.6], bot = [0, 0, 0.02];
  for (let j = 1; j < nv; j++) {
    const row = [], ph = Math.PI * j / nv;
    for (let i = 0; i < nu; i++) {
      const th = 2 * Math.PI * (i + (j % 2) * 0.5) / nu, k = 0.85 + 0.3 * rnd();
      row.push([Math.cos(th) * Math.sin(ph) * r * 1.15 * k, Math.sin(th) * Math.sin(ph) * r * 1.15 * k, r * 0.8 + Math.cos(ph) * r * 0.8 * (0.9 + 0.2 * rnd())]);
    }
    P.push(row);
  }
  const polys = [];
  for (let i = 0; i < nu; i++) { const a = P[0][i], b = P[0][(i + 1) % nu]; polys.push([top, a, b]); }
  for (let j = 0; j + 1 < P.length; j++) for (let i = 0; i < nu; i++) {
    const a = P[j][i], b = P[j][(i + 1) % nu], c = P[j + 1][(i + 1) % nu], d = P[j + 1][i];
    polys.push([a, d, c], [a, c, b]);
  }
  const last = P[P.length - 1];
  for (let i = 0; i < nu; i++) { const a = last[i], b = last[(i + 1) % nu]; polys.push([bot, b, a]); }
  // kierunek ścian na zewnątrz
  for (const p of polys) { const n = V.cross(V.sub(p[1], p[0]), V.sub(p[2], p[0])), c = V.mul(V.add(V.add(p[0], p[1]), p[2]), 1 / 3); if (V.dot(n, V.sub(c, [0, 0, r * 0.8])) < 0) p.reverse(); }
  return { shapes: [{ kind: 'mesh', polys, marks: [], soft: true, color: '#c5ccb6' }] };
}

// figury 2D: płaski obrys w płaszczyźnie X–Z, obracany do kamery wokół pionu
const flat = (pts, color) => ({ shapes: [normalizeShape({ o: [0, 0, 0], u: X, v: Z, n: V.cross(X, Z), pts, h: 0, bill: true, color })] });

function person(walking) {
  // sylwetka ok. 1,75 m, rysowana od stopy lewej, przez głowę, do stopy prawej
  const P = walking
    ? [[-0.32, 0], [-0.2, 0], [-0.08, 0.42], [0.0, 0.82], [0.1, 0.4], [0.24, 0.02], [0.36, 0.02], [0.22, 0.48], [0.17, 0.92], [0.2, 1.12], [0.32, 0.88], [0.4, 0.9], [0.26, 1.3], [0.17, 1.44], [0.08, 1.48], [0.12, 1.55], [0.11, 1.66], [0.04, 1.74], [-0.05, 1.73], [-0.1, 1.64], [-0.08, 1.54], [-0.06, 1.48], [-0.16, 1.43], [-0.24, 1.25], [-0.34, 0.92], [-0.27, 0.9], [-0.17, 1.12], [-0.15, 0.9], [-0.2, 0.46]]
    : [[-0.2, 0], [-0.06, 0], [-0.05, 0.8], [0.0, 0.8], [0.05, 0.8], [0.06, 0], [0.2, 0], [0.15, 0.5], [0.16, 0.92], [0.18, 1.2], [0.26, 0.86], [0.31, 0.88], [0.26, 1.3], [0.19, 1.43], [0.09, 1.47], [0.1, 1.55], [0.09, 1.67], [0.02, 1.74], [-0.06, 1.73], [-0.1, 1.64], [-0.09, 1.53], [-0.07, 1.47], [-0.19, 1.43], [-0.26, 1.3], [-0.31, 0.88], [-0.26, 0.86], [-0.18, 1.2], [-0.16, 0.92], [-0.15, 0.5]];
  return flat(P, '#e4e0d7');
}

function tree2d() {
  // pień i korona o falistym brzegu
  let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const crown = [], cz = 4.6, R = 2.3, n = 28;
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + 0.25 + (2 * Math.PI - 0.5) * i / n, k = 1 + 0.09 * Math.sin(i * 2.3) + 0.06 * (rnd() - 0.5);
    crown.push([Math.cos(t) * R * k, cz + Math.sin(t) * R * 1.08 * k]);
  }
  const trunk = [[-0.14, 0], [0.14, 0], [0.12, cz - R * 1.08 + 0.15]];
  const pts = [...trunk.slice(0, 2), [0.12, crown[0][1]], ...crown.map(p => p), [-0.12, crown[crown.length - 1][1]]];
  return flat(pts.reverse(), '#d5dbc8');
}

function conifer2d() {
  const pts = [[-0.12, 0], [0.12, 0], [0.12, 0.6]];
  const H = 7.5, layers = 6;
  for (let i = 0; i < layers; i++) { const z = 0.6 + (H - 0.6) * i / layers, w = 1.6 * (1 - i / layers) + 0.2; pts.push([w, z], [w * 0.45, z + (H - 0.6) / layers * 0.75]); }
  pts.push([0, H]);
  const right = pts.slice(3), left = right.slice(0, -1).reverse().map(([x, z]) => [-x, z]);
  return flat([[-0.12, 0], [0.12, 0], [0.12, 0.6], ...right, ...left, [-0.12, 0.6]], '#cfd6c3');
}

export const LIBRARY = [
  { key: 'car', name: _t('Samochód'), make: car },
  { key: 'van', name: _t('Van'), make: van },
  { key: 'person', name: _t('Człowiek'), make: () => person(false) },
  { key: 'walker', name: _t('Człowiek idący'), make: () => person(true) },
  { key: 'tree', name: _t('Drzewo 2D'), make: tree2d },
  { key: 'conifer', name: _t('Drzewo iglaste 2D'), make: conifer2d },
  { key: 'bush', name: _t('Krzew'), make: () => bush() },
  { key: 'bench', name: _t('Ławka'), make: bench }
];

/* ---------- własne modele ---------- */
const STORE = 'modo.library';
export function loadUserLib() { try { return JSON.parse(localStorage.getItem(STORE) || '[]'); } catch (e) { return []; } }
export function saveUserLib(list) { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; } }
