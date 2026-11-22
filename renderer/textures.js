import { _t } from './i18n.js';
// Materiały z teksturą dla wiaderka. Tekstury są rysowane w kodzie (bez plików graficznych), powtarzalne w obu
// kierunkach i mają prawdziwą skalę: `size` to szerokość i wysokość jednego powtórzenia w metrach.
// `avg` to kolor zastępczy (miniatury, eksport OBJ, style bez tekstur).

// stały generator liczb losowych — tekstura wygląda zawsze tak samo
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// drobne ziarno: kropki rysowane z zawinięciem przez krawędź, żeby powtórzenia się zgadzały
function grain(c, W, H, r, n, colors, size = 1.6) {
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, s = (0.4 + r()) * size;
    c.fillStyle = colors[Math.floor(r() * colors.length)];
    for (const dx of [0, W, -W]) for (const dy of [0, H, -H]) c.fillRect(x + dx, y + dy, s, s);
  }
}

export const TEXTURES = {
  cegla: {
    name: _t('cegła'), avg: '#b06a4c', size: [0.52, 0.3], px: [256, 148],
    draw(c, W, H) {
      const r = rng(11), rows = 4, bh = H / rows, bw = W / 2, j = 5;
      c.fillStyle = '#d9d2c4'; c.fillRect(0, 0, W, H);
      for (let k = 0; k < rows; k++) for (let i = -1; i < 3; i++) {
        const x = i * bw + (k % 2 ? bw / 2 : 0), y = k * bh;
        const t = r(); c.fillStyle = `rgb(${168 + t * 34 | 0},${92 + t * 26 | 0},${66 + t * 20 | 0})`;
        c.fillRect(x + j / 2, y + j / 2, bw - j, bh - j);
      }
      grain(c, W, H, r, 500, ['rgba(60,30,20,.10)', 'rgba(255,230,210,.10)']);
    }
  },
  drewno: {
    name: _t('deski'), avg: '#b8946a', size: [1.2, 0.6], px: [256, 128],
    draw(c, W, H) {
      const r = rng(23), n = 5, ph = H / n;
      for (let k = 0; k < n; k++) {
        const t = r(); c.fillStyle = `rgb(${172 + t * 30 | 0},${136 + t * 26 | 0},${94 + t * 22 | 0})`;
        c.fillRect(0, k * ph, W, ph);
        c.strokeStyle = 'rgba(80,52,28,.16)'; c.lineWidth = 1;
        for (let i = 0; i < 7; i++) { const y = k * ph + 3 + r() * (ph - 6); c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W / 3, y + (r() - 0.5) * 3, 2 * W / 3, y + (r() - 0.5) * 3, W, y); c.stroke(); }
        c.fillStyle = 'rgba(60,38,20,.55)'; c.fillRect(0, k * ph, W, 1.4);
        const cut = (k * 0.37 % 1) * W; c.fillRect(cut, k * ph, 1.4, ph);
      }
    }
  },
  beton: {
    name: _t('beton'), avg: '#b9b6ae', size: [2.4, 2.4], px: [256, 256],
    draw(c, W, H) {
      const r = rng(37); c.fillStyle = '#bcb9b1'; c.fillRect(0, 0, W, H);
      grain(c, W, H, r, 2600, ['rgba(255,255,255,.10)', 'rgba(70,68,62,.10)', 'rgba(120,116,108,.08)'], 2.4);
      c.strokeStyle = 'rgba(70,68,62,.28)'; c.lineWidth = 1.2;
      c.strokeRect(0.6, 0.6, W, H); c.beginPath(); c.moveTo(W / 2, 0); c.lineTo(W / 2, H); c.stroke();
      c.fillStyle = 'rgba(70,68,62,.35)';
      for (const [x, y] of [[W / 4, H / 4], [3 * W / 4, H / 4], [W / 4, 3 * H / 4], [3 * W / 4, 3 * H / 4]]) { c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill(); }
    }
  },
  plytki: {
    name: _t('płytki'), avg: '#d6d3cb', size: [0.6, 0.6], px: [128, 128],
    draw(c, W, H) {
      const r = rng(41); c.fillStyle = '#dad7cf'; c.fillRect(0, 0, W, H);
      grain(c, W, H, r, 300, ['rgba(255,255,255,.18)', 'rgba(90,88,80,.07)'], 2);
      c.fillStyle = '#9d9a92'; c.fillRect(0, 0, W, 2); c.fillRect(0, 0, 2, H);
    }
  },
  dachowka: {
    name: _t('dachówka'), avg: '#9a4f3c', size: [0.6, 0.66], px: [128, 140],
    draw(c, W, H) {
      const r = rng(53), rows = 2, cols = 3, rh = H / rows, cw = W / cols;
      c.fillStyle = '#6e3527'; c.fillRect(0, 0, W, H);
      for (let k = 0; k < rows; k++) for (let i = -1; i <= cols; i++) {
        const x = i * cw + (k % 2 ? cw / 2 : 0), y = k * rh, t = r();
        c.fillStyle = `rgb(${150 + t * 28 | 0},${76 + t * 18 | 0},${58 + t * 14 | 0})`;
        c.beginPath(); c.moveTo(x + 1, y); c.lineTo(x + cw - 1, y); c.lineTo(x + cw - 1, y + rh * 0.62); c.quadraticCurveTo(x + cw / 2, y + rh * 1.06, x + 1, y + rh * 0.62); c.closePath(); c.fill();
      }
    }
  },
  blacha: {
    name: _t('blacha'), avg: '#8f959a', size: [0.5, 0.5], px: [128, 128],
    draw(c, W, H) {
      const g = c.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, '#7b8187'); g.addColorStop(0.06, '#a9afb4'); g.addColorStop(0.14, '#93999e'); g.addColorStop(0.92, '#8d9398'); g.addColorStop(1, '#7b8187');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  },
  trawa: {
    name: _t('trawa'), avg: '#8fa573', size: [2, 2], px: [256, 256],
    draw(c, W, H) {
      const r = rng(67); c.fillStyle = '#90a674'; c.fillRect(0, 0, W, H);
      grain(c, W, H, r, 5200, ['rgba(60,90,40,.22)', 'rgba(190,205,140,.20)', 'rgba(110,140,80,.25)'], 2.2);
    }
  },
  zwir: {
    name: _t('żwir'), avg: '#a6a299', size: [1.5, 1.5], px: [256, 256],
    draw(c, W, H) {
      const r = rng(71); c.fillStyle = '#a8a49b'; c.fillRect(0, 0, W, H);
      grain(c, W, H, r, 4200, ['rgba(255,255,255,.22)', 'rgba(60,58,52,.22)', 'rgba(150,140,120,.3)'], 3);
    }
  }
};

const canvases = new Map();
export function textureCanvas(id) {
  const T = TEXTURES[id]; if (!T) return null;
  if (!canvases.has(id)) {
    const cv = document.createElement('canvas'); cv.width = T.px[0]; cv.height = T.px[1];
    T.draw(cv.getContext('2d'), cv.width, cv.height);
    canvases.set(id, cv);
  }
  return canvases.get(id);
}
