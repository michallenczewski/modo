// Modo — okno programu: narzędzia, nawigacja, klawiatura, pole wymiarów, okienka (słońce, PNG, podkład, skróty), plik.

import { Viewer, STYLES, DEFAULT_COLOR } from './viewer.js';
import { Snapper } from './snap.js';
import { newModel, cloneModel, fixModel, similar, membersOf, groupOf, topUnder, insideGroup, chainOf, subtreeIds, IDENT, syncComponent, pruneGroups, instancesOf, vertices } from './model.js';
import { pickEntity, PlaceTool, SectionTool, DimTool, TextTool, ProtractorTool, PolygonTool, RotRectTool, CenterArcTool, SelectTool, LineTool, RectTool, PushTool, PaintTool, NavTool, CircleTool, ArcTool, MoveTool, RotateTool, ScaleTool, OffsetTool, TapeTool, EraserTool } from './tools.js';
import { ACTIONS, loadKeys, saveKeyOverride, keysFor, comboOf, prettyCombo } from './keys.js';
import { sunPosition, sunRiseSet, fmtHour } from './sun.js';
import { parseDxf } from './dxf.js';
import { exportObj } from './export.js';
import { initSolid, solidReady } from './solid.js';
import { booleanMesh, toMesh as meshOf } from './mesh.js';
import { faces as facesOfShape, isSolid, removeIds, isHidden, bounds } from './model.js';
import { meshVolume, meshArea } from './mesh.js';
import { LIBRARY, loadUserLib, saveUserLib } from './lib.js';
import { translateShape, groupsWhollyIn, edges as edgesOf } from './model.js';
import { fmtNum, fmtLength } from './units.js';
import { drawAnnotations } from './annot.js';
import { UNITS, getUnit, setUnit } from './units.js';

const api = window.api;
const $ = s => document.querySelector(s);
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
  extents: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><rect x="5.5" y="5.5" width="5" height="5" rx=".5"/>'
};
const ic = n => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

/* ---------- stan ---------- */
const app = {
  isMac,
  model: newModel(),
  undo: [], redo: [],
  selection: new Set(),
  lockAxis: null, lockByShift: false,
  paint: '#d9d4c7', paintAlpha: 1,
  lastPush: null,
  file: { path: null, name: 'Bez nazwy', dirty: false },
  underlay: null,
  keys: loadKeys()
};
const viewer = app.viewer = new Viewer($('#view'));
const snapper = app.snapper = new Snapper(viewer);
viewer.selected = app.selection;
viewer.setModel(app.model);

app.opSeq = 0;   // licznik zmian: narzędzie może poprawić wpisanym wymiarem tylko swoją ostatnią operację
app.checkpoint = () => { app.undo.push(cloneModel(app.model)); if (app.undo.length > 200) app.undo.shift(); app.redo = []; app.opSeq++; };
// cofnięcie ostatniej operacji bez zapisywania jej do „ponów” (przed powtórzeniem jej z nowym wymiarem)
app.revertLast = () => { if (!app.undo.length) return false; app.model = app.undo.pop(); viewer.setModel(app.model); app.opSeq++; return true; };
app.markDirty = (v = true) => { app.file.dirty = v; api.setDirty(v); $('#saved').textContent = v ? 'zmieniono' : (app.file.path || api.web ? 'zapisano' : ''); };
app.changed = () => { postEdit(); viewer.setModel(app.model); app.markDirty(); app.refresh(); app.renderViewChip?.(); };
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
  pruneGroups(m);
  if (app.editing && !m.groups.some(g => g.id === app.editing)) app.exitGroup();
  if (app.editSolid != null && !m.shapes.some(s => s.id === app.editSolid)) { app.editSolid = null; viewer.editSolid = null; }
}
app.setModelLive = m => { app.model = m; viewer.setModel(m); };
app.commitLive = start => { app.undo.push(start); app.redo = []; app.opSeq++; postEdit(start); app.markDirty(); viewer.setModel(app.model); app.refresh(); app.renderViewChip?.(); };
app.refresh = () => { viewer.redraw(); app.updateHint(); app.updateVcb(); };
app.selectionChanged = () => { viewer.rebuild(); app.refresh(); app.renderViewChip?.(); };
app.setPaint = (c, a) => { app.paint = c; if (a !== undefined) app.paintAlpha = a; renderSwatches(); };

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
app.enterGroup = gid => { app.editing = gid; viewer.editGroup = gid; app.selection.clear(); viewer.rebuild(); app.refresh(); renderViewChip(); };
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
  if (!ids.length) return toast('Zaznacz bryły albo linie, z których ma powstać ' + (kind === 'comp' ? 'komponent.' : 'grupa.'));
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
  toast(kind === 'comp' ? 'Komponent — kopie zmieniają się razem. Dwuklik, żeby edytować.' : 'Grupa. Dwuklik, żeby edytować.');
}
function selectedGroups() { const out = new Set(); for (const id of app.selection) { const g = topUnder(app.model, id, app.editing); if (g) out.add(g); } return [...out]; }
function explode() {
  const gs = selectedGroups(); if (!gs.length) return toast('Zaznacz grupę albo komponent.');
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
  const gs = selectedGroups().filter(g => g.kind === 'comp'); if (!gs.length) return toast('Zaznacz komponent.');
  app.checkpoint();
  for (const g of gs) g.def = 'd' + app.model.next++;
  app.changed(); toast(gs.length > 1 ? 'Komponenty są teraz niezależne' : 'Ten komponent jest teraz niezależny');
}

/* ---------- narzędzia ---------- */
const tools = {
  select: new SelectTool(app), line: new LineTool(app), rect: new RectTool(app), circle: new CircleTool(app), arc: new ArcTool(app),
  place: new PlaceTool(app), section: new SectionTool(app), dim: new DimTool(app), text: new TextTool(app), protractor: new ProtractorTool(app),
  rrect: new RotRectTool(app), polygon: new PolygonTool(app), carc: new CenterArcTool(app, false), pie: new CenterArcTool(app, true),
  push: new PushTool(app), move: new MoveTool(app), rotate: new RotateTool(app), scale: new ScaleTool(app), offset: new OffsetTool(app), tape: new TapeTool(app), eraser: new EraserTool(app), paint: new PaintTool(app),
  orbit: new NavTool(app, 'orbit'), pan: new NavTool(app, 'pan'), zoom: new NavTool(app, 'zoom')
};
let tool = tools.select;
const TOOL_NAME = { tape: 'Taśma i prowadnice', protractor: 'Kątomierz', dim: 'Wymiar', text: 'Opis', rect: 'Prostokąt', rrect: 'Prostokąt obrócony', circle: 'Okrąg', polygon: 'Wielokąt', arc: 'Łuk przez dwa punkty', carc: 'Łuk ze środka', pie: 'Wycinek koła' };
// rodziny narzędzi: jeden przycisk na pasku, warianty w wysuwanym menu po najechaniu
const FAMILIES = { rect: ['rect', 'rrect'], circle: ['circle', 'polygon'], arc: ['arc', 'carc', 'pie'], tape: ['tape', 'protractor'], dim: ['dim', 'text'] };
const famOf = id => Object.keys(FAMILIES).find(f => FAMILIES[f].includes(id));
const famCur = {};
const TOOLBAR = [['select', 'Zaznacz'], null, ['line', 'Linia'], ['rect', 'Prostokąt'], ['circle', 'Okrąg'], ['arc', 'Łuk'], null, ['push', 'Wypchnij / wciśnij'], ['move', 'Przesuń'], ['rotate', 'Obróć'], ['scale', 'Skaluj'], ['offset', 'Odsunięcie'], null, ['tape', 'Taśma'], ['dim', 'Wymiar'], ['section', 'Przekrój'], ['eraser', 'Gumka'], ['paint', 'Kolor bryły'], 'grow', ['orbit', 'Orbita'], ['pan', 'Przesuń widok'], ['extents', 'Pokaż wszystko']];
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
    if (later) return toast(name + ' będzie w kolejnej wersji.');
    if (id === 'extents') return viewer.zoomExtents();
    if (FAMILIES[id]) { hideFlyout(); return setTool(famCur[id]); }
    setTool(id);
    if (id === 'paint') openPop('#paintPop', b, 'right');
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
}
function hideFlyout() { clearTimeout(flyTimer); if (flyEl) flyEl.remove(); flyEl = null; }
function setTool(id) {
  if (!tools[id]) return;
  tool.deactivate(); tool = tools[id]; tool.activate();
  app.lockAxis = null; vcbBuf = '';
  const fam = famOf(id);
  if (fam) { famCur[fam] = id; const fb = toolsEl.querySelector(`[data-family="${fam}"]`); if (fb) { fb.querySelector('svg').outerHTML = ic(id); fb.setAttribute('aria-label', TOOL_NAME[id]); } }
  for (const b of toolsEl.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === id || (!!fam && b.dataset.family === fam));
  $('#view').className = ['place', 'section', 'dim', 'text', 'protractor', 'line', 'rect', 'rrect', 'polygon', 'carc', 'pie', 'circle', 'arc', 'push', 'move', 'rotate', 'scale', 'offset', 'tape', 'eraser', 'paint'].includes(id) ? 'c-draw' : ['orbit', 'pan'].includes(id) ? 'c-grab' : '';
  viewer.overlayDraw = (c, v) => tool.draw(c, v);
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
  if (!ok) toast('Nie rozumiem wymiaru „' + text + '”. Przykłady: 3,5 · 350cm · 6;4');
  app.refresh();
}
// jednostka szkicu: liczba wpisana bez jednostki jest w tej jednostce; klik przełącza m → cm → mm
const unitBtn = $('#unitBtn');
function renderUnit() { unitBtn.textContent = getUnit(); unitBtn.title = 'Jednostka wymiarów: ' + { m: 'metry', cm: 'centymetry', mm: 'milimetry' }[getUnit()] + ' — kliknij, żeby zmienić'; }
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
    view.setPointerCapture(e.pointerId); view.classList.add('c-grabbing');
    return;
  }
  if (e.button === 0) { view.setPointerCapture(e.pointerId); tool.down(e, x, y); app.refresh(); }
});
view.addEventListener('pointermove', e => {
  const [x, y] = xy(e);
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
    const click = nav.btn === 2 && nav.moved < 4; nav = null; view.classList.remove('c-grabbing');
    if (click) openContext(x, y, e.clientX, e.clientY);   // prawy klik bez przeciągania: menu podręczne
    return;
  }
  if (e.button === 0) { tool.up(e, x, y); app.refresh(); }
});
view.addEventListener('dblclick', e => { const [x, y] = xy(e); tool.dbl(e, x, y); app.refresh(); });
view.addEventListener('contextmenu', e => e.preventDefault());
view.addEventListener('auxclick', e => e.preventDefault());
view.addEventListener('pointerleave', () => { viewer.redraw(); });
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
  if (e.key === 'Escape') {
    if (closePops()) return;
    if (vcbBuf) { vcbBuf = ''; app.refresh(); return; }
    const busy = tool.active || tool.anchor || tool.p0 || tool.c || tool.b || tool.face || tool.p1;
    if (!busy && app.editSolid != null) { app.exitSolid(); return; }
    if (!busy && app.editing) { app.exitGroup(); return; }
    tool.cancel(); app.lockAxis = null; app.refresh(); return;
  }
  // blokada osi strzałkami (jak w SketchUpie): → czerwona, ← zielona, ↑ niebieska, ↓ zwolnienie
  if (/^Arrow/.test(e.key) && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    const ax = { ArrowRight: 'x', ArrowLeft: 'y', ArrowUp: 'z', ArrowDown: null }[e.key];
    app.lockAxis = app.lockAxis === ax ? null : ax; app.lockByShift = false;
    app.refresh(); return;
  }
  if (e.key === 'Shift' && !e.repeat && tool.cur && tool.cur.axis && !app.lockAxis) { app.lockAxis = tool.cur.axis; app.lockByShift = true; app.refresh(); }
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
  if (e.key === 'Shift' && app.lockByShift) { app.lockAxis = null; app.lockByShift = false; app.refresh(); }
});

function run(act) {
  const later = ACTIONS.find(a => a.id === act)?.later;
  if (later) return toast(ACTIONS.find(a => a.id === act).name + ' będzie w kolejnej wersji.');
  switch (act) {
    case 'select': case 'line': case 'rect': case 'circle': case 'arc': case 'rrect': case 'polygon': case 'carc': case 'pie': case 'dim': case 'text': case 'protractor': case 'section': case 'push': case 'move': case 'rotate': case 'scale': case 'offset': case 'tape': case 'eraser': case 'paint': case 'orbit': case 'pan': case 'zoom': setTool(act); break;
    case 'hideRest': hideRest(); break;
    case 'hideSimilar': hideSimilar(); break;
    case 'hideSel': hideSel(); break;
    case 'unhideAll': unhideAll(); break;
    case 'persp': viewer.toggleOrtho(); toast(viewer.ortho ? 'Rzut równoległy' : 'Perspektywa'); renderViewChip(); renderViewPop(); break;
    case 'cut': toggleCut(); break;
    case 'obj': saveObj(); break;
    case 'library': openPop('#libPop', $('#libBtn')); break;
    case 'panel': case 'info': togglePanel(act === 'info' ? true : undefined); break;
    case 'sectionToggle': sectionToggle(); break;
    case 'sectionPlanes': viewer.showSectPlanes = !viewer.showSectPlanes; viewer.redraw(); renderViewPop(); toast(viewer.showSectPlanes ? 'Płaszczyzny przekroju widoczne' : 'Płaszczyzny przekroju ukryte'); break;
    case 'sectionFlip': { const q = selectedSections()[0]; if (q) { app.checkpoint(); q.n = q.n.map(x => -x); app.changed(); } break; }
    case 'viewIso': case 'viewTop': case 'viewFront': case 'viewRight': case 'viewBack': case 'viewLeft': viewer.setView(act.slice(4).toLowerCase()); renderViewChip(); renderViewPop(); break;
    case 'twoPoint': viewer.setTwoPoint(!viewer.twoPoint); toast(viewer.twoPoint ? 'Perspektywa dwupunktowa' : 'Perspektywa'); renderViewChip(); renderViewPop(); break;
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
    case 'editGroup': { const g = selectedGroups()[0]; if (g) app.enterGroup(g.id); else app.exitGroup(); break; }
    case 'clearGuides': if (app.model.guides.length) { app.checkpoint(); app.model.guides = []; app.changed(); } break;
    case 'theme': cycleTheme(); break;
    case 'extents': viewer.zoomExtents(); break;
    case 'delete': deleteSelection(); break;
    case 'selectAll': app.selection.clear(); app.model.shapes.forEach(s => app.selection.add(s.id)); app.model.lines.forEach(l => app.selection.add('l' + l.id)); app.model.guides.forEach(g => app.selection.add('g' + g.id)); app.selectionChanged(); break;
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
const hiddenCount = () => app.model.shapes.filter(s => s.hidden).length + app.model.lines.filter(l => l.hidden).length;
function setHidden(fn) {
  app.checkpoint();
  for (const s of app.model.shapes) { const h = fn(s.id, s); if (h !== undefined) s.hidden = h || undefined; }
  for (const l of app.model.lines) { const h = fn('l' + l.id, l); if (h !== undefined) l.hidden = h || undefined; }
  for (const d of app.model.dims) { const h = fn('d' + d.id, d); if (h !== undefined) d.hidden = h || undefined; }
  for (const t of app.model.texts) { const h = fn('t' + t.id, t); if (h !== undefined) t.hidden = h || undefined; }
  for (const id of [...app.selection]) { const s = typeof id === 'number' ? app.model.shapes.find(q => q.id === id) : app.model.lines.find(q => 'l' + q.id === id); if (!s || s.hidden) app.selection.delete(id); }
  app.changed(); renderViewChip();
}
function hideRest() {
  // drugi raz F (albo F bez zaznaczenia, gdy coś jest ukryte) pokazuje wszystko
  if ((app.isolated || !app.selection.size) && hiddenCount()) return unhideAll();
  if (!app.selection.size) return toast('Zaznacz bryły, które mają zostać widoczne.');
  setHidden(id => !app.selection.has(id));
  app.isolated = true;
}
function hideSimilar() {
  const sel = app.model.shapes.filter(s => app.selection.has(s.id));
  if (!sel.length) return toast('Zaznacz bryłę — ukryję ją razem z podobnymi.');
  let n = 0;
  setHidden((id, s) => { if (typeof id !== 'number') return undefined; if (sel.some(q => similar(q, s))) { n++; return true; } return undefined; });
  app.selection.clear(); viewer.rebuild(); toast('Ukryto podobne bryły: ' + n);
}
function hideSel() { if (!app.selection.size) return; setHidden(id => app.selection.has(id) ? true : undefined); app.selection.clear(); viewer.rebuild(); }
function unhideAll() { if (!hiddenCount()) return; setHidden(() => false); app.isolated = false; }
function toggleCut() {
  const sel = app.model.shapes.filter(s => app.selection.has(s.id) && (s.kind === 'mesh' || s.h > 0));
  if (!sel.length) return toast('Zaznacz bryłę, która ma wycinać (albo przestać wycinać).');
  app.checkpoint();
  const on = !sel.every(s => s.op === 'cut');
  for (const s of sel) s.op = on ? 'cut' : undefined;
  app.changed(); toast(on ? 'Bryła wycina z brył, które przecina' : 'Zwykła bryła');
}
function renderViewChip() {
  renderPanel();
  const n = hiddenCount(), b = $('#hiddenChip');
  b.hidden = !n; b.textContent = 'Ukryte: ' + n + ' · pokaż';
  $('#orthoChip').hidden = !viewer.ortho && !viewer.twoPoint; $('#orthoChip').textContent = viewer.ortho ? 'Rzut równoległy' : 'Perspektywa dwupunktowa';
  const ed = app.editing && app.model.groups.find(g => g.id === app.editing), eb = $('#editChip');
  eb.hidden = !ed && app.editSolid == null;
  if (app.editSolid != null) eb.textContent = 'Edytujesz bryłę — wierzchołki, krawędzie, ściany · wyjdź';
  if (ed && app.editSolid == null) {
    const depth = chainOf(app.model, ed.id).length;
    eb.textContent = (ed.kind === 'comp' ? `Edytujesz komponent (${instancesOf(app.model, ed.def).length} wyst.)` : 'Edytujesz grupę') + (depth > 1 ? ` · poziom ${depth}` : '') + ' · wyjdź';
  }
  const sg = !app.editing && selectedGroups(), sc = $('#selChip');
  sc.hidden = !(sg && sg.length === 1);
  if (sg && sg.length === 1) sc.textContent = sg[0].kind === 'comp' ? 'Komponent · ' + instancesOf(app.model, sg[0].def).length + ' wyst.' : 'Grupa';
}
app.renderViewChip = renderViewChip;

/* ---------- narzędzia brył ---------- */
// kolejność zaznaczania ma znaczenie: pierwsza zaznaczona bryła jest tą, z którą działamy
function solidOp(op) {
  const sel = [...app.selection].filter(i => typeof i === 'number').map(id => app.model.shapes.find(s => s.id === id)).filter(s => s && isSolid(s) && s.op !== 'cut');
  if (sel.length < 2) return toast('Zaznacz co najmniej dwie bryły (kolejność ma znaczenie: pierwsza jest główną).');
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
  toast({ union: 'Połączono bryły', intersect: 'Została część wspólna', subtract: 'Odjęto od pierwszej bryły', trim: 'Przycięto pierwszą bryłę (pozostałe zostały)' }[op]);
}

function deleteSelection() {
  if (!app.selection.size) return;
  app.checkpoint();
  removeIds(app.model, app.selection);
  app.selection.clear(); app.changed();
}
function undo() {
  if (tool.active || tool.anchor || tool.p0) tool.cancel();
  if (!app.undo.length) return;
  app.opSeq++;
  app.redo.push(cloneModel(app.model)); app.model = app.undo.pop();
  app.selection.clear(); viewer.setModel(app.model); app.markDirty(); app.refresh(); renderViewChip();
  if (app.editing && !app.model.groups.some(g => g.id === app.editing)) app.exitGroup();
}
function redo() {
  if (!app.redo.length) return;
  app.opSeq++;
  app.undo.push(cloneModel(app.model)); app.model = app.redo.pop();
  app.selection.clear(); viewer.setModel(app.model); app.markDirty(); app.refresh(); renderViewChip();
  if (app.editing && !app.model.groups.some(g => g.id === app.editing)) app.exitGroup();
}

/* ---------- styl ---------- */
function setStyle(s) {
  viewer.setStyle(s);
  for (const b of document.querySelectorAll('#styleSeg button')) b.classList.toggle('on', b.dataset.style === s);
  $('#pngStyle').textContent = 'styl: ' + STYLES[s].name;
}
document.querySelectorAll('#styleSeg button').forEach(b => b.addEventListener('click', () => { setStyle(b.dataset.style); }));

/* ---------- okienka ---------- */
function openPop(sel, anchor, side) {
  const p = $(sel); const was = !p.hidden;
  closePops(); if (was) return;
  p.hidden = false;
  const r = anchor.getBoundingClientRect(), w = p.offsetWidth;
  if (side === 'right') { p.style.left = (r.right + 8) + 'px'; p.style.top = Math.max(8, r.top - 8) + 'px'; }
  else { p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px'; p.style.top = (r.bottom + 6) + 'px'; }
  anchor.classList.add('open');
  if (sel === '#sunPop') renderSun();
  if (sel === '#pngPop') renderPng();
  if (sel === '#underPop') renderUnder();
  if (sel === '#viewPop') renderViewPop();
  if (sel === '#libPop') renderLib();
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
const groupName = g => g.name || (g.kind === 'comp' ? 'Komponent ' + g.def.slice(1) : 'Grupa ' + g.id);
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
  const tagSelect = cur => `<div class="row"><span class="lbl w70">Warstwa</span><select class="fld grow" id="infTag"><option value="">bez warstwy</option>${m.tags.map(t => `<option value="${t.id}"${t.id === cur ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`;
  const size = ids => { const b = bounds(m, null, ids); return b ? infoRow('Wymiary', `${fmtNum(b.hi[0] - b.lo[0])} × ${fmtNum(b.hi[1] - b.lo[1])} × ${fmtLength(b.hi[2] - b.lo[2])}`) : ''; };
  const vol = ss => { let v = 0, a = 0; for (const s of ss) { const q = meshCopy(s); v += Math.abs(meshVolume(q)); a += meshArea(q); } return ss.length ? infoRow('Pole ścian', fmtA(a)) + infoRow('Objętość', fmtV(v)) : ''; };
  let html = '';
  if (!sel.length) {
    const solids = m.shapes.filter(s => isSolid(s) && s.op !== 'cut');
    html = `<div class="muted">Nic nie zaznaczono. Kliknij element, żeby zobaczyć jego wymiary, pole i objętość.</div>`
      + infoRow('Bryły', solids.length) + infoRow('Grupy', m.groups.filter(g => g.kind !== 'comp').length) + infoRow('Komponenty', new Set(m.groups.filter(g => g.kind === 'comp').map(g => g.def)).size + ' rodz. · ' + m.groups.filter(g => g.kind === 'comp').length + ' wyst.')
      + vol(solids);
  } else {
    const groups = selectedGroups(), tops = selectionTops();
    const one = tops.length === 1 ? tops[0] : null;
    if (one && groups.length === 1) {
      const g = groups[0], ids = membersOf(m, g.id);
      const n = g.kind === 'comp' ? m.groups.filter(q => q.def === g.def && q.kind === 'comp').length : 0;
      html = `<div class="row"><span class="lbl w70">Nazwa</span><input class="fld grow" id="infName" value="${esc(groupName(g))}"></div>`
        + infoRow('Rodzaj', g.kind === 'comp' ? 'komponent, ' + n + ' wyst.' : 'grupa')
        + tagSelect(g.tag) + size(ids) + vol(solidsIn(ids));
    } else if (one && typeof sel[0] === 'number' && sel.length === 1) {
      const s = one;
      html = `<div class="row"><span class="lbl w70">Nazwa</span><input class="fld grow" id="infName" value="${esc(s.name || '')}" placeholder="${isSolid(s) ? 'Bryła' : 'Ściana'} ${s.id}"></div>`
        + infoRow('Rodzaj', s.op === 'cut' ? 'bryła wycinająca' : isSolid(s) ? 'bryła' : 'ściana') + tagSelect(s.tag) + size([s.id])
        + (isSolid(s) ? vol([s]) : infoRow('Pole', fmtA(facesOfShape(s).reduce((a, f) => a + Math.abs(polyAreaOf(f.verts)), 0) / (facesOfShape(s).length > 1 ? 2 : 1))));
    } else if (one && sel[0][0] === 'l') {
      html = infoRow('Rodzaj', 'linia') + tagSelect(one.tag) + infoRow('Długość', fmtLength(V3.dist(one.a, one.b)));
    } else if (one && sel[0][0] === 'd') {
      html = infoRow('Rodzaj', 'wymiar') + infoRow('Zmierzone', fmtLength(V3.dist(one.a, one.b))) + `<div class="row"><span class="lbl w70">Tekst</span><input class="fld grow" id="infDimText" value="${esc(one.text || '')}" placeholder="zmierzony"></div>` + tagSelect(one.tag);
    } else if (one && sel[0][0] === 't') {
      html = infoRow('Rodzaj', 'opis') + `<textarea class="fld" id="infText">${esc(one.text)}</textarea>` + tagSelect(one.tag);
    } else if (sel.length === 1 && sel[0][0] === 's') {
      const q = m.sections.find(q => 's' + q.id === sel[0]);
      html = infoRow('Rodzaj', 'płaszczyzna przekroju') + infoRow('Stan', q?.on ? 'włączony' : 'wyłączony');
    } else {
      html = infoRow('Zaznaczono', tops.length + (tops.length === 1 ? ' element' : tops.length < 5 ? ' elementy' : ' elementów')) + tagSelect(tops.every(e => e.tag === tops[0]?.tag) ? tops[0]?.tag : undefined) + size(sel) + vol(solidsIn(sel));
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
  L.innerHTML = m.tags.length ? m.tags.map(t => `<div class="tagrow${t.hidden ? ' off' : ''}" data-id="${t.id}"><button class="ib" data-eye title="${t.hidden ? 'Pokaż' : 'Ukryj'} warstwę">${t.hidden ? EYE_OFF : EYE}</button><input class="fld" value="${esc(t.name)}" aria-label="Nazwa warstwy"><span class="cnt num">${tagCount(t.id) || ''}</span><button class="ib" data-del title="Usuń warstwę (elementy zostają, bez warstwy)">${XS}</button></div>`).join('')
    : '<div class="muted">Warstwy porządkują model (np. istniejące, projektowane, otoczenie). Element dostaje warstwę w sekcji Element.</div>';
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
  const t = { id: m.next++, name: 'Warstwa ' + (m.tags.length + 1) };
  m.tags.push(t);
  // nowa warstwa od razu dla zaznaczenia
  const tops = selectionTops(); for (const e of tops) e.tag = t.id;
  app.changed();
  if (tops.length) toast('Zaznaczone elementy są na warstwie „' + t.name + '”.');
  setTimeout(() => { const i = $(`.tagrow[data-id="${t.id}"] input`); if (i) { i.focus(); i.select(); } });
});
function renderTree() {
  const m = app.model, T = $('#tree');
  const roots = m.groups.filter(g => g.p == null);
  if (!roots.length) { T.innerHTML = '<div class="muted">Tu pojawią się grupy i komponenty (Spacja, ' + prettyCombo('Mod+Space', isMac) + ').</div>'; return; }
  const selG = new Set(selectedGroups().map(g => g.id));
  const rows = [];
  const walk = (g, depth) => {
    const kids = m.groups.filter(q => q.p === g.id), closed = app.treeClosed.has(g.id);
    const mem = membersOf(m, g.id), hid = mem.length && mem.every(i => { const e = typeof i === 'number' ? m.shapes.find(s => s.id === i) : m.lines.find(l => 'l' + l.id === i); return e && isHidden(m, e); });
    const ico = g.kind === 'comp' ? '<path d="M8 2.5 13.5 8 8 13.5 2.5 8z"/>' : '<rect x="3" y="3" width="10" height="10" rx="1.5"/>';
    rows.push(`<div class="tnode${selG.has(g.id) ? ' sel' : ''}${app.editing === g.id ? ' edit' : ''}${hid ? ' hid' : ''}" data-id="${g.id}" style="padding-left:${depth * 14}px"><span class="arr">${kids.length ? (closed ? '▸' : '▾') : ''}</span><svg class="ico" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">${ico}</svg><span class="nm">${esc(groupName(g))}</span><button class="ib" title="${hid ? 'Pokaż' : 'Ukryj'}">${hid ? EYE_OFF : EYE}</button></div>`);
    if (!closed) for (const k of kids) walk(k, depth + 1);
  };
  for (const g of roots) walk(g, 0);
  const loose = m.shapes.filter(s => s.g == null && isSolid(s)).length;
  if (loose) rows.push(`<div class="muted" style="padding:4px 0 0 20px">${loose} ${loose === 1 ? 'bryła' : loose < 5 ? 'bryły' : 'brył'} poza grupami</div>`);
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
  $('#libMine').innerHTML = mine.map((it, i) => `<div class="libitem" role="button" tabindex="0" data-i="${i}">${thumb(it)}<span>${esc(it.name)}</span><button class="del" title="Usuń z biblioteki">${XS}</button></div>`).join('');
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
  app.changed();
  app.selection.clear(); membersOf(m, gid).forEach(i => app.selection.add(i));
  setTool('select'); app.selectionChanged();
};
$('#libSave').addEventListener('click', () => {
  const m = app.model, ids = new Set(app.selection);
  const shapes = m.shapes.filter(s => ids.has(s.id)), lines = m.lines.filter(l => ids.has('l' + l.id));
  if (!shapes.length && !lines.length) return toast('Zaznacz bryły albo grupę, którą chcesz zapisać w bibliotece.');
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
  const name = (single && single.name) || 'Model ' + (loadUserLib().length + 1);
  const list = loadUserLib(); list.push({ name, shapes: S, lines: L, groups: keep });
  if (!saveUserLib(list)) return toast('Nie udało się zapisać biblioteki (za mało miejsca).');
  renderLib(); toast('Zapisano w bibliotece jako „' + name + '”. Nazwę zmienisz w panelu, nadając ją grupie przed zapisem.');
});

/* ---------- przekroje ---------- */
const selectedSections = () => (app.model.sections || []).filter(q => app.selection.has('s' + q.id));
function sectionToggle() {
  const all = app.model.sections || [];
  if (!all.length) return toast('Nie ma jeszcze przekroju — narysuj go narzędziem Przekrój.');
  const sel = selectedSections()[0], active = all.find(q => q.on);
  app.checkpoint();
  if (sel) { const on = !sel.on; all.forEach(q => q.on = false); sel.on = on; }
  else if (active) active.on = false;
  else { const q = all[all.length - 1]; q.on = true; }
  app.changed(); renderViewPop();
  toast(all.some(q => q.on) ? 'Przekrój włączony' : 'Przekrój wyłączony');
}

/* ---------- widok, kamera, sceny ---------- */
const VIEWS = [['viewIso', 'Izometria'], ['viewTop', 'Góra'], ['viewFront', 'Przód'], ['viewRight', 'Prawy'], ['viewBack', 'Tył'], ['viewLeft', 'Lewy']];
app.scenes = []; app.scene = -1;
const mmOf = fov => Math.round(12 / Math.tan(fov * Math.PI / 360));
$('#viewBtn').addEventListener('click', () => openPop('#viewPop', $('#viewBtn')));
function renderViewPop() {
  if ($('#viewPop').hidden) return;
  const k = id => { const c = keysFor(id, app.keys.over)[0]; return c ? '<kbd>' + prettyCombo(c, isMac) + '</kbd>' : ''; };
  $('#viewGrid').innerHTML = VIEWS.map(([id, n]) => `<button data-a="${id}"><span>${n}</span>${k(id)}</button>`).join('');
  $('#viewGrid').querySelectorAll('button').forEach(b => b.addEventListener('click', () => run(b.dataset.a)));
  const proj = viewer.ortho ? 'ortho' : viewer.twoPoint ? 'two' : 'persp';
  document.querySelectorAll('#projSeg button').forEach(b => b.classList.toggle('on', b.dataset.proj === proj));
  const f = $('#fovRange'); f.value = Math.round(viewer.cam.fov); f.disabled = viewer.ortho; setRangeFill(f);
  $('#fovLbl').textContent = viewer.ortho ? '—' : Math.round(viewer.cam.fov) + '° · ' + mmOf(viewer.cam.fov) + ' mm';
  const secs = app.model.sections || [];
  $('#secRow').hidden = !secs.length;
  $('#secOn').checked = secs.some(q => q.on); $('#secPlanes').checked = viewer.showSectPlanes;
  const L = $('#sceneList');
  L.innerHTML = app.scenes.map((sc, i) => `<div class="scene${i === app.scene ? ' on' : ''}" data-i="${i}"><button class="no num" title="Pokaż scenę">${i + 1}</button><input class="fld" value="${sc.name.replace(/"/g, '&quot;')}" aria-label="Nazwa sceny"><button class="ib" data-u title="Zapisz bieżący widok w tej scenie"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/></svg></button><button class="ib" data-d title="Usuń scenę"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>`).join('');
  L.querySelectorAll('.scene').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('.no').addEventListener('click', () => showScene(i));
    const inp = row.querySelector('input');
    inp.addEventListener('change', () => { app.scenes[i].name = inp.value.trim() || 'Scena ' + (i + 1); app.markDirty(); });
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') inp.blur(); });
    row.querySelector('[data-u]').addEventListener('click', () => { app.scenes[i] = { ...captureScene(), name: app.scenes[i].name }; app.scene = i; app.markDirty(); renderViewPop(); toast('Zaktualizowano scenę „' + app.scenes[i].name + '”'); });
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
const captureScene = () => ({ camera: viewer.getCamera(), style: viewer.style, sun: { ...viewer.sunCfg }, section: (app.model.sections || []).find(q => q.on)?.id ?? null });
function addScene() {
  app.scenes.push({ name: 'Scena ' + (app.scenes.length + 1), ...captureScene() });
  app.scene = app.scenes.length - 1; app.markDirty();
  toast('Dodano scenę „' + app.scenes[app.scene].name + '”');
  renderViewPop();
}
function showScene(i) {
  const sc = app.scenes[i]; if (!sc) return;
  app.scene = i;
  viewer.setCamera(sc.camera);
  if (sc.style && STYLES[sc.style]) setStyle(sc.style);
  if (sc.sun) { viewer.setSun(sc.sun); renderSun(); }
  if ('section' in sc && app.model.sections?.length) { for (const q of app.model.sections) q.on = q.id === sc.section; viewer.rebuild(); }
  renderViewChip(); renderViewPop();
}
function goScene(d) {
  if (!app.scenes.length) return toast('Nie ma jeszcze scen — dodaj je w okienku Widok.');
  const i = ((app.scene < 0 ? (d > 0 ? -1 : 0) : app.scene) + d + app.scenes.length) % app.scenes.length;
  showScene(i); toast(app.scenes[i].name);
}

/* ---------- słońce ---------- */
const MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
function setSun(c) { viewer.setSun(c); renderSun(); app.markDirtySoft(); }
app.markDirtySoft = () => { if (!app.file.dirty && app.model.shapes.length) app.markDirty(); };
const setRangeFill = el => el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%');
function renderSun() {
  const c = viewer.sunCfg, [Y, M, D] = c.date.split('-').map(Number);
  $('#sunLabel').textContent = `${D} ${MON[M - 1]} · ${fmtHour(c.hour)} · ${placeName(c)}`;
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
  $('#sunRise').textContent = rise != null ? 'wschód ' + fmtHour(rise) : '';
  $('#sunSet').textContent = set != null ? 'zachód ' + fmtHour(set) : '';
  $('#sunAltAz').textContent = p.alt > 0 ? `wysokość ${Math.round(p.alt)}° · azymut ${Math.round(p.az)}°` : 'słońce pod horyzontem';
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
const placeName = c => (Math.abs(c.lat - 52.23) < 0.05 && Math.abs(c.lon - 21.01) < 0.05) ? 'Warszawa' : 'własne miejsce';
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
  if (W > max || H > max) { const k = max / Math.max(W, H); W = Math.floor(W * k); H = Math.floor(H * k); toast(`Największy obraz na tym komputerze: ${W} × ${H} px`); }
  $('#pngGo').disabled = true; $('#pngGo').textContent = 'Liczę…';
  try {
    const blob = await viewer.exportPng(W, H, { transparent: $('#pngTransparent').checked, axes: $('#pngAxes').checked, underlay: $('#pngUnder').checked, dark: viewer.dark && $('#pngDark').checked, guides: $('#pngGuides').checked });
    const p = await api.savePng(new Uint8Array(await blob.arrayBuffer()), pngName());
    if (p) { closePops(); toast('Zapisano obraz ' + W + ' × ' + H + ' px', api.web ? null : ['Pokaż', () => api.showInFolder(p)]); }
  } catch (err) { toast('Nie udało się zapisać obrazu: ' + err.message); }
  $('#pngGo').disabled = false; $('#pngGo').textContent = 'Zapisz…';
});

/* ---------- podkład CAD ---------- */
const UNIT_M = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1, in: 0.0254, ft: 0.3048 };
async function pickUnderlay(path) {
  const r = await api.pickUnderlay(path || null);
  if (!r) return;
  if (r.error) {
    if (r.code === 'NO_ODA') { openPop('#underPop', $('#underBtn')); toast('Do plików DWG potrzebny jest darmowy ODA File Converter.', ['Pobierz', () => api.openExternal('https://www.opendesign.com/guestfiles/oda_file_converter')]); }
    else toast(r.error);
    return;
  }
  try {
    const d = parseDxf(r.data);
    app.underlay = { name: r.name, path: r.path || null, converted: !!r.converted, height: app.underlay?.height ?? 0, opacity: 0.6, snap: true, units: d.units, offset: d.offset, layers: d.layers, truncated: d.truncated };
    applyUnderlay();
    viewer.zoomExtents();
    closePops(); openPop('#underPop', $('#underBtn'));
    app.markDirty();
  } catch (err) { toast('Nie udało się odczytać pliku: ' + err.message); }
}
function applyUnderlay() { viewer.setUnderlay(app.underlay); snapper.setUnderlay(app.underlay); $('#underBtn').classList.toggle('on', !!app.underlay); }
async function renderUnder() {
  const u = app.underlay;
  $('#underEmpty').hidden = !!u; $('#underFull').hidden = !u;
  if (!u) {
    const s = await api.odaStatus();
    $('#odaInfo').innerHTML = s.web ? 'W wersji przeglądarkowej działa tylko DXF.'
      : s.path ? 'ODA File Converter jest zainstalowany — pliki DWG zadziałają.'
        : 'Do plików DWG potrzebny jest darmowy ODA File Converter. <a href="#" id="odaGet">Pobierz</a> · <a href="#" id="odaPick">Wskaż program…</a>';
    $('#odaGet')?.addEventListener('click', e => { e.preventDefault(); api.openExternal('https://www.opendesign.com/guestfiles/oda_file_converter'); });
    $('#odaPick')?.addEventListener('click', async e => { e.preventDefault(); await api.odaPick(); renderUnder(); });
    return;
  }
  $('#underName').textContent = u.name;
  $('#underInfo').textContent = (u.converted ? 'Zamieniony na DXF (ODA File Converter) · ' : '') + 'środek rysunku przesunięty do początku układu' + (u.truncated ? ' · plik bardzo duży, część linii pominięta' : '');
  if (document.activeElement !== $('#underH')) $('#underH').value = String(u.height).replace('.', ',') + ' m';
  $('#underUnits').value = u.units;
  const op = $('#underOp'); op.value = u.opacity; setRangeFill(op);
  $('#underSnap').checked = u.snap;
  $('#underCount').textContent = `${u.layers.filter(l => l.visible).length} z ${u.layers.length}`;
  const box = $('#underLayers'); box.innerHTML = '';
  for (const L of u.layers) {
    const row = document.createElement('div'); row.className = 'layer' + (L.visible ? '' : ' off');
    row.innerHTML = `<i style="background:${L.color}"></i><span title="${L.name}">${L.name}</span><span class="num">${L.segs.length / 4}</span>`;
    const b = document.createElement('button'); b.className = 'ib sm'; b.setAttribute('aria-label', (L.visible ? 'Ukryj' : 'Pokaż') + ' warstwę ' + L.name);
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

/* ---------- kolor bryły ---------- */
const PALETTE = [[null, 'biały'], ['#e4dfd3', 'jasny beton'], ['#c9c3b5', 'beton'], ['#8d8980', 'grafit'], ['#c99a7c', 'cegła'], ['#bfa17c', 'drewno'], ['#a9b49a', 'zieleń'], ['#a7b6c2', 'szkło', 0.3]];
function renderSwatches() {
  const box = $('#swatches'); box.innerHTML = '';
  for (const [c, n, a = 1] of PALETTE) {
    const b = document.createElement('button'); b.className = 'sw' + ((app.paint || null) === c && Math.abs(app.paintAlpha - a) < 0.01 ? ' on' : '') + (a < 1 ? ' glass' : '');
    b.style.setProperty('--c', c || DEFAULT_COLOR); b.style.setProperty('--a', a); b.textContent = n;
    b.addEventListener('click', () => { app.setPaint(c, a); setTool('paint'); });
    box.append(b);
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
      row.innerHTML = `<span>${a.name}</span>` + (a.later ? '<span class="lbl" style="flex:none">później</span>' : '');
      const b = document.createElement('button'); b.setAttribute('aria-label', 'Zmień skrót: ' + a.name);
      b.innerHTML = keysFor(a.id, app.keys.over).map(k => `<kbd>${prettyCombo(k, isMac)}</kbd>`).join(' ') || '<kbd>—</kbd>';
      b.addEventListener('click', () => {
        b.classList.add('wait'); b.innerHTML = '<kbd>naciśnij…</kbd>';
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
  if (id != null && !app.selection.has(id) && (!app.editing || app.inEditing(id))) {
    if (app.editSolid != null && id !== app.editSolid) app.exitSolid();
    app.selection.clear(); app.expand(id).forEach(i => app.selection.add(i)); app.selectionChanged();
  }
  const sel = [...app.selection], groups = selectedGroups();
  const solids = sel.filter(i => typeof i === 'number').map(i => app.model.shapes.find(s => s.id === i)).filter(s => s && isSolid(s));
  const items = [];
  const secSel = selectedSections();
  if (secSel.length && secSel.length === sel.length) {
    items.push(['sectionToggle', secSel[0].on ? 'Wyłącz przekrój' : 'Włącz ten przekrój'], ['sectionFlip', 'Odwróć kierunek'], ['sectionPlanes', viewer.showSectPlanes ? 'Ukryj płaszczyzny przekrojów' : 'Pokaż płaszczyzny przekrojów'], null, ['delete', 'Usuń']);
  } else if (sel.length) {
    items.push(['info', 'Informacje o elemencie'], null);
    if (groups.length === 1) items.push(['editGroup', groups[0].kind === 'comp' ? 'Edytuj komponent' : 'Edytuj grupę']);
    items.push(['group', 'Utwórz grupę'], ['comp', 'Utwórz komponent']);
    if (groups.length) items.push(['explode', 'Rozbij']);
    if (groups.some(g => g.kind === 'comp')) items.push(['unique', 'Zrób unikalny']);
    items.push(null);
    if (solids.length) items.push(['cut', solids.every(s => s.op === 'cut') ? 'Bryła zwykła (nie wycina)' : 'Bryła wycinająca']);
    if (solids.filter(s => s.op !== 'cut').length >= 2) items.push(['solidUnion', 'Suma brył'], ['solidIntersect', 'Część wspólna'], ['solidSubtract', 'Odejmij od pierwszej'], ['solidTrim', 'Przytnij pierwszą']);
    items.push(null, ['hideSel', 'Ukryj'], ['hideRest', 'Ukryj resztę'], ['zoomSel', 'Pokaż zaznaczenie'], null, ['delete', 'Usuń']);
  } else {
    if (app.editing || app.editSolid != null) items.push(['exitEdit', 'Zakończ edycję'], null);
    items.push(['selectAll', 'Zaznacz wszystko'], ['unhideAll', 'Pokaż ukryte'], ['extents', 'Pokaż cały model'], null, ['clearGuides', 'Usuń wszystkie prowadnice']);
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

/* ---------- menu pliku ---------- */
$('#fileBtn').addEventListener('click', () => {
  const m = $('#menu'); const was = !m.hidden; closePops(); if (was) return;
  const k = id => prettyCombo(keysFor(id, app.keys.over)[0] || '', isMac);
  const items = [['new', 'Nowy szkic'], ['open', 'Otwórz…'], null, ['save', 'Zapisz'], ['saveAs', 'Zapisz jako…'], null, ['underlay', 'Podkład DXF / DWG…'], ['png', 'Eksport PNG…'], ['obj', 'Eksport OBJ (3ds Max)…'], null, ['clearGuides', 'Usuń wszystkie prowadnice'], ['theme', 'Wygląd: ' + THEME_NAME[theme]], ['newWindow', 'Nowe okno']];
  m.innerHTML = items.map(i => i ? `<button role="menuitem" data-a="${i[0]}"><span>${i[1]}</span>${keysFor(i[0], app.keys.over).length ? '<kbd>' + k(i[0]) + '</kbd>' : ''}</button>` : '<div class="msep"></div>').join('');
  m.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { closePops(); b.dataset.a === 'newWindow' ? api.newWindow() : run(b.dataset.a); }));
  m.hidden = false;
  const r = $('#fileBtn').getBoundingClientRect();
  m.style.left = Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 6) + 'px';
  $('#fileBtn').classList.add('open');
});

/* ---------- plik ---------- */
function serialize() {
  return JSON.stringify({
    app: 'Modo', format: 1, model: app.model, camera: viewer.getCamera(), style: viewer.style,
    sun: viewer.sunCfg, axes: viewer.showAxes, units: getUnit(), underlay: app.underlay, scenes: app.scenes
  });
}
function load(text, name, path) {
  const d = JSON.parse(text);
  if (d.app !== 'Modo') throw new Error('To nie jest plik Modo');
  app.editing = null; viewer.editGroup = null; app.editSolid = null; viewer.editSolid = null;
  app.model = fixModel(d.model || newModel()); app.undo = []; app.redo = []; app.selection.clear();
  viewer.setModel(app.model);
  if (d.sun) viewer.setSun(d.sun);
  if (d.style && STYLES[d.style]) setStyle(d.style);
  if (d.units) { setUnit(d.units); renderUnit(); }
  app.opSeq++;
  viewer.showAxes = d.axes !== false;
  app.underlay = d.underlay || null; applyUnderlay();
  app.scenes = d.scenes || []; app.scene = -1;
  if (d.camera) viewer.setCamera(d.camera); else viewer.zoomExtents();
  setFile(path, name); app.markDirty(false); renderSun(); setTool('select'); renderViewChip();
}
function setFile(path, name) { app.file.path = path; app.file.name = name || 'Bez nazwy'; $('#fileName').textContent = app.file.name; document.title = app.file.name + ' — Modo'; }
async function confirmDiscard() { return !app.file.dirty || confirm('Szkic ma niezapisane zmiany. Porzucić je?'); }
async function newSketch() {
  if (!(await confirmDiscard())) return;
  app.editing = null; viewer.editGroup = null;
  app.model = newModel(); app.undo = []; app.redo = []; app.selection.clear(); app.underlay = null; applyUnderlay(); app.scenes = []; app.scene = -1;
  app.opSeq++; viewer.setModel(app.model); setFile(null, 'Bez nazwy'); app.markDirty(false); setTool('select');
}
async function openSketch(p) {
  if (!p && !(await confirmDiscard())) return;
  try { const r = await api.openFile(p); if (r) load(r.text, r.name, r.path); }
  catch (err) { toast('Nie udało się otworzyć pliku: ' + err.message); }
}
async function saveSketch(as) {
  try {
    const r = await api.saveFile(as ? null : app.file.path, serialize(), app.file.name === 'Bez nazwy' ? 'Szkic' : app.file.name);
    if (!r) return false;
    setFile(r.path, r.name); app.markDirty(false); toast('Zapisano');
    return true;
  } catch (err) { toast('Nie udało się zapisać: ' + err.message); return false; }
}
async function saveObj() {
  const name = app.file.name === 'Bez nazwy' ? 'Modo' : app.file.name;
  const r = exportObj(app.model, name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^A-Za-z0-9_ -]+/g, '_'));
  if (!r.count) return toast('Nie ma brył do eksportu.');
  try {
    const p = await api.saveObj(r.obj, r.mtl, name);
    if (p) toast('Zapisano OBJ: ' + r.count + ' obiektów (metry, oś Y w górę)', api.web ? null : ['Pokaż', () => api.showInFolder(p)]);
  } catch (err) { toast('Nie udało się zapisać OBJ: ' + err.message); }
}
api.onSaveThenClose(async () => { if (await saveSketch(false)) api.closeNow(); });

/* ---------- aktualizacje ---------- */
function renderUpd(s) {
  const b = $('#updBtn');
  if (s && s.state === 'available') { b.hidden = false; b.textContent = 'Nowa wersja ' + s.version + ' — zainstaluj'; }
  else if (s && s.state === 'downloading') { b.hidden = false; b.textContent = 'Pobieram ' + Math.round(100 * s.got / (s.size || 1)) + '%'; }
  else b.hidden = true;
}
api.onUpdate(renderUpd); api.updateGet().then(renderUpd);
$('#updBtn').addEventListener('click', () => api.updateInstall());

/* ---------- komunikaty ---------- */
let toastT = 0;
function toast(text, action) {
  const t = $('#toast'); t.textContent = text;
  if (action) { const b = document.createElement('button'); b.textContent = action[0]; b.addEventListener('click', () => { action[1](); t.hidden = true; }); t.append(b); }
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, action ? 7000 : 3200);
}

app.toast = (t, a) => toast(t, a);
$('#hiddenChip').addEventListener('click', () => unhideAll());
$('#editChip').addEventListener('click', () => app.editSolid != null ? app.exitSolid() : app.exitGroup());
$('#orthoChip').addEventListener('click', () => run(viewer.ortho ? 'persp' : 'twoPoint'));

/* ---------- wygląd: automatyczny (jak system), jasny, ciemny ---------- */
const THEME_NAME = { auto: 'automatyczny', light: 'jasny', dark: 'ciemny' };
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
  applyTheme(); toast('Wygląd: ' + THEME_NAME[theme]);
}
mq.addEventListener('change', () => { if (theme === 'auto') applyTheme(); });
applyTheme();

/* ---------- start ---------- */
setStyle('szkic');
setTool('select');
renderSun();
setFile(null, 'Bez nazwy'); app.markDirty(false);
const startPath = new URLSearchParams(location.search).get('p');
if (startPath) openSketch(startPath);
window.modo = app;   // do testów w konsoli
app.solidReady = solidReady;
// Manifold ładuje się w tle; po załadowaniu scena przelicza wycięcia już nim
initSolid().then(ok => { if (ok && app.model.shapes.some(q => q.op === 'cut')) viewer.rebuild(); });
app.run = run;
