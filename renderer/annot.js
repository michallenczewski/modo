// Wymiary i opisy: rysowane na płaskiej nakładce (w oknie i w eksporcie PNG), zawsze czytelne, niezależnie od perspektywy.
// Wymiar: { id, a, b, off } — punkty mierzone i wektor odsunięcia linii wymiarowej.
// Opis:   { id, p, q, text } — punkt wskazany (strzałka odnośnika) i miejsce tekstu; p === q to opis bez odnośnika.

import { V, isHidden } from './model.js';
import { fmtLength } from './units.js';

// prostokąty tekstów na ekranie (do trafiania kursorem) — poza modelem, żeby nie trafiały do pliku
const BOX = new WeakMap();
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export function dimText(d) { return d.text || fmtLength(V.dist(d.a, d.b)); }

// project(p) → { x, y, behind } w pikselach rysunku
export function drawAnnotations(c, project, model, { scale = 1, dark = false, paper = '#f3f1ea', selected = null, visible = () => true } = {}) {
  const ink = dark ? '#d8d6d0' : '#2a2a28', sel = dark ? '#9fb4dc' : '#3f5f99';
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const d of model.dims || []) {
    if (isHidden(model, d) || !visible(d)) continue;
    const col = selected && selected.has('d' + d.id) ? sel : ink;
    const A = project(d.a), B = project(d.b), A2 = project(V.add(d.a, d.off)), B2 = project(V.add(d.b, d.off));
    if (A.behind || B.behind || A2.behind || B2.behind) continue;
    c.strokeStyle = col; c.fillStyle = col;
    // linie pomocnicze: od punktu (z małą przerwą) do linii wymiarowej i odrobinę dalej
    const ext = (P, Q) => {
      const dx = Q.x - P.x, dy = Q.y - P.y, L = Math.hypot(dx, dy); if (L < 1) return;
      const ux = dx / L, uy = dy / L, gap = Math.min(4 * scale, L * 0.3);
      c.beginPath(); c.moveTo(P.x + ux * gap, P.y + uy * gap); c.lineTo(Q.x + ux * 5 * scale, Q.y + uy * 5 * scale); c.stroke();
    };
    c.lineWidth = 0.8 * scale; ext(A, A2); ext(B, B2);
    // linia wymiarowa z ukośnymi kreskami na końcach (jak na rysunku architektonicznym)
    const dx = B2.x - A2.x, dy = B2.y - A2.y, L = Math.hypot(dx, dy); if (L < 2) continue;
    const ux = dx / L, uy = dy / L;
    c.lineWidth = 1 * scale;
    c.beginPath(); c.moveTo(A2.x - ux * 6 * scale, A2.y - uy * 6 * scale); c.lineTo(B2.x + ux * 6 * scale, B2.y + uy * 6 * scale); c.stroke();
    c.lineWidth = 1.6 * scale;
    const tk = 4.5 * scale, tx = (ux - uy) * Math.SQRT1_2 * tk, ty = (uy + ux) * Math.SQRT1_2 * tk;
    for (const P of [A2, B2]) { c.beginPath(); c.moveTo(P.x - tx, P.y - ty); c.lineTo(P.x + tx, P.y + ty); c.stroke(); }
    // tekst nad linią, obrócony wzdłuż niej i zawsze czytelny
    let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const t = dimText(d);
    c.save();
    c.translate((A2.x + B2.x) / 2, (A2.y + B2.y) / 2); c.rotate(ang);
    c.font = `500 ${11.5 * scale}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'bottom';
    const w = c.measureText(t).width;
    if (paper) { c.fillStyle = paper; c.globalAlpha = 0.85; c.fillRect(-w / 2 - 3 * scale, -17 * scale, w + 6 * scale, 14 * scale); c.globalAlpha = 1; }
    c.fillStyle = col; c.fillText(t, 0, -4 * scale);
    c.restore();
  }
  for (const t of model.texts || []) {
    if (isHidden(model, t) || !visible(t)) continue;
    const col = selected && selected.has('t' + t.id) ? sel : ink;
    const P = project(t.p), Q = project(t.q);
    if (P.behind || Q.behind) continue;
    c.strokeStyle = col; c.fillStyle = col;
    const lines = String(t.text || '').split('\n');
    c.font = `${12 * scale}px ${FONT}`; c.textBaseline = 'middle';
    const lh = 16 * scale, w = Math.max(...lines.map(l => c.measureText(l).width)), h = lines.length * lh;
    const leader = Math.hypot(Q.x - P.x, Q.y - P.y) > 3;
    // tekst po tej stronie odnośnika, w którą on biegnie
    const right = !leader || Q.x >= P.x;
    const x0 = right ? Q.x + (leader ? 6 * scale : -w / 2) : Q.x - 6 * scale - w, y0 = Q.y - h / 2;
    if (leader) {
      c.lineWidth = 0.9 * scale;
      c.beginPath(); c.moveTo(P.x, P.y); c.lineTo(Q.x, Q.y); c.stroke();
      c.beginPath(); c.arc(P.x, P.y, 2.2 * scale, 0, Math.PI * 2); c.fill();
    }
    if (paper) { c.fillStyle = paper; c.globalAlpha = 0.85; c.fillRect(x0 - 4 * scale, y0 - 2 * scale, w + 8 * scale, h + 4 * scale); c.globalAlpha = 1; }
    c.fillStyle = col; c.textAlign = 'left';
    lines.forEach((l, i) => c.fillText(l, x0, y0 + lh * (i + 0.5)));
    if (scale === 1) BOX.set(t, { x: x0 - 4, y: y0 - 2, w: w + 8, h: h + 4 });
  }
  c.restore();
}

// trafienie kursorem w wymiar albo opis: 'd12' / 't5' / null
export function pickAnnotation(model, project, x, y) {
  const segD = (A, B) => { const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / L2)); return Math.hypot(A.x + dx * t - x, A.y + dy * t - y); };
  let best = null, bd = 6;
  for (const t of model.texts || []) {
    if (isHidden(model, t)) continue;
    const b = BOX.get(t); if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return 't' + t.id;
    const P = project(t.p), Q = project(t.q); if (P.behind || Q.behind) continue;
    const d = segD(P, Q); if (d < bd) { bd = d; best = 't' + t.id; }
  }
  for (const d of model.dims || []) {
    if (isHidden(model, d)) continue;
    const A2 = project(V.add(d.a, d.off)), B2 = project(V.add(d.b, d.off)); if (A2.behind || B2.behind) continue;
    // linia wymiarowa razem z tekstem nad nią
    const k = segD(A2, B2), mx = (A2.x + B2.x) / 2, my = (A2.y + B2.y) / 2;
    const dd = Math.min(k, Math.hypot(x - mx, y - my) < 20 ? 0 : Infinity);
    if (dd < bd) { bd = dd; best = 'd' + d.id; }
  }
  return best;
}
