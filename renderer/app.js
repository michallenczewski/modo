// Modo — okno programu: narzędzia, nawigacja, klawiatura, pole wymiarów, okienka (słońce, PNG, podkład, skróty), plik.

import { Viewer, STYLES, DEFAULT_COLOR } from './viewer.js';
import { Snapper } from './snap.js';
import { V, newModel, cloneModel, fixModel, similar, membersOf, groupOf, topUnder, insideGroup, chainOf, subtreeIds, IDENT, syncComponent, pruneGroups, instancesOf, vertices, facesFromLines } from './model.js';
import { TEXTURES, textureCanvas } from './textures.js';
import { stitch, intersectFaces } from './stitch.js';
import { absorb, component, facesOfPolys, liftFaces, eraseFaces } from './geo.js';
import { subFaces, subAt, scaleTargets, targetBox, pickEntity, deleteFace, deleteEdge, Arc3Tool, FreehandTool, LookTool, WalkTool, CamPosTool, PlaceTool, SectionTool, DimTool, TextTool, ProtractorTool, PolygonTool, RotRectTool, CenterArcTool, SelectTool, LineTool, RectTool, PushTool, PaintTool, NavTool, ZoomWinTool, CircleTool, ArcTool, MoveTool, RotateTool, ScaleTool, OffsetTool, TapeTool, EraserTool } from './tools.js';
import { ACTIONS, loadKeys, saveKeyOverride, keysFor, comboOf, prettyCombo } from './keys.js';
import { sunPosition, sunRiseSet, fmtHour } from './sun.js';
import { parseDxf } from './dxf.js';
import { exportObj } from './export.js';
import { initSolid, solidReady } from './solid.js';
import { booleanMesh, toMesh as meshOf } from './mesh.js';
import { faces as facesOfShape, isSolid, removeIds, isHidden, bounds, viewHide } from './model.js';
import { meshVolume, meshArea, regionOf } from './mesh.js';
import { LIBRARY, loadUserLib, saveUserLib } from './lib.js';
import { translateShape, groupsWhollyIn, edges as edgesOf } from './model.js';
import { fmtNum, fmtLength } from './units.js';
import { drawAnnotations } from './annot.js';
import { UNITS, getUnit, setUnit } from './units.js';

import { _t, lang, LANGS, setLang, translateDom } from './i18n.js';
import { installTestApi } from './testapi.js';
const api = window.api;
const $ = s => document.querySelector(s);
translateDom();   // stałe napisy z index.html w wybranym języku
try { api.setLang && api.setLang(lang); } catch (e) {}   // okienka systemowe w tym samym języku
const isMac = api.platform === 'darwin';
if (!api.web) document.documentElement.classList.add(isMac ? 'frame-mac' : 'frame-win');
api.onFullscreen(v => document.documentElement.classList.toggle('fs', v));

/* ---------- ikony narzędzi ---------- */
const IC = {
  select: '<path d="M4 2.5v10.2l2.9-2.5 1.9 4.1 1.7-.8-1.9-4h3.9z"/>',
  line: '<path d="M4 12 12 4"/><circle cx="3.2" cy="12.8" r="1.2"/><circle cx="12.8" cy="3.2" r="1.2"/>',
  rect: '<rect x="2.5" y="4" width="11" height="8" rx=".5"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r=".6"/>',
  arc: '<path d="M2.5 12.5a6.5 6.5 0 0 1 11 0"/><circle cx="2.5" cy="12.5" r="1"/><circle cx="13.5" cy="12.5" r="1"/>',
  push: '<path d="M2.5 10.5h11v3h-11z"/><path d="M8 8.5V2.5M5.5 5 8 2.5 10.5 5"/>',
  move: '<path d="M8 2v12M2 8h12M6.2 3.8 8 2l1.8 1.8M6.2 12.2 8 14l1.8-1.8M3.8 6.2 2 8l1.8 1.8M12.2 6.2 14 8l-1.8 1.8"/>',
  rotate: '<path d="M13.2 8.5A5.3 5.3 0 1 1 11.6 4"/><path d="M12.2 1.8v2.7H9.5"/>',
  offset: '<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>',
  tape: '<path d="M2.3 11.2 11.2 2.3l2.5 2.5-8.9 8.9z"/><path d="M5 8.5l1.2 1.2M7 6.5l1.6 1.6M9 4.5l1.2 1.2"/>',
  eraser: '<path d="M9.6 2.6 13.4 6.4 7 12.8H4.2L2.6 11.2z"/><path d="M6 6.2l3.8 3.8M7 12.8h6.5"/>',
  paint: '<path d="M3 7.5 7.5 3l5 5L8 12.5z"/><path d="M3 7.5h9.5"/><path d="M13.3 10.2s1.2 1.4 1.2 2.2a1.2 1.2 0 0 1-2.4 0c0-.8 1.2-2.2 1.2-2.2z"/>',
  orbit: '<ellipse cx="8" cy="8" rx="5.5" ry="2.6"/><path d="M8 2.5v11"/><path d="M11.3 4.2 13.5 5.5l-.8 2.3"/>',
  pan: '<path d="M5.5 8V4a1 1 0 0 1 2 0v3.5V3a1 1 0 0 1 2 0v4.5V4.2a1 1 0 0 1 2 0V10c0 2.2-1.5 4-4 4-1.8 0-2.7-.8-3.6-2L2.6 9.4a1 1 0 0 1 1.5-1.3L5.5 9.5"/>',
  scale: '<rect x="2.5" y="6.5" width="7" height="7" rx=".5"/><path d="M9 2.5h4.5V7M13.5 2.5 8 8"/>',
  rrect: '<path d="M2.5 9.5 8.5 3.5l5 5-6 6z"/>',
  polygon: '<path d="M8 2.2 13.5 6.2l-2.1 6.5H4.6L2.5 6.2z"/>',
  carc: '<path d="M13.5 8A5.5 5.5 0 0 0 4.1 4.1"/><circle cx="8" cy="8" r=".8"/><path d="M8 8 13.5 8" stroke-dasharray="1.2 1.6"/>',
  section: '<path d="M3 3.5h10v9H3z" stroke-dasharray="0"/><path d="M1.5 8h13"/><path d="M5 8l-1.2 2.2M8 8l-1.2 2.2M11 8l-1.2 2.2"/>',
  dim: '<path d="M2.5 5v7M13.5 5v7M2.5 9.5h11"/><path d="M4 11l-1.4-1.4M13.4 9.6 12 8"/>',
  text: '<path d="M3.5 4h9M8 4v8.5"/>',
  protractor: '<path d="M2.5 12.5h11"/><path d="M2.5 12.5A5.5 5.5 0 0 1 13.5 12.5"/><path d="M8 12.5 11.5 5" stroke-dasharray="1.4 1.6"/>',
  pie: '<path d="M8 8V2.5A5.5 5.5 0 1 1 2.5 8z"/>',
  extents: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>',
  // polecenia bez przycisku na pasku narzędzi: okienko Edycja i okienko Widok
  undo: '<path d="M5.5 3 2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H6"/>',
  redo: '<path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H10"/>',
  cutClip: '<circle cx="4" cy="11.5" r="1.8"/><circle cx="12" cy="11.5" r="1.8"/><path d="M5.2 10.2 12.5 2.5M10.8 10.2 3.5 2.5"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8"/>',
  paste: '<rect x="3" y="3.5" width="10" height="10.5" rx="1.2"/><path d="M6 3.5V2.3h4v1.2"/><path d="M6 7.5h4M6 10.5h4"/>',
  pasteInPlace: '<rect x="3" y="3.5" width="10" height="10.5" rx="1.2"/><path d="M6 3.5V2.3h4v1.2"/><circle cx="8" cy="9" r="1.5"/><path d="M8 6.3v1.2M8 10.5v1.2M5.3 9h1.2M9.5 9h1.2"/>',
  selectAll: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5" fill="currentColor"/>',
  selectNone: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2 2"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>',
  selectInvert: '<rect x="2.5" y="2.5" width="11" height="11" rx="1" stroke-dasharray="2 2"/><path d="M5.5 10.5v-5h5z" fill="currentColor"/><path d="M5.5 10.5h5v-5"/>',
  hideSel: '<path d="M2.5 2.5l11 11M6.6 4A6.3 6.3 0 0 1 8 3.8c4 0 6.2 4.2 6.2 4.2a11 11 0 0 1-1.8 2.3M10.6 11.6A5.8 5.8 0 0 1 8 12.2C4 12.2 1.8 8 1.8 8a11 11 0 0 1 2.4-2.8"/>',
  unhideAll: '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  unlockAll: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-1"/>',
  viewPrev: '<path d="M13 8H3.5M7 4.5 3.5 8 7 11.5"/>',
  viewNext: '<path d="M3 8h9.5M9 4.5 12.5 8 9 11.5"/>',
  zoomWin: '<circle cx="7" cy="7" r="4.7"/><path d="M10.5 10.5 14 14"/><rect x="5" y="5.3" width="4" height="3.4" rx=".4"/>',
  xray: '<path d="M8 1.8 13.6 5v6.2L8 14.4 2.4 11.2V5z"/><path d="M2.4 5 8 8.2 13.6 5M8 8.2v6.2" stroke-dasharray="1.5 1.6"/>',
  // odbicie: strzałka w obie strony w kolorze osi i przerywana płaszczyzna lustra
  flipX: '<path d="M8 2.5v11" stroke-dasharray="1.6 1.8"/><path d="M2.5 8h11M4.5 6 2.5 8l2 2M11.5 6l2 2-2 2" stroke="#c0533f"/>',
  flipY: '<path d="M3 3l10 10" stroke-dasharray="1.6 1.8"/><path d="M3.5 12.5l9-9M3.5 9.7v2.8h2.8M9.7 3.5h2.8v2.8" stroke="#4f8a46"/>',
  flipZ: '<path d="M2.5 8h11" stroke-dasharray="1.6 1.8"/><path d="M8 2.5v11M6 4.5 8 2.5l2 2M6 11.5l2 2 2-2" stroke="#3f63a8"/>',
  freehand: '<path d="M2.5 11.5c1.5-4.5 3-6 4.2-4.6 1.3 1.5-.6 4.4.8 5 1.6.7 2.6-3.6 6-7.4"/>',
  arc3: '<path d="M2.5 12.5a6.5 6.5 0 0 1 11 0"/><circle cx="2.5" cy="12.5" r="1"/><circle cx="13.5" cy="12.5" r="1"/><circle cx="8" cy="9.6" r="1"/>',
  look: '<path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/>',
  walk: '<circle cx="8.6" cy="2.9" r="1.3"/><path d="M8.3 5.2 6.4 9.2l2.2 1.6.5 3.4M6.4 9.2 4.6 13.6M8.3 5.2l2.4 1.9 1.9.3M8 5.8 5.6 7.2"/>',
  camPos: '<circle cx="8" cy="3" r="1.3"/><path d="M8 4.8v5M5.6 6.6h4.8M8 9.8l-1.6 3M8 9.8l1.6 3"/><path d="M3 12.2l2 2M5 12.2l-2 2" stroke-width="1.1"/>',
  fog: '<path d="M2.5 5.5h8M5 8h8.5M2.5 10.5h6M10.5 10.5h3"/>',
  wire: '<path d="M8 1.8 13.6 5v6.2L8 14.4 2.4 11.2V5z"/><path d="M2.4 5 8 8.2 13.6 5M8 8.2v6.2M2.4 11.2 8 8M13.6 11.2 8 8M8 1.8V8" stroke-width="1"/>',
  hiddenGeo: '<path d="M8 1.8 13.6 5v6.2L8 14.4 2.4 11.2V5z" stroke-dasharray="1.6 1.7"/><circle cx="8" cy="8" r="1.6"/>',
  intersect: '<path d="M2.5 6.5h7v7h-7z"/><path d="M6.5 2.5h7v7h-7z"/><path d="M6.5 6.5h3v3" stroke="#b0489e" stroke-width="1.8"/>',
  backEdges: '<path d="M8 1.8 13.6 5v6.2L8 14.4 2.4 11.2V5z"/><path d="M2.4 5 8 8.2 13.6 5M8 8.2v6.2"/><path d="M2.4 11.2 8 8M13.6 11.2 8 8M8 1.8V8" stroke-dasharray="1.2 1.6" stroke-width="1"/>',
  guides: '<path d="M2 12.5 14 3.5" stroke-dasharray="2 2"/><path d="M2.5 5.5l3 3M11 8l2.5 2.5" stroke-width="1"/>',
  soften: '<path d="M2.5 12.5c2-7 9-7 11 0"/><path d="M8 7.2v6.3" stroke-dasharray="1.4 1.6"/>',
  unsoften: '<path d="M2.5 12.5 8 4l5.5 8.5"/><path d="M8 4v9.5"/>',
  cleanLines: '<path d="M2.5 13.5h11" stroke-dasharray="2 2"/><path d="M4 10.5 10.5 4M10.5 4h-3M10.5 4v3"/><path d="M11 9.5l3 3M14 9.5l-3 3" stroke="#c0533f"/>',
  makeFaces: '<path d="M2.8 12.8 4.2 4.2l8.6-1.4-1.4 8.6z"/><path d="M5 10.5 10.5 5M5.2 7.6 7.6 5.2M8 10.6l2.6-2.6" stroke-width="1"/>',
  edit: '<path d="M2.5 13.5 3.3 10.4 10.9 2.8a1.2 1.2 0 0 1 1.7 0l.6.6a1.2 1.2 0 0 1 0 1.7L5.6 12.7z"/><path d="M9.6 4.1l2.3 2.3"/>'
};
const ic = n => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ---------- stan ---------- */
const app = {
  isMac,
  model: newModel(),
  undo: [], redo: [],
  selection: new Set(),
  lockAxis: null, lockDir: null, lockByShift: false,
  paint: '#d9d4c7', paintAlpha: 1, paintTex: null,
  eyeH: 1.6,   // wysokość oczu kamery (spacer, ustaw kamerę)
  lastPush: null,
  file: { path: null, name: _t('Bez nazwy'), dirty: false },
  underlay: null,
  keys: loadKeys()
};
const viewer = app.viewer = new Viewer($('#view'));
const snapper = app.snapper = new Snapper(viewer);
viewer.selected = app.selection;
viewer.setModel(app.model);

app.opSeq = 0;   // licznik zmian: narzędzie może poprawić wpisanym wymiarem tylko swoją ostatnią operację
// Cofanie to kopie całego modelu, więc głębokość historii zależy od jego wagi: mały szkic pamięta 200 kroków,
// model z dziesiątkami tysięcy ścian — kilka (inaczej historia zajmowałaby gigabajty pamięci).
const undoDepth = () => { let w = 0; for (const s of app.model.shapes) w += s.polys ? s.polys.length : 6; return Math.max(6, Math.min(200, Math.round(300000 / Math.max(1, w)))); };
const trimUndo = () => { const n = undoDepth(); while (app.undo.length > n) app.undo.shift(); while (app.redo.length > n) app.redo.shift(); };
app.checkpoint = () => { app.undo.push(cloneModel(app.model)); trimUndo(); app.redo = []; app.opSeq++; };
// cofnięcie ostatniej operacji bez zapisywania jej do „ponów” (przed powtórzeniem jej z nowym wymiarem)
app.revertLast = () => { if (!app.undo.length) return false; app.model = app.undo.pop(); viewer.setModel(app.model); app.opSeq++; return true; };
// autozapis: `seq` rośnie przy każdej zmianie, `saved` to stan ostatnio zapisany w kopii; `key` wyróżnia to okno
const auto = { key: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), seq: 0, saved: 0, written: false };
function autoClear() { auto.saved = auto.seq; if (auto.written) { auto.written = false; api.autosaveClear(auto.key); } }
app.markDirty = (v = true) => { app.file.dirty = v; api.setDirty(v); $('#saved').textContent = v ? _t('zmieniono') : (app.file.path || api.web ? _t('zapisano') : ''); if (v) auto.seq++; else autoClear(); };
// po każdej zakończonej operacji blokada osi strzałką się zwalnia (jak w SketchUpie) — następna zaczyna bez niej
const unlockAxis = () => { if (!app.lockByShift) { app.lockAxis = null; app.lockDir = null; } };
app.changed = () => { app.clearSub(); unlockAxis(); postEdit(); viewer.setModel(app.model); app.markDirty(); app.refresh(); app.renderViewChip?.(); };
// po każdej zmianie: nowe elementy w edytowanej grupie należą do niej, a inne wystąpienia komponentu dostają tę samą zmianę
function postEdit(prev = app.undo[app.undo.length - 1]) {
  const m = app.model;
  if (app.editing && prev) {
    const had = new Set([...prev.shapes.map(s => s.id), ...prev.lines.map(l => 'l' + l.id)]);
    for (const s of m.shapes) if (!s.g && !had.has(s.id)) s.g = app.editing;
    for (const l of m.lines) if (!l.g && !had.has('l' + l.id)) l.g = app.editing;
    // edytowana grupa i każdy komponent nad nią: pozostałe wystąpienia dostają tę samą zmianę (od środka na zewnątrz)
    for (const g of chainOf(m, app.editing)) if (g.kind === 'comp') syncComponent(m, g.id);
  }
  // nowe linie i płaskie ściany łączą się z tym, co już jest: dzielą krawędzie, zamykają pola w ściany, dzielą ściany, robią otwory
  app.lastStitch = null;
  if (prev && !app.noStitch) { try { app.lastStitch = stitch(m, prev, app.stitchLimit || 200); } catch (e) { console.error('stitch', e); } }
  // Wspólna geometria: luźne bryły bieżącego kontekstu (szkic albo edytowana grupa) zlewają się w jedną.
  // Bryła wyjęta do polecenia na obiektach (`apart`) wraca do wspólnej, gdy przestaje być zaznaczona.
  // (bryła, która trafiła do grupy, przestaje być „wyjęta” — w grupie jest zwykłą zawartością)
  for (const s of m.shapes) if (s.apart && (!app.selection.has(s.id) || (s.g ?? null) !== (app.editing ?? null))) delete s.apart;
  try { const r = absorb(m, app.editing ?? null); for (const id of r.gone) app.selection.delete(id); } catch (e) { console.error('absorb', e); }
  pruneGroups(m);
  if (app.editing && !m.groups.some(g => g.id === app.editing)) app.exitGroup();
  if (app.editSolid != null && !m.shapes.some(s => s.id === app.editSolid)) { app.editSolid = null; viewer.editSolid = null; }
}
app.setModelLive = m => { app.model = m; viewer.setModel(m); };
app.commitLive = start => { app.clearSub(); unlockAxis(); app.undo.push(start); trimUndo(); app.redo = []; app.opSeq++; postEdit(start); app.markDirty(); viewer.setModel(app.model); app.refresh(); app.renderViewChip?.(); };
app.refresh = () => { viewer.redraw(); app.updateHint(); app.updateVcb(); };
// zablokowane elementy nie mogą trafić do zaznaczenia żadną drogą (ramka, panel, „zaznacz wszystko”)
function dropLocked() {
  const m = app.model; if (!m.shapes.some(s => s.locked) && !m.lines.some(l => l.locked)) return;
  for (const id of [...app.selection]) { const e = typeof id === 'number' ? m.shapes.find(s => s.id === id) : String(id)[0] === 'l' ? m.lines.find(l => 'l' + l.id === id) : null; if (e && e.locked) app.selection.delete(id); }
}
// Zaznaczone pojedyncze ściany i krawędzie brył (klik narzędziem Zaznacz) leżą osobno od zaznaczenia całych
// elementów: [{ id bryły, kind: 'face' | 'edge', pts, polys | a, b }]. Każda zmiana modelu je czyści.
app.sub = [];
function showSub() { viewer.setSubFaces(app.sub.filter(q => q.kind === 'face').flatMap(q => q.polys)); }
app.clearSub = () => { if (!app.sub.length) return; app.sub = []; showSub(); };
function drawSub(c, v) {
  for (const q of app.sub) {
    if (q.kind !== 'edge') continue;
    const A = v.toScreen(q.a), B = v.toScreen(q.b); if (A.behind || B.behind) continue;
    c.save(); c.strokeStyle = viewer.dark ? '#8fa8d8' : '#3f5f99'; c.lineWidth = 3.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); c.restore();
  }
}
// Wspólna geometria nie jest obiektem: gdyby trafiła do zaznaczenia w całości (zaznacz wszystko, panel), zamienia się
// w zaznaczenie wszystkich jej ścian. Ściany i obiekty mogą być zaznaczone razem.
const isGeo = id => typeof id === 'number' && app.model.shapes.some(s => s.id === id && s.geo);
app.selectionChanged = () => {
  dropLocked();
  for (const id of [...app.selection]) if (isGeo(id)) { const s = app.model.shapes.find(q => q.id === id); app.selection.delete(id); app.sub = [...app.sub.filter(q => q.id !== id), ...subFaces(s, s.polys.map((_, i) => i))]; }
  // bryła wyjęta do polecenia na obiektach, która przestała być zaznaczona, wraca do wspólnej geometrii
  if (app.model.shapes.some(q => q.apart && !app.selection.has(q.id))) { for (const q of app.model.shapes) if (q.apart && !app.selection.has(q.id)) delete q.apart; try { absorb(app.model, app.editing ?? null); } catch (e) { console.error('absorb', e); } viewer.setModel(app.model); }
  showSub(); viewer.reselect(); app.refresh(); app.renderViewChip?.();
};
// Polecenia działające na całych obiektach (grupa, ukryj, kopiuj, skaluj…): zaznaczone ściany wspólnej geometrii są
// wyjmowane do osobnej bryły, która zostaje zaznaczona. Po odznaczeniu wraca do wspólnej geometrii (postEdit).
app.liftSub = () => {
  const faces = app.sub.filter(q => q.kind === 'face'); if (!faces.length) return null;
  const s = app.model.shapes.find(q => q.id === faces[0].id); if (!s || !s.geo) return null;
  const idx = new Set(); for (const q of faces) if (q.id === s.id) for (const i of regionOf(s, +q.key.split(':')[1])) idx.add(i);
  const t = liftFaces(app.model, s, [...idx]);
  app.sub = []; showSub(); app.selection.add(t.id); viewer.setModel(app.model);
  return t;
};
const LIFT = new Set(['group', 'comp', 'hideSel', 'hideRest', 'hideSimilar', 'lock', 'copy', 'cutClip', 'flipX', 'flipY', 'flipZ', 'solidUnion', 'solidIntersect', 'solidSubtract', 'solidTrim', 'cut', 'intersect']);
app.setPaint = (c, a, t) => { app.paint = c; if (a !== undefined) app.paintAlpha = a; app.paintTex = t || null; renderSwatches(); };

/* ---------- grupy i komponenty ---------- */
app.editing = null;
// klik w element zaznacza grupę, która leży bezpośrednio w edytowanej (albo w całym modelu)
app.groupAt = id => topUnder(app.model, id, app.editing);
app.expand = id => { const g = topUnder(app.model, id, app.editing); return g ? membersOf(app.model, g.id) : [id]; };
app.inEditing = id => insideGroup(app.model, id, app.editing);
app.editSolid = null;
// edycja bryły: wierzchołki, krawędzie i ściany (dwuklik w bryłę)
app.enterSolid = id => { app.editSolid = id; viewer.editSolid = id; app.selection.clear(); viewer.rebuild(); app.refresh(); renderViewChip(); };
app.exitSolid = () => { if (app.editSolid == null) return; const id = app.editSolid; app.editSolid = null; viewer.editSolid = null; app.selection.clear(); if (app.model.shapes.some(s => s.id === id)) app.expand(id).forEach(i => app.selection.add(i)); viewer.rebuild(); app.refresh(); renderViewChip(); };
app.enterGroup = gid => { app.editing = gid; viewer.editGroup = gid; app.selection.clear(); app.sub = []; try { absorb(app.model, gid); } catch (e) { console.error('absorb', e); } viewer.setModel(app.model); app.refresh(); renderViewChip(); };
// wyjście o jeden poziom w górę (jak Esc w SketchUpie)
app.exitGroup = () => {
  if (!app.editing) return;
  const gid = app.editing, g = app.model.groups.find(q => q.id === gid);
  app.editing = g && g.p != null && app.model.groups.some(q => q.id === g.p) ? g.p : null; viewer.editGroup = app.editing;
  app.selection.clear(); if (g) membersOf(app.model, gid).forEach(i => app.selection.add(i));
  viewer.rebuild(); app.refresh(); renderViewChip();
};
function makeGroup(kind) {
  const ids = [...app.selection].filter(i => !String(i).startsWith('g'));
  if (!ids.length) return toast(_t('Zaznacz bryły albo linie, z których ma powstać ') + (kind === 'comp' ? _t('komponent.') : _t('grupa.')));
  app.checkpoint();
  const m = app.model, gid = m.next++, E = app.editing;
  let lo = [Infinity, Infinity, Infinity];
  const sub = new Set();
  for (const id of ids) {
    const e = typeof id === 'number' ? m.shapes.find(s => s.id === id) : m.lines.find(l => 'l' + l.id === id);
    if (!e) continue;
    for (const p of typeof id === 'number' ? vertices(e) : [e.a, e.b]) for (let k = 0; k < 3; k++) lo[k] = Math.min(lo[k], p[k]);
    // element leżący wprost w edytowanej grupie przechodzi do nowej; z głębszych przenosimy całą podgrupę
    const top = topUnder(m, id, E);
    if (top) sub.add(top.id); else e.g = gid;
  }
  for (const q of m.groups) if (sub.has(q.id)) q.p = gid;
  const rec = kind === 'comp' ? { id: gid, kind, def: 'd' + gid, frame: IDENT(lo) } : { id: gid, kind };
  if (E != null) rec.p = E;
  m.groups.push(rec);
  app.changed(); app.selectionChanged();
  toast(kind === 'comp' ? _t('Komponent — kopie zmieniają się razem. Dwuklik, żeby edytować.') : _t('Grupa. Dwuklik, żeby edytować.'));
}
function selectedGroups() { const out = new Set(); for (const id of app.selection) { const g = topUnder(app.model, id, app.editing); if (g) out.add(g); } return [...out]; }
function explode() {
  const gs = selectedGroups(); if (!gs.length) return toast(_t('Zaznacz grupę albo komponent.'));
  app.checkpoint();
  // zawartość rozbitej grupy przechodzi piętro wyżej
  for (const g of gs) {
    const up = g.p;
    for (const e of [...app.model.shapes, ...app.model.lines]) if (e.g === g.id) { if (up != null) e.g = up; else delete e.g; }
    for (const q of app.model.groups) if (q.p === g.id) { if (up != null) q.p = up; else delete q.p; }
    app.model.groups = app.model.groups.filter(q => q.id !== g.id);
  }
  app.changed(); app.selectionChanged();
}
function makeUnique() {
  const gs = selectedGroups().filter(g => g.kind === 'comp'); if (!gs.length) return toast(_t('Zaznacz komponent.'));
  app.checkpoint();
  for (const g of gs) g.def = 'd' + app.model.next++;
  app.changed(); toast(gs.length > 1 ? _t('Komponenty są teraz niezależne') : _t('Ten komponent jest teraz niezależny'));
}

/* ---------- narzędzia ---------- */
const tools = {
  select: new SelectTool(app), line: new LineTool(app), rect: new RectTool(app), circle: new CircleTool(app), arc: new ArcTool(app),
  place: new PlaceTool(app), section: new SectionTool(app), dim: new DimTool(app), text: new TextTool(app), protractor: new ProtractorTool(app),
  rrect: new RotRectTool(app), polygon: new PolygonTool(app), carc: new CenterArcTool(app, false), pie: new CenterArcTool(app, true),
  push: new PushTool(app), move: new MoveTool(app), rotate: new RotateTool(app), scale: new ScaleTool(app), offset: new OffsetTool(app), tape: new TapeTool(app), eraser: new EraserTool(app), paint: new PaintTool(app),
  orbit: new NavTool(app, 'orbit'), pan: new NavTool(app, 'pan'), zoom: new NavTool(app, 'zoom'), zoomWin: new ZoomWinTool(app),
  arc3: new Arc3Tool(app), freehand: new FreehandTool(app), look: new LookTool(app), walk: new WalkTool(app), camPos: new CamPosTool(app)
};
// po ustawieniu kamery od razu można się rozejrzeć (jak w SketchUpie)
app.camPosDone = () => { setTool('look'); renderViewChip(); };
let tool = tools.select, toolId = 'select', toolBefore = 'select';
// po powiększeniu ramką wraca narzędzie, którym pracowałeś wcześniej
app.zoomWinDone = () => setTool(toolBefore);
const TOOL_NAME = { line: _t('Linia'), freehand: _t('Linia odręczna'), arc3: _t('Łuk przez trzy punkty'), orbit: _t('Orbita'), look: _t('Rozejrzyj się'), walk: _t('Spacer'), camPos: _t('Ustaw kamerę'), tape: _t('Taśma i prowadnice'), protractor: _t('Kątomierz'), dim: _t('Wymiar'), text: _t('Opis'), rect: _t('Prostokąt'), rrect: _t('Prostokąt obrócony'), circle: _t('Okrąg'), polygon: _t('Wielokąt'), arc: _t('Łuk przez dwa punkty'), carc: _t('Łuk ze środka'), pie: _t('Wycinek koła') };
// rodziny narzędzi: jeden przycisk na pasku, warianty w wysuwanym menu po najechaniu
const FAMILIES = { line: ['line', 'freehand'], rect: ['rect', 'rrect'], circle: ['circle', 'polygon'], arc: ['arc', 'arc3', 'carc', 'pie'], tape: ['tape', 'protractor'], dim: ['dim', 'text'], orbit: ['orbit', 'look', 'walk', 'camPos'] };
const famOf = id => Object.keys(FAMILIES).find(f => FAMILIES[f].includes(id));
const famCur = {};
const TOOLBAR = [['select', _t('Zaznacz')], null, ['line', _t('Linia')], ['rect', _t('Prostokąt')], ['circle', _t('Okrąg')], ['arc', _t('Łuk')], null, ['push', _t('Wypchnij / wciśnij')], ['move', _t('Przesuń')], ['rotate', _t('Obróć')], ['scale', _t('Skaluj')], ['offset', _t('Odsunięcie')], null, ['tape', _t('Taśma')], ['dim', _t('Wymiar')], ['section', _t('Przekrój')], ['eraser', _t('Gumka')], ['paint', _t('Kolor i materiał')], 'grow', ['orbit', _t('Orbita')], ['pan', _t('Przesuń widok')], ['extents', _t('Pokaż wszystko')]];
app.tools = tools;   // do testów w konsoli
app.setTool = id => setTool(id);
const toolsEl = $('#tools');
for (const t of TOOLBAR) {
  if (t === null) { toolsEl.insertAdjacentHTML('beforeend', '<div class="hsep"></div>'); continue; }
  if (t === 'grow') { toolsEl.insertAdjacentHTML('beforeend', '<div class="grow"></div>'); continue; }
  const [id, name, later] = t;
  const b = document.createElement('button');
  b.className = 'ib' + (later ? ' later' : ''); b.dataset.tool = id; b.innerHTML = ic(id);
  b.setAttribute('aria-label', name + (later ? ' (w kolejnej wersji)' : ''));
  if (id === 'paint') b.insertAdjacentHTML('beforeend', '<i class="dot"></i>');
  if (FAMILIES[id]) { famCur[id] = id; b.dataset.family = id; b.classList.add('fam'); }
  b.addEventListener('mouseenter', () => { if (FAMILIES[id]) return showFlyout(b, id); hideFlyout(); showTip(b, name + (later ? ' — w kolejnej wersji' : ''), keysFor(id === 'extents' ? 'extents' : id, app.keys.over)[0]); });
  b.addEventListener('mouseleave', e => { hideTip(); if (FAMILIES[id] && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#flyout'))) flyTimer = setTimeout(hideFlyout, 120); });
  b.addEventListener('click', () => {
    if (later) return toast(name + _t(' będzie w kolejnej wersji.'));
    if (id === 'extents') return viewer.zoomExtents();
    if (FAMILIES[id]) { hideFlyout(); return setTool(famCur[id]); }
    setTool(id);
    if (id === 'paint') showSec('mat');
  });
  toolsEl.append(b);
}
// wysuwane menu wariantów
let flyEl = null, flyTimer = null;
function showFlyout(b, fam) {
  clearTimeout(flyTimer); hideTip();
  if (flyEl && flyEl.dataset.fam === fam) return;
  hideFlyout();
  const r = b.getBoundingClientRect();
  flyEl = document.createElement('div'); flyEl.id = 'flyout'; flyEl.className = 'menu flyout'; flyEl.dataset.fam = fam;
  flyEl.innerHTML = FAMILIES[fam].map(t => { const k = keysFor(t, app.keys.over)[0]; return `<button data-t="${t}" class="${tool === tools[t] ? 'on' : ''}">${ic(t)}<span>${TOOL_NAME[t]}</span>${k ? '<kbd>' + prettyCombo(k, isMac) + '</kbd>' : ''}</button>`; }).join('');
  flyEl.style.left = (r.right + 6) + 'px'; flyEl.style.top = (r.top - 5) + 'px';
  flyEl.addEventListener('mouseleave', () => { flyTimer = setTimeout(hideFlyout, 120); });
  flyEl.addEventListener('mouseenter', () => clearTimeout(flyTimer));
  flyEl.querySelectorAll('button').forEach(x => x.addEventListener('click', () => { hideFlyout(); setTool(x.dataset.t); }));
  document.body.append(flyEl);
  // menu przy dolnej krawędzi okna podjeżdża w górę, żeby zmieściły się wszystkie pozycje
  flyEl.style.top = Math.max(8, Math.min(r.top - 5, window.innerHeight - flyEl.offsetHeight - 8)) + 'px';
}
// Linie śledzenia: po przejechaniu kursorem po krawędzi zostaje jej przerywane przedłużenie (dwie ostatnie krawędzie).
// Kursor się do nich przykleja, a przytrzymany Shift blokuje go na linii, na której właśnie jest.
const TRACE_TOOLS = new Set(['line', 'rect', 'rrect', 'circle', 'polygon', 'arc', 'arc3', 'carc', 'pie', 'move', 'tape', 'dim', 'protractor', 'place', 'section', 'camPos']);
function drawTrace(c, v) {
  if (!TRACE_TOOLS.has(toolId)) return;
  const col = viewer.dark ? '#d48bc6' : '#b0489e', lk = snapper.lockLine;
  const seg = (a, b, w) => { const A = v.toScreen(a), B = v.toScreen(b); if (A.behind || B.behind) return; c.save(); c.strokeStyle = col; c.lineWidth = w; c.setLineDash(w > 1.2 ? [] : [2, 5]); c.globalAlpha = w > 1.2 ? 0.9 : 0.75; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); c.restore(); };
  for (const r of snapper.refs) {
    const L = Math.max(V.dist(r.a, r.b), viewer.pixelSize(r.a) * 900);
    // w kawałkach, żeby część za kamerą nie gasiła całej linii
    for (const [o, sg] of [[r.a, -1], [r.b, 1]]) for (let k = 0; k < 6; k++) seg(V.add(o, V.mul(r.dir, sg * L * k / 6)), V.add(o, V.mul(r.dir, sg * L * (k + 1) / 6)), 1);
  }
  if (lk) { const L = viewer.pixelSize(lk.o) * 2500; for (let k = -6; k < 6; k++) seg(V.add(lk.o, V.mul(lk.d, L * k / 6)), V.add(lk.o, V.mul(lk.d, L * (k + 1) / 6)), 1.6); }
}
// Kursor w widoku: systemowy kursor to sama kropka (jej środek jest dokładnie punktem działania narzędzia),
// a ikona bieżącego narzędzia jest osobnym znaczkiem, który jedzie obok kursora.
const DOT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.6" fill="#1a1a19" stroke="#fff" stroke-width="1.4"/></svg>')}") 8 8, crosshair`;
const curIcon = document.createElement('div'); curIcon.id = 'curIcon'; curIcon.hidden = true; document.body.append(curIcon);
function toolCursor(id) {
  const on = id !== 'select' && !!IC[id];
  curIcon.dataset.on = on ? '1' : '';
  if (on) { const icon = IC[id].replace(/currentColor/g, '#1a1a19'); curIcon.innerHTML = `<svg width="19" height="19" viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round"><g stroke="#fff" stroke-width="3.4" opacity=".92">${icon}</g><g stroke="#1a1a19" stroke-width="1.4">${icon}</g></svg>`; }
  else curIcon.hidden = true;
  return on ? DOT_CURSOR : '';
}
const moveCurIcon = e => { if (!curIcon.dataset.on || nav) { curIcon.hidden = true; return; } curIcon.hidden = false; curIcon.style.transform = `translate(${e.clientX + 9}px, ${e.clientY + 9}px)`; };
function hideFlyout() { clearTimeout(flyTimer); if (flyEl) flyEl.remove(); flyEl = null; }
function setTool(id) {
  if (!tools[id]) return;
  if (id === 'zoomWin' && toolId !== 'zoomWin') toolBefore = toolId;
  tool.deactivate(); tool = tools[id]; toolId = id; tool.activate();
  app.lockAxis = null; app.lockDir = null; vcbBuf = ''; snapper.forget();
  const fam = famOf(id);
  if (fam) { famCur[fam] = id; const fb = toolsEl.querySelector(`[data-family="${fam}"]`); if (fb) { fb.querySelector('svg').outerHTML = ic(id); fb.setAttribute('aria-label', TOOL_NAME[id]); } }
  for (const b of toolsEl.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === id || (!!fam && b.dataset.family === fam));
  $('#view').className = ['place', 'section', 'dim', 'text', 'protractor', 'line', 'rect', 'rrect', 'polygon', 'carc', 'pie', 'circle', 'arc', 'push', 'move', 'rotate', 'scale', 'offset', 'tape', 'eraser', 'paint', 'zoomWin', 'arc3', 'freehand', 'camPos'].includes(id) ? 'c-draw' : ['orbit', 'pan', 'look', 'walk'].includes(id) ? 'c-grab' : '';
  $('#view').style.cursor = toolCursor(id);
  viewer.overlayDraw = (c, v) => { drawSub(c, v); drawTrace(c, v); tool.draw(c, v); };
  viewer.annotDraw = (c, proj, scale, o = {}) => drawAnnotations(c, proj, app.model, { scale, dark: o.dark ?? viewer.dark, paper: 'paper' in o ? o.paper : viewer.st().paper, selected: scale === 1 ? app.selection : null });
  app.refresh();
}
let tipEl = null;
function showTip(el, text, key) {
  hideTip(); const r = el.getBoundingClientRect();
  tipEl = document.createElement('div'); tipEl.className = 'tip';
  tipEl.innerHTML = text + (key ? ' <kbd>' + prettyCombo(key, isMac) + '</kbd>' : '');
  tipEl.style.left = (r.right + 8) + 'px'; tipEl.style.top = (r.top + r.height / 2 - 14) + 'px';
  document.body.append(tipEl);
}
function hideTip() { if (tipEl) tipEl.remove(); tipEl = null; }

/* ---------- pasek stanu i pole wymiarów ---------- */
let vcbBuf = '';
const vcbEl = $('#vcb');
app.updateHint = () => { $('#hint').innerHTML = tool.hint() || ''; };
app.updateVcb = () => {
  const v = tool.vcb();
  $('#vcbWrap').style.visibility = v ? '' : 'hidden';
  $('#unitBtn').style.visibility = v ? '' : 'hidden';
  if (!v) return;
  $('#vcbLabel').textContent = v.label;
  if (document.activeElement !== vcbEl) { vcbEl.value = vcbBuf || v.value; vcbEl.classList.toggle('typing', !!vcbBuf); }
};
function applyVcb(text) {
  if (!text) return;
  const ok = tool.value(text);
  vcbBuf = ''; vcbEl.classList.remove('typing');
  if (!ok) toast(_t('Nie rozumiem wymiaru „') + text + _t('”. Przykłady: 3,5 · 350cm · 6;4'));
  app.refresh();
}
// jednostka szkicu: liczba wpisana bez jednostki jest w tej jednostce; klik przełącza m → cm → mm
const unitBtn = $('#unitBtn');
function renderUnit() { unitBtn.textContent = getUnit(); unitBtn.title = _t('Jednostka wymiarów: ') + { m: _t('metry'), cm: _t('centymetry'), mm: _t('milimetry') }[getUnit()] + _t(' — kliknij, żeby zmienić'); }
unitBtn.addEventListener('click', () => { setUnit(UNITS[(UNITS.indexOf(getUnit()) + 1) % UNITS.length]); renderUnit(); app.refresh(); app.markDirtySoft(); });
renderUnit();
vcbEl.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const t = vcbEl.value; vcbEl.blur(); applyVcb(t); }
  else if (e.key === 'Escape') { vcbEl.blur(); vcbBuf = ''; app.refresh(); }
  e.stopPropagation();
});

/* ---------- mysz w widoku ---------- */
const view = $('#view');
let nav = null;   // { mode, last, pivot }
const xy = e => { const r = view.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
view.addEventListener('pointerdown', e => {
  closePops();
  const [x, y] = xy(e);
  if (e.button === 1 || e.button === 2) {
    e.preventDefault();
    nav = { mode: e.button === 2 || e.shiftKey ? 'pan' : 'orbit', last: { x, y }, pivot: viewer.pivotAt(x, y), btn: e.button, moved: 0 };
    view.setPointerCapture(e.pointerId); view.classList.add('c-grabbing'); view.style.cursor = 'grabbing';
    return;
  }
  if (e.button === 0) { view.setPointerCapture(e.pointerId); tool.down(e, x, y); app.refresh(); }
});
view.addEventListener('pointermove', e => {
  const [x, y] = xy(e); moveCurIcon(e);
  if (nav) {
    const dx = x - nav.last.x, dy = y - nav.last.y; nav.last = { x, y }; nav.moved += Math.abs(dx) + Math.abs(dy);
    if (nav.mode === 'orbit' && !e.shiftKey) viewer.orbit(dx, dy, nav.pivot); else viewer.pan(dx, dy, nav.pivot);
    tool.move(e, x, y); viewer.redraw();
    return;
  }
  tool.move(e, x, y); app.refresh();
});
view.addEventListener('pointerup', e => {
  const [x, y] = xy(e);
  if (nav) {
    const click = nav.btn === 2 && nav.moved < 4; nav = null; view.classList.remove('c-grabbing'); view.style.cursor = toolCursor(toolId);
    if (click) openContext(x, y, e.clientX, e.clientY);   // prawy klik bez przeciągania: menu podręczne
    return;
  }
  if (e.button === 0) { tool.up(e, x, y); app.refresh(); }
});
view.addEventListener('dblclick', e => { const [x, y] = xy(e); tool.dbl(e, x, y); app.refresh(); });
// potrójny klik: wszystko połączone (narzędzie Zaznacz)
view.addEventListener('click', e => { if (e.detail === 3 && e.button === 0 && tool.triple) { const [x, y] = xy(e); tool.triple(e, x, y); app.refresh(); } });
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('auxclick', e => e.preventDefault());
view.addEventListener('pointerleave', () => { curIcon.hidden = true; viewer.redraw(); });
// kółko myszy: powiększanie do kursora; gładzik: dwa palce obracają (z ⇧ przesuwają), szczypanie powiększa
view.addEventListener('wheel', e => {
  e.preventDefault();
  const [x, y] = xy(e);
  const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && e.wheelDeltaY && Math.abs(e.wheelDeltaY) % 120 === 0);
  if (e.ctrlKey || mouseWheel) {
    const k = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    viewer.zoomAt(x, y, Math.pow(1.0018, -k * (e.ctrlKey && !mouseWheel ? 4 : 1)));
  } else if (e.shiftKey) {
    viewer.pan(-e.deltaX, -e.deltaY, viewer.pivotAt(viewer.w / 2, viewer.h / 2));
  } else {
    viewer.orbit(-e.deltaX * 0.6, -e.deltaY * 0.6, viewer.pivotAt(viewer.w / 2, viewer.h / 2));
  }
  tool.move(e, x, y); viewer.redraw();
}, { passive: false });

/* ---------- klawiatura ---------- */
const typingIn = el => el && (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'range' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
let capture = null;   // przypisywanie skrótu w oknie skrótów
window.addEventListener('keydown', e => {
  if (capture) { capture(e); return; }
  if (typingIn(document.activeElement) && document.activeElement !== vcbEl) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  // okienko słońca: strzałki zmieniają godzinę i dzień
  if (!$('#sunPop').hidden && /^Arrow(Left|Right)$/.test(e.key)) {
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (e.shiftKey) { const d = new Date(viewer.sunCfg.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dir); setSun({ date: d.toISOString().slice(0, 10) }); }
    else setSun({ hour: Math.max(0, Math.min(24, viewer.sunCfg.hour + dir * 0.25)) });
    return;
  }
  if (e.key === 'Escape' && !$('#aiModal').hidden) { $('#aiModal').hidden = true; return; }
  if (e.key === 'Escape') {
    if (closePops()) return;
    if (vcbBuf) { vcbBuf = ''; app.refresh(); return; }
    const busy = tool.active || tool.anchor || tool.p0 || tool.c || tool.b || tool.face || tool.p1;
    if (!busy && app.sub.length) { app.clearSub(); app.refresh(); renderPanel(); return; }
    if (!busy && app.editSolid != null) { app.exitSolid(); return; }
    if (!busy && app.editing) { app.exitGroup(); return; }
    tool.cancel(); app.lockAxis = null; app.lockDir = null; snapper.lockLine = null; app.refresh(); return;
  }
  // blokada osi strzałkami (jak w SketchUpie): → czerwona, ← zielona, ↑ niebieska, ↓ zwolnienie
  if (/^Arrow/.test(e.key) && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    const ax = { ArrowRight: 'x', ArrowLeft: 'y', ArrowUp: 'z', ArrowDown: null }[e.key];
    // ↓ przy inferencji „równolegle / prostopadle do krawędzi” blokuje ten kierunek (jak w SketchUpie); inaczej zwalnia blokadę
    if (e.key === 'ArrowDown' && !app.lockDir && !app.lockAxis && tool.cur && tool.cur.type === 'ref' && tool.cur.dir) { app.lockDir = tool.cur.dir.slice(); app.lockByShift = false; app.refresh(); return; }
    app.lockAxis = app.lockAxis === ax ? null : ax; app.lockDir = null; app.lockByShift = false;
    app.refresh(); return;
  }
  // przytrzymany Shift blokuje bieżący kierunek: oś, jeśli kursor jest na osi, albo dowolny kierunek od punktu początkowego
  if (e.key === 'Shift' && !e.repeat && tool.cur && !app.lockAxis && !app.lockDir) {
    const from = tool.lockFrom?.();
    // kursor na linii śledzenia (przedłużenie krawędzi, „od punktu”): Shift trzyma go na tej linii
    if (tool.cur.gline && !tool.cur.axis && TRACE_TOOLS.has(toolId)) { snapper.lockLine = { o: tool.cur.gline.o.slice(), d: tool.cur.gline.d.slice() }; app.lockByShift = true; app.refresh(); }
    else if (tool.cur.axis) { app.lockAxis = tool.cur.axis; app.lockByShift = true; app.refresh(); }
    else if (from && V.dist(from, tool.cur.p) > 1e-6) { app.lockDir = V.norm(V.sub(tool.cur.p, from)); app.lockByShift = true; app.refresh(); }
  }
  if (tool.key(e)) { e.preventDefault(); return; }
  // pole wymiarów: cyfry i separatory zaczynają wpisywanie
  const canValue = tool.vcb && tool.vcb();
  // ⇧ + cyfra to skrót (np. styl), a nie początek wymiaru
  if (canValue && !e.metaKey && !e.ctrlKey && !e.altKey && !(e.shiftKey && !vcbBuf)) {
    // szyk po kopii zaczyna się od „x”, „*” albo „/” (np. x5, /4)
    // „x” zaczyna wpis tylko zaraz po kopii (inaczej to skrót narzędzia)
    const arr = tool.lastValid?.() && tool.last?.copy;
    if (/^[0-9.,;×xX*/\-+]$/.test(e.key) && (vcbBuf || /[0-9.,\-+]/.test(e.key) || (arr && /[x*×/]/.test(e.key))) || (vcbBuf && /^[a-zA-Z"'° ]$/.test(e.key))) {
      e.preventDefault(); vcbBuf += e.key; app.updateVcb(); return;
    }
    if (vcbBuf && e.key === 'Backspace') { e.preventDefault(); vcbBuf = vcbBuf.slice(0, -1); app.updateVcb(); return; }
    if (vcbBuf && e.key === 'Enter') { e.preventDefault(); applyVcb(vcbBuf); return; }
  }
  const combo = comboOf(e, isMac); if (!combo) return;
  const act = app.keys.map.get(combo);
  if (act) { e.preventDefault(); run(act); }
});
window.addEventListener('keyup', e => {
  if (e.key === 'Shift' && app.lockByShift) { app.lockAxis = null; app.lockDir = null; snapper.lockLine = null; app.lockByShift = false; app.refresh(); }
});

function run(act) {
  const later = ACTIONS.find(a => a.id === act)?.later;
  if (later) return toast(ACTIONS.find(a => a.id === act).name + _t(' będzie w kolejnej wersji.'));
  if (LIFT.has(act)) app.liftSub();
  switch (act) {
    case 'select': case 'line': case 'rect': case 'circle': case 'arc': case 'rrect': case 'polygon': case 'carc': case 'pie': case 'dim': case 'text': case 'protractor': case 'section': case 'push': case 'move': case 'rotate': case 'scale': case 'offset': case 'tape': case 'eraser': case 'paint': case 'orbit': case 'pan': case 'zoom': case 'zoomWin': case 'arc3': case 'freehand': case 'look': case 'walk': case 'camPos': setTool(act); break;
    case 'fog': viewer.setLook({ fog: !viewer.fog }); renderViewPop(); app.markDirtySoft(); toast(viewer.fog ? _t('Mgła włączona') : _t('Mgła wyłączona')); break;
    case 'wire': viewer.setLook({ wire: !viewer.wire }); renderViewPop(); syncLook(); app.markDirtySoft(); toast(viewer.wire ? _t('Siatka: same krawędzie') : _t('Ściany widoczne')); break;
    case 'hiddenGeo': viewer.setLook({ showHidden: !viewer.showHidden }); renderViewPop(); toast(viewer.showHidden ? _t('Ukryta geometria widoczna (blado)') : _t('Ukryta geometria schowana')); break;
    case 'makeFaces': makeFaces(); break;
    case 'cleanLines': cleanLines(); break;
    case 'backEdges': viewer.setLook({ backEdges: !viewer.backEdges }); renderViewPop(); syncLook(); toast(viewer.backEdges ? _t('Krawędzie tylne widoczne (blado)') : _t('Krawędzie tylne schowane')); break;
    case 'guides': viewer.setLook({ showGuides: viewer.showGuides === false }); renderViewPop(); toast(viewer.showGuides === false ? _t('Prowadnice ukryte') : _t('Prowadnice widoczne')); break;
    case 'soften': softenSel(true); break;
    case 'unsoften': softenSel(false); break;
    case 'selSameMat': selectSameMaterial(); break;
    case 'intersect': intersectSel(); break;
    case 'underToLines': underlayToLines(); break;
    case 'selectNone': app.selection.clear(); app.sub = []; app.selectionChanged(); break;
    case 'selectInvert': selectInvert(); break;
    case 'copy': copySel(); break;
    case 'cutClip': if (copySel()) deleteSelection(); break;
    case 'paste': pasteClip(false); break;
    case 'pasteInPlace': pasteClip(true); break;
    case 'lock': lockSel(); break;
    case 'flipX': flipSel(0); break;
    case 'flipY': flipSel(1); break;
    case 'flipZ': flipSel(2); break;
    case 'unlockAll': unlockAll(); break;
    case 'viewPrev': viewStep(-1); break;
    case 'viewNext': viewStep(1); break;
    case 'xray': viewer.xray = !viewer.xray; viewer.rebuild(); viewer.redraw(); renderViewPop(); syncLook(); toast(viewer.xray ? _t('Prześwit włączony') : _t('Prześwit wyłączony')); break;
    case 'saveCopy': saveCopy(); break;
    case 'revert': revertSketch(); break;
    case 'updateCheck': checkUpdate(); break;
    case 'edit': openPop('#editPop', $('#editBtn')); break;
    case 'hideRest': hideRest(); break;
    case 'hideSimilar': hideSimilar(); break;
    case 'hideSel': hideSel(); break;
    case 'unhideAll': unhideAll(); break;
    case 'persp': viewer.toggleOrtho(); toast(viewer.ortho ? _t('Rzut równoległy') : _t('Perspektywa')); renderViewChip(); renderViewPop(); break;
    case 'cut': toggleCut(); break;
    case 'obj': saveObj(); break;
    case 'render': showSec('render'); break;
    case 'importSkp': importSkp(); break;
    case 'library': openPop('#libPop', $('#libBtn')); break;
    case 'panel': case 'info': togglePanel(act === 'info' ? true : undefined); break;
    case 'sectionToggle': sectionToggle(); break;
    case 'sectionPlanes': viewer.showSectPlanes = !viewer.showSectPlanes; viewer.redraw(); renderViewPop(); toast(viewer.showSectPlanes ? _t('Płaszczyzny przekroju widoczne') : _t('Płaszczyzny przekroju ukryte')); break;
    case 'sectionFlip': { const q = selectedSections()[0]; if (q) { app.checkpoint(); q.n = q.n.map(x => -x); app.changed(); } break; }
    case 'viewIso': case 'viewTop': case 'viewFront': case 'viewRight': case 'viewBack': case 'viewLeft': case 'viewBottom': viewer.setView(act.slice(4).toLowerCase()); renderViewChip(); renderViewPop(); break;
    case 'twoPoint': viewer.setTwoPoint(!viewer.twoPoint); toast(viewer.twoPoint ? _t('Perspektywa dwupunktowa') : _t('Perspektywa')); renderViewChip(); renderViewPop(); break;
    case 'views': openPop('#viewPop', $('#viewBtn')); break;
    case 'sceneAdd': addScene(); break;
    case 'scenePrev': goScene(-1); break;
    case 'sceneNext': goScene(1); break;
    case 'solidUnion': solidOp('union'); break;
    case 'solidIntersect': solidOp('intersect'); break;
    case 'solidSubtract': solidOp('subtract'); break;
    case 'solidTrim': solidOp('trim'); break;
    case 'group': makeGroup('group'); break;
    case 'comp': makeGroup('comp'); break;
    case 'explode': explode(); break;
    case 'unique': makeUnique(); break;
    case 'editGroup': {
      const g = selectedGroups()[0], one = [...app.selection].filter(i => typeof i === 'number');
      if (g) app.enterGroup(g.id);
      else if (app.editSolid != null) app.exitSolid();
      // jedna zaznaczona bryła luzem: edycja jej wierzchołków, krawędzi i ścian
      else if (one.length === 1 && app.selection.size === 1 && app.model.shapes.some(s => s.id === one[0] && !s.bill)) app.enterSolid(one[0]);
      else app.exitGroup();
      break;
    }
    case 'clearGuides': if (app.model.guides.length) { app.checkpoint(); app.model.guides = []; app.changed(); } break;
    case 'theme': cycleTheme(); break;
    case 'lang': switchLang(); break;
    case 'extents': viewer.zoomExtents(); break;
    case 'delete': deleteSelection(); break;
    case 'selectAll': app.selection.clear(); app.sub = []; app.model.shapes.forEach(s => { if (!s.locked) app.selection.add(s.id); }); app.model.lines.forEach(l => { if (!l.locked) app.selection.add('l' + l.id); }); app.model.guides.forEach(g => app.selection.add('g' + g.id)); app.selectionChanged(); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'style1': setStyle('szkic'); break;
    case 'style2': setStyle('kreska'); break;
    case 'style3': setStyle('model'); break;
    case 'axes': viewer.showAxes = !viewer.showAxes; viewer.redraw(); break;
    case 'new': newSketch(); break;
    case 'open': openSketch(); break;
    case 'save': saveSketch(false); break;
    case 'saveAs': saveSketch(true); break;
    case 'png': openPop('#pngPop', $('#pngBtn')); break;
    case 'underlay': app.underlay ? openPop('#underPop', $('#underBtn')) : pickUnderlay(); break;
    case 'keys': openKeys(); break;
  }
}
/* ---------- chowanie brył ---------- */
const hiddenCount = () => app.model.shapes.filter(s => s.hidden).length + app.model.lines.filter(l => l.hidden).length + app.model.shapes.reduce((n, s) => n + (s.hid ? s.hid.length : 0), 0);
function setHidden(fn, edges) {
  app.checkpoint();
  // „pokaż wszystko” przywraca też krawędzie ukryte gumką
  if (edges) for (const s of app.model.shapes) delete s.hid;
  for (const s of app.model.shapes) { const h = fn(s.id, s); if (h !== undefined) s.hidden = h || undefined; }
  for (const l of app.model.lines) { const h = fn('l' + l.id, l); if (h !== undefined) l.hidden = h || undefined; }
  for (const d of app.model.dims) { const h = fn('d' + d.id, d); if (h !== undefined) d.hidden = h || undefined; }
  for (const t of app.model.texts) { const h = fn('t' + t.id, t); if (h !== undefined) t.hidden = h || undefined; }
  for (const id of [...app.selection]) { const s = typeof id === 'number' ? app.model.shapes.find(q => q.id === id) : app.model.lines.find(q => 'l' + q.id === id); if (!s || s.hidden) app.selection.delete(id); }
  app.changed(); renderViewChip();
}
// Przy edycji grupy F (bez zaznaczenia) przełącza widok: reszta modelu przygaszona albo całkiem schowana (jak w SketchUpie).
// To ustawienie widoku, nie modelu — nic nie trafia do pliku ani do historii cofania, a wybór zostaje na następne edycje.
function setRestHidden(on) {
  app.restHidden = on;
  try { localStorage.setItem('modo.restHidden', on ? '1' : ''); } catch (e) {}
  viewer.rebuild(); renderViewChip();
}
function hideRest() {
  if (app.editing != null && !app.selection.size && !app.sub.length) return setRestHidden(!app.restHidden);
  // drugi raz F (albo F bez zaznaczenia, gdy coś jest ukryte) pokazuje wszystko
  if ((app.isolated || !app.selection.size) && hiddenCount()) return unhideAll();
  if (!app.selection.size) return toast(_t('Zaznacz bryły, które mają zostać widoczne.'));
  setHidden(id => !app.selection.has(id));
  app.isolated = true;
}
function hideSimilar() {
  const sel = app.model.shapes.filter(s => app.selection.has(s.id));
  if (!sel.length) return toast(_t('Zaznacz bryłę — ukryję ją razem z podobnymi.'));
  let n = 0;
  setHidden((id, s) => { if (typeof id !== 'number') return undefined; if (sel.some(q => similar(q, s))) { n++; return true; } return undefined; });
  app.selection.clear(); viewer.rebuild(); toast(_t('Ukryto podobne bryły: ') + n);
}
function hideSel() { if (!app.selection.size) return; setHidden(id => app.selection.has(id) ? true : undefined); app.selection.clear(); viewer.rebuild(); }
function unhideAll() { if (!hiddenCount()) return; setHidden(() => false, true); app.isolated = false; }
function toggleCut() {
  const sel = app.model.shapes.filter(s => app.selection.has(s.id) && (s.kind === 'mesh' || s.h > 0));
  if (!sel.length) return toast(_t('Zaznacz bryłę, która ma wycinać (albo przestać wycinać).'));
  app.checkpoint();
  const on = !sel.every(s => s.op === 'cut');
  for (const s of sel) s.op = on ? 'cut' : undefined;
  app.changed(); toast(on ? _t('Bryła wycina z brył, które przecina') : _t('Zwykła bryła'));
}
function renderViewChip() {
  renderPanel();
  const n = hiddenCount(), b = $('#hiddenChip');
  b.hidden = !n; b.textContent = _t('Ukryte: ') + n + _t(' · pokaż');
  const nl = lockedCount(), lb = $('#lockChip');
  lb.hidden = !nl; lb.textContent = _t('Zablokowane: ') + nl + ' · odblokuj';
  $('#orthoChip').hidden = !viewer.ortho && !viewer.twoPoint; $('#orthoChip').textContent = viewer.ortho ? _t('Rzut równoległy') : _t('Perspektywa dwupunktowa');
  const ed = app.editing && app.model.groups.find(g => g.id === app.editing), eb = $('#editChip');
  eb.hidden = !ed && app.editSolid == null;
  if (app.editSolid != null) eb.textContent = _t('Edytujesz bryłę — wierzchołki, krawędzie, ściany · wyjdź');
  if (ed && app.editSolid == null) {
    const depth = chainOf(app.model, ed.id).length;
    eb.textContent = (ed.kind === 'comp' ? _t`Edytujesz komponent (${instancesOf(app.model, ed.def).length} wyst.)` : _t('Edytujesz grupę')) + (depth > 1 ? ` · poziom ${depth}` : '') + _t(' · wyjdź');
  }
  const rc = $('#restChip'); rc.hidden = !(ed && app.editSolid == null);
  rc.textContent = app.restHidden ? _t('Reszta modelu schowana · pokaż') : _t('Schowaj resztę modelu');
  const sg = !app.editing && selectedGroups(), sc = $('#selChip');
  sc.hidden = !(sg && sg.length === 1);
  if (sg && sg.length === 1) sc.textContent = sg[0].kind === 'comp' ? _t('Komponent · ') + instancesOf(app.model, sg[0].def).length + _t(' wyst.') : _t('Grupa');
}
app.renderViewChip = renderViewChip;

/* ---------- narzędzia brył ---------- */
// kolejność zaznaczania ma znaczenie: pierwsza zaznaczona bryła jest tą, z którą działamy
function solidOp(op) {
  const sel = [...app.selection].filter(i => typeof i === 'number').map(id => app.model.shapes.find(s => s.id === id)).filter(s => s && isSolid(s) && s.op !== 'cut');
  if (sel.length < 2) return toast(_t('Zaznacz co najmniej dwie bryły (kolejność ma znaczenie: pierwsza jest główną).'));
  app.checkpoint();
  const [a, ...rest] = sel;
  meshOf(a, facesOfShape);
  for (const b of rest) {
    const B = JSON.parse(JSON.stringify(b)); meshOf(B, facesOfShape);
    booleanMesh(a, B, op === 'trim' ? 'subtract' : op);
  }
  if (op !== 'trim') { const ids = new Set(rest.map(b => b.id)); app.model.shapes = app.model.shapes.filter(s => !ids.has(s.id)); }
  if (!a.polys.length) app.model.shapes = app.model.shapes.filter(s => s !== a);
  app.selection.clear(); if (a.polys.length) app.selection.add(a.id);
  app.changed(); app.selectionChanged();
  toast({ union: _t('Połączono bryły'), intersect: _t('Została część wspólna'), subtract: _t('Odjęto od pierwszej bryły'), trim: _t('Przycięto pierwszą bryłę (pozostałe zostały)') }[op]);
}

function deleteSelection() {
  if (!app.selection.size && !app.sub.length) return;
  app.checkpoint();
  // ściany i krawędzie (jak w SketchUpie): po usunięciu ściany jej krawędzie zostają
  for (const q of app.sub) { const s = app.model.shapes.find(x => x.id === q.id); if (!s) continue; if (q.kind === 'face') deleteFace(app.model, s, q.polys); else deleteEdge(app.model, s, q.a, q.b, true); }
  removeIds(app.model, app.selection);
  // obrys, który zostaje po usuniętej ścianie, nie może od razu zamknąć się z powrotem w ścianę
  app.selection.clear(); app.noStitch = true; app.changed(); app.noStitch = false;
}
// po cofnięciu albo ponowieniu: bryły wyjęte do polecenia wracają do wspólnej geometrii
function regeo() { for (const s of app.model.shapes) delete s.apart; try { absorb(app.model, app.editing ?? null); } catch (e) { console.error('absorb', e); } }
function undo() {
  if (tool.active || tool.anchor || tool.p0) tool.cancel();
  if (!app.undo.length) return;
  app.clearSub();
  app.opSeq++;
  app.redo.push(cloneModel(app.model)); app.model = app.undo.pop();
  app.selection.clear(); app.sub = []; regeo(); viewer.setModel(app.model); app.markDirty(); app.refresh(); renderViewChip();
  if (app.editing && !app.model.groups.some(g => g.id === app.editing)) app.exitGroup();
}
function redo() {
  if (!app.redo.length) return;
  app.clearSub();
  app.opSeq++;
  app.undo.push(cloneModel(app.model)); app.model = app.redo.pop();
  app.selection.clear(); app.sub = []; regeo(); viewer.setModel(app.model); app.markDirty(); app.refresh(); renderViewChip();
  if (app.editing && !app.model.groups.some(g => g.id === app.editing)) app.exitGroup();
}

/* ---------- zaznaczenie: odwrócenie, blokada ---------- */
// to, co da się teraz zaznaczyć: widoczne, niezablokowane, w edytowanej grupie (albo w całym modelu)
function selectable() {
  const m = app.model, out = [], ok = (e, id) => !e.locked && !isHidden(m, e) && (app.editing == null || app.inEditing(id));
  for (const s of m.shapes) if (ok(s, s.id)) out.push(s.id);
  for (const l of m.lines) if (ok(l, 'l' + l.id)) out.push('l' + l.id);
  return out;
}
function selectInvert() {
  const was = new Set(app.selection); app.selection.clear();
  for (const id of selectable()) if (!was.has(id)) app.selection.add(id);
  app.selectionChanged();
}
const lockedCount = () => app.model.shapes.filter(s => s.locked).length + app.model.lines.filter(l => l.locked).length;
function lockSel() {
  const m = app.model, es = [...m.shapes.filter(s => app.selection.has(s.id)), ...m.lines.filter(l => app.selection.has('l' + l.id))];
  if (!es.length) return toast(_t('Zaznacz bryły albo linie, które mają zostać zablokowane.'));
  app.checkpoint();
  for (const e of es) e.locked = true;
  app.selection.clear(); app.changed(); app.selectionChanged();
  toast(_t('Zablokowano: ') + es.length + _t('. Zablokowanych elementów nie da się zaznaczyć ani zmienić.'), [_t('Odblokuj'), unlockAll]);
}
function unlockAll() {
  if (!lockedCount()) return toast(_t('Nic nie jest zablokowane.'));
  app.checkpoint();
  for (const e of [...app.model.shapes, ...app.model.lines]) delete e.locked;
  app.changed(); app.selectionChanged();
}

/* ---------- odbicie lustrzane ---------- */
// Zaznaczenie odbija się wzdłuż osi świata względem środka swojej ramki (jak „Odbij wzdłuż” w SketchUpie).
function flipSel(axis) {
  const t = new Set(app.selection), b = targetBox(app.model, t, true);
  if (!b) return toast(_t('Zaznacz bryły, linie albo grupę, które mają zostać odbite (dwuklik zaznacza całą bryłę).'));
  app.checkpoint();
  const kv = [1, 1, 1]; kv[axis] = -1;
  scaleTargets(app.model, t, b.c, b.E, kv);
  app.changed(); app.selectionChanged();
  toast(_t('Odbito wzdłuż osi ') + ['czerwonej', 'zielonej', 'niebieskiej'][axis]);
}

/* ---------- schowek: kopiuj, wytnij, wklej ---------- */
// Schowek leży w pamięci przeglądarki, więc działa też między oknami programu. Współrzędne są zapisane
// względem środka podstawy zaznaczenia (`o`), żeby wklejanie mogło postawić całość pod kursorem.
const CLIP = 'modo.schowek';
let clipMem = null;
app.docId = Math.random().toString(36).slice(2);   // schowek z tego samego szkicu zachowuje warstwy i powiązania komponentów
function packSelection(ids) {
  const m = app.model;
  const shapes = m.shapes.filter(s => ids.has(s.id)), lines = m.lines.filter(l => ids.has('l' + l.id));
  if (!shapes.length && !lines.length) return null;
  const b = bounds(m, null, [...ids]), o = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, b.lo[2]], neg = o.map(x => -x);
  const groups = groupsWhollyIn(m, ids).map(g => JSON.parse(JSON.stringify(g))), gset = new Set(groups.map(g => g.id));
  for (const g of groups) { if (g.p == null || !gset.has(g.p)) delete g.p; if (g.frame) g.frame.o = g.frame.o.map((x, k) => x + neg[k]); }
  const clean = c => { if (c.g == null || !gset.has(c.g)) delete c.g; delete c.hidden; delete c.locked; return c; };
  const S = shapes.map(s => { const c = JSON.parse(JSON.stringify(s)); translateShape(c, neg); return clean(c); });
  const L = lines.map(l => { const c = JSON.parse(JSON.stringify(l)); c.a = c.a.map((x, k) => x + neg[k]); c.b = c.b.map((x, k) => x + neg[k]); return clean(c); });
  return { paste: true, name: _t('Schowek'), doc: app.docId, o, shapes: S, lines: L, groups };
}
function copySel() {
  const item = packSelection(new Set(app.selection));
  if (!item) { toast(_t('Zaznacz bryły albo linie do skopiowania.')); return false; }
  clipMem = item;
  try { localStorage.setItem(CLIP, JSON.stringify(item)); } catch (e) {}
  toast(_t('Skopiowano: ') + (item.shapes.length + item.lines.length));
  return true;
}
function readClip() {
  try { const t = localStorage.getItem(CLIP); if (t) return JSON.parse(t); } catch (e) {}
  return clipMem;
}
function pasteClip(inPlace) {
  const item = readClip();
  if (!item || !(item.shapes.length + (item.lines || []).length)) return toast(_t('Schowek jest pusty — najpierw skopiuj zaznaczenie.'));
  if (inPlace) return insertItems(item, item.o);
  startPlace(item);
}
// wstawia elementy schowka w punkcie p: nowe numery, grupy zachowane; komponenty z tego samego szkicu zostają wystąpieniami
function insertItems(item, p) {
  const m = app.model, data = JSON.parse(JSON.stringify(item)), same = item.doc === app.docId, E = app.editing;
  app.checkpoint();
  const gmap = new Map(), defs = new Map(), out = [];
  for (const g of data.groups || []) gmap.set(g.id, m.next++);
  for (const g of data.groups || []) {
    g.id = gmap.get(g.id);
    if (g.p != null && gmap.has(g.p)) g.p = gmap.get(g.p); else if (E != null) g.p = E; else delete g.p;
    if (g.frame) g.frame.o = g.frame.o.map((x, k) => x + p[k]);
    if (g.kind === 'comp' && !same) { if (!defs.has(g.def)) defs.set(g.def, 'd' + m.next++); g.def = defs.get(g.def); }
    if (!same) delete g.tag;
    m.groups.push(g);
  }
  const place = e => { if (e.g != null && gmap.has(e.g)) e.g = gmap.get(e.g); else if (E != null) e.g = E; else delete e.g; if (!same) delete e.tag; };
  for (const s of data.shapes) { s.id = m.next++; place(s); translateShape(s, p); m.shapes.push(s); out.push(s.id); }
  for (const l of data.lines || []) { l.id = m.next++; place(l); l.a = l.a.map((x, k) => x + p[k]); l.b = l.b.map((x, k) => x + p[k]); m.lines.push(l); out.push('l' + l.id); }
  app.noStitch = true; app.changed(); app.noStitch = false;
  app.selection.clear(); out.forEach(i => app.selection.add(i));
  setTool('select'); app.selectionChanged();
}

/* ---------- historia widoków: poprzedni i następny ---------- */
// Kamera jest próbkowana co chwilę; gdy przestaje się zmieniać, poprzednie ustawienie trafia do historii.
const camHist = { back: [], fwd: [], last: null, cur: null, moving: false };
const camNow = () => JSON.stringify(viewer.getCamera());
function camReset() { camHist.back = []; camHist.fwd = []; camHist.last = camHist.cur = camNow(); camHist.moving = false; }
setInterval(() => {
  const c = camNow();
  if (camHist.last == null) { camHist.last = camHist.cur = c; return; }
  if (c !== camHist.cur) { camHist.cur = c; camHist.moving = true; return; }
  if (!camHist.moving) return;
  camHist.moving = false;
  if (c !== camHist.last) { camHist.back.push(camHist.last); if (camHist.back.length > 40) camHist.back.shift(); camHist.fwd = []; camHist.last = c; }
}, 300);
function viewStep(d) {
  const from = d < 0 ? camHist.back : camHist.fwd, to = d < 0 ? camHist.fwd : camHist.back;
  if (!from.length) return toast(d < 0 ? _t('Nie ma wcześniejszego widoku.') : _t('Nie ma następnego widoku.'));
  to.push(camNow());
  viewer.setCamera(JSON.parse(from.pop()));
  camHist.last = camHist.cur = camNow(); camHist.moving = false;
  renderViewChip(); renderViewPop();
}

/* ---------- styl ---------- */
function setStyle(s) {
  viewer.setStyle(s);
  for (const b of document.querySelectorAll('#styleSeg button')) b.classList.toggle('on', b.dataset.style === s);
  $('#pngStyle').textContent = 'styl: ' + STYLES[s].name;
}
document.querySelectorAll('#styleSeg button').forEach(b => b.addEventListener('click', () => { setStyle(b.dataset.style); }));
// prześwit (wszystkie krawędzie widać przez ściany) i siatka (same krawędzie) — pod ręką obok stylu
const lookBtns = [['xrayBtn', 'xray', _t('Prześwit — półprzezroczyste ściany'), () => viewer.xray], ['backBtn', 'backEdges', _t('Krawędzie tylne — zasłonięte krawędzie widać blado'), () => viewer.backEdges], ['wireBtn', 'wire', _t('Siatka — same krawędzie'), () => viewer.wire]];
function syncLook() { for (const [id, , , on] of lookBtns) $('#' + id).classList.toggle('on', !!on()); }
for (const [id, act, name] of lookBtns) { const b = $('#' + id); b.innerHTML = ic(act); b.setAttribute('aria-label', name); { const k = keysFor(act, app.keys.over)[0]; b.title = name + (k ? ' (' + prettyCombo(k, isMac) + ')' : ''); } b.addEventListener('click', () => run(act)); }

/* ---------- okienka ---------- */
function openPop(sel, anchor, side) {
  const p = $(sel); const was = !p.hidden;
  closePops(); if (was) return;
  p.hidden = false;
  const r = anchor.getBoundingClientRect(), w = p.offsetWidth;
  if (side === 'right') { p.style.left = (r.right + 8) + 'px'; p.style.top = Math.max(8, Math.min(r.top - 8, window.innerHeight - p.offsetHeight - 8)) + 'px'; }
  else { p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px'; p.style.top = (r.bottom + 6) + 'px'; }
  anchor.classList.add('open');
  if (sel === '#sunPop') renderSun();
  if (sel === '#pngPop') renderPng();
  if (sel === '#underPop') renderUnder();
  if (sel === '#viewPop') renderViewPop();
  if (sel === '#libPop') renderLib();
  if (sel === '#editPop') renderEditPop();
}
function closePops() {
  let any = false;
  for (const p of document.querySelectorAll('.pop:not(.modal), .menu')) if (!p.hidden) { p.hidden = true; any = true; }
  document.querySelectorAll('header .open').forEach(b => b.classList.remove('open'));
  return any;
}
document.addEventListener('pointerdown', e => {
  if (e.target.closest('.pop, .menu, header button, #tools button')) return;
  if (!e.target.closest('#view')) closePops();
});

/* ---------- panel boczny: element, warstwy, struktura ---------- */
app.panel = false; app.treeClosed = new Set();
const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const EYE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.9"/></svg>';
const EYE_OFF = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 2.5l11 11M6.6 4A6.3 6.3 0 0 1 8 3.8c4 0 6.2 4.2 6.2 4.2a11 11 0 0 1-1.8 2.3M10.6 11.6A5.8 5.8 0 0 1 8 12.2C4 12.2 1.8 8 1.8 8a11 11 0 0 1 2.4-2.8"/></svg>';
const XS = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
function togglePanel(v) {
  app.panel = v ?? !app.panel;
  document.body.classList.toggle('panel', app.panel); $('#panel').hidden = !app.panel; $('#panelBtn').classList.toggle('on', app.panel);
  try { localStorage.setItem('modo.panel', app.panel ? '1' : ''); } catch (e) {}
  renderPanel();
}
$('#panelBtn').addEventListener('click', () => togglePanel());
// Sekcje panelu zwijają się kliknięciem w nagłówek; program pamięta, które są zwinięte.
const FOLD_KEY = 'modo.panelFold';
let folded = new Set(['render']);
try { const f = localStorage.getItem(FOLD_KEY); if (f) folded = new Set(JSON.parse(f)); } catch (e) {}
function setFold(name, closed) {
  const sec = $(`#panel [data-sec="${name}"]`); if (!sec) return;
  closed ? folded.add(name) : folded.delete(name);
  sec.classList.toggle('closed', closed); sec.querySelector('.pfold').setAttribute('aria-expanded', String(!closed));
  try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folded])); } catch (e) {}
  if (!closed && name === 'render') renderAi();
}
for (const sec of document.querySelectorAll('#panel .psec')) {
  const name = sec.dataset.sec;
  sec.classList.toggle('closed', folded.has(name)); sec.querySelector('.pfold').setAttribute('aria-expanded', String(!folded.has(name)));
  sec.querySelector('.pfold').addEventListener('click', () => setFold(name, !folded.has(name)));
}
// otwiera panel na danej sekcji (wiaderko → Materiały, przycisk Render → Render)
function showSec(name) {
  closePops(); if (!app.panel) togglePanel(true);
  setFold(name, false);
  const sec = $(`#panel [data-sec="${name}"]`); if (sec) sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
app.showSec = showSec;
if (!folded.has('render')) setTimeout(() => renderAi());   // po wczytaniu całego pliku (lista modeli jest niżej)
/* ---------- górny pasek: przewijanie ikon w wąskim oknie ---------- */
{
  const bar = $('#topBar');
  const mask = () => { const l = bar.scrollLeft > 1, r = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1; bar.classList.toggle('lmask', l); bar.classList.toggle('rmask', r); };
  // kółko myszy przewija w bok (gładzik przewija w bok sam)
  bar.addEventListener('wheel', e => { if (bar.scrollWidth <= bar.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; bar.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });
  bar.addEventListener('scroll', () => { mask(); closePops(); });
  new ResizeObserver(mask).observe(bar); mask();
}
const groupName = g => g.name || (g.kind === 'comp' ? _t('Komponent ') + g.def.slice(1) : _t('Grupa ') + g.id);
const solidsIn = ids => ids.filter(i => typeof i === 'number').map(i => app.model.shapes.find(s => s.id === i)).filter(s => s && isSolid(s) && s.op !== 'cut');
const meshCopy = s => meshOf(JSON.parse(JSON.stringify(s)), facesOfShape);
const fmtA = a => a.toFixed(2).replace('.', ',') + ' m²', fmtV = v => v.toFixed(2).replace('.', ',') + ' m³';
// elementy „na wierzchu” zaznaczenia: grupy w całości i elementy luzem (do nadawania warstwy)
function selectionTops() {
  const groups = selectedGroups(), inG = new Set(groups.flatMap(g => membersOf(app.model, g.id)));
  const m = app.model, loose = [];
  for (const id of app.selection) {
    if (inG.has(id)) continue;
    const e = typeof id === 'number' ? m.shapes.find(s => s.id === id) : id[0] === 'l' ? m.lines.find(l => 'l' + l.id === id) : id[0] === 'd' ? m.dims.find(d => 'd' + d.id === id) : id[0] === 't' ? m.texts.find(t => 't' + t.id === id) : null;
    if (e) loose.push(e);
  }
  return [...groups, ...loose];
}
function renderPanel() {
  if (!app.panel) return;
  renderInfo(); renderTags(); renderTree();
}
function infoRow(label, value) { return `<div class="row"><span class="lbl w70">${label}</span><span class="val num">${value}</span></div>`; }
function renderInfo() {
  const m = app.model, sel = [...app.selection], B = $('#infoBody');
  const tagSelect = cur => _t`<div class="row"><span class="lbl w70">Warstwa</span><select class="fld grow" id="infTag"><option value="">bez warstwy</option>${m.tags.map(t => `<option value="${t.id}"${t.id === cur ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`;
  const size = ids => { const b = bounds(m, null, ids); return b ? infoRow(_t('Wymiary'), `${fmtNum(b.hi[0] - b.lo[0])} × ${fmtNum(b.hi[1] - b.lo[1])} × ${fmtLength(b.hi[2] - b.lo[2])}`) : ''; };
  const vol = ss => { let v = 0, a = 0; for (const s of ss) { const q = meshCopy(s); v += Math.abs(meshVolume(q)); a += meshArea(q); } return ss.length ? infoRow(_t('Pole ścian'), fmtA(a)) + infoRow(_t('Objętość'), fmtV(v)) : ''; };
  let html = '';
  if (!sel.length && app.sub.length) {
    // pojedyncze ściany i krawędzie: pole i długość
    const F = app.sub.filter(q => q.kind === 'face'), E = app.sub.filter(q => q.kind === 'edge');
    const polyArea = p => { let s = [0, 0, 0]; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s = [s[0] + a[1] * b[2] - a[2] * b[1], s[1] + a[2] * b[0] - a[0] * b[2], s[2] + a[0] * b[1] - a[1] * b[0]]; } return Math.hypot(...s) / 2; };
    const area = F.reduce((t, q) => t + q.polys.reduce((u, p) => u + polyArea(p), 0), 0), len = E.reduce((t, q) => t + Math.hypot(q.a[0] - q.b[0], q.a[1] - q.b[1], q.a[2] - q.b[2]), 0);
    html = _t`<div class="muted">${F.length && E.length ? _t('Ściany i krawędzie bryły') : F.length > 1 ? _t('Ściany bryły: ') + F.length : F.length ? _t('Ściana bryły') : E.length > 1 ? _t('Krawędzie bryły: ') + E.length : _t('Krawędź bryły')}. Dwuklik zaznacza całą bryłę.</div>`
      + (F.length ? infoRow(_t('Pole'), fmtA(area)) : '') + (E.length ? infoRow(_t('Długość'), fmtLength(len)) : '');
  } else if (!sel.length) {
    const solids = m.shapes.filter(s => isSolid(s) && s.op !== 'cut');
    html = _t`<div class="muted">Nic nie zaznaczono. Kliknij element, żeby zobaczyć jego wymiary, pole i objętość.</div>`
      + infoRow(_t('Bryły'), solids.length) + infoRow(_t('Grupy'), m.groups.filter(g => g.kind !== 'comp').length) + infoRow(_t('Komponenty'), new Set(m.groups.filter(g => g.kind === 'comp').map(g => g.def)).size + _t(' rodz. · ') + m.groups.filter(g => g.kind === 'comp').length + _t(' wyst.'))
      + vol(solids);
  } else {
    const groups = selectedGroups(), tops = selectionTops();
    const one = tops.length === 1 ? tops[0] : null;
    if (one && groups.length === 1) {
      const g = groups[0], ids = membersOf(m, g.id);
      const n = g.kind === 'comp' ? m.groups.filter(q => q.def === g.def && q.kind === 'comp').length : 0;
      html = _t`<div class="row"><span class="lbl w70">Nazwa</span><input class="fld grow" id="infName" value="${esc(groupName(g))}"></div>`
        + infoRow(_t('Rodzaj'), g.kind === 'comp' ? _t('komponent, ') + n + _t(' wyst.') : _t('grupa'))
        + tagSelect(g.tag) + size(ids) + vol(solidsIn(ids));
    } else if (one && typeof sel[0] === 'number' && sel.length === 1) {
      const s = one;
      html = _t`<div class="row"><span class="lbl w70">Nazwa</span><input class="fld grow" id="infName" value="${esc(s.name || '')}" placeholder="${isSolid(s) ? _t('Bryła') : _t('Ściana')} ${s.id}"></div>`
        + infoRow(_t('Rodzaj'), s.op === 'cut' ? _t('bryła wycinająca') : isSolid(s) ? _t('bryła') : _t('ściana')) + tagSelect(s.tag) + size([s.id])
        + (isSolid(s) ? vol([s]) : infoRow(_t('Pole'), fmtA(facesOfShape(s).reduce((a, f) => a + Math.abs(polyAreaOf(f.verts)), 0) / (facesOfShape(s).length > 1 ? 2 : 1))));
    } else if (one && sel[0][0] === 'l') {
      html = infoRow(_t('Rodzaj'), 'linia') + tagSelect(one.tag) + infoRow(_t('Długość'), fmtLength(V3.dist(one.a, one.b)));
    } else if (one && sel[0][0] === 'd') {
      html = infoRow(_t('Rodzaj'), 'wymiar') + infoRow(_t('Zmierzone'), fmtLength(V3.dist(one.a, one.b))) + _t`<div class="row"><span class="lbl w70">Tekst</span><input class="fld grow" id="infDimText" value="${esc(one.text || '')}" placeholder="zmierzony"></div>` + tagSelect(one.tag);
    } else if (one && sel[0][0] === 't') {
      html = infoRow(_t('Rodzaj'), 'opis') + `<textarea class="fld" id="infText">${esc(one.text)}</textarea>` + tagSelect(one.tag);
    } else if (sel.length === 1 && sel[0][0] === 's') {
      const q = m.sections.find(q => 's' + q.id === sel[0]);
      html = infoRow(_t('Rodzaj'), _t('płaszczyzna przekroju')) + infoRow(_t('Stan'), q?.on ? _t('włączony') : _t('wyłączony'));
    } else {
      html = infoRow(_t('Zaznaczono'), tops.length + (tops.length === 1 ? _t(' element') : tops.length < 5 ? _t(' elementy') : _t(' elementów'))) + tagSelect(tops.every(e => e.tag === tops[0]?.tag) ? tops[0]?.tag : undefined) + size(sel) + vol(solidsIn(sel));
    }
  }
  B.innerHTML = html;
  const nm = $('#infName');
  if (nm) {
    nm.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') nm.blur(); });
    nm.addEventListener('change', () => { const t = selectionTops()[0]; if (!t) return; app.checkpoint(); const v = nm.value.trim(); if (t.kind === 'comp') { for (const g of m.groups) if (g.def === t.def) g.name = v || undefined; } else t.name = v || undefined; app.markDirty(); renderTree(); });
  }
  const tg = $('#infTag');
  if (tg) tg.addEventListener('change', () => { app.checkpoint(); const v = tg.value ? +tg.value : undefined; for (const e of selectionTops()) e.tag = v; app.changed(); });
  const dt = $('#infDimText');
  if (dt) { dt.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') dt.blur(); }); dt.addEventListener('change', () => { const d = selectionTops()[0]; app.checkpoint(); d.text = dt.value.trim() || undefined; app.changed(); }); }
  const tx = $('#infText');
  if (tx) { tx.addEventListener('keydown', e => e.stopPropagation()); tx.addEventListener('change', () => { const t = selectionTops()[0]; if (!tx.value.trim()) return; app.checkpoint(); t.text = tx.value.replace(/\s+$/, ''); app.changed(); }); }
}
const polyAreaOf = P => { let x = 0, y = 0, z = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } return Math.hypot(x, y, z) / 2; };
const V3 = { dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) };
function tagCount(id) { const m = app.model; return [...m.shapes, ...m.lines, ...m.groups, ...m.dims, ...m.texts].filter(e => e.tag === id).length; }
function renderTags() {
  const m = app.model, L = $('#tagList');
  L.innerHTML = m.tags.length ? m.tags.map(t => `<div class="tagrow${t.hidden ? ' off' : ''}" data-id="${t.id}"><button class="ib" data-eye title="${t.hidden ? _t('Pokaż warstwę') : _t('Ukryj warstwę')}">${t.hidden ? EYE_OFF : EYE}</button><input class="fld" value="${esc(t.name)}" aria-label="${_t('Nazwa warstwy')}"><span class="cnt num">${tagCount(t.id) || ''}</span><button class="ib" data-del title="${_t('Usuń warstwę (elementy zostają, bez warstwy)')}">${XS}</button></div>`).join('')
    : _t('<div class="muted">Warstwy porządkują model (np. istniejące, projektowane, otoczenie). Element dostaje warstwę w sekcji Element.</div>');
  L.querySelectorAll('.tagrow').forEach(r => {
    const t = m.tags.find(q => q.id === +r.dataset.id), inp = r.querySelector('input');
    r.querySelector('[data-eye]').addEventListener('click', () => {
      t.hidden = !t.hidden || undefined;
      for (const id of [...app.selection]) { const e = typeof id === 'number' ? m.shapes.find(q => q.id === id) : id[0] === 'l' ? m.lines.find(q => 'l' + q.id === id) : id[0] === 'd' ? m.dims.find(q => 'd' + q.id === id) : id[0] === 't' ? m.texts.find(q => 't' + q.id === id) : null; if (e && isHidden(m, e)) app.selection.delete(id); }
      viewer.setHoverFace(null); app.markDirty(); viewer.setModel(m); app.refresh(); renderPanel();
    });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
    inp.addEventListener('change', () => { t.name = inp.value.trim() || t.name; app.markDirty(); renderPanel(); });
    r.querySelector('[data-del]').addEventListener('click', () => {
      app.checkpoint();
      for (const e of [...m.shapes, ...m.lines, ...m.groups, ...m.dims, ...m.texts]) if (e.tag === t.id) delete e.tag;
      m.tags = m.tags.filter(q => q !== t); app.changed();
    });
  });
}
$('#tagAdd').addEventListener('click', () => {
  const m = app.model; app.checkpoint();
  const t = { id: m.next++, name: _t('Warstwa ') + (m.tags.length + 1) };
  m.tags.push(t);
  // nowa warstwa od razu dla zaznaczenia
  const tops = selectionTops(); for (const e of tops) e.tag = t.id;
  app.changed();
  if (tops.length) toast(_t('Zaznaczone elementy są na warstwie „') + t.name + '”.');
  setTimeout(() => { const i = $(`.tagrow[data-id="${t.id}"] input`); if (i) { i.focus(); i.select(); } });
});
function renderTree() {
  const m = app.model, T = $('#tree');
  const roots = m.groups.filter(g => g.p == null);
  if (!roots.length) { T.innerHTML = _t('<div class="muted">Tu pojawią się grupy i komponenty (Spacja, ') + prettyCombo('Mod+Space', isMac) + ').</div>'; return; }
  const selG = new Set(selectedGroups().map(g => g.id));
  const rows = [];
  const walk = (g, depth) => {
    const kids = m.groups.filter(q => q.p === g.id), closed = app.treeClosed.has(g.id);
    const mem = membersOf(m, g.id), hid = mem.length && mem.every(i => { const e = typeof i === 'number' ? m.shapes.find(s => s.id === i) : m.lines.find(l => 'l' + l.id === i); return e && isHidden(m, e); });
    const ico = g.kind === 'comp' ? '<path d="M8 2.5 13.5 8 8 13.5 2.5 8z"/>' : '<rect x="3" y="3" width="10" height="10" rx="1.5"/>';
    rows.push(`<div class="tnode${selG.has(g.id) ? ' sel' : ''}${app.editing === g.id ? ' edit' : ''}${hid ? ' hid' : ''}" data-id="${g.id}" style="padding-left:${depth * 14}px"><span class="arr">${kids.length ? (closed ? '▸' : '▾') : ''}</span><svg class="ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">${ico}</svg><span class="nm">${esc(groupName(g))}</span><button class="ib" title="${hid ? _t('Pokaż') : _t('Ukryj')}">${hid ? EYE_OFF : EYE}</button></div>`);
    if (!closed) for (const k of kids) walk(k, depth + 1);
  };
  for (const g of roots) walk(g, 0);
  const loose = m.shapes.filter(s => s.g == null && isSolid(s)).length;
  if (loose) rows.push(`<div class="muted" style="padding:4px 0 0 20px">${loose} ${loose === 1 ? _t('bryła') : loose < 5 ? _t('bryły') : _t('brył')} ${_t('poza grupami')}</div>`);
  T.innerHTML = rows.join('');
  T.querySelectorAll('.tnode').forEach(r => {
    const g = m.groups.find(q => q.id === +r.dataset.id);
    r.querySelector('.arr').addEventListener('click', e => { e.stopPropagation(); app.treeClosed.has(g.id) ? app.treeClosed.delete(g.id) : app.treeClosed.add(g.id); renderTree(); });
    r.querySelector('.ib').addEventListener('click', e => {
      e.stopPropagation();
      const mem = new Set(membersOf(m, g.id)), hide = !r.classList.contains('hid');
      setHidden(id => mem.has(id) ? hide : undefined);
    });
    r.addEventListener('click', () => {
      // zaznaczenie grupy: najpierw wejście do jej rodzica (albo wyjście do całego modelu)
      if (app.editSolid != null) app.exitSolid();
      if (app.editing !== g.p) { if (g.p == null) { while (app.editing) app.exitGroup(); } else app.enterGroup(g.p); }
      app.selection.clear(); membersOf(m, g.id).forEach(i => app.selection.add(i)); app.selectionChanged();
    });
    r.addEventListener('dblclick', () => app.enterGroup(g.id));
  });
}
try { if (localStorage.getItem('modo.panel')) setTimeout(() => togglePanel(true)); } catch (e) {}

/* ---------- biblioteka modeli ---------- */
$('#libBtn').addEventListener('click', () => openPop('#libPop', $('#libBtn')));
// miniatura: krawędzie w rzucie aksonometrycznym, jako rysunek kreską
function thumb(item, W = 96, H = 60) {
  const ca = Math.cos(-0.6), sa = Math.sin(-0.6);
  const pr = p => { const x = p[0] * ca - p[1] * sa, y = p[0] * sa + p[1] * ca; return [x, -p[2] - y * 0.42]; };
  const segs = [];
  const ex = [ca, -sa, 0], ey = [-0.42 * sa, -0.42 * ca, -1], vd = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const sh of item.shapes) for (const e of edgesOf(sh)) {
    // gładkie bryły (krzew, koła): tylko kontur
    if ((sh.soft || e.soft) && e.n2 && (dot(e.n1, vd) > 0) === (dot(e.n2, vd) > 0)) continue;
    segs.push([pr(e.a), pr(e.b)]);
  }
  for (const l of item.lines || []) segs.push([pr(l.a), pr(l.b)]);
  if (!segs.length) return '';
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = Math.min((W - 10) / (x1 - x0 || 1), (H - 8) / (y1 - y0 || 1)), ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = (H - (y1 - y0) * k) / 2 - y0 * k;
  const d = segs.map(([a, b]) => `M${(a[0] * k + ox).toFixed(1)} ${(a[1] * k + oy).toFixed(1)}L${(b[0] * k + ox).toFixed(1)} ${(b[1] * k + oy).toFixed(1)}`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" aria-hidden="true"><path d="${d}"/></svg>`;
}
const libCache = new Map();
const libItem = it => { if (!libCache.has(it.key)) libCache.set(it.key, { ...it.make(), name: it.name, key: it.key }); return libCache.get(it.key); };
function renderLib() {
  $('#libGrid').innerHTML = LIBRARY.map(it => `<button class="libitem" data-k="${it.key}">${thumb(libItem(it))}<span>${it.name}</span></button>`).join('');
  $('#libGrid').querySelectorAll('.libitem').forEach(b => b.addEventListener('click', () => startPlace(libItem(LIBRARY.find(i => i.key === b.dataset.k)))));
  const mine = loadUserLib();
  $('#libMine').innerHTML = mine.map((it, i) => `<div class="libitem" role="button" tabindex="0" data-i="${i}">${thumb(it)}<span>${esc(it.name)}</span><button class="del" title="${_t('Usuń z biblioteki')}">${XS}</button></div>`).join('');
  $('#libNote').hidden = mine.length > 0;
  $('#libMine').querySelectorAll('.libitem').forEach(b => {
    const i = +b.dataset.i;
    b.addEventListener('click', e => { if (e.target.closest('.del')) return; startPlace(mine[i]); });
    b.querySelector('.del').addEventListener('click', () => { const l = loadUserLib(); l.splice(i, 1); saveUserLib(l); renderLib(); });
  });
}
function startPlace(item) {
  closePops();
  if (app.editSolid != null) app.exitSolid();
  setTool('place'); tools.place.setItem(item); app.refresh();
}
// wstawienie: kopie elementów z nowymi numerami, przesunięte do punktu, opakowane w komponent
app.placeItem = (item, p) => {
  if (item.paste) return insertItems(item, p);
  const m = app.model, data = JSON.parse(JSON.stringify(item));
  app.checkpoint();
  const gid = m.next++, gmap = new Map(), smap = new Map();
  for (const g of data.groups || []) gmap.set(g.id, m.next++);
  for (const g of data.groups || []) { g.id = gmap.get(g.id); g.p = g.p != null && gmap.has(g.p) ? gmap.get(g.p) : gid; if (g.frame) g.frame.o = g.frame.o.map((x, k) => x + p[k]); if (g.kind === 'comp') g.def = 'd' + g.id + 'x'; m.groups.push(g); }
  // definicje zagnieżdżonych komponentów: te same w obrębie wstawienia
  const defs = new Map(); for (const g of data.groups || []) if (g.kind === 'comp') { const k = item.groups.find(q => gmap.get(q.id) === g.id)?.def; if (!defs.has(k)) defs.set(k, g.def); g.def = defs.get(k); }
  for (const s of data.shapes) { const id = m.next++; smap.set(s.id, id); s.id = id; s.g = s.g != null && gmap.has(s.g) ? gmap.get(s.g) : gid; translateShape(s, p); delete s.tag; m.shapes.push(s); }
  for (const l of data.lines || []) { l.id = m.next++; l.g = l.g != null && gmap.has(l.g) ? gmap.get(l.g) : gid; l.a = l.a.map((x, k) => x + p[k]); l.b = l.b.map((x, k) => x + p[k]); m.lines.push(l); }
  m.groups.push({ id: gid, kind: 'comp', def: 'd' + gid, frame: IDENT(p), name: item.name, p: app.editing ?? undefined });
  app.noStitch = true; app.changed(); app.noStitch = false;
  app.selection.clear(); membersOf(m, gid).forEach(i => app.selection.add(i));
  setTool('select'); app.selectionChanged();
};
$('#libSave').addEventListener('click', () => {
  const m = app.model, ids = new Set(app.selection);
  const shapes = m.shapes.filter(s => ids.has(s.id)), lines = m.lines.filter(l => ids.has('l' + l.id));
  if (!shapes.length && !lines.length) return toast(_t('Zaznacz bryły albo grupę, którą chcesz zapisać w bibliotece.'));
  const b = bounds(m, null, [...ids]), o = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, b.lo[2]], neg = o.map(x => -x);
  const groups = groupsWhollyIn(m, ids).map(g => JSON.parse(JSON.stringify(g)));
  const gset = new Set(groups.map(g => g.id));
  // grupa obejmująca całe zaznaczenie znika — wstawienie i tak tworzy własny komponent
  const outer = groups.filter(g => g.p == null || !gset.has(g.p));
  const single = outer.length === 1 && shapes.every(s => s.g != null) ? outer[0] : null;
  const keep = groups.filter(g => g !== single);
  for (const g of keep) { if (g.p == null || !gset.has(g.p) || g.p === single?.id) delete g.p; if (g.frame) g.frame.o = g.frame.o.map((x, k) => x + neg[k]); delete g.tag; }
  const S = shapes.map(s => { const c = JSON.parse(JSON.stringify(s)); translateShape(c, neg); if (c.g == null || !gset.has(c.g) || c.g === single?.id) delete c.g; delete c.hidden; delete c.tag; return c; });
  const L = lines.map(l => { const c = JSON.parse(JSON.stringify(l)); c.a = c.a.map((x, k) => x + neg[k]); c.b = c.b.map((x, k) => x + neg[k]); if (c.g == null || !gset.has(c.g) || c.g === single?.id) delete c.g; delete c.hidden; delete c.tag; return c; });
  const name = (single && single.name) || _t('Model ') + (loadUserLib().length + 1);
  const list = loadUserLib(); list.push({ name, shapes: S, lines: L, groups: keep });
  if (!saveUserLib(list)) return toast(_t('Nie udało się zapisać biblioteki (za mało miejsca).'));
  renderLib(); toast(_t('Zapisano w bibliotece jako „') + name + _t('”. Nazwę zmienisz w panelu, nadając ją grupie przed zapisem.'));
});

/* ---------- przekroje ---------- */
const selectedSections = () => (app.model.sections || []).filter(q => app.selection.has('s' + q.id));
function sectionToggle() {
  const all = app.model.sections || [];
  if (!all.length) return toast(_t('Nie ma jeszcze przekroju — narysuj go narzędziem Przekrój.'));
  const sel = selectedSections()[0], active = all.find(q => q.on);
  app.checkpoint();
  if (sel) { const on = !sel.on; all.forEach(q => q.on = false); sel.on = on; }
  else if (active) active.on = false;
  else { const q = all[all.length - 1]; q.on = true; }
  app.changed(); renderViewPop();
  toast(all.some(q => q.on) ? _t('Przekrój włączony') : _t('Przekrój wyłączony'));
}

/* ---------- widok, kamera, sceny ---------- */
const VIEWS = [['viewIso', _t('Izometria')], ['viewTop', _t('Góra')], ['viewFront', _t('Przód')], ['viewRight', _t('Prawy')], ['viewBack', _t('Tył')], ['viewLeft', _t('Lewy')], ['viewBottom', _t('Dół')]];
// polecenia widoku pokazane samymi ikonami (nazwa i skrót w podpowiedzi)
const VIEW_ICONS = [['viewPrev', _t('Poprzedni widok')], ['viewNext', _t('Następny widok')], ['zoomWin', _t('Powiększ okno (ramką)')], ['extents', _t('Pokaż cały model')], ['look', _t('Rozejrzyj się')], ['walk', _t('Spacer')], ['camPos', _t('Ustaw kamerę')], ['xray', _t('Prześwit')], ['backEdges', _t('Krawędzie tylne')], ['wire', _t('Siatka — same krawędzie')], ['fog', _t('Mgła')], ['hiddenGeo', _t('Ukryta geometria')], ['guides', _t('Prowadnice: pokaż / ukryj')]];
const VIEW_ON = { xray: () => viewer.xray, wire: () => viewer.wire, fog: () => viewer.fog, hiddenGeo: () => viewer.showHidden, backEdges: () => viewer.backEdges, guides: () => viewer.showGuides !== false };
const tipOf = (id, name) => { const c = keysFor(id, app.keys.over)[0]; return name + (c ? ' (' + prettyCombo(c, isMac) + ')' : ''); };
const iconBtn = ([id, name], on) => `<button class="ib${on ? ' on' : ''}" data-a="${id}" title="${tipOf(id, name)}" aria-label="${name}">${ic(id)}</button>`;
// okienko Edycja: polecenia, które dotąd miały tylko skrót albo menu podręczne
const EDIT_ICONS = [[['undo', _t('Cofnij')], ['redo', _t('Ponów')]], [['cutClip', _t('Wytnij')], ['copy', _t('Kopiuj')], ['paste', _t('Wklej (wskaż miejsce)')], ['pasteInPlace', _t('Wklej w tym samym miejscu')]], [['selectAll', _t('Zaznacz wszystko')], ['selectNone', _t('Odznacz wszystko')], ['selectInvert', _t('Odwróć zaznaczenie')]], [['hideSel', _t('Ukryj zaznaczone')], ['unhideAll', _t('Pokaż wszystko')], ['lock', _t('Zablokuj zaznaczone')], ['unlockAll', _t('Odblokuj wszystko')]], [['flipX', _t('Odbij wzdłuż osi czerwonej')], ['flipY', _t('Odbij wzdłuż osi zielonej')], ['flipZ', _t('Odbij wzdłuż osi niebieskiej')], ['makeFaces', _t('Ściany z zaznaczonych linii')], ['intersect', _t('Przetnij ściany brył')], ['cleanLines', _t('Usuń luźne krawędzie')]], [['soften', _t('Wygładź krawędzie (do 30°)')], ['unsoften', _t('Przywróć wygładzone krawędzie')]]];
function renderEditPop() {
  const p = $('#editPop');
  p.innerHTML = EDIT_ICONS.map(g => `<div class="icons">${g.map(i => iconBtn(i)).join('')}</div>`).join('');
  p.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const a = b.dataset.a; if (a === 'paste') closePops(); run(a); }));
}
$('#editBtn').addEventListener('click', () => openPop('#editPop', $('#editBtn')));
app.scenes = []; app.scene = -1;
const mmOf = fov => Math.round(12 / Math.tan(fov * Math.PI / 360));
$('#viewBtn').addEventListener('click', () => openPop('#viewPop', $('#viewBtn')));
function renderViewPop() {
  if ($('#viewPop').hidden) return;
  const k = id => { const c = keysFor(id, app.keys.over)[0]; return c ? '<kbd>' + prettyCombo(c, isMac) + '</kbd>' : ''; };
  $('#viewGrid').innerHTML = VIEWS.map(([id, n]) => `<button data-a="${id}"><span>${n}</span>${k(id)}</button>`).join('');
  $('#viewGrid').querySelectorAll('button').forEach(b => b.addEventListener('click', () => run(b.dataset.a)));
  $('#viewIcons').innerHTML = VIEW_ICONS.map(i => iconBtn(i, VIEW_ON[i[0]]?.())).join('');
  $('#viewIcons').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (['zoomWin', 'look', 'walk', 'camPos'].includes(b.dataset.a)) closePops(); run(b.dataset.a); }));
  const proj = viewer.ortho ? 'ortho' : viewer.twoPoint ? 'two' : 'persp';
  document.querySelectorAll('#projSeg button').forEach(b => b.classList.toggle('on', b.dataset.proj === proj));
  const f = $('#fovRange'); f.value = Math.round(viewer.cam.fov); f.disabled = viewer.ortho; setRangeFill(f);
  $('#fovLbl').textContent = viewer.ortho ? '—' : Math.round(viewer.cam.fov) + '° · ' + mmOf(viewer.cam.fov) + ' mm';
  const secs = app.model.sections || [];
  $('#secRow').hidden = !secs.length;
  $('#secOn').checked = secs.some(q => q.on); $('#secPlanes').checked = viewer.showSectPlanes;
  const L = $('#sceneList');
  L.innerHTML = app.scenes.map((sc, i) => `<div class="scene${i === app.scene ? ' on' : ''}" data-i="${i}"><button class="no num" title="${_t('Pokaż scenę')}">${i + 1}</button><input class="fld" value="${sc.name.replace(/"/g, '&quot;')}" aria-label="${_t('Nazwa sceny')}"><button class="ib" data-u title="${_t('Zapisz bieżący widok w tej scenie')}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg></button><button class="ib" data-d title="${_t('Usuń scenę')}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>`).join('');
  L.querySelectorAll('.scene').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('.no').addEventListener('click', () => showScene(i));
    const inp = row.querySelector('input');
    inp.addEventListener('change', () => { app.scenes[i].name = inp.value.trim() || _t('Scena ') + (i + 1); app.markDirty(); });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
    row.querySelector('[data-u]').addEventListener('click', () => { app.scenes[i] = { ...captureScene(), name: app.scenes[i].name }; app.scene = i; app.markDirty(); renderViewPop(); toast(_t('Zaktualizowano scenę „') + app.scenes[i].name + '”'); });
    row.querySelector('[data-d]').addEventListener('click', () => { app.scenes.splice(i, 1); if (app.scene >= app.scenes.length) app.scene = app.scenes.length - 1; app.markDirty(); renderViewPop(); });
  });
}
document.querySelectorAll('#projSeg button').forEach(b => b.addEventListener('click', () => {
  const want = b.dataset.proj;
  if (want === 'ortho') { if (!viewer.ortho) viewer.toggleOrtho(); }
  else { if (viewer.ortho) viewer.toggleOrtho(); viewer.setTwoPoint(want === 'two'); }
  renderViewChip(); renderViewPop();
}));
$('#fovRange').addEventListener('input', e => { viewer.setFov(+e.target.value); setRangeFill(e.target); $('#fovLbl').textContent = Math.round(viewer.cam.fov) + '° · ' + mmOf(viewer.cam.fov) + ' mm'; });
$('#sceneAdd').addEventListener('click', addScene);
$('#secOn').addEventListener('change', () => sectionToggle());
$('#secPlanes').addEventListener('change', () => run('sectionPlanes'));
const captureScene = () => ({ camera: viewer.getCamera(), style: viewer.style, fog: !!viewer.fog, wire: !!viewer.wire, sun: { ...viewer.sunCfg }, section: (app.model.sections || []).find(q => q.on)?.id ?? null });
function addScene() {
  app.scenes.push({ name: _t('Scena ') + (app.scenes.length + 1), ...captureScene() });
  app.scene = app.scenes.length - 1; app.markDirty();
  toast(_t('Dodano scenę „') + app.scenes[app.scene].name + '”');
  renderViewPop();
}
function showScene(i) {
  const sc = app.scenes[i]; if (!sc) return;
  app.scene = i;
  viewer.setCamera(sc.camera);
  if (sc.style && STYLES[sc.style]) setStyle(sc.style);
  if ('fog' in sc) viewer.setLook({ fog: sc.fog, wire: sc.wire });
  if (sc.sun) { viewer.setSun(sc.sun); renderSun(); }
  if ('section' in sc && app.model.sections?.length) { for (const q of app.model.sections) q.on = q.id === sc.section; viewer.rebuild(); }
  renderViewChip(); renderViewPop();
}
function goScene(d) {
  if (!app.scenes.length) return toast(_t('Nie ma jeszcze scen — dodaj je w okienku Widok.'));
  const i = ((app.scene < 0 ? (d > 0 ? -1 : 0) : app.scene) + d + app.scenes.length) % app.scenes.length;
  showScene(i); toast(app.scenes[i].name);
}

/* ---------- słońce ---------- */
const MON = lang === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];   // i18n-ok
function setSun(c) { viewer.setSun(c); renderSun(); app.markDirtySoft(); }
app.markDirtySoft = () => { if (!app.file.dirty && app.model.shapes.length) app.markDirty(); };
const setRangeFill = el => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
function renderSun() {
  const c = viewer.sunCfg, [Y, M, D] = c.date.split('-').map(Number);
  // na pasku jest sama ikona; data, godzina i miejsce — w podpowiedzi
  { const t = `${_t('Słońce i cienie')} · ${D} ${MON[M - 1]} · ${fmtHour(c.hour)} · ${placeName(c)}`; $('#sunBtn').title = t; $('#sunBtn').setAttribute('aria-label', t); }
  if ($('#sunPop').hidden) return;
  $('#placeLbl').textContent = `${placeName(c)} · ${c.lat.toFixed(2).replace('.', ',')}° N · ${c.lon.toFixed(2).replace('.', ',')}° E`;
  $('#sunDate').value = c.date;
  $('#sunHourLbl').textContent = fmtHour(c.hour);
  $('#sunShadows').checked = c.shadows;
  const s1 = $('#sunSoft'); s1.value = c.soft; setRangeFill(s1);
  const s2 = $('#sunLight'); s2.value = c.light; setRangeFill(s2);
  if (document.activeElement !== $('#sunLat')) $('#sunLat').value = String(c.lat).replace('.', ',');
  if (document.activeElement !== $('#sunLon')) $('#sunLon').value = String(c.lon).replace('.', ',');
  const { rise, set } = sunRiseSet(c.date, c.lat, c.lon, c.tz);
  const p = sunPosition(c.date, c.hour, c.lat, c.lon, c.tz);
  $('#sunRise').textContent = rise != null ? _t('wschód ') + fmtHour(rise) : '';
  $('#sunSet').textContent = set != null ? _t('zachód ') + fmtHour(set) : '';
  $('#sunAltAz').textContent = p.alt > 0 ? _t`wysokość ${Math.round(p.alt)}° · azymut ${Math.round(p.az)}°` : _t('słońce pod horyzontem');
  // łuk drogi słońca od wschodu do zachodu; suwak godziny obejmuje ten sam zakres
  const h0 = rise != null ? Math.max(0, Math.floor(rise * 2) / 2 - 0.5) : 0, h1 = set != null ? Math.min(24, Math.ceil(set * 2) / 2 + 0.5) : 24;
  const hs = $('#sunHour'); hs.min = h0; hs.max = h1; hs.value = c.hour; setRangeFill(hs);
  const pts = []; let maxA = 10;
  for (let i = 0; i <= 80; i++) { const t = h0 + (h1 - h0) * i / 80, a = sunPosition(c.date, t, c.lat, c.lon, c.tz).alt; pts.push([t, a]); maxA = Math.max(maxA, a); }
  const sx = t => 10 + 268 * (t - h0) / (h1 - h0), sy = a => 70 - Math.max(a, -6) * (58 / maxA);
  const d = pts.map(([t, a], i) => (i ? 'L' : 'M') + sx(t).toFixed(1) + ' ' + sy(a).toFixed(1)).join(' ');
  const cx = sx(Math.max(h0, Math.min(h1, c.hour))), cy = sy(p.alt);
  $('#sunArc').innerHTML = `<path d="M4 70h280" style="stroke:var(--line)"/><path d="${d}" fill="none" style="stroke:var(--muted2)" stroke-width="1.2" stroke-dasharray="2 3"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" style="fill:var(--card);stroke:var(--text)" stroke-width="1.4"/><line x1="${cx.toFixed(1)}" y1="${(cy + 6).toFixed(1)}" x2="${cx.toFixed(1)}" y2="70" style="stroke:var(--text)" stroke-dasharray="1.5 2.5"/>`;
}
const placeName = c => (Math.abs(c.lat - 52.23) < 0.05 && Math.abs(c.lon - 21.01) < 0.05) ? _t('Warszawa') : _t('własne miejsce');
$('#sunBtn').addEventListener('click', () => openPop('#sunPop', $('#sunBtn')));
$('#sunDate').addEventListener('change', e => e.target.value && setSun({ date: e.target.value }));
$('#sunToday').addEventListener('click', () => setSun({ date: new Date().toISOString().slice(0, 10) }));
$('#sunHour').addEventListener('input', e => setSun({ hour: +e.target.value }));
$('#sunShadows').addEventListener('change', e => setSun({ shadows: e.target.checked }));
$('#sunSoft').addEventListener('input', e => setSun({ soft: +e.target.value }));
$('#sunLight').addEventListener('input', e => setSun({ light: +e.target.value }));
for (const [id, k] of [['#sunLat', 'lat'], ['#sunLon', 'lon']]) $(id).addEventListener('change', e => { const v = parseFloat(e.target.value.replace(',', '.')); if (isFinite(v)) setSun({ [k]: v }); });

/* ---------- eksport PNG ---------- */
let pngSize = 'x2';
function pngDims() {
  const asp = viewer.w / viewer.h;
  if (pngSize === 'x2') return [Math.round(viewer.w * 2), Math.round(viewer.h * 2)];
  if (pngSize === '4k') return [3840, Math.round(3840 / asp)];
  if (pngSize === '6k') return [6000, Math.round(6000 / asp)];
  return [parseInt($('#pngW').value, 10) || 3000, parseInt($('#pngH').value, 10) || Math.round(3000 / asp)];
}
function pngName() { const c = viewer.sunCfg, [, M, D] = c.date.split('-').map(Number); return `${app.file.name} · ${D} ${MON[M - 1]} ${fmtHour(c.hour).replace(':', '.')}`; }
function renderPng() {
  document.querySelectorAll('#pngSize button').forEach(b => b.classList.toggle('on', b.dataset.s === pngSize));
  const [W, H] = pngDims();
  if (pngSize !== 'own') { $('#pngW').value = W; $('#pngH').value = H; }
  $('#pngName').textContent = pngName() + '.png';
  $('#pngUnder').disabled = !app.underlay;
}
document.querySelectorAll('#pngSize button').forEach(b => b.addEventListener('click', () => { pngSize = b.dataset.s; renderPng(); }));
$('#pngW').addEventListener('input', () => { pngSize = 'own'; $('#pngH').value = Math.round($('#pngW').value * viewer.h / viewer.w) || ''; renderPng(); });
$('#pngH').addEventListener('input', () => { pngSize = 'own'; $('#pngW').value = Math.round($('#pngH').value * viewer.w / viewer.h) || ''; renderPng(); });
$('#pngBtn').addEventListener('click', () => openPop('#pngPop', $('#pngBtn')));
$('#pngGo').addEventListener('click', async () => {
  let [W, H] = pngDims();
  const max = viewer.renderer.capabilities.maxTextureSize || 8192;
  if (W > max || H > max) { const k = max / Math.max(W, H); W = Math.floor(W * k); H = Math.floor(H * k); toast(_t`Największy obraz na tym komputerze: ${W} × ${H} px`); }
  $('#pngGo').disabled = true; $('#pngGo').textContent = _t('Liczę…');
  try {
    const blob = await viewer.exportPng(W, H, { transparent: $('#pngTransparent').checked, axes: $('#pngAxes').checked, underlay: $('#pngUnder').checked, dark: viewer.dark && $('#pngDark').checked, guides: $('#pngGuides').checked });
    const p = await api.savePng(new Uint8Array(await blob.arrayBuffer()), pngName());
    if (p) { closePops(); toast(_t('Zapisano obraz ') + W + ' × ' + H + ' px', api.web ? null : [_t('Pokaż'), () => api.showInFolder(p)]); }
  } catch (err) { toast(_t('Nie udało się zapisać obrazu: ') + err.message); }
  $('#pngGo').disabled = false; $('#pngGo').textContent = _t('Zapisz…');
});

/* ---------- podkład CAD ---------- */
const UNIT_M = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, in: 0.0254, ft: 0.3048 };
async function pickUnderlay(path) {
  const r = await api.pickUnderlay(path || null);
  if (!r) return;
  if (r.error) {
    if (r.code === 'NO_ODA') { openPop('#underPop', $('#underBtn')); toast(_t('Do plików DWG potrzebny jest darmowy ODA File Converter.'), [_t('Pobierz'), () => api.openExternal('https://www.opendesign.com/guestfiles/oda_file_converter')]); }
    else toast(r.error);
    return;
  }
  try {
    let d;
    if (r.dwg) {
      toast(_t('Czytam ') + r.name + '…'); await new Promise(res => setTimeout(res, 30));
      try { d = await (await import('./dwg.js')).readDwg(r.data, parseDxf); }
      catch (err) {
        // zapas: ODA File Converter, jeśli jest zainstalowany
        const o = r.path ? await api.dwgViaOda(r.path) : { code: 'NO_ODA' };
        if (o.data) d = parseDxf(o.data);
        else if (o.code === 'NO_ODA') { toast(_t('Tego pliku DWG nie udało się odczytać wbudowanym czytnikiem. Pomoże darmowy ODA File Converter albo zapis rysunku jako DXF.'), api.web ? null : [_t('Pobierz ODA'), () => api.openExternal('https://www.opendesign.com/guestfiles/oda_file_converter')]); return; }
        else throw new Error(o.error || err.message);
      }
    } else d = parseDxf(r.data);
    app.underlay = { name: r.name, path: r.path || null, converted: !!r.dwg, height: app.underlay?.height ?? 0, opacity: 0.6, snap: true, units: d.units, offset: d.offset, layers: d.layers, truncated: d.truncated };
    applyUnderlay();
    viewer.zoomExtents();
    closePops(); openPop('#underPop', $('#underBtn'));
    app.markDirty();
  } catch (err) { toast(_t('Nie udało się odczytać pliku: ') + err.message); }
}
function applyUnderlay() { viewer.setUnderlay(app.underlay); snapper.setUnderlay(app.underlay); $('#underBtn').classList.toggle('on', !!app.underlay); }
async function renderUnder() {
  const u = app.underlay;
  $('#underEmpty').hidden = !!u; $('#underFull').hidden = !u;
  if (!u) {
    const s = await api.odaStatus();
    $('#odaInfo').innerHTML = s.web ? ''
      : s.path ? _t('ODA File Converter jest zainstalowany — posłuży jako zapas, gdyby wbudowany czytnik nie poradził sobie z plikiem.')
        : _t('Gdyby jakiś plik DWG się nie otworzył, zapasem jest darmowy ODA File Converter. <a href="#" id="odaGet">Pobierz</a> · <a href="#" id="odaPick">Wskaż program…</a>');
    $('#odaGet')?.addEventListener('click', e => { e.preventDefault(); api.openExternal('https://www.opendesign.com/guestfiles/oda_file_converter'); });
    $('#odaPick')?.addEventListener('click', async e => { e.preventDefault(); await api.odaPick(); renderUnder(); });
    return;
  }
  $('#underName').textContent = u.name;
  $('#underInfo').textContent = (u.converted ? _t('Odczytany z DWG · ') : '') + _t('środek rysunku przesunięty do początku układu') + (u.truncated ? _t(' · plik bardzo duży, część linii pominięta') : '');
  if (document.activeElement !== $('#underH')) $('#underH').value = String(u.height).replace('.', ',') + ' m';
  $('#underUnits').value = u.units;
  const op = $('#underOp'); op.value = u.opacity; setRangeFill(op);
  $('#underSnap').checked = u.snap;
  $('#underCount').textContent = `${u.layers.filter(l => l.visible).length} z ${u.layers.length}`;
  const box = $('#underLayers'); box.innerHTML = '';
  for (const L of u.layers) {
    const row = document.createElement('div'); row.className = 'layer' + (L.visible ? '' : ' off');
    row.innerHTML = `<i style="background:${L.color}"></i><span title="${L.name}">${L.name}</span><span class="num">${L.segs.length / 4}</span>`;
    const b = document.createElement('button'); b.className = 'ib sm'; b.setAttribute('aria-label', (L.visible ? _t('Ukryj') : _t('Pokaż')) + _t(' warstwę ') + L.name);
    b.innerHTML = L.visible ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.8 8S4 3.8 8 3.8 14.2 8 14.2 8 12 12.2 8 12.2 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="2"/></svg>'
      : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M2.5 2.5l11 11M6.5 4c.5-.1 1-.2 1.5-.2 4 0 6.2 4.2 6.2 4.2s-.6 1.1-1.7 2.3M10 11.7c-.6.3-1.3.5-2 .5-4 0-6.2-4.2-6.2-4.2s.8-1.5 2.3-2.8"/></svg>';
    b.addEventListener('click', () => { L.visible = !L.visible; applyUnderlay(); renderUnder(); app.markDirty(); });
    row.append(b); box.append(row);
  }
}
$('#underBtn').addEventListener('click', () => openPop('#underPop', $('#underBtn')));
$('#underPick').addEventListener('click', () => pickUnderlay());
$('#underClose').addEventListener('click', () => closePops());
$('#underReload').addEventListener('click', () => (app.underlay?.path || api.web) ? pickUnderlay(app.underlay?.path) : pickUnderlay());
$('#underRemove').addEventListener('click', () => { app.underlay = null; applyUnderlay(); renderUnder(); app.markDirty(); });
$('#underLines').addEventListener('click', () => underlayToLines());
$('#underH').addEventListener('change', e => {
  const v = parseFloat(e.target.value.replace(',', '.')); if (!isFinite(v) || !app.underlay) return;
  app.underlay.height = v; applyUnderlay(); renderUnder(); app.markDirty();
});
$('#underUnits').addEventListener('change', e => {
  const u = app.underlay; if (!u) return;
  const k = UNIT_M[e.target.value] / UNIT_M[u.units];
  for (const L of u.layers) L.segs = L.segs.map(v => Math.round(v * k * 1000) / 1000);
  u.offset = u.offset.map(v => v * k); u.units = e.target.value;
  applyUnderlay(); viewer.zoomExtents(); renderUnder(); app.markDirty();
});
$('#underOp').addEventListener('input', e => { if (!app.underlay) return; app.underlay.opacity = +e.target.value; setRangeFill(e.target); applyUnderlay(); });
$('#underSnap').addEventListener('change', e => { if (!app.underlay) return; app.underlay.snap = e.target.checked; snapper.setUnderlay(app.underlay); });

// Podkład zamieniony na prawdziwe linie: grupa z liniami na wysokości podkładu, warstwy rysunku stają się warstwami Modo.
// Po wejściu do grupy można na nich rysować, a „Ściany z linii” wypełnia zamknięte pola.
const UNDER_MAX = 20000;
function underlayToLines() {
  const u = app.underlay; if (!u) return;
  const layers = u.layers.filter(L => L.visible && L.segs.length), count = layers.reduce((n, L) => n + L.segs.length / 4, 0);
  if (!count) return toast(_t('Żadna warstwa podkładu nie jest widoczna.'));
  if (count > UNDER_MAX) return toast(_t`Widoczne warstwy mają ${count} odcinków — to za dużo na linie do rysowania (do ${UNDER_MAX}). Ukryj zbędne warstwy podkładu i spróbuj ponownie.`);
  const m = app.model; app.checkpoint();
  const gid = m.next++; m.groups.push({ id: gid, kind: 'group', name: u.name.replace(/\.(dxf|dwg)$/i, '') });
  const seen = new Set(); let made = 0;
  for (const L of layers) {
    let tag = m.tags.find(t => t.name === L.name); if (!tag) { tag = { id: m.next++, name: L.name }; m.tags.push(tag); }
    for (let i = 0; i < L.segs.length; i += 4) {
      const a = [L.segs[i], L.segs[i + 1], u.height], b = [L.segs[i + 2], L.segs[i + 3], u.height];
      if (V.dist(a, b) < 1e-5) continue;
      const k = a.concat(b).map(x => Math.round(x * 1e4)).join(','), k2 = b.concat(a).map(x => Math.round(x * 1e4)).join(',');
      if (seen.has(k) || seen.has(k2)) continue; seen.add(k);
      m.lines.push({ id: m.next++, a, b, g: gid, tag: tag.id }); made++;
    }
  }
  app.underlay = null; applyUnderlay(); closePops();
  app.selection.clear(); for (const id of membersOf(m, gid)) app.selection.add(id);
  app.noStitch = true; app.changed(); app.noStitch = false; app.selectionChanged();
  toast(_t`Podkład zamieniony na ${made} linii w jednej grupie. Dwuklik wchodzi do grupy; „Ściany z linii” wypełnia zamknięte pola.`, [_t('Ściany z linii'), () => makeFaces()], 9000);
}
// „Przetnij ściany” (Intersect Faces): tam, gdzie ściany brył przechodzą przez siebie, powstają krawędzie, które dzielą te ściany.
// Z zaznaczeniem — zaznaczone bryły z resztą; bez — wszystkie bryły luzem (w edytowanej grupie: jej bryły).
function intersectSel() {
  const m = app.model, ids = new Set([...app.selection].filter(i => typeof i === 'number'));
  const segs = intersectFaces(m, ids.size ? ids : null, app.editing ?? null);
  if (!segs.length) return toast(ids.size ? _t('Zaznaczone bryły nie przecinają się z żadną inną.') : _t('Żadne bryły się nie przecinają.'));
  if (segs.length > 1500) return toast(_t('Za dużo krawędzi przecięcia naraz. Zaznacz mniej brył.'));
  app.checkpoint();
  const lines0 = new Set(m.lines);
  for (const [a, b] of segs) { const l = { id: m.next++, a, b }; if (app.editing) l.g = app.editing; m.lines.push(l); }
  app.stitchLimit = 2000; app.selection.clear(); app.changed(); app.stitchLimit = 0; app.selectionChanged();
  const left = app.model.lines.filter(l => !lines0.has(l)).length;
  toast(_t`Krawędzie przecięcia: ${segs.length}. Ściany są podzielone wzdłuż nich` + (left ? _t`; ${left} zostało jako luźne linie.` : '.'));
}
// „Wygładź krawędzie”: krawędzie między ścianami, które stykają się pod kątem do 30°, przestają być rysowane (zostaje kontur),
// a ściany cieniują się gładko — do powierzchni obłych i skręconych. Z zaznaczonymi ścianami działa tylko na nie.
function softenSel(on) {
  const s = app.model.shapes.find(q => q.geo && (q.g ?? null) === (app.editing ?? null)); if (!s) return toast(_t('Nie ma geometrii do wygładzenia.'));
  const faces = app.sub.filter(q => q.kind === 'face' && q.id === s.id), keyOf = p => p.map(x => Math.round(x * 1e4)).join(',');
  const mine = faces.length ? new Set(faces.flatMap(f => f.pts.map(keyOf))) : null, inSel = e => !mine || (mine.has(keyOf(e.a)) && mine.has(keyOf(e.b)));
  const segK = (a, b) => { const x = keyOf(a), y = keyOf(b); return x < y ? x + '|' + y : y + '|' + x; };
  app.checkpoint();
  if (on) {
    const have = new Set((s.softs || []).map(([a, b]) => segK(a, b))), add = [];
    for (const e of edgesOf(s)) if (e.n2 && !e.soft && inSel(e) && V.dot(e.n1, e.n2) > 0.866 && !have.has(segK(e.a, e.b))) add.push([e.a.slice(), e.b.slice()]);
    if (!add.length) { app.undo.pop(); return toast(_t('Nie ma krawędzi do wygładzenia (ściany muszą stykać się pod kątem do 30°).')); }
    s.softs = [...(s.softs || []), ...add]; toast(_t('Wygładzone krawędzie: ') + add.length);
  } else {
    const before = (s.softs || []).length;
    s.softs = (s.softs || []).filter(([a, b]) => !inSel({ a, b })); if (!s.softs.length) delete s.softs;
    toast(_t('Przywrócone krawędzie: ') + (before - (s.softs || []).length));
  }
  app.noStitch = true; app.changed(); app.noStitch = false;
}
// wszystkie ściany geometrii w tym samym kolorze, materiale i kryciu co zaznaczona
function selectSameMaterial() {
  const q = app.sub.find(x => x.kind === 'face'); if (!q) return toast(_t('Zaznacz ścianę, a zaznaczę wszystkie z tym samym materiałem.'));
  const s = app.model.shapes.find(x => x.id === q.id); if (!s) return;
  const sig = i => { const f = s.fc && s.fc['p:' + i]; return f ? (f.c || '') + '|' + (f.t || '') + '|' + (f.a ?? '') : ''; }, want = sig(+q.key.split(':')[1]);
  app.sub = subFaces(s, s.polys.map((_, i) => i).filter(i => sig(i) === want)); app.selectionChanged();
}
// „Usuń luźne krawędzie”: linie z wolnym końcem (niezaczepionym o inną linię ani o krawędź ściany) znikają, po kolei aż do
// skutku — czyli całe wiszące ciągi. Zamknięte obrysy i linie zaczepione obydwoma końcami zostają. Z zaznaczeniem — tylko zaznaczone.
function cleanLines() {
  const m = app.model, G = app.editing ?? null, only = [...app.selection].some(i => String(i)[0] === 'l') ? app.selection : null;
  const edges = m.shapes.filter(s => (s.g ?? null) === G && !isHidden(m, s)).flatMap(s => edgesOf(s).map(e => [e.a, e.b]));
  const onEdge = p => edges.some(([a, b]) => { const L = V.dist(a, b); if (L < 1e-9) return false; const d = V.mul(V.sub(b, a), 1 / L), t = V.dot(V.sub(p, a), d); return t > -1e-5 && t < L + 1e-5 && V.dist(V.add(a, V.mul(d, t)), p) < 1e-5; });
  let lines = m.lines.filter(l => (l.g ?? null) === G && !l.locked && !isHidden(m, l)), gone = new Set(), again = true;
  while (again) {
    again = false;
    for (const l of lines) {
      if (gone.has(l) || (only && !only.has('l' + l.id))) continue;
      const free = p => !onEdge(p) && !lines.some(o => o !== l && !gone.has(o) && (V.dist(o.a, p) < 1e-5 || V.dist(o.b, p) < 1e-5));
      if (free(l.a) || free(l.b)) { gone.add(l); again = true; }
    }
  }
  if (!gone.size) return toast(_t('Nie ma luźnych krawędzi z wolnym końcem.'));
  app.checkpoint(); m.lines = m.lines.filter(l => !gone.has(l)); for (const l of gone) app.selection.delete('l' + l.id);
  app.noStitch = true; app.changed(); app.noStitch = false; app.selectionChanged();
  toast(_t('Usunięte luźne krawędzie: ') + gone.size);
}
// zamknięte pola między zaznaczonymi liniami (także w zaznaczonej grupie) stają się płaskimi ścianami
function makeFaces() {
  const m = app.model, lines = m.lines.filter(l => app.selection.has('l' + l.id));
  if (lines.length < 3) return toast(_t('Zaznacz linie, które tworzą zamknięte pola (albo grupę z liniami z podkładu).'));
  const before = cloneModel(m), r = facesFromLines(m, lines);
  if (!r) return toast(_t('Za dużo linii naraz. Zaznacz mniejszy fragment rysunku.'));
  if (!r.faces.length) { app.model = before; viewer.setModel(app.model); return toast(_t('Zaznaczone linie nie zamykają żadnego pola w jednej płaszczyźnie.')); }
  app.undo.push(before); app.redo = []; app.opSeq++;
  app.selection.clear(); for (const f of r.faces) app.expand(f.id).forEach(i => app.selection.add(i));
  app.changed(); app.selectionChanged();
  toast(_t`Powstało ścian: ${r.faces.length}. Każdą możesz wypchnąć.` + (r.skipped ? _t` Pominięte linie poza płaszczyzną: ${r.skipped}.` : ''));
}

/* ---------- kolor bryły ---------- */
const PALETTE = [[null, _t('biały')], ['#e4dfd3', _t('jasny beton')], ['#c9c3b5', _t('beton')], ['#8d8980', _t('grafit')], ['#c99a7c', _t('cegła')], ['#bfa17c', _t('drewno')], ['#a9b49a', _t('zieleń')], ['#a7b6c2', _t('szkło'), 0.3]];
const texThumb = new Map();
function renderSwatches() {
  const box = $('#swatches'); box.innerHTML = '';
  for (const [c, n, a = 1] of PALETTE) {
    const b = document.createElement('button'); b.className = 'sw' + (!app.paintTex && (app.paint || null) === c && Math.abs(app.paintAlpha - a) < 0.01 ? ' on' : '') + (a < 1 ? ' glass' : '');
    b.style.setProperty('--c', c || DEFAULT_COLOR); b.style.setProperty('--a', a); b.textContent = n;
    b.addEventListener('click', () => { app.setPaint(c, a); setTool('paint'); });
    box.append(b);
  }
  // materiały z teksturą: wzór w prawdziwej skali (cegła, deski, płytki…)
  const tb = $('#texSwatches'); tb.innerHTML = '';
  for (const [id, T] of Object.entries(TEXTURES)) {
    if (!texThumb.has(id)) texThumb.set(id, textureCanvas(id).toDataURL());
    const b = document.createElement('button'); b.className = 'sw tex' + (app.paintTex === id ? ' on' : '');
    b.style.backgroundImage = `url(${texThumb.get(id)})`; b.innerHTML = `<span>${T.name}</span>`;
    b.addEventListener('click', () => { app.setPaint(T.avg, 1, id); setTool('paint'); });
    tb.append(b);
  }
  const dot = toolsEl.querySelector('[data-tool=paint] .dot'); if (dot) dot.style.background = app.paint || DEFAULT_COLOR;
  $('#paintCustom').value = app.paint || '#f6f4ee';
  const pa = $('#paintAlpha'); pa.value = app.paintAlpha; setRangeFill(pa); $('#paintAlphaLbl').textContent = Math.round(app.paintAlpha * 100) + '%';
}
$('#paintCustom').addEventListener('input', e => app.setPaint(e.target.value));
$('#paintAlpha').addEventListener('input', e => app.setPaint(app.paint, +e.target.value));
renderSwatches();

/* ---------- skróty ---------- */
function openKeys() { $('#keysModal').hidden = false; renderKeys(); $('#keysQ').focus(); }
function closeKeys() { $('#keysModal').hidden = true; capture = null; }
$('#keysBtn').addEventListener('click', openKeys);
$('#themeBtn').addEventListener('click', () => cycleTheme());
$('#keysClose').addEventListener('click', closeKeys);
$('#keysModal .scrim').addEventListener('click', closeKeys);
$('#keysQ').addEventListener('input', renderKeys);
$('#keysQ').addEventListener('keydown', e => { if (e.key === 'Escape') closeKeys(); });
$('#keysReset').addEventListener('click', () => { app.keys.over = {}; saveKeyOverride({}); app.keys = loadKeys(); renderKeys(); });
function renderKeys() {
  const q = $('#keysQ').value.trim().toLowerCase();
  const box = $('#keysList'); box.innerHTML = '';
  const groups = [...new Set(ACTIONS.map(a => a.group))];
  for (const g of groups) {
    const items = ACTIONS.filter(a => a.group === g && (!q || a.name.toLowerCase().includes(q) || keysFor(a.id, app.keys.over).some(k => prettyCombo(k, isMac).toLowerCase().includes(q))));
    if (!items.length) continue;
    const col = document.createElement('section'); col.className = 'grp'; col.innerHTML = `<div class="gh">${g}</div>`;
    for (const a of items) {
      const row = document.createElement('div'); row.className = 'k' + (a.later ? ' later' : '');
      row.innerHTML = `<span>${a.name}</span>` + (a.later ? _t('<span class="lbl" style="flex:none">później</span>') : '');
      const b = document.createElement('button'); b.setAttribute('aria-label', _t('Zmień skrót: ') + a.name);
      b.innerHTML = keysFor(a.id, app.keys.over).map(k => `<kbd>${prettyCombo(k, isMac)}</kbd>`).join(' ') || '<kbd>—</kbd>';
      b.addEventListener('click', () => {
        b.classList.add('wait'); b.innerHTML = _t('<kbd>naciśnij…</kbd>');
        capture = e => {
          e.preventDefault(); e.stopPropagation();
          if (e.key === 'Escape') { capture = null; renderKeys(); return; }
          if (e.key === 'Backspace' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { app.keys.over[a.id] = []; }
          else {
            const c = comboOf(e, isMac); if (!c) return;
            // ten sam skrót nie może należeć do dwóch poleceń
            for (const o of ACTIONS) if (o.id !== a.id) { const ks = keysFor(o.id, app.keys.over); if (ks.includes(c)) app.keys.over[o.id] = ks.filter(k => k !== c); }
            app.keys.over[a.id] = [c];
          }
          capture = null; saveKeyOverride(app.keys.over); app.keys = loadKeys(); renderKeys();
        };
      });
      row.append(b); col.append(row);
    }
    box.append(col);
  }
}

/* ---------- edycja tekstu opisu ---------- */
app.editText = (t, isNew) => {
  const P = viewer.toScreen(t.q), r = $('#view').getBoundingClientRect();
  const ta = document.createElement('textarea');
  ta.className = 'textEdit'; ta.value = t.text || ''; ta.rows = Math.max(1, ta.value.split('\n').length);
  ta.style.left = (r.left + P.x + 6) + 'px'; ta.style.top = (r.top + P.y - 12) + 'px';
  document.body.append(ta);
  // fokus dopiero po zakończeniu kliknięcia (inaczej mysz od razu go zabiera)
  let done = false, ready = false;
  setTimeout(() => { ta.focus(); ta.select(); ready = true; }, 30);
  const finish = ok => {
    if (done) return; done = true;
    const v = ta.value.replace(/\s+$/, ''); ta.remove();
    if (!ok || !v) { if (!isNew && ok && !v) { app.checkpoint(); app.model.texts = app.model.texts.filter(x => x.id !== t.id); app.changed(); } app.refresh(); return; }
    app.checkpoint();
    if (isNew) app.model.texts.push({ ...t, text: v }); else { const x = app.model.texts.find(x => x.id === t.id); if (x) x.text = v; }
    app.changed();
  };
  ta.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else setTimeout(() => { ta.rows = Math.max(1, ta.value.split('\n').length); });
  });
  ta.addEventListener('blur', () => { if (ready) finish(true); });
};

/* ---------- menu podręczne (prawy klik) ---------- */
function openContext(x, y, cx, cy) {
  closePops();
  const id = pickEntity(app, x, y);
  // prawy klik w niezaznaczony element zaznacza go (jak w SketchUpie)
  if (isGeo(id)) {
    const q = subAt(app, id, x, y);
    if (q && !app.sub.some(o => o.kind === q.kind && (q.kind === 'face' ? o.key === q.key : V.dist(o.a, q.a) + V.dist(o.b, q.b) < 1e-6))) { app.selection.clear(); app.sub = [q]; app.selectionChanged(); }
  } else if (id != null && !app.selection.has(id) && (!app.editing || app.inEditing(id))) {
    if (app.editSolid != null && id !== app.editSolid) app.exitSolid();
    app.selection.clear(); app.expand(id).forEach(i => app.selection.add(i)); app.selectionChanged();
  }
  const sel = [...app.selection], groups = selectedGroups();
  const solids = sel.filter(i => typeof i === 'number').map(i => app.model.shapes.find(s => s.id === i)).filter(s => s && isSolid(s));
  const items = [];
  const secSel = selectedSections();
  if (secSel.length && secSel.length === sel.length) {
    items.push(['sectionToggle', secSel[0].on ? _t('Wyłącz przekrój') : _t('Włącz ten przekrój')], ['sectionFlip', _t('Odwróć kierunek')], ['sectionPlanes', viewer.showSectPlanes ? _t('Ukryj płaszczyzny przekrojów') : _t('Pokaż płaszczyzny przekrojów')], null, ['delete', _t('Usuń')]);
  } else if (sel.length) {
    items.push(['info', _t('Informacje o elemencie')], null);
    if (groups.length === 1) items.push(['editGroup', groups[0].kind === 'comp' ? _t('Edytuj komponent') : _t('Edytuj grupę')]);
    else if (!groups.length && sel.length === 1 && solids.length === 1 && app.editSolid == null) items.push(['editGroup', _t('Edytuj bryłę (wierzchołki, krawędzie, ściany)')]);
    items.push(['group', _t('Utwórz grupę')], ['comp', _t('Utwórz komponent')]);
    if (groups.length) items.push(['explode', _t('Rozbij')]);
    if (groups.some(g => g.kind === 'comp')) items.push(['unique', _t('Zrób unikalny')]);
    items.push(null);
    if (solids.length) items.push(['cut', solids.every(s => s.op === 'cut') ? _t('Bryła zwykła (nie wycina)') : _t('Bryła wycinająca')]);
    if (solids.some(s => s.op !== 'cut')) items.push(['intersect', _t('Przetnij ściany z modelem')]);
    if (solids.filter(s => s.op !== 'cut').length >= 2) items.push(['solidUnion', _t('Suma brył')], ['solidIntersect', _t('Część wspólna')], ['solidSubtract', _t('Odejmij od pierwszej')], ['solidTrim', _t('Przytnij pierwszą')]);
    items.push(null, ['flipX', _t('Odbij wzdłuż osi czerwonej')], ['flipY', _t('Odbij wzdłuż osi zielonej')], ['flipZ', _t('Odbij wzdłuż osi niebieskiej')]);
    if (sel.filter(i => String(i)[0] === 'l').length >= 3) items.push(null, ['makeFaces', _t('Ściany z linii')]);
    items.push(null, ['cutClip', _t('Wytnij')], ['copy', _t('Kopiuj')], ['paste', _t('Wklej')]);
    items.push(null, ['hideSel', _t('Ukryj')], ['hideRest', _t('Ukryj resztę')], ['lock', _t('Zablokuj')], ['zoomSel', _t('Pokaż zaznaczenie')], null, ['delete', _t('Usuń')]);
  } else if (app.sub.length) {
    // zaznaczone ściany albo krawędzie wspólnej geometrii
    if (app.sub.some(q => q.kind === 'face')) items.push(['selSameMat', _t('Zaznacz ściany z tym samym materiałem')], ['soften', _t('Wygładź krawędzie')], ['unsoften', _t('Przywróć wygładzone krawędzie')], null, ['group', _t('Utwórz grupę')], ['comp', _t('Utwórz komponent')], null, ['flipX', _t('Odbij wzdłuż osi czerwonej')], ['flipY', _t('Odbij wzdłuż osi zielonej')], ['flipZ', _t('Odbij wzdłuż osi niebieskiej')], null, ['cutClip', _t('Wytnij')], ['copy', _t('Kopiuj')], ['paste', _t('Wklej')], null, ['hideSel', _t('Ukryj')], ['hideRest', _t('Ukryj resztę')], ['lock', _t('Zablokuj')], null);
    items.push(['delete', _t('Usuń')]);
  } else {
    if (app.editing || app.editSolid != null) items.push(['exitEdit', _t('Zakończ edycję')], null);
    items.push(['paste', _t('Wklej')], ['pasteInPlace', _t('Wklej w tym samym miejscu')], null);
    items.push(['selectAll', _t('Zaznacz wszystko')], ['unhideAll', _t('Pokaż ukryte')]);
    if (lockedCount()) items.push(['unlockAll', _t('Odblokuj wszystko')]);
    items.push(['extents', _t('Pokaż cały model')], null, ['cleanLines', _t('Usuń luźne krawędzie')], ['clearGuides', _t('Usuń wszystkie prowadnice')]);
  }
  while (items.length && !items[items.length - 1]) items.pop();
  const m = $('#ctxMenu');
  const k = a => { const c = keysFor(a, app.keys.over)[0]; return c ? '<kbd>' + prettyCombo(c, isMac) + '</kbd>' : ''; };
  m.innerHTML = items.filter((it, i) => it || (i && items[i - 1])).map(i => i ? `<button role="menuitem" data-a="${i[0]}"><span>${i[1]}</span>${k(i[0])}</button>` : '<div class="msep"></div>').join('');
  m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { closePops(); const a = b.dataset.a; a === 'exitEdit' ? (app.editSolid != null ? app.exitSolid() : app.exitGroup()) : a === 'zoomSel' ? viewer.zoomExtents([...app.selection]) : run(a); app.refresh(); }));
  m.hidden = false;
  m.style.left = Math.min(window.innerWidth - m.offsetWidth - 8, cx) + 'px';
  m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, cy) + 'px';
}

/* ---------- język ---------- */
// Zmiana języka przeładowuje okno, więc najpierw trzeba zapisać szkic (autozapis nie jest od tego).
function switchLang() {
  if (app.file.dirty) return toast(_t('Najpierw zapisz szkic — zmiana języka przeładowuje okno.'));
  const next = lang === 'pl' ? 'en' : 'pl';
  setLang(next); try { api.setLang && api.setLang(next); } catch (e) {}
  const p = app.file.path;
  location.href = location.pathname + (p ? '?p=' + encodeURIComponent(p) : '');
}
/* ---------- menu pliku ---------- */
$('#fileBtn').addEventListener('click', async () => {
  const m = $('#menu'); const was = !m.hidden; closePops(); if (was) return;
  const k = id => prettyCombo(keysFor(id, app.keys.over)[0] || '', isMac);
  // ostatnio otwierane pliki i szkice z autozapisu (po awarii) — tylko w programie
  let recent = [], lost = [];
  try { recent = (await api.recentList()).filter(r => r.path !== app.file.path).slice(0, 8); lost = await api.autosaveList(auto.key); } catch (e) {}
  const items = [['new', _t('Nowy szkic')], ['open', _t('Otwórz…')], null, ['save', _t('Zapisz')], ['saveAs', _t('Zapisz jako…')], ['saveCopy', _t('Zapisz kopię jako…')]];
  if (app.file.path) items.push(['revert', _t('Przywróć zapisaną wersję')]);
  items.push(null, ['importSkp', _t('Importuj SketchUp (.skp)…')], ['underlay', _t('Podkład DXF / DWG…')], ['png', _t('Eksport PNG…')], ['obj', _t('Eksport OBJ (3ds Max)…')], null, ['clearGuides', _t('Usuń wszystkie prowadnice')], ['theme', _t('Wygląd: ') + THEME_NAME[theme]], ['lang', 'Język / Language: ' + LANGS.find(l => l[0] === lang)[1]], ['newWindow', _t('Nowe okno')], ['updateCheck', _t('Sprawdź aktualizacje')]);   // i18n-ok
  const hhmm = t => new Date(t).toLocaleString(lang === 'en' ? 'en-GB' : 'pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  m.innerHTML = items.map(i => i ? `<button role="menuitem" data-a="${i[0]}"><span>${i[1]}</span>${keysFor(i[0], app.keys.over).length ? '<kbd>' + k(i[0]) + '</kbd>' : ''}</button>` : '<div class="msep"></div>').join('')
    + (lost.length ? _t('<div class="msep"></div><div class="mlbl">Niezapisane po awarii</div>') + lost.map((r, i) => `<button role="menuitem" data-lost="${i}"><span>${esc(r.name || _t('Bez nazwy'))}</span><kbd>${hhmm(r.time)}</kbd></button>`).join('') : '')
    + (recent.length ? _t('<div class="msep"></div><div class="mlbl">Ostatnie</div>') + recent.map((r, i) => `<button role="menuitem" data-recent="${i}" title="${esc(r.path)}"><span>${esc(r.name)}</span><kbd>${esc(r.dir)}</kbd></button>`).join('') : '');
  m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    closePops();
    if (b.dataset.recent) return openRecent(recent[+b.dataset.recent].path);
    if (b.dataset.lost) return restoreAuto(lost[+b.dataset.lost]);
    b.dataset.a === 'newWindow' ? api.newWindow() : run(b.dataset.a);
  }));
  m.hidden = false;
  const r = $('#fileBtn').getBoundingClientRect();
  m.style.left = Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  $('#fileBtn').classList.add('open');
});

/* ---------- plik ---------- */
function serialize() {
  return JSON.stringify({
    app: 'Modo', format: 1, model: app.model, camera: viewer.getCamera(), style: viewer.style,
    sun: viewer.sunCfg, axes: viewer.showAxes, fog: !!viewer.fog, wire: !!viewer.wire, eye: app.eyeH, units: getUnit(), underlay: app.underlay, scenes: app.scenes
  });
}
function load(text, name, path) {
  const d = JSON.parse(text);
  if (d.app !== 'Modo') throw new Error(_t('To nie jest plik Modo'));
  app.editing = null; viewer.editGroup = null; app.editSolid = null; viewer.editSolid = null; app.clearSub();
  app.model = fixModel(d.model || newModel()); app.undo = []; app.redo = []; app.selection.clear();
  try { absorb(app.model, null); } catch (e) { console.error('absorb', e); }   // starsze szkice: luźne bryły zlewają się we wspólną geometrię
  viewer.setModel(app.model);
  if (d.sun) viewer.setSun(d.sun);
  if (d.style && STYLES[d.style]) setStyle(d.style);
  if (d.units) { setUnit(d.units); renderUnit(); }
  app.opSeq++;
  viewer.showAxes = d.axes !== false;
  viewer.setLook({ fog: !!d.fog, wire: !!d.wire, showHidden: false }); if (d.eye > 0) app.eyeH = d.eye; syncLook();
  app.underlay = d.underlay || null; applyUnderlay();
  app.scenes = d.scenes || []; app.scene = -1;
  if (d.camera) viewer.setCamera(d.camera); else viewer.zoomExtents();
  setFile(path, name); app.markDirty(false); renderSun(); setTool('select'); renderViewChip();
  app.docId = Math.random().toString(36).slice(2); camReset();
}
function setFile(path, name) { app.file.path = path; app.file.name = name || _t('Bez nazwy'); $('#fileName').textContent = app.file.name; document.title = app.file.name + ' — Modo'; }
async function confirmDiscard() { return !app.file.dirty || confirm(_t('Szkic ma niezapisane zmiany. Porzucić je?')); }
async function newSketch() {
  if (!(await confirmDiscard())) return;
  app.editing = null; viewer.editGroup = null; app.clearSub();
  app.model = newModel(); app.undo = []; app.redo = []; app.selection.clear(); app.underlay = null; applyUnderlay(); app.scenes = []; app.scene = -1;
  app.opSeq++; viewer.setModel(app.model); setFile(null, _t('Bez nazwy')); app.markDirty(false); setTool('select');
  app.docId = Math.random().toString(36).slice(2); camReset(); renderViewChip();
}
async function openSketch(p) {
  if (!p && !(await confirmDiscard())) return;
  try { const r = await api.openFile(p); if (r) load(r.text, r.name, r.path); }
  catch (err) { toast(_t('Nie udało się otworzyć pliku: ') + err.message); }
}
async function saveSketch(as) {
  try {
    const r = await api.saveFile(as ? null : app.file.path, serialize(), app.file.name === _t('Bez nazwy') ? _t('Szkic') : app.file.name);
    if (!r) return false;
    setFile(r.path, r.name); app.markDirty(false); toast(_t('Zapisano'));
    return true;
  } catch (err) { toast(_t('Nie udało się zapisać: ') + err.message); return false; }
}
// kopia szkicu w innym miejscu: bieżący plik i jego nazwa zostają bez zmian
async function saveCopy() {
  try {
    const p = await api.saveCopy(serialize(), (app.file.name === _t('Bez nazwy') ? _t('Szkic') : app.file.name) + ' — kopia');
    if (p) toast(_t('Zapisano kopię'), api.web || p === true ? null : [_t('Pokaż'), () => api.showInFolder(p)]);
  } catch (err) { toast(_t('Nie udało się zapisać kopii: ') + err.message); }
}
async function revertSketch() {
  if (!app.file.path) return toast(_t('Ten szkic nie był jeszcze zapisany.'));
  if (app.file.dirty && !confirm(_t('Wrócić do ostatnio zapisanej wersji? Niezapisane zmiany przepadną.'))) return;
  await openSketch(app.file.path);
}
async function openRecent(p) { if (await confirmDiscard()) await openSketch(p); }
async function checkUpdate() {
  if (api.web) return toast(_t('Aktualizacje sprawdza program zainstalowany na komputerze.'));
  toast(_t('Sprawdzam aktualizacje…'));
  const s = await api.updateCheck();
  if (s.state === 'available') toast(_t('Jest nowa wersja ') + s.version + _t(' (masz ') + s.current + ').', [_t('Zainstaluj'), () => api.updateInstall()]);
  else if (s.state === 'downloading') toast(_t('Nowa wersja właśnie się pobiera.'));
  else if (s.state === 'error') toast(_t('Nie udało się sprawdzić aktualizacji: ') + s.error);
  else toast(_t('Masz najnowszą wersję (') + s.current + ').');
}

/* ---------- autozapis ---------- */
// Co 30 sekund, jeśli szkic się zmienił od ostatniej kopii, jego pełna treść trafia do osobnego pliku
// (w programie: folder ustawień; w przeglądarce: pamięć przeglądarki). Zapis, nowy szkic albo zwykłe
// zamknięcie okna kasują kopię — zostaje tylko wtedy, gdy program padł.
const AUTO_EVERY = 30000;
setInterval(async () => {
  if (!app.file.dirty || auto.seq === auto.saved) return;
  if (tool.active || tool.anchor) return;   // w połowie przeciągania model jest w stanie przejściowym
  const seq = auto.seq;
  try { if (await api.autosave(auto.key, { path: app.file.path, name: app.file.name, time: Date.now(), text: serialize() })) { auto.saved = seq; auto.written = true; } } catch (e) {}
}, AUTO_EVERY);
async function restoreAuto(r) {
  if (!(await confirmDiscard())) return;
  try {
    const rec = await api.autosaveRead(r.key);
    if (!rec || !rec.text) return toast(_t('Nie udało się odczytać autozapisu.'));
    load(rec.text, rec.name, rec.path || null);
    app.markDirty(true);
    await api.autosaveClear(r.key);
    toast(_t('Przywrócono szkic z autozapisu. Zapisz go, żeby zachować.'));
  } catch (err) { toast(_t('Nie udało się przywrócić szkicu: ') + err.message); }
}
async function offerRestore() {
  let lost = [];
  try { lost = await api.autosaveList(auto.key); } catch (e) {}
  if (!lost.length) return;
  const r = lost[0];
  toast(_t('Program został ostatnio zamknięty z niezapisanym szkicem „') + (r.name || _t('Bez nazwy')) + '”.' + (lost.length > 1 ? _t(' Pozostałe znajdziesz w menu Plik.') : ''), [_t('Przywróć'), () => restoreAuto(r)], 45000);
}

async function saveObj() {
  const name = app.file.name === _t('Bez nazwy') ? 'Modo' : app.file.name;
  const r = exportObj(app.model, name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^A-Za-z0-9_ -]+/g, '_'));
  if (!r.count) return toast(_t('Nie ma brył do eksportu.'));
  try {
    const p = await api.saveObj(r.obj, r.mtl, name);
    if (p) toast(_t('Zapisano OBJ: ') + r.count + _t(' obiektów (metry, oś Y w górę)'), api.web ? null : [_t('Pokaż'), () => api.showInFolder(p)]);
  } catch (err) { toast(_t('Nie udało się zapisać OBJ: ') + err.message); }
}
/* ---------- render widoku przez Gemini (Nano Banana) ---------- */
const AI_MODELS = [['gemini-nano-banana-2.1', 'Nano Banana 2.1'], ['gemini-3-pro-image', 'Nano Banana Pro'], ['gemini-3.1-flash-image', 'Nano Banana 2'], ['gemini-3.1-flash-lite-image', _t('Nano Banana 2 Lite (tylko 1K)')], ['', _t('Inny model…')]];
const AI_PROMPT = 'Turn this architectural massing sketch into a photorealistic architectural photograph. Keep the geometry, proportions, openings, camera position and composition exactly as in the image; do not add, remove or reshape any building volumes. Remove the sketch outlines. Use realistic, restrained materials, natural daylight consistent with the direction of the shadows in the image, a believable ground, subtle greenery and a few people for scale.';
const AI_RATIOS = [['1:1', 1], ['5:4', 1.25], ['4:3', 4 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['21:9', 21 / 9], ['4:5', 0.8], ['3:4', 0.75], ['2:3', 2 / 3], ['9:16', 9 / 16]];
const aiGet = (k, d) => { try { return localStorage.getItem('modo.ai.' + k) ?? d; } catch (e) { return d; } };
const aiSet = (k, v) => { try { localStorage.setItem('modo.ai.' + k, v); } catch (e) {} };
let aiBusy = false, aiLast = null;   // aiLast: { url, blob, source }
$('#aiBtn').addEventListener('click', () => showSec('render'));
$('#aiModel').innerHTML = AI_MODELS.map(([id, n]) => `<option value="${id}">${n}</option>`).join('');
async function renderAi(forceKey) {
  const has = await api.geminiHasKey();
  $('#aiKeyBox').hidden = has && !forceKey; $('#aiMain').hidden = !has || !!forceKey;
  if (!has || forceKey) { $('#aiKey').value = ''; setTimeout(() => $('#aiKey').focus(), 30); return; }
  const model = aiGet('model', AI_MODELS[0][0]);
  $('#aiModel').value = AI_MODELS.some(m => m[0] === model) ? model : '';
  $('#aiCustomRow').hidden = $('#aiModel').value !== ''; if ($('#aiModel').value === '') $('#aiCustom').value = model;
  const size = aiGet('size', '2K');
  document.querySelectorAll('#aiSize button').forEach(b => b.classList.toggle('on', b.dataset.s === size));
  if (document.activeElement !== $('#aiPrompt')) $('#aiPrompt').value = aiGet('prompt', AI_PROMPT);
  $('#aiGo').disabled = aiBusy; if (!aiBusy) $('#aiStatus').textContent = '';
}
$('#aiKey').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('#aiKeySave').click(); });
$('#aiKeySave').addEventListener('click', async () => { const k = $('#aiKey').value.trim(); if (!k) return; await api.geminiSetKey(k); $('#aiKey').value = ''; renderAi(); });
$('#aiKeyChange').addEventListener('click', () => renderAi(true));
$('#aiModel').addEventListener('change', e => { if (e.target.value) aiSet('model', e.target.value); else aiSet('model', $('#aiCustom').value.trim()); renderAi(); });
$('#aiCustom').addEventListener('keydown', e => e.stopPropagation());
$('#aiCustom').addEventListener('change', e => aiSet('model', e.target.value.trim()));
document.querySelectorAll('#aiSize button').forEach(b => b.addEventListener('click', () => { aiSet('size', b.dataset.s); renderAi(); }));
$('#aiPrompt').addEventListener('keydown', e => e.stopPropagation());
$('#aiPrompt').addEventListener('change', e => aiSet('prompt', e.target.value));
$('#aiPromptReset').addEventListener('click', () => { aiSet('prompt', AI_PROMPT); $('#aiPrompt').value = AI_PROMPT; });
const b64 = async blob => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function aiRender() {
  if (aiBusy) return;
  const model = (aiGet('model', AI_MODELS[0][0]) || '').trim(), prompt = ($('#aiPrompt').value || '').trim() || AI_PROMPT;
  if (!model) return toast(_t('Wpisz identyfikator modelu.'));
  let size = aiGet('size', '2K'); if (/lite/.test(model)) size = '1K';
  aiBusy = true; $('#aiGo').disabled = true; $('#aiStatus').textContent = _t('Przygotowuję widok…');
  try {
    // widok w proporcjach okna, dłuższy bok 1600 px — tyle wystarcza modelowi jako wzór
    const k = 1600 / Math.max(viewer.w, viewer.h), W = Math.round(viewer.w * k), H = Math.round(viewer.h * k);
    const src = await viewer.exportPng(W, H, { dark: false });
    const ar = viewer.w / viewer.h, ratio = AI_RATIOS.reduce((a, b) => Math.abs(Math.log(b[1] / ar)) < Math.abs(Math.log(a[1] / ar)) ? b : a)[0];
    $('#aiStatus').textContent = _t('Gemini renderuje… to trwa zwykle kilkanaście sekund');
    const t0 = Date.now();
    const r = await api.geminiRender({ model, body: {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/png', data: await b64(src) } }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ratio, imageSize: size } }
    } });
    if (r.error) { if (r.code === 'NO_KEY') renderAi(true); throw new Error(r.error); }
    const parts = r.json?.candidates?.[0]?.content?.parts || [];
    const img = parts.map(p => p.inlineData || p.inline_data).find(Boolean);
    if (!img || !img.data) {
      const why = r.json?.promptFeedback?.blockReason || r.json?.candidates?.[0]?.finishReason, txt = parts.map(p => p.text).filter(Boolean).join(' ').slice(0, 200);
      throw new Error(_t('Gemini nie zwrócił obrazu') + (why ? ' (' + why + ')' : '') + (txt ? ': ' + txt : '.'));
    }
    const bin = atob(img.data), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const blob = new Blob([u], { type: img.mimeType || img.mime_type || 'image/png' });
    if (aiLast) { URL.revokeObjectURL(aiLast.url); URL.revokeObjectURL(aiLast.source); }
    aiLast = { url: URL.createObjectURL(blob), blob, source: URL.createObjectURL(src) };
    closePops();
    $('#aiImg').src = aiLast.url; $('#aiInfo').textContent = (AI_MODELS.find(m => m[0] === model)?.[1] || model) + ' · ' + size + ' · ' + Math.round((Date.now() - t0) / 1000) + ' s';
    $('#aiModal').hidden = false;
  } catch (err) { toast(_t('Render się nie udał: ') + (err.message || err)); $('#aiStatus').textContent = ''; }
  finally { aiBusy = false; $('#aiGo').disabled = false; if ([_t('Przygotowuję widok…'), _t('Gemini renderuje… to trwa zwykle kilkanaście sekund')].includes($('#aiStatus').textContent)) $('#aiStatus').textContent = ''; }
}
$('#aiGo').addEventListener('click', aiRender);
const aiClose = () => { $('#aiModal').hidden = true; };
$('#aiClose').addEventListener('click', aiClose);
$('#aiModal .scrim').addEventListener('click', aiClose);
$('#aiAgain').addEventListener('click', () => { aiClose(); showSec('render'); });
// przytrzymanie przycisku pokazuje widok wysłany z Modo — do porównania
for (const [ev, on] of [['pointerdown', true], ['pointerup', false], ['pointerleave', false]]) $('#aiCompare').addEventListener(ev, () => { if (aiLast) $('#aiImg').src = on ? aiLast.source : aiLast.url; });
$('#aiSave').addEventListener('click', async () => {
  if (!aiLast) return;
  try {
    // zapis zawsze jako PNG, niezależnie od formatu odpowiedzi
    const bmp = await createImageBitmap(aiLast.blob), cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0);
    const png = await new Promise(res => cv.toBlob(res, 'image/png'));
    const p = await api.savePng(new Uint8Array(await png.arrayBuffer()), app.file.name + ' · render');
    if (p) toast(_t('Zapisano render'), api.web ? null : [_t('Pokaż'), () => api.showInFolder(p)]);
  } catch (err) { toast(_t('Nie udało się zapisać: ') + err.message); }
});
app.aiRender = aiRender;

/* ---------- import ze SketchUpa ---------- */
async function importSkp(file) {
  const r = file || await api.pickBinary('skp', _t('Model SketchUp'));
  if (!r) return;
  if (r.error) return toast(_t('Nie udało się otworzyć pliku: ') + r.error);
  toast(_t('Czytam ') + r.name + '…');
  await new Promise(res => setTimeout(res, 30));   // żeby komunikat zdążył się pokazać
  try {
    const [{ parseSkp }, { skpToModo }] = await Promise.all([import('./vendor/openskp/index.js'), import('./skp.js')]);
    const u8 = r.data, skp = parseSkp(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    if (app.editSolid != null) app.exitSolid();
    while (app.editing) app.exitGroup();
    const m = app.model, before = cloneModel(m);
    const out = skpToModo(skp, () => m.next++, r.name.replace(/\.skp$/i, ''));
    if (!out.shapes.length && !out.lines.length) return toast(_t('W tym pliku nie znalazłem żadnej geometrii.'));
    app.undo.push(before); app.redo = []; app.opSeq++;
    m.shapes.push(...out.shapes); m.lines.push(...out.lines); m.groups.push(...out.groups);
    for (const t of out.tags) { const old = m.tags.find(q => q.name === t.name); if (old) { for (const g of out.groups) if (g.tag === t.id) g.tag = old.id; } else m.tags.push(t); }
    app.scenes.push(...out.scenes);
    app.noStitch = true; app.changed(); app.noStitch = false;
    app.selection.clear(); membersOf(m, out.groups[0].id).forEach(i => app.selection.add(i));
    setTool('select'); app.selectionChanged();
    const empty = before.shapes.length + before.lines.length === 0;
    viewer.zoomExtents(empty ? null : [...app.selection]);
    const n = out.stats.faces;
    toast(_t`Zaimportowano ${r.name}: ${out.shapes.length} brył, ${n} ścian, ${out.stats.instances} grup i komponentów` + (n > 60000 ? _t('. To duży model — praca może być wolniejsza.') : '.'));
  } catch (err) { console.error(err); toast(_t('Nie udało się odczytać pliku SketchUpa: ') + (err && err.message || err)); }
}
app.importSkp = importSkp;
api.onSaveThenClose(async () => { if (await saveSketch(false)) api.closeNow(); });

/* ---------- aktualizacje ---------- */
function renderUpd(s) {
  const b = $('#updBtn');
  if (s && s.state === 'available') { b.hidden = false; b.textContent = _t('Nowa wersja ') + s.version + _t(' — zainstaluj'); }
  else if (s && s.state === 'downloading') { b.hidden = false; b.textContent = _t('Pobieram ') + Math.round(100 * s.got / (s.size || 1)) + '%'; }
  else b.hidden = true;
}
api.onUpdate(renderUpd); api.updateGet().then(renderUpd);
$('#updBtn').addEventListener('click', () => api.updateInstall());

/* ---------- komunikaty ---------- */
let toastT = 0;
function toast(text, action, ms) {
  const t = $('#toast'); t.textContent = text;
  if (action) { const b = document.createElement('button'); b.textContent = action[0]; b.addEventListener('click', () => { action[1](); t.hidden = true; }); t.append(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms || (action ? 7000 : 3200));
}

app.toast = (t, a) => toast(t, a);
$('#hiddenChip').addEventListener('click', () => unhideAll());
$('#lockChip').addEventListener('click', () => unlockAll());
$('#restChip').addEventListener('click', () => setRestHidden(!app.restHidden));
$('#editChip').addEventListener('click', () => app.editSolid != null ? app.exitSolid() : app.exitGroup());
$('#orthoChip').addEventListener('click', () => run(viewer.ortho ? 'persp' : 'twoPoint'));

/* ---------- wygląd: automatyczny (jak system), jasny, ciemny ---------- */
const THEME_NAME = { auto: _t('automatyczny'), light: _t('jasny'), dark: _t('ciemny') };
let theme = 'auto';
try { theme = localStorage.getItem('modo.theme') || 'auto'; } catch (e) {}
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const dark = theme === 'dark' || (theme === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  viewer.setDark(dark);
  api.setTheme?.(dark);
  $('#pngDarkRow').hidden = !dark;
}
function cycleTheme() {
  theme = { auto: 'light', light: 'dark', dark: 'auto' }[theme] || 'auto';
  try { localStorage.setItem('modo.theme', theme); } catch (e) {}
  applyTheme(); toast(_t('Wygląd: ') + THEME_NAME[theme]);
}
mq.addEventListener('change', () => { if (theme === 'auto') applyTheme(); });
applyTheme();

/* ---------- start ---------- */
setStyle('szkic');
setTool('select');
renderSun();
setFile(null, _t('Bez nazwy')); app.markDirty(false);
const startPath = new URLSearchParams(location.search).get('p');
if (startPath) openSketch(startPath);
camReset();
setTimeout(offerRestore, 1200);
// reszta modelu schowana przy edycji grupy: ukryte jest wszystko poza edytowaną grupą (zob. viewHide w model.js)
try { app.restHidden = !!localStorage.getItem('modo.restHidden'); } catch (e) { app.restHidden = false; }
viewHide.fn = e => {
  if (!app.restHidden || viewer.editGroup == null || app.editSolid != null) return false;
  const set = viewer.editSet || (viewer.editSet = subtreeIds(app.model, viewer.editGroup));   // liczone na nowo przy każdej przebudowie widoku
  return e.g == null || !set.has(e.g);
};
window.modo = app;   // do testów w konsoli
installTestApi(app);   // window.modoTest — stałe polecenia do testów
app.solidReady = solidReady;
// Manifold ładuje się w tle; po załadowaniu scena przelicza wycięcia już nim
initSolid().then(ok => { if (ok && app.model.shapes.some(q => q.op === 'cut')) viewer.rebuild(); });
app.run = run;
