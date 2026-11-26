// Widok 3D: scena three.js z osią Z w górę, nawigacja jak w SketchUpie, słońce z miękkimi cieniami
// i szkicowe krawędzie rysowane własnym shaderem (przedłużenia za narożniki, drżenie, grubszy kontur, zanikanie w głębi).

import * as THREE from './vendor/three.module.js';
import { isHidden, triangulate, edges as shapeEdges, bounds, onTopOf, boxOf, boxesTouch, subtreeIds, isSolid, V } from './model.js';
import { triangulatePoly, isMesh, segKey, newell, polyArea } from './mesh.js';
import { subtractAll, resultEdges } from './csg.js';
import { sunPosition, sunVector } from './sun.js';
import { TEXTURES, textureCanvas, isImageMat, onImageReady } from './textures.js';

import { _t } from './i18n.js';
/* ---------- style rysunku ---------- */
export const STYLES = {
  // Szkic: ołówek — cienka, lekko drżąca kreska (dawniej gruby obrys 2,1 px i wyraźne falowanie wyglądały topornie)
  // Szkic: ołówek — każda kreska rysowana dwa razy z innym drżeniem (strokes: 2), końce lekko wychodzą za narożnik, ciepły grafit
  szkic: { name: _t('Szkic'), paper: '#f4f1e8', ink: '#3a352d', inkFar: '#aaa395', wSil: 1.2, wIn: 0.6, ext: 3, wobble: 1.0, fade: 0.8, lines: true, strokes: 2, shadow: 0.2, tint: 0.35 },
  kreska: { name: _t('Kreska'), paper: '#ffffff', ink: '#1f1f1d', inkFar: '#9a9893', wSil: 1.6, wIn: 0.8, ext: 0, wobble: 0, fade: 0.6, lines: true, shadow: 0.16, tint: 0.15 },
  model: { name: _t('Model'), paper: '#efede8', ink: '#000000', inkFar: '#000000', wSil: 0, wIn: 0, ext: 0, wobble: 0, fade: 0, lines: false, shadow: 0.3, tint: 0 }
};
// tryb ciemny: ciemny papier, jasna kreska, przygaszone ściany (kolory jak w ciemnej Gapie)
const DARK = {
  szkic: { paper: '#1c1b19', ink: '#e3ddd0', inkFar: '#7a756b', shadow: 0.55, wall: '#4d4b47' },
  kreska: { paper: '#161616', ink: '#e9e9e7', inkFar: '#77776f', shadow: 0.5, wall: '#4a4a48' },
  model: { paper: '#1d1d1c', ink: '#000000', inkFar: '#000000', shadow: 0.6, wall: '#6a6863' }
};
export const DEFAULT_COLOR = '#f6f4ee';
export const styleOf = (name, dark) => dark ? { ...STYLES[name], ...DARK[name] } : STYLES[name];

/* ---------- shader krawędzi ---------- */
const EDGE_VS = `
#define BIAS_K 0.0015
#define BIAS_MAX 0.05
uniform vec2 res; uniform float px, wSil, wIn, ext, wobble, nearZ, fadeNear, fadeFar, sectOn, seedOff; uniform vec4 sect;
attribute vec3 ea, eb, n1, n2, col; attribute float t, side, seed, hasN2, wmul, soft;
varying float vHalf, vD, vFade, vDepth, vAlpha; varying vec3 vCol;
void main(){
  float sd = seed + seedOff;
  vec4 va = modelViewMatrix * vec4(ea, 1.0), vb = modelViewMatrix * vec4(eb, 1.0);
  float nz = -nearZ * 1.001;
  if (va.z > nz && vb.z > nz) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float ta = 0.0, tb = 1.0;
  if (va.z > nz) ta = (nz - va.z) / (vb.z - va.z);
  if (vb.z > nz) tb = (nz - va.z) / (vb.z - va.z);
  // przekrój: część krawędzi po zdjętej stronie płaszczyzny znika
  if (sectOn > 0.5) {
    float fa = dot(sect.xyz, ea) - sect.w, fb = dot(sect.xyz, eb) - sect.w;
    if (fa > 1e-5 && fb > 1e-5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    if (fa > 1e-5) ta = max(ta, fa / (fa - fb));
    if (fb > 1e-5) tb = min(tb, fa / (fa - fb));
  }
  float tt = clamp(t, ta, tb);
  vec4 vp = mix(va, vb, tt), cp = projectionMatrix * vp;
  vec4 pA = projectionMatrix * mix(va, vb, ta), pB = projectionMatrix * mix(va, vb, tb);
  vec2 sA = pA.xy / pA.w * 0.5 * res, sB = pB.xy / pB.w * 0.5 * res;
  vec2 dir = sB - sA; float L = length(dir); dir = L > 1e-4 ? dir / L : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 s = cp.xy / cp.w * 0.5 * res;
  float e = ext * px * min(1.0, L / (40.0 * px));
  if (t <= 0.0 && ta <= 0.0) s -= dir * e * (0.7 + 0.6 * fract(sd * 7.13));
  if (t >= 1.0 && tb >= 1.0) s += dir * e * (0.7 + 0.6 * fract(sd * 3.71));
  float amp = wobble * px * (fract(sd * 13.37) - 0.5) * 2.0 * min(1.0, L / (60.0 * px));
  s += nrm * amp * sin(3.14159 * tt) + nrm * amp * 0.35 * sin(6.28318 * tt + sd * 6.0);
  vec3 wp = mix(ea, eb, tt);
  vec3 vd = normalize(cameraPosition - wp);
  float f1 = dot(n1, vd), f2 = hasN2 > 0.5 ? dot(n2, vd) : -1.0;
  bool sil = (f1 > 0.0) != (f2 > 0.0);
  // krawędź, która na ekranie jest bardzo krótka (daleki albo gęsty model), rysuje się cieniej — inaczej kreski zlewają się w plamę
  float w = (sil ? wSil : (soft > 0.5 ? 0.0 : wIn)) * px * wmul * clamp(L / (26.0 * px), 0.4, 1.0);
  if (w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // z daleka (mało pikseli na metr modelu) kreski cienieją, a poniżej jednego piksela bledną — gęsta elewacja nie robi się czarna
  float ppm = projectionMatrix[1][1] * 0.5 * res.y / max(cp.w, 1e-4) / px;
  w *= clamp(ppm / 40.0, 0.18, 1.0);
  vAlpha = clamp(w / (0.9 * px), 0.0, 1.0);
  w = max(w, 0.9 * px);
  vHalf = w * 0.5;
  vD = side * (vHalf + px);
  s += nrm * vD;
  vFade = clamp((-vp.z - fadeNear) / max(fadeFar - fadeNear, 0.001), 0.0, 1.0);
  vCol = col; vDepth = -vp.z;
  // Kreska wygrywa ze ścianą, na której leży: przysuwamy ją do kamery w przestrzeni widoku o ułamek odległości (najwyżej
  // 5 cm, z daleka tyle, ile wymaga dokładność głębi), a w rzucie równoległym o stałe 3 cm. Dawniej stała w głębi ekranu
  // rosła z kwadratem odległości (przy 40 m ~30 cm) i spod ścian wystawały końcówki krawędzi wnęk i otworów.
  float dist = -vp.z, bias = projectionMatrix[3][3] > 0.5 ? 0.03 : min(dist * BIAS_K, max(BIAS_MAX, 5e-6 * dist * dist));
  vec4 zc = projectionMatrix * vec4(vp.xy, vp.z + bias, 1.0);
  gl_Position = vec4(s / (0.5 * res) * cp.w, zc.z / zc.w * cp.w, cp.w);
}`;
// Kreska zaznaczenia ma stałą grubość (niezależną od stylu — w stylu „Model” zwykłe kreski mają grubość 0), bez falowania,
// wydłużania i cienienia z odległości. Głębia: kreska jest przysuwana do kamery o ułamek swojej odległości, ale najwyżej
// o 15 cm, więc ściany zasłaniają zaznaczone krawędzie z tyłu bryły — z daleka i w rzucie równoległym też.
const selRepl = [
  ['  float e = ext * px', '  float e = 0.0 * px'],
  ['  float amp = wobble * px', '  float amp = 0.0 * px'],
  ['  float w = (sil ? wSil : (soft > 0.5 ? 0.0 : wIn)) * px * wmul * clamp(L / (26.0 * px), 0.4, 1.0);', '  float w = 2.6 * px * wmul;'],
  ['  w *= clamp(ppm / 40.0, 0.18, 1.0);\n', ''],
  ['#define BIAS_K 0.0015\n#define BIAS_MAX 0.05', '#define BIAS_K 0.002\n#define BIAS_MAX 0.15'],
];
const SEL_VS = selRepl.reduce((v, [a, b]) => { if (!v.includes(a)) throw new Error('SEL_VS: ' + a); return v.replace(a, b); }, EDGE_VS);
const EDGE_FS = `
uniform vec3 ink, inkFar, paper; uniform float fade, px, opacity, fogOn, fogNear, fogFar;
varying float vHalf, vD, vFade, vDepth, vAlpha; varying vec3 vCol;
void main(){
  float a = clamp(vHalf + 0.5 * px - abs(vD), 0.0, px) / px;
  if (a <= 0.0) discard;
  vec3 c = vCol.r < 0.0 ? mix(ink, inkFar, vFade * fade) : vCol;
  c = mix(c, paper, fogOn * clamp((vDepth - fogNear) / max(fogFar - fogNear, 0.001), 0.0, 1.0));
  gl_FragColor = vec4(c, a * vAlpha * opacity * (1.0 - 0.55 * vFade * fade));
}`;

// (każda krawędź jest dzielona na odcinki, żeby linia mogła lekko falować — patrz buildEdgeGeometry)

// seg — na ile odcinków dzielona jest każda krawędź (falowanie kreski); przy bardzo wielu krawędziach mniej, żeby widok nie ważył milionów trójkątów
const EDGE_ATTRS = [['position', 3], ['ea', 3], ['eb', 3], ['n1', 3], ['n2', 3], ['col', 3], ['t', 1], ['side', 1], ['seed', 1], ['hasN2', 1], ['wmul', 1], ['soft', 1]];
const segFor = n => n > 30000 ? 1 : n > 8000 ? 2 : 6;
// dane kresek dla listy krawędzi: [{ a, b, n1, n2, col:[r,g,b]|null, w }] → tablice atrybutów (bez indeksów)
function edgeBlock(list, SEG) {
  const nV = list.length * SEG * 4, B = { seg: SEG, nV };
  for (const [n, k] of EDGE_ATTRS) B[n] = new Float32Array(nV * k);
  const { ea, eb, n1, n2, col, position: pos, t, side, seed, hasN2, wmul, soft } = B;
  let v = 0;
  for (let k = 0; k < list.length; k++) {
    const E = list[k], a = E.a, b = E.b, c = E.col, m1 = E.n1, m2 = E.n2, w = E.w || 1, sf = E.soft ? 1 : 0;
    const sd = Math.abs(Math.sin((a[0] * 12.9898 + a[1] * 78.233 + b[0] * 37.719 + b[2] * 4.581 + b[1] * 1.37) * 43758.5453)) % 1;
    for (let s = 0; s < SEG; s++) for (let q = 0; q < 4; q++) {
      const tv = (s + (q >> 1)) / SEG, i = v * 3;
      ea[i] = a[0]; ea[i + 1] = a[1]; ea[i + 2] = a[2]; eb[i] = b[0]; eb[i + 1] = b[1]; eb[i + 2] = b[2];
      n1[i] = m1[0]; n1[i + 1] = m1[1]; n1[i + 2] = m1[2]; if (m2) { n2[i] = m2[0]; n2[i + 1] = m2[1]; n2[i + 2] = m2[2]; }
      if (c) { col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2]; } else { col[i] = -1; col[i + 1] = -1; col[i + 2] = -1; }
      pos[i] = a[0] + (b[0] - a[0]) * tv; pos[i + 1] = a[1] + (b[1] - a[1]) * tv; pos[i + 2] = a[2] + (b[2] - a[2]) * tv;
      t[v] = tv; side[v] = q & 1 ? 1 : -1; seed[v] = sd; hasN2[v] = m2 ? 1 : 0; wmul[v] = w; soft[v] = sf;
      v++;
    }
  }
  return B;
}
// kreski całego widoku z kawałków: [{ list, col, cache }] — kawałek bryły, która się nie zmieniła, ma gotowe dane w `cache.eb`
// (każda krawędź jest dzielona na odcinki, żeby kreska mogła lekko falować; przy bardzo wielu krawędziach odcinków jest mniej)
function joinEdges(chunks, total) {
  const SEG = segFor(total), nV = total * SEG * 4, out = {};
  for (const [n, k] of EDGE_ATTRS) out[n] = new Float32Array(nV * k);
  let v = 0;
  for (const ch of chunks) {
    if (!ch.list.length) continue;
    let B = ch.cache && ch.cache.eb;
    if (!B || B.seg !== SEG) { B = edgeBlock(ch.list, SEG); if (ch.cache) ch.cache.eb = B; }
    for (const [n, k] of EDGE_ATTRS) out[n].set(B[n], v * k);
    if (ch.col) { const c = ch.col, arr = out.col; for (let i = v * 3, e = (v + B.nV) * 3; i < e; i += 3) { arr[i] = c[0]; arr[i + 1] = c[1]; arr[i + 2] = c[2]; } }
    v += B.nV;
  }
  const nQ = total * SEG, idx = new Uint32Array(nQ * 6);
  for (let q = 0, b = 0, i = 0; q < nQ; q++, b += 4) { idx[i++] = b; idx[i++] = b + 2; idx[i++] = b + 1; idx[i++] = b + 1; idx[i++] = b + 2; idx[i++] = b + 3; }
  const g = new THREE.BufferGeometry();
  for (const [n, k] of EDGE_ATTRS) g.setAttribute(n, new THREE.BufferAttribute(out[n], k));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.userData.seg = SEG;
  return g;
}
const buildEdgeGeometry = list => joinEdges([{ list }], list.length);

// skrót treści bryły: suma kontrolna wierzchołków i zapis pozostałych pól, od których zależy jej wygląd
function shapeSig(s) {
  let sum = 0, n = 0;
  if (s.polys) for (const p of s.polys) for (const v of p) { n++; sum += (v[0] * 1.37 + v[1] * 2.11 + v[2] * 3.07) * (n % 251 + 1); }
  return n + '|' + sum + '|' + JSON.stringify([s.pts, s.fc, s.softs, s.hid, s.marks, s.o, s.u, s.v, s.h, s.holes, s.alpha, s.soft, s.color, s.tex, s.open]);
}
// Szkło jest odsunięte w głąb bardziej niż zwykłe ściany: szyba leżąca dokładnie na stropie (ta sama płaszczyzna)
// zawsze przegrywa ze stropem — inaczej karta graficzna rozstrzyga to raz tak, raz tak i na szybie pojawiają się prostokąty.
const GLASS_OFS = [4, 16];
const hex3 = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export class Viewer {
  constructor(host) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl';
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'ov';
    host.append(this.canvas, this.overlay);
    this.ctx = this.overlay.getContext('2d');

    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    r.localClippingEnabled = true;
    this.clipPlane = new THREE.Plane(); this.showSectPlanes = true; this.sectSegs = [];
    r.setPixelRatio(window.devicePixelRatio || 1);
    r.shadowMap.enabled = true;
    // Cienie z mapy głębi z miękkim filtrem (PCF). Wcześniejsza metoda VSM trzymała głębię w mało dokładnej teksturze
    // i przy niskim słońcu albo dużym modelu dawała na ścianach kwadratowe plamy.
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(35, 1, 0.1, 8000);
    this.cam.up.set(0, 0, 1);
    this.cam.position.set(30, -34, 22);
    this.cam.lookAt(4, 4, 2);
    // rzut równoległy: kamera ortograficzna podąża za perspektywiczną (ta sama orbita i kierunek)
    this.ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 12000);
    this.ortho = false; this.orthoH = 20; this.twoPoint = false; this.shift = 0;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe9e4d8, 1.6);
    this.hemi.position.set(0, 0, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.groundMat = new THREE.ShadowMaterial({ opacity: 0.24, color: 0x3b362c, depthWrite: false });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.groundMat);
    this.ground.receiveShadow = true;
    this.ground.position.z = -0.002;
    this.scene.add(this.ground);

    this.axes = this.makeAxes();
    this.scene.add(this.axes);

    this.modelGroup = new THREE.Group(); this.scene.add(this.modelGroup);
    this.underlayGroup = new THREE.Group(); this.scene.add(this.underlayGroup);
    this.previewGroup = new THREE.Group(); this.scene.add(this.previewGroup);
    this.subGroup = new THREE.Group(); this.scene.add(this.subGroup);   // zaznaczone pojedyncze ściany
    this.guideGroup = new THREE.Group(); this.scene.add(this.guideGroup);
    this.ghostGroup = new THREE.Group(); this.scene.add(this.ghostGroup);

    this.edgeMat = new THREE.ShaderMaterial({
      vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false,
      uniforms: {
        res: { value: new THREE.Vector2(1, 1) }, px: { value: 1 }, wSil: { value: 2 }, wIn: { value: 1 }, ext: { value: 8 }, wobble: { value: 1 },
        nearZ: { value: 0.05 }, fadeNear: { value: 10 }, fadeFar: { value: 80 }, ink: { value: new THREE.Color() }, inkFar: { value: new THREE.Color() },
        fade: { value: 0.8 }, opacity: { value: 1 }, paper: { value: new THREE.Color() }, fogOn: { value: 0 }, fogNear: { value: 1 }, fogFar: { value: 100 }, sectOn: { value: 0 }, sect: { value: new THREE.Vector4() }, seedOff: { value: 0 }
      }
    });
    this.edgeMesh = null;

    this.style = 'szkic';
    this.sunCfg = { date: new Date().toISOString().slice(0, 10), hour: 13, lat: 52.23, lon: 21.01, tz: 'Europe/Warsaw', shadows: true, soft: 0.45, light: 0.7 };
    this.model = null; this.selected = new Set(); this.hover = null;
    this.showAxes = true;
    this.pxScale = 1;
    this.needs = true;
    this.overlayDraw = null;   // funkcja narzędzia rysująca pomoce na nakładce 2D

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => { if (this.needs) { this.needs = false; this.render(); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  st() {
    const s = styleOf(this.style, this.dark);
    // styl Model z włączonymi krawędziami: cienkie, spokojne kreski bez drżenia
    if (this.style === 'model' && this.modelEdges) return { ...s, lines: true, wSil: 1.1, wIn: 0.6, ink: this.dark ? '#d9d6cf' : '#2b2a27', inkFar: this.dark ? '#6f6c66' : '#8c8981', fade: 0.5 };
    return s;
  }
  vc() {
    if (!this.ortho) return this.cam;
    const o = this.ocam, f = this.cam.getWorldDirection(new THREE.Vector3());
    o.position.copy(this.cam.position).addScaledVector(f, -3000);
    o.quaternion.copy(this.cam.quaternion);
    const a = this.cam.aspect;
    o.left = -this.orthoH * a; o.right = this.orthoH * a; o.top = this.orthoH; o.bottom = -this.orthoH;
    o.updateProjectionMatrix(); o.updateMatrixWorld();
    return o;
  }
  toggleOrtho() {
    const f = this.cam.getWorldDirection(new THREE.Vector3()), t = Math.tan(this.cam.fov * Math.PI / 360);
    if (!this.ortho) {
      if (this.twoPoint) this.setTwoPoint(false);
      const P = this.pivotAt(this.w / 2, this.h / 2);
      this.orthoH = Math.max(0.5, P.clone().sub(this.cam.position).dot(f) * t);
      this.ortho = true;
    } else {
      const P = this.pivotAt(this.w / 2, this.h / 2);
      this.ortho = false;
      const d = this.orthoH / t;
      const along = P.clone().sub(this.cam.position).dot(f);
      this.cam.position.addScaledVector(f, along - d);
    }
    this.needs = true;
  }
  setDark(v) { this.dark = !!v; if (this.model) this.rebuild(); else this.needs = true; }

  // osie rysowania: początek i kierunki (model.axes); bez nich — osie świata
  setAxesFrame(a) {
    const o = a ? a.o : [0, 0, 0], x = a ? a.x : [1, 0, 0], y = a ? a.y : [0, 1, 0], z = V.cross(x, y);
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)).setPosition(...o);
    this.axes.matrixAutoUpdate = false; this.axes.matrix.copy(M); this.axes.matrixWorldNeedsUpdate = true; this.needs = true;
  }
  makeAxes() {
    // osie dzielone na krótkie odcinki: linia, która w całości przechodzi za kamerę, bywa przez niektóre karty gubiona
    const g = new THREE.Group(), L = 1500, N = 150;
    const mk = (dir, color, neg) => {
      const pts = [];
      for (let i = 0; i < N; i++) { const a = (neg ? -1 : 1) * L * i / N, b = (neg ? -1 : 1) * L * (i + 1) / N; pts.push(new THREE.Vector3(...dir).multiplyScalar(a), new THREE.Vector3(...dir).multiplyScalar(b)); }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const m = neg ? new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.5, transparent: true, opacity: 0.5 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 });
      const l = new THREE.LineSegments(geo, m); if (neg) l.computeLineDistances(); l.frustumCulled = false; return l;
    };
    g.add(mk([1, 0, 0], 0xc47a6a), mk([1, 0, 0], 0xc47a6a, true), mk([0, 1, 0], 0x7d9d76), mk([0, 1, 0], 0x7d9d76, true), mk([0, 0, 1], 0x7c8fb3));
    return g;
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    const dpr = window.devicePixelRatio || 1;
    this.overlay.width = w * dpr; this.overlay.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cam.aspect = w / h; this.applyShift();
    this.needs = true;
  }

  /* ---------- model ---------- */
  setModel(model, opts = {}) {
    this.model = model;
    this.rebuild(opts);
  }
  rebuild({ highlight } = {}) {
    this.rebuilds = (this.rebuilds || 0) + 1;   // licznik dla pamięci podręcznych zależnych od geometrii (ramki grup)
    for (const c of [...this.modelGroup.children]) { if (!c.geometry.userData.cached) c.geometry.dispose(); for (const m of [].concat(c.material)) if (m.dispose && m !== this.edgeMat && !c.userData.depthOnly) m.dispose(); this.modelGroup.remove(c); }
    // Geometria ścian każdej bryły jest pamiętana, dopóki bryła się nie zmieni — zaznaczenie albo zmiana stylu
    // przebudowuje wtedy tylko materiały, a nie dziesiątki tysięcy trójkątów.
    this.shapeCache ||= new Map(); const live = new Set();
    this.edgeIndex = [];   // które krawędzie (zakres w liście) należą do której bryły albo linii — do szybkiej zmiany koloru przy zaznaczaniu
    this.editSet = this.editGroup != null ? subtreeIds(this.model, this.editGroup) : null;
    this._bounds = bounds(this.model);
    this._sunB = this.model.lines.length ? null : this._bounds;   // zasięg cienia: same bryły
    this.meshes = [];
    for (const b of this.bills || []) { b.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== this.edgeMat) o.material.dispose(); }); this.scene.remove(b.group); }
    this.bills = [];
    const st = this.st();
    const paper = new THREE.Color(st.paper);
    const chunks = []; let edgeList = [], done = 0;   // kreski: kawałki gotowe (z pamięci brył) i lista luzem
    const flush = () => { if (edgeList.length) { chunks.push({ list: edgeList }); done += edgeList.length; edgeList = []; } }, count = () => done + edgeList.length;
    const lines = st.lines || this.wire;   // w trybie siatki krawędzie są zawsze
    const GHOST = hex3(this.dark ? '#5d5d5a' : '#b9b5aa');
    // bryły wycinające: nie mają własnych ścian, odejmują się od brył, które przecinają
    const cutters = this.model.shapes.filter(s => s.op === 'cut' && !isHidden(this.model, s) && isSolid(s)).map(s => ({ s, box: boxOf(s) }));
    const polysOf = s => {
      const out = [];
      for (const f of triangulate(s)) for (const t of f.tris) {
        const g = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0]));
        out.push({ vs: V.dot(g, f.normal) < 0 ? [t[0], t[2], t[1]] : t, shared: { id: s.id, key: f.key, soft: !!s.soft } });
      }
      return out;
    };
    this._cutters = cutters.map(c => c.s);
    this.rebuildGhosts(this._cutters);
    // Ściany wszystkich brył trafiają do kilku wspólnych paczek (jedna na rodzaj materiału), więc karta graficzna dostaje
    // parę poleceń zamiast tysięcy. Osobne siatki brył zostają tylko do trafiania kursorem. Przy przekroju — po staremu.
    const batch = !(this.model.sections || []).some(q => q.on && !q.hidden), packs = new Map();
    this.batches = batch ? [] : null;
    for (const s of this.model.shapes) {
      if (s.op === 'cut') continue;
      if (isHidden(this.model, s)) {
        // ukryta geometria: schowane bryły widać jako blady obrys
        if (this.showHidden && lines) for (const e of shapeEdges(s)) edgeList.push({ ...e, col: GHOST, w: 0.7, soft: false });
        continue;
      }
      if (s.bill) { this.addBillboard(s, st, paper); continue; }
      // wspólna geometria nie musi być zamkniętą bryłą, więc bryły wycinające jej nie dotyczą (otwór robi się wypchnięciem na wylot)
      const cut = isSolid(s) && !s.geo ? cutters.filter(c => boxesTouch(c.box, boxOf(s))) : [];
      if (cut.length) { this.addCsgMesh(s, subtractAll(polysOf(s), cut.map(c => polysOf(c.s))), edgeList, st, paper); continue; }
      const sel = this.selected.has(s.id);
      const flat = s.h === 0;
      const stamp = [s.polys, s.pts, s.fc, s.softs, s.hid, s.marks, s.o, s.u, s.v, s.h, s.holes, s.alpha, s.soft];
      let cache = this.shapeCache.get(s.id); live.add(s.id);
      // po cofnięciu model jest kopią: tablice są nowe, ale treść większości brył ta sama — wtedy wystarczy porównać skrót treści
      let sig = null;
      if (cache && cache.stamp.some((x, i) => x !== stamp[i]) && (sig = shapeSig(s)) === cache.sig) cache.stamp = stamp;
      if (!cache || cache.stamp !== stamp && cache.stamp.some((x, i) => x !== stamp[i])) {
        if (cache) for (const part of cache.parts) part.geo.dispose();
        const items = [], sm = this.smoother(s);
        for (const f of triangulate(s)) for (const tri of f.tris) {
          const g = V.cross(V.sub(tri[1], tri[0]), V.sub(tri[2], tri[0])), t = V.dot(g, f.normal) < 0 ? [tri[0], tri[2], tri[1]] : tri;
          items.push({ tri: t, n: f.normal, ns: sm ? t.map(p => sm(f.key, p)) : null, key: f.key, id: s.id });
        }
        // szkło (krycie poniżej 0,6) idzie do osobnej siatki, która nie rzuca cienia — reszta bryły rzuca go normalnie
        const alphaOf = it => { const f = s.fc && s.fc[it.key]; return (f && f.a) ?? s.alpha ?? 1; };
        cache = { stamp, sig: sig ?? shapeSig(s), parts: [] };
        for (const glass of [false, true]) {
          const list = items.filter(it => (alphaOf(it) < 0.6) === glass); if (!list.length) continue;
          const part = this.faceGeo(s, list); part.glass = glass; part.geo.userData.cached = true; cache.parts.push(part);
        }
        this.shapeCache.set(s.id, cache);
      }
      for (const part of cache.parts) {
        if (batch) {
          let dbl = flat || !!s.open;
          const gs = part.groups.length ? part.groups : [{ start: 0, count: part.geo.attributes.position.count, fp: null }];
          for (const g of gs) {
            const fp = g.fp, a0 = (fp && fp.a) ?? s.alpha ?? 1, a = this.xray ? Math.min(a0, 0.32) : a0, glass = a < 0.999, tex = (fp ? fp.t : s.tex) || '';
            if (glass) dbl = true;
            const two = flat || glass || !!s.open, cast = !flat && !part.glass, key = a + '|' + tex + '|' + two + '|' + flat + '|' + cast;
            let pk = packs.get(key); if (!pk) packs.set(key, pk = { a, glass, tex, two, flat, cast, items: [], n: 0 });
            pk.items.push({ s, geo: part.geo, start: g.start, count: g.count, fp }); pk.n += g.count;
          }
          this.pickMats ||= [new THREE.MeshBasicMaterial({ side: THREE.FrontSide }), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })];
          const mesh = new THREE.Mesh(part.geo, this.pickMats[dbl ? 1 : 0]);
          mesh.userData = { shapeId: s.id, keys: part.keys, ids: part.ids, glass: part.glass };
          this.meshes.push(mesh);
          continue;
        }
        const mesh = this.meshFrom(s, part, st, paper, flat);
        mesh.castShadow = !flat && !part.glass; mesh.receiveShadow = true;
        if (part.glass || (s.alpha ?? 1) < 0.999) mesh.renderOrder = 1;
        mesh.userData.glass = part.glass;
        this.modelGroup.add(mesh); this.meshes.push(mesh);
      }
      const e0 = count();
      if (lines) {
        const col = sel ? hex3('#3f5f99') : this.dimmed(s) ? hex3(this.dark ? '#4a4a48' : '#c9c5bb') : null;
        if (isMesh(s) && !this.showHidden) {
          // krawędzie bryły, która się nie zmieniła, są pamiętane razem z jej ścianami
          if (!cache.el) { cache.el = []; for (const e of shapeEdges(s)) if (!e.hid) cache.el.push(s.soft ? { ...e, soft: true } : e); }
          flush(); chunks.push({ list: cache.el, col, cache }); done += cache.el.length;
        } else for (const e of shapeEdges(s)) {
          // krawędź dolna bryły postawionej na innej bryle to styk, nie kontur — rysujemy ją cienko
          if (!isMesh(s) && s.h > 0 && V.dot(e.n1, s.n) < -0.999) {
            const mid = V.sub(V.lerp(e.a, e.b, 0.5), V.mul(e.n2, 0.01));   // odrobinę do środka, nie na samym brzegu
            if (!e.hid && !e.soft && this.model.shapes.some(t => t !== s && !isMesh(t) && V.dot(t.n, s.n) > 0.999 && onTopOf(mid, t))) { edgeList.push({ ...e, n1: s.n, col }); continue; }
          }
          // krawędzie ukryte gumką znikają, wygładzone zostają tylko jako kontur; „ukryta geometria” pokazuje obie blado
          if (e.hid || (e.soft && this.showHidden)) { if (this.showHidden) edgeList.push({ ...e, col: GHOST, w: 0.7, soft: false }); continue; }
          edgeList.push(s.soft && isMesh(s) ? { ...e, col, soft: true } : { ...e, col });
        }
      }
      this.edgeIndex.push({ id: s.id, a: e0, b: count(), k: sel ? 1 : this.dimmed(s) ? 2 : 0 });
    }
    if (lines) for (const l of this.model.lines) {
      this.edgeIndex.push({ id: 'l' + l.id, a: count(), b: count() + (isHidden(this.model, l) ? 0 : 1), k: this.selected.has('l' + l.id) ? 1 : 0 });
      if (isHidden(this.model, l)) { if (this.showHidden) edgeList.push({ a: l.a, b: l.b, n1: [0, 0, 1], n2: null, col: GHOST, w: 0.7 }); continue; }
      const sel = this.selected.has('l' + l.id);
      edgeList.push({ a: l.a, b: l.b, n1: [0, 0, 1], n2: null, col: sel ? hex3('#3f5f99') : null, w: 0.9 });
    }
    for (const [id, c] of this.shapeCache) if (!live.has(id)) { for (const part of c.parts) part.geo.dispose(); this.shapeCache.delete(id); }
    let anyGlass = this.meshes.some(m => m.renderOrder === 1);
    for (const pk of packs.values()) {
      const pos = new Float32Array(pk.n * 3), nor = new Float32Array(pk.n * 3), uv = new Float32Array(pk.n * 2), col = new Float32Array(pk.n * 3), ranges = [];
      const map = pk.tex ? this.texture(pk.tex) : null; let at = 0;
      for (const it of pk.items) {
        const A = it.geo.attributes;
        pos.set(A.position.array.subarray(it.start * 3, (it.start + it.count) * 3), at * 3);
        nor.set(A.normal.array.subarray(it.start * 3, (it.start + it.count) * 3), at * 3);
        uv.set(A.uv.array.subarray(it.start * 2, (it.start + it.count) * 2), at * 2);
        const r = { s: it.s, c: it.fp ? it.fp.c : it.s.color, tex: !!map, a: at, n: it.count, k: this.selected.has(it.s.id) ? 1 : this.dimmed(it.s) ? 2 : 0 };
        const c = this.colorFor(it.s, st, paper, r.c, r.tex);
        for (let i = at * 3, e = (at + it.count) * 3; i < e; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
        ranges.push(r); at += it.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, this.sides(new THREE.MeshLambertMaterial({
        map, vertexColors: true, side: pk.two ? THREE.DoubleSide : THREE.FrontSide, transparent: pk.glass, opacity: pk.a, depthWrite: !pk.glass,
        polygonOffset: true, polygonOffsetFactor: pk.glass ? GLASS_OFS[0] : pk.flat ? 0.5 : 1.5, polygonOffsetUnits: pk.glass ? GLASS_OFS[1] : pk.flat ? 1 : 2
      })));
      mesh.castShadow = pk.cast; mesh.receiveShadow = true; mesh.frustumCulled = false;
      if (pk.glass) { mesh.renderOrder = 1; anyGlass = true; this.addGlassDepth(mesh); }
      this.modelGroup.add(mesh); this.batches.push({ mesh, ranges });
    }
    if (this.edgeMesh) { this.edgeMesh.geometry.dispose(); this.scene.remove(this.edgeMesh); this.edgeMesh = null; }
    if (this.edge2Mesh) { this.scene.remove(this.edge2Mesh); this.edge2Mesh = null; }
    if (this.backMesh) { this.scene.remove(this.backMesh); this.backMesh = null; }
    if (this.underMesh) { this.scene.remove(this.underMesh); this.underMesh = null; }
    flush();
    if (done) {
      this.edgeMesh = new THREE.Mesh(joinEdges(chunks, done), this.edgeMat);
      this.edgeMesh.frustumCulled = false; this.edgeMesh.renderOrder = 2;
      this.scene.add(this.edgeMesh);
      // Szkic: drugie, bledsze pociągnięcie tej samej kreski z innym drżeniem — jak ołówek prowadzony dwa razy
      if (st.strokes === 2) {
        this.edge2Mat ||= new THREE.ShaderMaterial({ vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false, uniforms: { ...this.edgeMat.uniforms, seedOff: { value: 0.437 }, opacity: { value: 0.45 } } });
        this.edge2Mesh = new THREE.Mesh(this.edgeMesh.geometry, this.edge2Mat);
        this.edge2Mesh.frustumCulled = false; this.edge2Mesh.renderOrder = 2.1;
        this.scene.add(this.edge2Mesh);
      }
      // Szkło: kreski rysują się dwa razy. Najpierw blado, pod szkłem (szyba je potem przykrywa swoim kolorem),
      // a po szkle jeszcze raz w pełni — ale tylko te, których żadna szyba nie zasłania. Dzięki temu widać, co jest za szybą, a co przed nią.
      if (anyGlass) {
        this.underMat ||= new THREE.ShaderMaterial({ vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false, uniforms: { ...this.edgeMat.uniforms, opacity: { value: 0.5 } } });
        this.underMesh = new THREE.Mesh(this.edgeMesh.geometry, this.underMat);
        this.underMesh.frustumCulled = false; this.underMesh.renderOrder = 0.5;
        this.scene.add(this.underMesh);
      }
      // krawędzie tylne: te same kreski narysowane drugi raz, blado, tylko tam, gdzie zasłania je ściana
      if (this.backEdges) {
        this.backMat ||= new THREE.ShaderMaterial({ vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth, uniforms: { ...this.edgeMat.uniforms, opacity: { value: 0.3 } } });
        this.backMesh = new THREE.Mesh(this.edgeMesh.geometry, this.backMat);
        this.backMesh.frustumCulled = false; this.backMesh.renderOrder = 0.6;
        this.scene.add(this.backMesh);
      }
    }
    this.guideGroup.visible = this.showGuides !== false;
    this.applySection(st);
    this.rebuildGuides();
    this.updateSun();
    this.needs = true;
  }

  // szyba po narysowaniu koloru zapisuje jeszcze samą głębię — po to, żeby drugi przebieg kresek wiedział, co jest za nią
  addGlassDepth(mesh) {
    this.glassDepthMat ||= [THREE.FrontSide, THREE.DoubleSide].map(side => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, transparent: true, side, polygonOffset: true, polygonOffsetFactor: GLASS_OFS[0], polygonOffsetUnits: GLASS_OFS[1] }));
    const d = new THREE.Mesh(mesh.geometry, this.glassDepthMat[1]);
    d.renderOrder = 1.5; d.frustumCulled = mesh.frustumCulled; d.userData = { depthOnly: true };
    this.modelGroup.add(d);
  }

  // Zmieniło się tylko zaznaczenie: zamiast przebudowy całej sceny poprawiamy kolory materiałów i kresek.
  // (Figury 2D, bryły wycinające i ukryta geometria mają własne zależności od zaznaczenia — wtedy pełna przebudowa.)
  reselect() {
    if (!this.model || !this.meshes || !this.edgeIndex || this.showHidden || (this.bills && this.bills.length) || (this._cutters && this._cutters.length) || this.section) return this.rebuild();
    const st = this.st(), paper = new THREE.Color(st.paper), byId = new Map(); for (const s of this.model.shapes) byId.set(s.id, s);
    for (const b of this.batches || []) {
      const attr = b.mesh.geometry.attributes.color, arr = attr.array; let dirty = false;
      for (const r of b.ranges) {
        const k = this.selected.has(r.s.id) ? 1 : this.dimmed(r.s) ? 2 : 0; if (k === r.k) continue; r.k = k; dirty = true;
        const c = this.colorFor(r.s, st, paper, r.c, r.tex);
        for (let i = r.a * 3, e = (r.a + r.n) * 3; i < e; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; }
      }
      if (dirty) attr.needsUpdate = true;
    }
    for (const mesh of this.batches ? [] : this.meshes) {
      const ud = mesh.userData, s = byId.get(ud.shapeId); if (!s || !ud.fps) continue;
      [].concat(mesh.material).forEach((mt, k) => { const fp = ud.fps[k]; mt.color.copy(this.colorFor(s, st, paper, fp ? fp.c : s.color, !!mt.map)); });
    }
    if (this.edgeMesh) {
      const attr = this.edgeMesh.geometry.attributes.col, arr = attr.array, per = this.edgeMesh.geometry.userData.seg * 4 * 3;
      const C = [[-1, -1, -1], hex3('#3f5f99'), hex3(this.dark ? '#4a4a48' : '#c9c5bb')]; let dirty = false;
      for (const en of this.edgeIndex) {
        const s = typeof en.id === 'number' ? byId.get(en.id) : null, k = this.selected.has(en.id) ? 1 : s && this.dimmed(s) ? 2 : 0;
        if (k === en.k) continue; en.k = k; dirty = true;
        const c = C[k]; for (let i = en.a * per, n = en.b * per; i < n; i += 3) { arr[i] = c[0]; arr[i + 1] = c[1]; arr[i + 2] = c[2]; }
      }
      if (dirty) attr.needsUpdate = true;
    }
    this.rebuildGuides();
    this.needs = true;
  }

  /* ---------- przekrój ---------- */
  // aktywna płaszczyzna przekroju zdejmuje stronę, w którą wskazuje jej normalna; przecięte bryły dostają wypełnienie (poché)
  applySection(st) {
    const sec = (this.model.sections || []).find(q => q.on && !q.hidden);
    this.section = sec || null;
    const u = this.edgeMat.uniforms;
    this.sectSegs = [];
    if (!sec) { this.ghostGroup.traverse(o => { if (o.material?.clippingPlanes?.length) { o.material.clippingPlanes = []; o.material.needsUpdate = true; } }); u.sectOn.value = 0; for (const m of this.meshes) for (const q of [].concat(m.material)) if (q.clippingPlanes?.length) { q.clippingPlanes = []; q.needsUpdate = true; } return; }
    const n = V.norm(sec.n), d = V.dot(n, sec.o);
    u.sectOn.value = 1; u.sect.value.set(n[0], n[1], n[2], d);
    this.clipPlane.normal.set(-n[0], -n[1], -n[2]); this.clipPlane.constant = d;
    const planes = [this.clipPlane];
    this.ghostGroup.traverse(o => { if (o.material) { o.material.clippingPlanes = planes; o.material.needsUpdate = true; } });
    const poche = new THREE.MeshBasicMaterial({ color: this.dark ? '#8d897f' : '#4f4c45', side: THREE.BackSide, clippingPlanes: planes });
    for (const m of [...this.meshes]) {
      for (const q of [].concat(m.material)) { q.clippingPlanes = planes; q.clipShadows = true; q.needsUpdate = true; }
      const sh = this.model.shapes.find(q => q.id === m.userData.shapeId);
      if (!sh || !isSolid(sh) || (sh.alpha ?? 1) < 0.6 || m.userData.glass) continue;   // szkło nie ma wypełnienia przekroju
      const back = new THREE.Mesh(m.geometry, poche); back.userData = { poche: true };
      this.modelGroup.add(back);
      // linia przekroju: przecięcie trójkątów z płaszczyzną
      const P = m.geometry.attributes.position, I = m.geometry.index, cnt = I ? I.count : P.count;
      const vtx = k => { const i = I ? I.getX(k) : k; return [P.getX(i), P.getY(i), P.getZ(i)]; };
      for (let k = 0; k + 2 < cnt; k += 3) {
        const tri = [vtx(k), vtx(k + 1), vtx(k + 2)], f = tri.map(p => V.dot(n, p) - d), pts = [];
        for (let i = 0; i < 3; i++) {
          const j = (i + 1) % 3;
          if ((f[i] > 0) !== (f[j] > 0) && Math.abs(f[i] - f[j]) > 1e-12) pts.push(V.lerp(tri[i], tri[j], f[i] / (f[i] - f[j])));
        }
        if (pts.length === 2 && V.dist(pts[0], pts[1]) > 1e-6) this.sectSegs.push(pts);
      }
    }
  }
  // obrys płaszczyzny przekroju (w oknie): prostokąt wokół modelu
  sectionCorners(sec) {
    const b = bounds(this.model) || { center: [0, 0, 0], radius: 5 };
    const n = V.norm(sec.n), c0 = V.sub(b.center, V.mul(n, V.dot(V.sub(b.center, sec.o), n)));
    const u = V.norm(Math.abs(n[2]) > 0.9 ? V.cross([1, 0, 0], n) : V.cross([0, 0, 1], n)), v = V.cross(n, u), R = b.radius * 0.75 + 0.5;
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, q]) => V.add(c0, V.add(V.mul(u, a * R), V.mul(v, q * R))));
  }
  drawSection(c, proj, scale, onScreen) {
    if (this.section && this.sectSegs.length) {
      c.save(); c.strokeStyle = this.st().ink; c.lineWidth = 2.6 * scale; c.lineCap = 'round';
      c.beginPath();
      for (const [a, b] of this.sectSegs) { const A = proj(a), B = proj(b); if (A.behind || B.behind) continue; c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); }
      c.stroke(); c.restore();
    }
    if (!onScreen || !this.showSectPlanes) return;
    for (const sec of this.model.sections || []) {
      if (sec.hidden) continue;
      const Q = this.sectionCorners(sec).map(proj); if (Q.some(q => q.behind)) continue;
      const sel = this.selected.has('s' + sec.id);
      c.save(); c.strokeStyle = sel ? '#3f5f99' : sec.on ? '#c0752f' : (this.dark ? '#77736b' : '#a8a397'); c.lineWidth = sel ? 1.6 : 1.1; c.setLineDash(sec.on ? [] : [6, 4]);
      c.beginPath(); Q.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.closePath(); c.stroke();
      // strzałki w narożnikach: w którą stronę patrzy przekrój
      const o = this.sectionCorners(sec), L = V.dist(o[0], o[1]) * 0.06;
      c.setLineDash([]);
      for (const p of o) {
        const A = proj(p), B = proj(V.sub(p, V.mul(V.norm(sec.n), L)));
        if (A.behind || B.behind) continue;
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        c.beginPath(); c.moveTo(B.x - ux * 6 + uy * 3.5, B.y - uy * 6 - ux * 3.5); c.lineTo(B.x, B.y); c.lineTo(B.x - ux * 6 - uy * 3.5, B.y - uy * 6 + ux * 3.5); c.stroke();
      }
      c.restore();
    }
  }

  // figura 2D (człowiek, drzewo): płaski obrys obracany wokół pionu tak, żeby zawsze patrzył w kamerę
  addBillboard(s, st, paper) {
    const o = s.o, pos = [], nor = [], keys = [];
    for (const f of triangulate(s)) for (const tri of f.tris) { for (const p of tri) { pos.push(p[0] - o[0], p[1] - o[1], p[2] - o[2]); nor.push(...f.normal); } keys.push(f.key); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mesh = new THREE.Mesh(geo, this.matFor(s, st, paper, true));
    mesh.castShadow = true; mesh.receiveShadow = false; mesh.userData = { shapeId: s.id, keys, bill: true };
    const group = new THREE.Group(); group.position.set(o[0], o[1], o[2]); group.add(mesh);
    if (st.lines || this.wire) {
      const col = this.selected.has(s.id) ? hex3('#3f5f99') : this.dimmed(s) ? hex3(this.dark ? '#4a4a48' : '#c9c5bb') : null;
      const list = shapeEdges(s).map(e => ({ a: V.sub(e.a, o), b: V.sub(e.b, o), n1: [0, 0, 0], n2: null, col, w: 2.1 }));
      if (list.length) { const em = new THREE.Mesh(buildEdgeGeometry(list), this.edgeMat); em.frustumCulled = false; em.renderOrder = 2; group.add(em); }
    }
    this.scene.add(group); this.meshes.push(mesh);
    this.bills.push({ group, o, n: s.n });
  }
  faceBillboards() {
    const c = this.cam.position, f = this.cam.getWorldDirection(new THREE.Vector3());
    for (const b of this.bills || []) {
      const dx = this.ortho ? -f.x : c.x - b.o[0], dy = this.ortho ? -f.y : c.y - b.o[1];
      if (Math.hypot(dx, dy) < 1e-6) continue;
      b.group.rotation.z = Math.atan2(dy, dx) - Math.atan2(b.n[1], b.n[0]);
      b.group.updateMatrixWorld(true);
    }
  }
  colorFor(s, st, paper, color = s.color, tex = false) {
    const base = new THREE.Color(tex ? '#ffffff' : color || st.wall || DEFAULT_COLOR);
    if (color || tex) base.lerp(paper, tex ? st.tint * 0.5 : st.tint);
    if (this.selected.has(s.id)) base.lerp(new THREE.Color('#9fb3d6'), 0.45);
    if (this.dimmed(s)) base.lerp(paper, 0.6);
    return base;
  }
  // przy edycji grupy reszta modelu jest przygaszona
  dimmed(s) { if (this.editSolid != null) return s.id !== this.editSolid; return this.editGroup != null && !(this.editSet && this.editSet.has(s.g)); }
  // materiał ściany: kolor, przezroczystość (szkło)
  // fp — kolor i tekstura pojedynczej ściany ({ c, t }); bez niego obowiązuje kolor całej bryły
  matFor(s, st, paper, flat, fp) {
    // prześwit: wszystkie ściany półprzezroczyste, żeby było widać, co jest w środku i z tyłu
    const a0 = (fp && fp.a) ?? s.alpha ?? 1, a = this.xray ? Math.min(a0, 0.32) : a0, glass = a < 0.999;
    const color = fp ? fp.c : s.color, tex = fp ? fp.t : s.tex, map = tex ? this.texture(tex) : null;
    return this.sides(new THREE.MeshLambertMaterial({
      map, color: this.colorFor(s, st, paper, color, !!map), side: flat || glass || s.open ? THREE.DoubleSide : THREE.FrontSide,
      transparent: glass, opacity: a, depthWrite: !glass,
      polygonOffset: true, polygonOffsetFactor: glass ? GLASS_OFS[0] : flat ? 0.5 : 1.5, polygonOffsetUnits: glass ? GLASS_OFS[1] : flat ? 1 : 2
    }));
  }
  // „Strony ścian”: ściany widać z obu stron, a tył każdej jest niebiesko-szary — od razu widać ściany odwrócone do środka
  sides(mat) {
    if (!this.faceSides) return mat;
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.47, 0.56, 0.71), 0.75);'); };
    mat.customProgramCacheKey = () => 'modo-sides';
    return mat;
  }
  // Ściany połączone wygładzoną krawędzią (np. trójkąty, na które złożyła się ściana po przesunięciu wierzchołka)
  // cieniują się jak jedna gładka powierzchnia: normalna w wierzchołku to średnia z tych ścian.
  // Zwraca funkcję (klucz ściany, punkt) → normalna albo null, gdy bryła nie ma wygładzonych krawędzi.
  smoother(s) {
    if (!isMesh(s) || !s.softs || !s.softs.length) return null;
    const soft = new Set(s.softs.map(([a, b]) => segKey(a, b))), n = s.polys.length, par = [...Array(n).keys()];
    const find = i => par[i] === i ? i : (par[i] = find(par[i])), owner = new Map();
    s.polys.forEach((p, i) => p.forEach((a, k) => { const key = segKey(a, p[(k + 1) % p.length]); if (!soft.has(key)) return; if (owner.has(key)) par[find(i)] = find(owner.get(key)); else owner.set(key, i); }));
    const K = v => Math.round(v[0] * 1e4) + ',' + Math.round(v[1] * 1e4) + ',' + Math.round(v[2] * 1e4), sum = new Map();
    s.polys.forEach((p, i) => { const g = find(i), w = V.mul(newell(p), polyArea(p)); for (const v of p) { const k = g + '|' + K(v); sum.set(k, V.add(sum.get(k) || [0, 0, 0], w)); } });
    return (key, v) => { const i = +String(key).split(':')[1], q = sum.get(find(i) + '|' + K(v)); return q ? V.norm(q) : null; };
  }
  // tekstura materiału (jedna na cały widok), powtarzana w obu kierunkach
  texture(id) {
    this.texCache ||= new Map();
    if (!this.texCache.has(id)) {
      const cv = textureCanvas(id); if (!cv) { this.texCache.set(id, null); return null; }
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const [w, h] = TEXTURES[id].size; t.repeat.set(1 / w, 1 / h);
      if (isImageMat(id)) onImageReady(id, () => { t.needsUpdate = true; this.needs = true; });
      this.texCache.set(id, t);
    }
    return this.texCache.get(id);
  }
  // zmieniony wymiar materiału z obrazu: nowa skala powtórzenia
  refreshTexture(id) { const t = this.texCache && this.texCache.get(id), T = TEXTURES[id]; if (t && T) { t.repeat.set(1 / T.size[0], 1 / T.size[1]); this.needs = true; } }
  // siatka ścian bryły. items: [{ tri, n, key, id }]; ściany z własnym kolorem albo teksturą (s.fc) dostają osobny materiał.
  // Współrzędne tekstury to metry w płaszczyźnie ściany (poziom i pion świata), więc wzór ma prawdziwą skalę.
  faceMesh(s, items, st, paper, flat) { return this.meshFrom(s, this.faceGeo(s, items), st, paper, flat); }
  // geometria ścian (pozycje, normalne, współrzędne tekstury) i podział na grupy materiałów — bez samych materiałów
  faceGeo(s, items) {
    const fc = s.fc || null, sig = it => { const f = fc && it.id === s.id && fc[it.key]; return f ? (f.c || '') + '|' + (f.t || '') + '|' + (f.a ?? '') + (f.tx ? '|' + it.key : '') : ''; };
    const order = items.map((it, i) => [sig(it), i]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]);
    const pos = [], nor = [], uv = [], keys = [], ids = [], groups = [];
    for (const [sg, i] of order) {
      const it = items[i], n = it.n;
      let u = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : V.norm(V.cross([0, 0, 1], n)); u = V.norm(V.sub(u, V.mul(n, V.dot(u, n))));
      const w = V.cross(n, u);
      if (!groups.length || groups[groups.length - 1].sig !== sg) groups.push({ sig: sg, start: keys.length * 3, count: 0, fp: sg ? fc[it.key] : null });
      groups[groups.length - 1].count += 3;
      const tx = sg && fc[it.key].tx, rc = tx ? Math.cos(-(tx.r || 0) * Math.PI / 180) : 1, rs = tx ? Math.sin(-(tx.r || 0) * Math.PI / 180) : 0;
      it.tri.forEach((p, k) => {
        const m = (it.ns && it.ns[k]) || n; pos.push(p[0], p[1], p[2]); nor.push(m[0], m[1], m[2]);
        let U = V.dot(p, u), W = V.dot(p, w);
        if (tx) { U -= tx.x || 0; W -= tx.y || 0; const U2 = U * rc - W * rs, W2 = U * rs + W * rc; U = U2 / (tx.sx || 1); W = W2 / (tx.sy || 1); }
        uv.push(U, W);
      });
      keys.push(it.key); ids.push(it.id);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (groups.length > 1) groups.forEach((g, k) => geo.addGroup(g.start, g.count, k));
    return { geo, groups, keys, ids: ids.some(i => i !== s.id) ? ids : undefined };
  }
  // siatka z zapamiętanej geometrii: materiały zależą od stylu, zaznaczenia i przygaszenia, więc powstają za każdym razem
  meshFrom(s, part, st, paper, flat) {
    const { geo, groups } = part;
    const mat = groups.length <= 1 ? this.matFor(s, st, paper, flat, groups[0]?.fp) : groups.map(g => this.matFor(s, st, paper, flat, g.fp));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { shapeId: s.id, keys: part.keys, ids: part.ids, fps: groups.length ? groups.map(g => g.fp) : [null] };
    return mesh;
  }
  // bryła z odjętymi wycięciami: siatka z wielokątów wyniku, krawędzie bez szwów
  addCsgMesh(s, polys, edgeList, st, paper) {
    const items = [];
    for (const p of polys) for (let i = 1; i + 1 < p.vs.length; i++) items.push({ tri: [p.vs[0], p.vs[i], p.vs[i + 1]], n: p.n, key: p.shared.key, id: p.shared.id });
    const mesh = this.faceMesh(s, items, st, paper, false);
    mesh.castShadow = (s.alpha ?? 1) > 0.6; mesh.receiveShadow = true;
    if (!mesh.userData.ids) mesh.userData.ids = items.map(() => s.id);
    this.modelGroup.add(mesh); this.meshes.push(mesh);
    if (st.lines || this.wire) { const col = this.selected.has(s.id) ? hex3('#3f5f99') : this.dimmed(s) ? hex3(this.dark ? '#4a4a48' : '#c9c5bb') : null; for (const e of resultEdges(polys)) edgeList.push({ ...e, col }); }
  }
  // wycięcia widać jako cienkie przerywane obrysy (nie trafiają do eksportu)
  rebuildGhosts(list) {
    for (const c of [...this.ghostGroup.children]) { c.geometry.dispose(); c.material.dispose(); this.ghostGroup.remove(c); }
    for (const s of list) {
      const pts = []; for (const e of shapeEdges(s)) pts.push(new THREE.Vector3(...e.a), new THREE.Vector3(...e.b));
      const sel = this.selected.has(s.id);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineDashedMaterial({ color: sel ? 0x3f5f99 : (this.dark ? 0x8d8d89 : 0x8a857b), dashSize: 0.15, gapSize: 0.12, transparent: true, opacity: sel ? 0.95 : 0.55, depthTest: !sel, depthWrite: false });
      const l = new THREE.LineSegments(geo, m); l.computeLineDistances(); l.renderOrder = 4;
      this.ghostGroup.add(l);
    }
  }

  // prowadnice (taśma): długie linie przerywane, jak w SketchUpie
  rebuildGuides() {
    for (const c of [...this.guideGroup.children]) { c.geometry.dispose(); c.material.dispose(); this.guideGroup.remove(c); }
    for (const g of this.model.guides || []) {
      // krótkie odcinki, jak przy osiach: linia przechodząca za kamerę bywa gubiona
      const L = 400, N = 80, pts = [];
      for (let i = 0; i < N; i++) pts.push(new THREE.Vector3(...V.add(g.o, V.mul(g.d, -L + 2 * L * i / N))), new THREE.Vector3(...V.add(g.o, V.mul(g.d, -L + 2 * L * (i + 1) / N))));
      const sel = this.selected.has('g' + g.id);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.LineDashedMaterial({ color: sel ? 0x3f5f99 : (this.dark ? 0x9aa3b5 : 0x6f7c96), dashSize: 0.3, gapSize: 0.3, transparent: true, opacity: sel ? 0.95 : 0.6, depthWrite: false });
      const l = new THREE.LineSegments(geo, m); l.computeLineDistances(); l.frustumCulled = false;
      this.guideGroup.add(l);
    }
  }

  // zaznaczone pojedyncze ściany (lista wielokątów); krawędzie rysuje nakładka 2D w app.js
  // zaznaczone krawędzie wspólnej geometrii: grube niebieskie kreski w widoku 3D, więc ściany zasłaniają te z tyłu
  setSubEdges(list) {
    if (this.subEdgeMesh) { this.subEdgeMesh.geometry.dispose(); this.scene.remove(this.subEdgeMesh); this.subEdgeMesh = null; }
    if (!list || !list.length) return this.redraw();
    // kolor podany wprost (bez przeliczania na barwy liniowe), bo shader kresek nie przelicza go z powrotem
    const col = (this.dark ? [0x8f, 0xa8, 0xd8] : [0x3f, 0x5f, 0x99]).map(x => x / 255);
    this.selEdgeMat ||= new THREE.ShaderMaterial({ vertexShader: SEL_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false, uniforms: this.edgeMat.uniforms });
    const m = new THREE.Mesh(buildEdgeGeometry(list.map(e => ({ a: e.a, b: e.b, n1: [0, 0, 1], n2: [0, 0, -1], col, w: 1 }))), this.selEdgeMat);
    m.frustumCulled = false; m.renderOrder = 3; this.scene.add(m); this.subEdgeMesh = m;
    this.redraw();
  }
  setSubFaces(polys) {
    // wszystkie zaznaczone ściany w jednym obiekcie (osobny obiekt na ścianę spowalniał obracanie przy tysiącach ścian)
    for (const c of [...this.subGroup.children]) { c.geometry.dispose(); this.subGroup.remove(c); }
    const pts = [];
    for (const verts of polys || []) for (const t of triangulatePoly(verts)) for (const p of t) pts.push(p[0], p[1], p[2]);
    if (pts.length) {
      this.subFaceMat ||= new THREE.MeshBasicMaterial({ color: 0x3f5f99, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.Mesh(g, this.subFaceMat); m.renderOrder = 2; m.frustumCulled = false;
      this.subGroup.add(m);
    }
    this.needs = true;
  }
  // podświetlenie ściany pod kursorem (push/pull) albo bryły (zaznaczanie)
  setHoverFace(verts) {
    for (const c of [...this.previewGroup.children]) { c.geometry.dispose(); this.previewGroup.remove(c); }
    if (verts) {
      // verts.region — kawałki ściany z otworami (albo złożonej z kilku wielokątów): podświetlamy całą ścianę
      const pts = []; for (const poly of verts.region || [verts]) for (const t of triangulatePoly(poly)) for (const p of t) pts.push(new THREE.Vector3(...p));
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x6b86b5, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
      m.renderOrder = 3;
      this.previewGroup.add(m);
    }
    this.needs = true;
  }

  /* ---------- styl i słońce ---------- */
  setStyle(name) {
    this.style = name;
    if (this.model) this.rebuild(); else this.needs = true;
  }
  // mgła, siatka i ukryta geometria: materiały trzeba zbudować na nowo (mgła jest wkompilowana w shader)
  setLook(o) {
    for (const k of ['fog', 'wire', 'showHidden', 'backEdges', 'showGuides', 'ao', 'modelEdges', 'faceSides']) if (k in o) this[k] = !!o[k];
    this.scene.fog = null; this.applyStyleUniforms();
    this.scene.traverse(q => { for (const m of [].concat(q.material || [])) m.needsUpdate = true; });
    if (this.model) this.rebuild(); else this.needs = true;
  }
  // rozglądanie się z miejsca: kamera obraca się wokół własnego położenia
  look(dx, dy) {
    const cam = this.cam, Z = new THREE.Vector3(0, 0, 1), fwd = cam.getWorldDirection(new THREE.Vector3());
    if (this.twoPoint) this.setTwoPoint(false);
    const right = new THREE.Vector3().crossVectors(fwd, Z).normalize();
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.z)));
    let dp = -dy * 0.004; dp = Math.max(-1.5 - pitch, Math.min(1.5 - pitch, dp));
    fwd.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(Z, -dx * 0.004).multiply(new THREE.Quaternion().setFromAxisAngle(right, dp)));
    cam.up.set(0, 0, 1); cam.lookAt(cam.position.clone().add(fwd));
    this.needs = true;
  }
  // krok w poziomie: naprzód (f), w bok (r), w górę (u) i obrót wokół pionu
  walk(f, r, u, turn) {
    const cam = this.cam, Z = new THREE.Vector3(0, 0, 1), fwd = cam.getWorldDirection(new THREE.Vector3());
    const h = new THREE.Vector3(fwd.x, fwd.y, 0); if (h.lengthSq() < 1e-9) h.set(0, 1, 0); h.normalize();
    const right = new THREE.Vector3().crossVectors(h, Z);
    cam.position.addScaledVector(h, f).addScaledVector(right, r).addScaledVector(Z, u);
    fwd.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(Z, turn));
    cam.up.set(0, 0, 1); cam.lookAt(cam.position.clone().add(fwd));
    this.needs = true;
  }
  // kamera w punkcie p; patrzy na punkt `to` albo — bez niego — poziomo w dotychczasową stronę
  placeCamera(p, to) {
    if (this.ortho) this.toggleOrtho();
    if (this.twoPoint) this.setTwoPoint(false);
    const cam = this.cam, fwd = cam.getWorldDirection(new THREE.Vector3());
    if (to) fwd.set(to[0] - p[0], to[1] - p[1], to[2] - p[2]); else fwd.setZ(0);
    if (fwd.lengthSq() < 1e-9) fwd.set(0, 1, 0);
    fwd.normalize(); if (Math.abs(fwd.z) > 0.999) fwd.set(0, 0.05, fwd.z).normalize();
    cam.position.set(p[0], p[1], p[2]); cam.up.set(0, 0, 1); cam.lookAt(cam.position.clone().add(fwd));
    this.needs = true;
  }
  setSun(cfg) { Object.assign(this.sunCfg, cfg); this.updateSun(); }
  sunInfo() { const c = this.sunCfg; return sunPosition(c.date, c.hour, c.lat, c.lon, c.tz); }
  updateSun() {
    const st = this.st(), c = this.sunCfg;
    const { alt, az } = this.sunInfo();
    const up = alt > 0;
    const dir = sunVector(Math.max(alt, 0.5), az);
    // mapa cieni obejmuje tylko bryły — duży podkład z okolicą rozmyłby cienie
    const b = (this.model && this.model.shapes.length && (this._sunB ||= bounds({ shapes: this.model.shapes, lines: [] }))) || { center: [0, 0, 0], radius: 25 };
    const R = b.radius * 1.4 + 4, ctr = new THREE.Vector3(...b.center);
    this.sun.target.position.copy(ctr);
    this.sun.position.copy(ctr).addScaledVector(new THREE.Vector3(...dir), R * 3);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = Math.max(0.1, R * 1.9); sc.far = R * 4.1;   // model mieści się w kuli o promieniu R wokół celu; ciasny zakres = dokładna głębia
    sc.updateProjectionMatrix();
    // Margines cienia rośnie z rozmiarem jednego punktu mapy cienia w modelu: przy dużym modelu punkt ma kilkanaście
    // centymetrów i stały margines dawał na ścianach kanciaste plamy („kwadraty”).
    const texel = 2 * R / this.sun.shadow.mapSize.x;
    this.sun.shadow.normalBias = Math.max(0.02, texel * 1.8); this.sun.shadow.bias = -Math.max(0.0002, texel * 0.002);
    this.sun.castShadow = c.shadows && up;
    this.sun.shadow.radius = 0.5 + c.soft * 5;
    // nisko nad horyzontem słońce słabnie; ściany w cieniu rozjaśnia światło nieba (suwak „Jasność”)
    const k = up ? Math.min(1, Math.sin(alt * Math.PI / 180) * 2.2 + 0.25) : 0;
    this.sun.intensity = 1.7 * k;
    this.hemi.intensity = 1.3 + c.light * 1.5 + (up ? 0 : 0.4);
    this.groundMat.opacity = st.shadow * (0.6 + 0.4 * k);
    this.groundMat.color.set(this.dark ? 0x000000 : 0x3b362c);
    this.ground.visible = c.shadows && up;
    const gs = Math.max(400, b.radius * 40);
    this.ground.scale.set(gs, gs, 1); this.ground.position.x = ctr.x; this.ground.position.y = ctr.y;
    this.needs = true;
  }

  /* ---------- rysowanie klatki ---------- */
  applyStyleUniforms(scale = 1, w = this.w, h = this.h) {
    const st = this.st(), u = this.edgeMat.uniforms;
    const dpr = this.renderer.getPixelRatio();
    u.res.value.set(w * dpr * scale, h * dpr * scale);
    u.px.value = dpr * scale;
    // tryb siatki w stylu bez kresek i tak rysuje krawędzie
    const noLines = this.wire && !st.lines;
    u.wSil.value = noLines ? 1.3 : st.wSil; u.wIn.value = noLines ? 1 : st.wIn; u.ext.value = st.ext; u.wobble.value = st.wobble; u.fade.value = st.fade;
    u.ink.value.set(st.ink); u.inkFar.value.set(st.inkFar);
    u.nearZ.value = this.cam.near;
    const b = this.model && (this._bounds || bounds(this.model));
    if (b) {
      const d = this.vc().position.distanceTo(new THREE.Vector3(...b.center));   // w rzucie równoległym kamera stoi daleko
      u.fadeNear.value = Math.max(0.1, d - b.radius * 0.6); u.fadeFar.value = d + b.radius * 1.2;
    }
    // mgła: od przodu modelu do dobrze za nim, w kolorze papieru (ściany przez scene.fog, krawędzie w shaderze)
    const near = b ? Math.max(0.1, u.fadeNear.value - b.radius * 0.2) : 10, far = b ? u.fadeFar.value + b.radius * 1.6 : 200;
    u.paper.value.set(st.paper); u.fogOn.value = this.fog ? 1 : 0; u.fogNear.value = near; u.fogFar.value = far;
    if (this.fog) { if (!this.scene.fog) this.scene.fog = new THREE.Fog(st.paper, near, far); this.scene.fog.color.set(st.paper); this.scene.fog.near = near; this.scene.fog.far = far; }
    else if (this.scene.fog) this.scene.fog = null;
  }
  render() {
    const st = this.st();
    this.scene.background = new THREE.Color(st.paper);
    this.axes.visible = this.showAxes;
    // siatka: same krawędzie, ściany nie są rysowane (kursor dalej je trafia)
    this.modelGroup.visible = !this.wire;
    for (const b of this.bills || []) b.group.children[0].visible = !this.wire;
    this.faceBillboards();
    this.applyStyleUniforms();
    this.renderer.render(this.scene, this.vc());
    if (this.aoOn()) { const dpr = this.renderer.getPixelRatio(); this.aoPass(null, Math.round(this.w * dpr), Math.round(this.h * dpr)); }
    this.drawOverlay();
  }
  /* ---------- cień otoczenia (styl Model) ---------- */
  // Narożniki, styk ściany z ziemią i wnęki dostają mniej światła z otoczenia. Trzy przejścia: (1) głębia i kierunki ścian
  // (tylko nieprzezroczyste ściany i ziemia — warstwa 1), (2) zasłonięcie liczone w połowie rozdzielczości (półkula
  // 16 próbek wokół punktu, promień w metrach zależny od wielkości modelu), (3) wygładzenie z uwzględnieniem głębi
  // i przyciemnienie gotowego obrazu mnożeniem. Kreski stylu Model nie istnieją, więc przyciemnienie ich nie psuje.
  aoOn() { return this.ao !== false && this.style === 'model' && !this.wire && !!this.model; }
  aoPass(target, W, H) {
    const r = this.renderer, cam = this.vc(), A = this._ao ||= this.aoInit();
    const hw = Math.max(1, W >> 1), hh = Math.max(1, H >> 1);
    if (A.w !== W || A.h !== H) { A.rtN.setSize(W, H); A.rtA.setSize(hw, hh); A.rtB.setSize(hw, hh); A.w = W; A.h = H; }
    // warstwa 1: ściany, które naprawdę coś zasłaniają
    const pick = this.pickMats || [], solid = [...(this.batches || []).map(b => b.mesh), ...this.meshes.filter(m => !pick.includes(m.material))];
    for (const m of solid) { const mats = [].concat(m.material); if (mats.every(q => !q.transparent && q.colorWrite !== false)) m.layers.enable(1); else m.layers.disable(1); }
    const b = this._bounds || bounds(this.model);
    // ziemia zasłania tylko wtedy, gdy kamera jest nad nią, a model nie schodzi pod poziom 0 (piwnica w przekroju)
    if (this.ground.visible && cam.position.z > 0 && (!b || b.lo[2] > -0.01)) this.ground.layers.enable(1); else this.ground.layers.disable(1);
    const radius = Math.min(2, Math.max(0.25, (b ? b.radius : 10) * 0.035));
    A.normal.clippingPlanes = this.section ? [this.clipPlane] : [];
    const keepMask = cam.layers.mask, keepBg = this.scene.background, keepOver = this.scene.overrideMaterial, keepFog = this.scene.fog, keepRT = r.getRenderTarget(), keepAuto = r.autoClear;
    cam.layers.set(1); this.scene.overrideMaterial = A.normal; this.scene.background = null; this.scene.fog = null;
    r.setRenderTarget(A.rtN); r.setClearColor(0x8080ff, 1); r.clear(); r.render(this.scene, cam);
    cam.layers.mask = keepMask; this.scene.overrideMaterial = keepOver; this.scene.background = keepBg; this.scene.fog = keepFog;
    const U = A.ao.uniforms; U.uProj.value.copy(cam.projectionMatrix); U.uInvProj.value.copy(cam.projectionMatrixInverse); U.uRadius.value = radius;
    // za modelem cień otoczenia gaśnie (daleka ziemia pod małym kątem dawała szary pas na horyzoncie)
    const dm = b ? this.cam.position.distanceTo(new THREE.Vector3(...b.center)) : 50, rm = b ? b.radius : 10; U.uFade.value.set(dm + rm, dm + rm * 2.5);
    U.uOff.value = this.ortho ? 3000 : 0;   // kamera rzutu równoległego stoi 3 km za zwykłą (vc)
    A.quad.material = A.ao; r.setRenderTarget(A.rtA); r.render(A.qs, A.qc);
    const Bu = A.blur.uniforms; Bu.uInvProj.value.copy(cam.projectionMatrixInverse); Bu.uTexel.value.set(1 / hw, 1 / hh); Bu.uRadius.value = radius;
    A.quad.material = A.blur; r.setRenderTarget(A.rtB); r.render(A.qs, A.qc);
    A.mul.uniforms.uStrength.value = this.dark ? 0.75 : 0.9;
    A.quad.material = A.mul; r.autoClear = false; r.setRenderTarget(target); r.render(A.qs, A.qc);
    r.autoClear = keepAuto; r.setRenderTarget(keepRT);
  }
  aoInit() {
    const rt = (w, h, depth) => { const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: !!depth }); if (depth) t.depthTexture = new THREE.DepthTexture(w, h); return t; };
    const A = { w: 0, h: 0, rtN: rt(1, 1, true), rtA: rt(1, 1), rtB: rt(1, 1) };
    A.normal = new THREE.MeshNormalMaterial({ side: THREE.DoubleSide });
    const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const VIEW = `vec3 viewPos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }`;
    A.ao = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: A.rtN.depthTexture }, tNormal: { value: A.rtN.texture }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uRadius: { value: 0.5 }, uFade: { value: new THREE.Vector2(50, 100) }, uOff: { value: 0 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tDepth, tNormal; uniform mat4 uProj, uInvProj; uniform float uRadius, uOff; uniform vec2 uFade;
        ${VIEW}
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main() {
          if (texture2D(tDepth, vUv).x >= 1.0) { gl_FragColor = vec4(1.0); return; }
          vec3 P = viewPos(vUv), N = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
          float a = hash(gl_FragCoord.xy) * 6.2831853; vec3 rnd = vec3(cos(a), sin(a), 0.3);
          vec3 T = normalize(rnd - N * dot(rnd, N)), B = cross(N, T);
          float occ = 0.0, dist = max(0.0, length(P) - uOff), bias = uRadius * 0.03 + dist * 0.0015;
          for (int i = 0; i < 16; i++) {
            float f = (float(i) + 0.5) / 16.0, th = float(i) * 2.39996 + a, z = sqrt(1.0 - f), rr = sqrt(f);
            float len = mix(0.15, 1.0, f * f);
            vec3 S = P + (T * cos(th) * rr + B * sin(th) * rr + N * z) * uRadius * len;
            vec4 c = uProj * vec4(S, 1.0); vec2 suv = c.xy / c.w * 0.5 + 0.5;
            if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || texture2D(tDepth, suv).x >= 1.0) continue;
            float sz = viewPos(suv).z;
            occ += (sz >= S.z + bias ? 1.0 : 0.0) * smoothstep(0.0, 1.0, uRadius / abs(P.z - sz));
          }
          gl_FragColor = vec4(vec3(clamp(1.0 - occ / 16.0 * 1.35 * (1.0 - smoothstep(uFade.x, uFade.y, dist)), 0.0, 1.0)), 1.0);
        }`
    });
    // wygładzenie 5×5 tylko w obrębie podobnej głębi (bez jasnych i ciemnych obwódek na brzegach brył)
    A.blur = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: A.rtA.texture }, tDepth: { value: A.rtN.depthTexture }, uInvProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.5 } },
      vertexShader: VS, depthTest: false, depthWrite: false,
      fragmentShader: `varying vec2 vUv; uniform sampler2D tAO, tDepth; uniform mat4 uInvProj; uniform vec2 uTexel; uniform float uRadius;
        ${VIEW}
        void main() {
          float z0 = viewPos(vUv).z, sum = 0.0, wsum = 0.0;
          for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) {
            vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
            float w = abs(viewPos(uv).z - z0) < uRadius * 0.5 ? 1.0 : 0.0;
            sum += texture2D(tAO, uv).r * w; wsum += w;
          }
          gl_FragColor = vec4(vec3(wsum > 0.0 ? sum / wsum : 1.0), 1.0);
        }`
    });
    A.mul = new THREE.ShaderMaterial({
      uniforms: { tAO: { value: A.rtB.texture }, uStrength: { value: 0.9 } }, vertexShader: VS,
      fragmentShader: 'varying vec2 vUv; uniform sampler2D tAO; uniform float uStrength; void main() { gl_FragColor = vec4(vec3(mix(1.0, texture2D(tAO, vUv).r, uStrength)), 1.0); }',
      blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthTest: false, depthWrite: false
    });
    A.qs = new THREE.Scene(); A.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    A.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), A.ao); A.quad.frustumCulled = false; A.qs.add(A.quad);
    return A;
  }
  drawOverlay() {
    const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
    if (this.model) this.drawSection(c, p => this.toScreen(p), 1, true);
    if (this.annotDraw) this.annotDraw(c, p => this.toScreen(p), 1);
    if (this.overlayDraw) this.overlayDraw(c, this);
  }
  redraw() { this.needs = true; }

  // obraz PNG w dowolnej rozdzielczości; grubość linii rośnie razem z rozdzielczością
  async exportPng(W, H, { transparent = false, axes = false, underlay = false, dark = this.dark, guides = false, minLine = 0 } = {}) {
    // w eksporcie bez zaznaczenia i bez przygaszenia przy edycji grupy
    const keepSel = [...this.selected], keepEdit = this.editGroup, keepSolid = this.editSolid;
    this.selected.clear(); this.editGroup = null; this.editSolid = null;
    // zaznaczone ściany i krawędzie też nie trafiają do obrazu
    const keepSubE = this.subEdgeMesh?.visible, keepSubF = this.subGroup.visible;
    if (this.subEdgeMesh) this.subEdgeMesh.visible = false; this.subGroup.visible = false;
    const keepDark = this.dark; this.dark = dark; this.rebuild();
    const keepGuides = this.guideGroup.visible; this.guideGroup.visible = guides; this.ghostGroup.visible = false;
    const r = this.renderer, st = this.st();
    const keepAxes = this.showAxes, keepUnder = this.underlayGroup.visible, keepMap = this.sun.shadow.mapSize.x;
    this.showAxes = axes; this.axes.visible = axes; this.underlayGroup.visible = underlay && keepUnder;
    this.sun.shadow.mapSize.set(8192, 8192); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    const aspect = this.cam.aspect; this.cam.aspect = W / H; this.cam.updateProjectionMatrix();
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const bg = this.scene.background; this.scene.background = transparent ? null : new THREE.Color(st.paper);
    const dpr = r.getPixelRatio();
    // skala linii: ten sam wygląd co w oknie, tylko w większej rozdzielczości
    const scale = Math.max(minLine, W / (this.w * dpr));   // minLine: miniatury — kreski nie mogą zniknąć
    this.applyStyleUniforms(scale, this.w, this.h);
    this.edgeMat.uniforms.res.value.set(W, H);
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, this.vc()); if (this.aoOn()) { const k = Math.min(1, 2400 / Math.max(W, H)); this.aoPass(rt, Math.round(W * k), Math.round(H * k)); } r.setRenderTarget(null);
    const px = new Uint8Array(W * H * 4);
    r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    // wymiary i opisy: osobna warstwa 2D w rozdzielczości eksportu (rzut kamerą eksportu)
    let ann = null;
    if (this.annotDraw) {
      ann = document.createElement('canvas'); ann.width = W; ann.height = H;
      const vc = this.vc(), proj = p => { const q = new THREE.Vector3(p[0], p[1], p[2]).project(vc); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, behind: q.z > 1 }; };
      this.annotDraw(ann.getContext('2d'), proj, W / this.w, { dark, paper: transparent ? null : st.paper });
    }
    if (this.section) { if (!ann) { ann = document.createElement('canvas'); ann.width = W; ann.height = H; } const vc = this.vc(); this.drawSection(ann.getContext('2d'), p => { const q = new THREE.Vector3(p[0], p[1], p[2]).project(vc); return { x: (q.x + 1) / 2 * W, y: (1 - q.y) / 2 * H, behind: q.z > 1 }; }, W / this.w, false); }
    rt.dispose();
    this.scene.background = bg; this.cam.aspect = aspect; this.cam.updateProjectionMatrix();
    this.showAxes = keepAxes; this.underlayGroup.visible = keepUnder; this.guideGroup.visible = keepGuides; this.ghostGroup.visible = true; if (this.subEdgeMesh) this.subEdgeMesh.visible = keepSubE; this.subGroup.visible = keepSubF;
    keepSel.forEach(i => this.selected.add(i)); this.editGroup = keepEdit; this.editSolid = keepSolid; this.dark = keepDark; this.rebuild();
    this.sun.shadow.mapSize.set(keepMap, keepMap); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null;
    this.needs = true;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    cx.putImageData(img, 0, 0);
    if (ann) cx.drawImage(ann, 0, 0);
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }

  /* ---------- rzutowanie i promienie ---------- */
  ray(x, y) {
    const v = new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(v, this.vc());
    return rc.ray;
  }
  toScreen(p) {
    const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.vc());
    return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, behind: v.z > 1 };
  }
  // ściana pod kursorem: { shapeId, key, point, normal }
  pick(x, y) {
    const rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1), this.vc());
    let hits = rc.intersectObjects(this.meshes || [], false);
    // przy przekroju trafienia w zdjętą część się nie liczą
    if (this.section) { const n = V.norm(this.section.n), d = V.dot(n, this.section.o); hits = hits.filter(h => n[0] * h.point.x + n[1] * h.point.y + n[2] * h.point.z - d <= 1e-6); }
    // ściany w tej samej płaszczyźnie (np. ściana z odsunięcia na dachu bryły): wygrywa płaska, potem nowsza
    if (hits.length > 1) {
      const d0 = hits[0].distance, eps = Math.max(1e-4, d0 * 1e-5);
      const near = hits.filter(h => h.distance - d0 < eps);
      const flat = id => (this.model.shapes.find(s => s.id === id) || {}).h === 0 ? 1 : 0;
      near.sort((a, b) => flat(b.object.userData.shapeId) - flat(a.object.userData.shapeId) || b.object.userData.shapeId - a.object.userData.shapeId);
      hits.splice(0, near.length, ...near);
    }
    // zablokowane bryły są nietykalne: kursor ich nie chwyta
    const locked = new Set(); for (const s of this.model.shapes) if (s.locked) locked.add(s.id);
    for (const h of hits) {
      const ud = h.object.userData, key = ud.keys[h.faceIndex];
      if (!key) continue;
      if (locked.size && locked.has(ud.ids ? ud.ids[h.faceIndex] : ud.shapeId)) continue;
      return { shapeId: ud.ids ? ud.ids[h.faceIndex] : ud.shapeId, key, solidId: ud.shapeId, point: [h.point.x, h.point.y, h.point.z], normal: h.face ? [h.face.normal.x, h.face.normal.y, h.face.normal.z] : [0, 0, 1], dist: h.distance };
    }
    return null;
  }
  // punkt na płaszczyźnie (o, n) pod kursorem
  onPlane(x, y, o, n) {
    const ray = this.ray(x, y);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...n), new THREE.Vector3(...o));
    const p = new THREE.Vector3();
    if (!ray.intersectPlane(pl, p)) return null;
    if (p.distanceTo(this.cam.position) > 20000) return null;
    return [p.x, p.y, p.z];
  }
  // najbliższy kursorowi punkt prostej (o, d): zwraca { p, t }
  onLine(x, y, o, d) {
    const ray = this.ray(x, y);
    const P = new THREE.Vector3(...o), D = new THREE.Vector3(...d).normalize();
    const w0 = new THREE.Vector3().subVectors(ray.origin, P);
    const a = ray.direction.dot(ray.direction), b = ray.direction.dot(D), c = D.dot(D), dd = ray.direction.dot(w0), e = D.dot(w0);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return null;
    const t = (a * e - b * dd) / den;
    return { p: [P.x + D.x * t, P.y + D.y * t, P.z + D.z * t], t };
  }
  pixelSize(p) {
    // rozmiar piksela w metrach w odległości punktu p (do tolerancji)
    if (this.ortho) return 2 * this.orthoH / this.h;
    const d = this.cam.position.distanceTo(new THREE.Vector3(...p));
    return 2 * d * Math.tan(this.cam.fov * Math.PI / 360) / this.h;
  }

  /* ---------- nawigacja ---------- */
  pivotAt(x, y) {
    const hit = this.pick(x, y);
    if (hit) return new THREE.Vector3(...hit.point);
    const g = this.onPlane(x, y, [0, 0, 0], [0, 0, 1]);
    if (g && V.dist(g, this.cam.position.toArray()) < 3000) return new THREE.Vector3(...g);
    const ray = this.ray(x, y);
    const b = this.model && bounds(this.model);
    const d = b ? this.cam.position.distanceTo(new THREE.Vector3(...b.center)) : 40;
    return ray.origin.clone().addScaledVector(ray.direction, d);
  }
  orbit(dx, dy, pivot) {
    const cam = this.cam, Z = new THREE.Vector3(0, 0, 1);
    if (this.twoPoint) {
      // perspektywa dwupunktowa: obrót tylko wokół pionu, ruch w pionie przesuwa obiektyw (piony zostają pionowe)
      const q = new THREE.Quaternion().setFromAxisAngle(Z, -dx * 0.006);
      const fwd = cam.getWorldDirection(new THREE.Vector3()).applyQuaternion(q);
      cam.position.sub(pivot).applyQuaternion(q).add(pivot);
      cam.up.set(0, 0, 1); cam.lookAt(cam.position.clone().add(fwd));
      this.shift = Math.max(-3, Math.min(3, this.shift - dy * 0.006 / Math.tan(cam.fov * Math.PI / 360)));
      this.applyShift(); this.needs = true; return;
    }
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, Z).normalize();
    const pitchNow = Math.asin(Math.max(-1, Math.min(1, fwd.z)));
    let dp = dy * 0.006;
    const lim = 1.55;
    if (pitchNow - dp > lim) dp = pitchNow - lim;
    if (pitchNow - dp < -lim) dp = pitchNow + lim;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(Z, -dx * 0.006);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dp);
    const q = qYaw.multiply(qPitch);
    cam.position.sub(pivot).applyQuaternion(q).add(pivot);
    fwd.applyQuaternion(q);
    cam.up.set(0, 0, 1);
    cam.lookAt(cam.position.clone().add(fwd));
    this.needs = true;
  }
  pan(dx, dy, pivot) {
    const cam = this.cam;
    const d = pivot ? pivot.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())) : 30;
    const s = this.ortho ? 2 * this.orthoH / this.h : 2 * Math.max(d, 0.1) * Math.tan(cam.fov * Math.PI / 360) / this.h;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
    this.needs = true;
  }
  zoomAt(x, y, factor) {
    // factor > 1 przybliża; kamera jedzie w stronę punktu pod kursorem
    const target = this.pivotAt(x, y);
    const cam = this.cam;
    if (this.ortho) {
      // rzut równoległy: zmienia się skala, a punkt pod kursorem zostaje na miejscu
      const a = this.toScreen(target.toArray());
      this.orthoH = Math.max(0.05, this.orthoH / factor);
      const b = this.toScreen(target.toArray());
      this.pan(a.x - b.x, a.y - b.y);
      this.needs = true; return;
    }
    const dist = cam.position.distanceTo(target);
    let k = 1 - 1 / factor;
    if (factor > 1 && dist * (1 - k) < 0.3) k = Math.max(0, 1 - 0.3 / dist);
    cam.position.lerp(target, k);
    this.needs = true;
  }
  // widoki standardowe: kierunek patrzenia kamery
  setView(name) {
    const D = { top: [0, 0.0001, -1], bottom: [0, 0.0001, 1], front: [0, 1, 0], back: [0, -1, 0], right: [-1, 0, 0], left: [1, 0, 0], iso: [-1, 1, -0.82] }[name];
    if (!D) return;
    if ((name === 'top' || name === 'bottom') && this.twoPoint) this.setTwoPoint(false);
    const f = new THREE.Vector3(...D).normalize();
    this.cam.up.set(0, 0, 1); this.cam.lookAt(this.cam.position.clone().add(f));
    this.zoomExtents();
  }
  setTwoPoint(on) {
    const cam = this.cam;
    if (on) {
      if (this.ortho) this.toggleOrtho();
      const f = cam.getWorldDirection(new THREE.Vector3()), p = Math.asin(Math.max(-0.99, Math.min(0.99, f.z)));
      if (Math.abs(f.z) > 0.97) f.set(0, 1, 0); else f.setZ(0).normalize();
      this.shift = Math.max(-3, Math.min(3, Math.tan(p) / Math.tan(cam.fov * Math.PI / 360)));
      cam.up.set(0, 0, 1); cam.lookAt(cam.position.clone().add(f));
      this.twoPoint = true;
    } else { this.twoPoint = false; this.shift = 0; }
    this.applyShift(); this.needs = true;
  }
  applyShift() {
    const cam = this.cam;
    if (this.twoPoint && this.shift) cam.setViewOffset(this.w, this.h, 0, -this.shift * this.h / 2, this.w, this.h); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
  setFov(deg) { this.cam.fov = Math.max(10, Math.min(110, deg)); this.cam.updateProjectionMatrix(); this.needs = true; }
  zoomExtents(only) {
    if (this.twoPoint) { this.shift = 0; this.applyShift(); }
    const b = this.model && (only?.length ? bounds(this.model, null, only) : bounds(this.model, this.underlayBounds));
    const cam = this.cam;
    const center = b ? new THREE.Vector3(...b.center) : new THREE.Vector3(0, 0, 0);
    const r = b ? b.radius : 15;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const d = r / Math.sin(Math.min(cam.fov, cam.fov * cam.aspect) * Math.PI / 360) * 1.05;
    cam.position.copy(center).addScaledVector(fwd, -d);
    if (this.ortho) this.orthoH = r * 1.08 / Math.min(1, cam.aspect);
    cam.lookAt(center);
    this.needs = true;
  }
  getCamera() { const f = this.cam.getWorldDirection(new THREE.Vector3()); return { p: this.cam.position.toArray(), f: f.toArray(), fov: this.cam.fov, ortho: this.ortho, orthoH: this.orthoH, twoPoint: !!this.twoPoint, shift: this.shift || 0 }; }
  setCamera(c) {
    if (!c) return;
    this.cam.position.fromArray(c.p); if (c.fov) this.cam.fov = c.fov;
    this.ortho = !!c.ortho; if (c.orthoH) this.orthoH = c.orthoH;
    this.cam.up.set(0, 0, 1); this.cam.lookAt(this.cam.position.clone().add(new THREE.Vector3().fromArray(c.f)));
    this.twoPoint = !!c.twoPoint && !this.ortho; this.shift = this.twoPoint ? c.shift || 0 : 0;
    this.applyShift(); this.needs = true;
  }

  /* ---------- podkład CAD ---------- */
  setUnderlay(u) {
    for (const c of [...this.underlayGroup.children]) { if (c === this.imageGroup) continue; c.geometry.dispose(); c.material.dispose(); this.underlayGroup.remove(c); }
    this.cadBounds = null; this.joinUnderBounds();
    if (!u) { this.needs = true; return; }
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const L of u.layers) {
      if (!L.visible || !L.segs.length) continue;
      const pos = new Float32Array(L.segs.length / 2 * 3);
      for (let i = 0, j = 0; i < L.segs.length; i += 2, j += 3) {
        pos[j] = L.segs[i]; pos[j + 1] = L.segs[i + 1]; pos[j + 2] = u.height;
        if (L.segs[i] < lo[0]) lo[0] = L.segs[i]; if (L.segs[i] > hi[0]) hi[0] = L.segs[i];
        if (L.segs[i + 1] < lo[1]) lo[1] = L.segs[i + 1]; if (L.segs[i + 1] > hi[1]) hi[1] = L.segs[i + 1];
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.LineBasicMaterial({ color: new THREE.Color(L.color), transparent: true, opacity: u.opacity, depthWrite: false });
      const ls = new THREE.LineSegments(g, m); ls.renderOrder = 1;
      this.underlayGroup.add(ls);
    }
    if (lo[0] !== Infinity) this.cadBounds = [[lo[0], lo[1], u.height], [hi[0], hi[1], u.height]];
    this.joinUnderBounds(); this.updateSun();
  }
  setImageOpacity(o) { for (const c of this.imageGroup?.children || []) c.material.opacity = o; this.needs = true; }
  joinUnderBounds() {
    const L = [this.cadBounds, this.imgBounds].filter(Boolean);
    this.underlayBounds = L.length ? [[0, 1, 2].map(k => Math.min(...L.map(b => b[0][k]))), [0, 1, 2].map(k => Math.max(...L.map(b => b[1][k])))] : null;
  }
  // Podkład z obrazu (rzut, mapa, zdjęcie): płaski prostokąt w poziomie na wysokości `height`, środek (x, y), szerokość w
  // metrach `w`, obrót `rot` w stopniach. Leży w tej samej grupie co podkład CAD (widoczność, eksport PNG).
  setImageUnder(u) {
    if (!this.imageGroup) { this.imageGroup = new THREE.Group(); this.underlayGroup.add(this.imageGroup); }
    for (const c of [...this.imageGroup.children]) { c.geometry.dispose(); c.material.dispose(); this.imageGroup.remove(c); }
    this.imgBounds = null;
    if (this._imgTex && (!u || this._imgTex.data !== u.data)) { this._imgTex.tex.dispose(); this._imgTex = null; }
    if (u) {
      if (!this._imgTex) { const t = new THREE.TextureLoader().load(u.data, () => { this.needs = true; }); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; this._imgTex = { data: u.data, tex: t }; }
      const h = u.w * u.px[1] / u.px[0], tex = this._imgTex.tex;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(u.w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: u.opacity ?? 0.7, depthWrite: false, side: THREE.DoubleSide }));
      mesh.position.set(u.x || 0, u.y || 0, (u.height || 0) - 0.001); mesh.rotation.z = (u.rot || 0) * Math.PI / 180; mesh.renderOrder = -1;
      this.imageGroup.add(mesh);
      const c = Math.cos(mesh.rotation.z), s = Math.sin(mesh.rotation.z), xs = [], ys = [];
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = a * u.w / 2, py = b * h / 2; xs.push((u.x || 0) + px * c - py * s); ys.push((u.y || 0) + px * s + py * c); }
      this.imgBounds = [[Math.min(...xs), Math.min(...ys), u.height || 0], [Math.max(...xs), Math.max(...ys), u.height || 0]];
    }
    this.joinUnderBounds(); this.needs = true;
  }
}
