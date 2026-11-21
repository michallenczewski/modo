// Widok 3D: scena three.js z osią Z w górę, nawigacja jak w SketchUpie, słońce z miękkimi cieniami
// i szkicowe krawędzie rysowane własnym shaderem (przedłużenia za narożniki, drżenie, grubszy kontur, zanikanie w głębi).

import * as THREE from './vendor/three.module.js';
import { triangulate, edges as shapeEdges, bounds, onTopOf, boxOf, boxesTouch, subtreeIds, isSolid, V } from './model.js';
import { triangulatePoly, isMesh } from './mesh.js';
import { subtractAll, resultEdges } from './csg.js';
import { sunPosition, sunVector } from './sun.js';

/* ---------- style rysunku ---------- */
export const STYLES = {
  szkic: { name: 'Szkic', paper: '#f3f1ea', ink: '#24221e', inkFar: '#8f8a80', wSil: 2.1, wIn: 0.95, ext: 9, wobble: 1.1, fade: 0.8, lines: true, shadow: 0.24, tint: 0.3 },
  kreska: { name: 'Kreska', paper: '#ffffff', ink: '#1f1f1d', inkFar: '#9a9893', wSil: 1.6, wIn: 0.8, ext: 0, wobble: 0, fade: 0.6, lines: true, shadow: 0.16, tint: 0.15 },
  model: { name: 'Model', paper: '#efede8', ink: '#000000', inkFar: '#000000', wSil: 0, wIn: 0, ext: 0, wobble: 0, fade: 0, lines: false, shadow: 0.3, tint: 0 }
};
// tryb ciemny: ciemny papier, jasna kreska, przygaszone ściany (kolory jak w ciemnej Gapie)
const DARK = {
  szkic: { paper: '#1b1b1a', ink: '#e6e2d8', inkFar: '#77736b', shadow: 0.55, wall: '#4d4b47' },
  kreska: { paper: '#161616', ink: '#e9e9e7', inkFar: '#77776f', shadow: 0.5, wall: '#4a4a48' },
  model: { paper: '#1d1d1c', ink: '#000000', inkFar: '#000000', shadow: 0.6, wall: '#6a6863' }
};
export const DEFAULT_COLOR = '#f6f4ee';
export const styleOf = (name, dark) => dark ? { ...STYLES[name], ...DARK[name] } : STYLES[name];

/* ---------- shader krawędzi ---------- */
const EDGE_VS = `
uniform vec2 res; uniform float px, wSil, wIn, ext, wobble, nearZ, fadeNear, fadeFar, sectOn; uniform vec4 sect;
attribute vec3 ea, eb, n1, n2, col; attribute float t, side, seed, hasN2, wmul, soft;
varying float vHalf, vD, vFade; varying vec3 vCol;
void main(){
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
  if (t <= 0.0 && ta <= 0.0) s -= dir * e * (0.7 + 0.6 * fract(seed * 7.13));
  if (t >= 1.0 && tb >= 1.0) s += dir * e * (0.7 + 0.6 * fract(seed * 3.71));
  float amp = wobble * px * (fract(seed * 13.37) - 0.5) * 2.0 * min(1.0, L / (60.0 * px));
  s += nrm * amp * sin(3.14159 * tt) + nrm * amp * 0.35 * sin(6.28318 * tt + seed * 6.0);
  vec3 wp = mix(ea, eb, tt);
  vec3 vd = normalize(cameraPosition - wp);
  float f1 = dot(n1, vd), f2 = hasN2 > 0.5 ? dot(n2, vd) : -1.0;
  bool sil = (f1 > 0.0) != (f2 > 0.0);
  float w = (sil ? wSil : (soft > 0.5 ? 0.0 : wIn)) * px * wmul;
  if (w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vHalf = w * 0.5;
  vD = side * (vHalf + px);
  s += nrm * vD;
  vFade = clamp((-vp.z - fadeNear) / max(fadeFar - fadeNear, 0.001), 0.0, 1.0);
  vCol = col;
  gl_Position = vec4(s / (0.5 * res) * cp.w, cp.z - 0.00004 * cp.w, cp.w);
}`;
const EDGE_FS = `
uniform vec3 ink, inkFar; uniform float fade, px, opacity;
varying float vHalf, vD, vFade; varying vec3 vCol;
void main(){
  float a = clamp(vHalf + 0.5 * px - abs(vD), 0.0, px) / px;
  if (a <= 0.0) discard;
  vec3 c = vCol.r < 0.0 ? mix(ink, inkFar, vFade * fade) : vCol;
  gl_FragColor = vec4(c, a * opacity * (1.0 - 0.55 * vFade * fade));
}`;

const SEG = 6;   // każda krawędź dzielona na odcinki, żeby linia mogła lekko falować

function buildEdgeGeometry(list) {
  // list: [{ a, b, n1, n2, col:[r,g,b]|null, w }]
  const nQ = list.length * SEG, nV = nQ * 4;
  const A = k => new Float32Array(nV * k);
  const ea = A(3), eb = A(3), n1 = A(3), n2 = A(3), col = A(3), pos = A(3), t = A(1), side = A(1), seed = A(1), hasN2 = A(1), wmul = A(1), soft = A(1);
  const idx = new Uint32Array(nQ * 6);
  let v = 0, q = 0;
  for (let k = 0; k < list.length; k++) {
    const E = list[k];
    const sd = Math.abs(Math.sin((E.a[0] * 12.9898 + E.a[1] * 78.233 + E.b[0] * 37.719 + E.b[2] * 4.581 + E.b[1] * 1.37) * 43758.5453)) % 1;
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG, t1 = (s + 1) / SEG;
      for (const [tv, sv] of [[t0, -1], [t0, 1], [t1, -1], [t1, 1]]) {
        ea.set(E.a, v * 3); eb.set(E.b, v * 3); n1.set(E.n1, v * 3); if (E.n2) n2.set(E.n2, v * 3);
        col.set(E.col || [-1, -1, -1], v * 3);
        pos.set(V.lerp(E.a, E.b, tv), v * 3);
        t[v] = tv; side[v] = sv; seed[v] = sd; hasN2[v] = E.n2 ? 1 : 0; wmul[v] = E.w || 1; soft[v] = E.soft ? 1 : 0;
        v++;
      }
      const b = v - 4;
      idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], q * 6); q++;
    }
  }
  const g = new THREE.BufferGeometry();
  const at = (n, arr, k) => g.setAttribute(n, new THREE.BufferAttribute(arr, k));
  at('position', pos, 3); at('ea', ea, 3); at('eb', eb, 3); at('n1', n1, 3); at('n2', n2, 3); at('col', col, 3);
  at('t', t, 1); at('side', side, 1); at('seed', seed, 1); at('hasN2', hasN2, 1); at('wmul', wmul, 1); at('soft', soft, 1);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

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
    r.shadowMap.type = THREE.VSMShadowMap;
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
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.blurSamples = 16;
    this.sun.shadow.radius = 6;
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
    this.guideGroup = new THREE.Group(); this.scene.add(this.guideGroup);
    this.ghostGroup = new THREE.Group(); this.scene.add(this.ghostGroup);

    this.edgeMat = new THREE.ShaderMaterial({
      vertexShader: EDGE_VS, fragmentShader: EDGE_FS, transparent: true, depthWrite: false,
      uniforms: {
        res: { value: new THREE.Vector2(1, 1) }, px: { value: 1 }, wSil: { value: 2 }, wIn: { value: 1 }, ext: { value: 8 }, wobble: { value: 1 },
        nearZ: { value: 0.05 }, fadeNear: { value: 10 }, fadeFar: { value: 80 }, ink: { value: new THREE.Color() }, inkFar: { value: new THREE.Color() },
        fade: { value: 0.8 }, opacity: { value: 1 }, sectOn: { value: 0 }, sect: { value: new THREE.Vector4() }
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

  st() { return styleOf(this.style, this.dark); }
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
    for (const c of [...this.modelGroup.children]) { c.geometry.dispose(); if (c.material.dispose && c.material !== this.edgeMat) c.material.dispose(); this.modelGroup.remove(c); }
    this.meshes = [];
    const st = this.st();
    const paper = new THREE.Color(st.paper);
    const edgeList = [];
    // bryły wycinające: nie mają własnych ścian, odejmują się od brył, które przecinają
    this.editSet = this.editGroup != null ? subtreeIds(this.model, this.editGroup) : null;
    const cutters = this.model.shapes.filter(s => s.op === 'cut' && !s.hidden && isSolid(s)).map(s => ({ s, box: boxOf(s) }));
    const polysOf = s => {
      const out = [];
      for (const f of triangulate(s)) for (const t of f.tris) {
        const g = V.cross(V.sub(t[1], t[0]), V.sub(t[2], t[0]));
        out.push({ vs: V.dot(g, f.normal) < 0 ? [t[0], t[2], t[1]] : t, shared: { id: s.id, key: f.key, soft: !!s.soft } });
      }
      return out;
    };
    this.rebuildGhosts(cutters.map(c => c.s));
    for (const s of this.model.shapes) {
      if (s.hidden || s.op === 'cut') continue;
      const cut = isSolid(s) ? cutters.filter(c => boxesTouch(c.box, boxOf(s))) : [];
      if (cut.length) { this.addCsgMesh(s, subtractAll(polysOf(s), cut.map(c => polysOf(c.s))), edgeList, st, paper); continue; }
      const pos = [], nor = [], keys = [];
      for (const f of triangulate(s)) {
        const n = new THREE.Vector3(...f.normal);
        for (const tri of f.tris) {
          const [a, b, c] = tri.map(p => new THREE.Vector3(...p));
          const g = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
          const ord = g.dot(n) < 0 ? [a, c, b] : [a, b, c];
          for (const p of ord) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
          keys.push(f.key);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      const sel = this.selected.has(s.id);
      const flat = s.h === 0;
      const mesh = new THREE.Mesh(geo, this.matFor(s, st, paper, flat));
      mesh.castShadow = !flat && (s.alpha ?? 1) > 0.6; mesh.receiveShadow = true;
      if ((s.alpha ?? 1) < 0.999) mesh.renderOrder = 1;
      mesh.userData = { shapeId: s.id, keys };
      this.modelGroup.add(mesh); this.meshes.push(mesh);
      if (st.lines) {
        const col = sel ? hex3('#3f5f99') : this.dimmed(s) ? hex3(this.dark ? '#4a4a48' : '#c9c5bb') : null;
        for (const e of shapeEdges(s)) {
          // krawędź dolna bryły postawionej na innej bryle to styk, nie kontur — rysujemy ją cienko
          if (!isMesh(s) && s.h > 0 && V.dot(e.n1, s.n) < -0.999) {
            const mid = V.sub(V.lerp(e.a, e.b, 0.5), V.mul(e.n2, 0.01));   // odrobinę do środka, nie na samym brzegu
            if (this.model.shapes.some(t => t !== s && !isMesh(t) && V.dot(t.n, s.n) > 0.999 && onTopOf(mid, t))) { edgeList.push({ ...e, n1: s.n, col }); continue; }
          }
          edgeList.push({ ...e, col });
        }
      }
    }
    if (st.lines) for (const l of this.model.lines) {
      if (l.hidden) continue;
      const sel = this.selected.has('l' + l.id);
      edgeList.push({ a: l.a, b: l.b, n1: [0, 0, 1], n2: null, col: sel ? hex3('#3f5f99') : null, w: 0.9 });
    }
    if (this.edgeMesh) { this.edgeMesh.geometry.dispose(); this.scene.remove(this.edgeMesh); this.edgeMesh = null; }
    if (edgeList.length) {
      this.edgeMesh = new THREE.Mesh(buildEdgeGeometry(edgeList), this.edgeMat);
      this.edgeMesh.frustumCulled = false; this.edgeMesh.renderOrder = 2;
      this.scene.add(this.edgeMesh);
    }
    this.applySection(st);
    this.rebuildGuides();
    this.updateSun();
    this.needs = true;
  }

  /* ---------- przekrój ---------- */
  // aktywna płaszczyzna przekroju zdejmuje stronę, w którą wskazuje jej normalna; przecięte bryły dostają wypełnienie (poché)
  applySection(st) {
    const sec = (this.model.sections || []).find(q => q.on && !q.hidden);
    this.section = sec || null;
    const u = this.edgeMat.uniforms;
    this.sectSegs = [];
    if (!sec) { this.ghostGroup.traverse(o => { if (o.material?.clippingPlanes?.length) { o.material.clippingPlanes = []; o.material.needsUpdate = true; } }); u.sectOn.value = 0; for (const m of this.meshes) if (m.material.clippingPlanes?.length) { m.material.clippingPlanes = []; m.material.needsUpdate = true; } return; }
    const n = V.norm(sec.n), d = V.dot(n, sec.o);
    u.sectOn.value = 1; u.sect.value.set(n[0], n[1], n[2], d);
    this.clipPlane.normal.set(-n[0], -n[1], -n[2]); this.clipPlane.constant = d;
    const planes = [this.clipPlane];
    this.ghostGroup.traverse(o => { if (o.material) { o.material.clippingPlanes = planes; o.material.needsUpdate = true; } });
    const poche = new THREE.MeshBasicMaterial({ color: this.dark ? '#8d897f' : '#4f4c45', side: THREE.BackSide, clippingPlanes: planes });
    for (const m of [...this.meshes]) {
      m.material.clippingPlanes = planes; m.material.clipShadows = true; m.material.needsUpdate = true;
      const sh = this.model.shapes.find(q => q.id === m.userData.shapeId);
      if (!sh || !isSolid(sh) || (sh.alpha ?? 1) < 0.6) continue;
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

  colorFor(s, st, paper) {
    const base = new THREE.Color(s.color || st.wall || DEFAULT_COLOR);
    if (s.color) base.lerp(paper, st.tint);
    if (this.selected.has(s.id)) base.lerp(new THREE.Color('#9fb3d6'), 0.45);
    if (this.dimmed(s)) base.lerp(paper, 0.6);
    return base;
  }
  // przy edycji grupy reszta modelu jest przygaszona
  dimmed(s) { if (this.editSolid != null) return s.id !== this.editSolid; return this.editGroup != null && !(this.editSet && this.editSet.has(s.g)); }
  // materiał ściany: kolor, przezroczystość (szkło)
  matFor(s, st, paper, flat) {
    const a = s.alpha ?? 1, glass = a < 0.999;
    return new THREE.MeshLambertMaterial({
      color: this.colorFor(s, st, paper), side: flat || glass ? THREE.DoubleSide : THREE.FrontSide,
      transparent: glass, opacity: a, depthWrite: !glass,
      polygonOffset: true, polygonOffsetFactor: flat ? 0.5 : 1.5, polygonOffsetUnits: flat ? 1 : 2
    });
  }
  // bryła z odjętymi wycięciami: siatka z wielokątów wyniku, krawędzie bez szwów
  addCsgMesh(s, polys, edgeList, st, paper) {
    const pos = [], nor = [], keys = [], ids = [];
    for (const p of polys) {
      for (let i = 1; i + 1 < p.vs.length; i++) {
        for (const v of [p.vs[0], p.vs[i], p.vs[i + 1]]) { pos.push(v[0], v[1], v[2]); nor.push(p.n[0], p.n[1], p.n[2]); }
        keys.push(p.shared.key); ids.push(p.shared.id);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const mesh = new THREE.Mesh(geo, this.matFor(s, st, paper, false));
    mesh.castShadow = (s.alpha ?? 1) > 0.6; mesh.receiveShadow = true;
    mesh.userData = { shapeId: s.id, keys, ids };
    this.modelGroup.add(mesh); this.meshes.push(mesh);
    if (st.lines) { const col = this.selected.has(s.id) ? hex3('#3f5f99') : this.dimmed(s) ? hex3(this.dark ? '#4a4a48' : '#c9c5bb') : null; for (const e of resultEdges(polys)) edgeList.push({ ...e, col }); }
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

  // podświetlenie ściany pod kursorem (push/pull) albo bryły (zaznaczanie)
  setHoverFace(verts) {
    for (const c of [...this.previewGroup.children]) { c.geometry.dispose(); this.previewGroup.remove(c); }
    if (verts) {
      const pts = []; for (const t of triangulatePoly(verts)) for (const p of t) pts.push(new THREE.Vector3(...p));
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
  setSun(cfg) { Object.assign(this.sunCfg, cfg); this.updateSun(); }
  sunInfo() { const c = this.sunCfg; return sunPosition(c.date, c.hour, c.lat, c.lon, c.tz); }
  updateSun() {
    const st = this.st(), c = this.sunCfg;
    const { alt, az } = this.sunInfo();
    const up = alt > 0;
    const dir = sunVector(Math.max(alt, 0.5), az);
    // mapa cieni obejmuje tylko bryły — duży podkład z okolicą rozmyłby cienie
    const b = (this.model && this.model.shapes.length && bounds({ shapes: this.model.shapes, lines: [] })) || { center: [0, 0, 0], radius: 25 };
    const R = b.radius * 1.4 + 4, ctr = new THREE.Vector3(...b.center);
    this.sun.target.position.copy(ctr);
    this.sun.position.copy(ctr).addScaledVector(new THREE.Vector3(...dir), R * 3);
    const sc = this.sun.shadow.camera;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.1; sc.far = R * 4 + R * 2 / Math.max(Math.sin(Math.max(alt, 0.5) * Math.PI / 180), 0.08);
    sc.updateProjectionMatrix();
    this.sun.castShadow = c.shadows && up;
    this.sun.shadow.radius = 1 + c.soft * 14;
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
    u.wSil.value = st.wSil; u.wIn.value = st.wIn; u.ext.value = st.ext; u.wobble.value = st.wobble; u.fade.value = st.fade;
    u.ink.value.set(st.ink); u.inkFar.value.set(st.inkFar);
    u.nearZ.value = this.cam.near;
    const b = this.model && bounds(this.model);
    if (b) {
      const d = this.vc().position.distanceTo(new THREE.Vector3(...b.center));   // w rzucie równoległym kamera stoi daleko
      u.fadeNear.value = Math.max(0.1, d - b.radius * 0.6); u.fadeFar.value = d + b.radius * 1.2;
    }
  }
  render() {
    const st = this.st();
    this.scene.background = new THREE.Color(st.paper);
    this.axes.visible = this.showAxes;
    this.applyStyleUniforms();
    this.renderer.render(this.scene, this.vc());
    this.drawOverlay();
  }
  drawOverlay() {
    const c = this.ctx; c.clearRect(0, 0, this.w, this.h);
    if (this.model) this.drawSection(c, p => this.toScreen(p), 1, true);
    if (this.annotDraw) this.annotDraw(c, p => this.toScreen(p), 1);
    if (this.overlayDraw) this.overlayDraw(c, this);
  }
  redraw() { this.needs = true; }

  // obraz PNG w dowolnej rozdzielczości; grubość linii rośnie razem z rozdzielczością
  async exportPng(W, H, { transparent = false, axes = false, underlay = false, dark = this.dark, guides = false } = {}) {
    // w eksporcie bez zaznaczenia i bez przygaszenia przy edycji grupy
    const keepSel = [...this.selected], keepEdit = this.editGroup, keepSolid = this.editSolid;
    this.selected.clear(); this.editGroup = null; this.editSolid = null;
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
    const scale = W / (this.w * dpr);
    this.applyStyleUniforms(scale, this.w, this.h);
    this.edgeMat.uniforms.res.value.set(W, H);
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(this.scene, this.vc()); r.setRenderTarget(null);
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
    this.showAxes = keepAxes; this.underlayGroup.visible = keepUnder; this.guideGroup.visible = keepGuides; this.ghostGroup.visible = true;
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
    for (const h of hits) {
      const ud = h.object.userData, key = ud.keys[h.faceIndex];
      if (!key) continue;
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
    const D = { top: [0, 0.0001, -1], front: [0, 1, 0], back: [0, -1, 0], right: [-1, 0, 0], left: [1, 0, 0], iso: [-1, 1, -0.82] }[name];
    if (!D) return;
    if (name === 'top' && this.twoPoint) this.setTwoPoint(false);
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
    for (const c of [...this.underlayGroup.children]) { c.geometry.dispose(); c.material.dispose(); this.underlayGroup.remove(c); }
    this.underlayBounds = null;
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
    if (lo[0] !== Infinity) this.underlayBounds = [[lo[0], lo[1], u.height], [hi[0], hi[1], u.height]];
    this.updateSun();
  }
}
