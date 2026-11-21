// Wymiary wpisywane w pole na dole okna. Jednostką domyślną są metry; przecinek i kropka działają jako separator dziesiętny.
// Przykłady: „3,5”  „350cm”  „3500 mm”  „3.5m”. Dwa wymiary (prostokąt): „6;4”  „6 x 4”  „6×4”.

const UNIT = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, km: 1000, '"': 0.0254, in: 0.0254, "'": 0.3048, ft: 0.3048 };

export function parseLength(s) {
  if (s == null) return null;
  s = String(s).trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  const m = s.match(/^([-+]?\d*(?:[.,]\d*)?)(mm|cm|dm|m|km|in|ft|"|')?$/);
  if (!m || m[1] === '' || m[1] === '-' || m[1] === '+') return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!isFinite(v)) return null;
  return v * (UNIT[m[2] || 'm']);
}

// zwraca tablicę długości albo null; pojedyncza wartość daje tablicę jednoelementową
export function parseLengths(s) {
  const parts = String(s).split(/[;x×*]/i).map(t => t.trim()).filter((t, i, a) => t !== '' || a.length === 1);
  const out = parts.map(parseLength);
  return out.some(v => v === null) ? null : out;
}

export function fmtLength(m, digits = 2) {
  if (!isFinite(m)) return '';
  const a = Math.abs(m) < 1e-9 ? 0 : m;
  return a.toFixed(digits).replace('.', ',') + ' m';
}
