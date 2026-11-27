import { _t } from './i18n.js';
// Skróty klawiszowe. Domyślne to układ Michała (Q W E R jak w 3ds Maxie, A S D, Z X C); każdy można zmienić w oknie skrótów (klawisz ?).
// Zapis: kod klawisza (KeyboardEvent.code bez „Key”/„Digit”) z modyfikatorami, np. „L”, „Shift+Z”, „Mod+S”.
// „Mod” to ⌘ na Macu i Ctrl na Windows.

export const ACTIONS = [
  { group: _t('Rysowanie'), id: 'line', name: _t('Linia'), keys: ['A'] },
  { group: _t('Rysowanie'), id: 'freehand', name: _t('Linia odręczna'), keys: [] },
  { group: _t('Rysowanie'), id: 'rect', name: _t('Prostokąt'), keys: ['D'] },
  { group: _t('Rysowanie'), id: 'rrect', name: _t('Prostokąt obrócony'), keys: ['Shift+D'] },
  { group: _t('Rysowanie'), id: 'circle', name: _t('Okrąg'), keys: ['V'] },
  { group: _t('Rysowanie'), id: 'polygon', name: _t('Wielokąt foremny'), keys: ['Shift+V'] },
  { group: _t('Rysowanie'), id: 'arc', name: _t('Łuk przez dwa punkty'), keys: ['B'] },
  { group: _t('Rysowanie'), id: 'arc3', name: _t('Łuk przez trzy punkty'), keys: [] },
  { group: _t('Rysowanie'), id: 'carc', name: _t('Łuk ze środka'), keys: ['Shift+B'] },
  { group: _t('Rysowanie'), id: 'pie', name: _t('Wycinek koła'), keys: ['Alt+B'] },
  { group: _t('Rysowanie'), id: 'offset', name: _t('Odsunięcie'), keys: ['T'] },
  { group: _t('Rysowanie'), id: 'tape', name: _t('Taśma i prowadnice'), keys: ['Y'] },
  { group: _t('Rysowanie'), id: 'protractor', name: _t('Kątomierz (prowadnica pod kątem)'), keys: ['Shift+Y'] },
  { group: _t('Rysowanie'), id: 'axes', name: _t('Osie rysowania (nowy początek i kierunki)'), keys: [] },
  { group: _t('Rysowanie'), id: 'axesReset', name: _t('Przywróć osie rysowania'), keys: [] },
  { group: _t('Rysowanie'), id: 'dim', name: _t('Wymiar'), keys: ['U'] },
  { group: _t('Rysowanie'), id: 'text', name: _t('Opis z odnośnikiem'), keys: ['Shift+T'] },
  { group: _t('Rysowanie'), id: 'section', name: _t('Płaszczyzna przekroju'), keys: ['N'] },
  { group: _t('Widok'), id: 'sectionToggle', name: _t('Przekrój: włącz / wyłącz'), keys: ['Shift+N'] },
  { group: _t('Widok'), id: 'sectionPlanes', name: _t('Przekrój: pokaż / ukryj płaszczyzny'), keys: ['Alt+N'] },
  { group: _t('Rysowanie'), id: 'clearGuides', name: _t('Usuń wszystkie prowadnice'), keys: [] },
  { group: _t('Edycja'), id: 'select', name: _t('Zaznacz'), keys: ['Q'] },
  { group: _t('Edycja'), id: 'group', name: _t('Utwórz grupę'), keys: ['Space'] },
  { group: _t('Edycja'), id: 'comp', name: _t('Utwórz komponent'), keys: ['Mod+Space', 'Ctrl+Space'] },
  { group: _t('Edycja'), id: 'unique', name: _t('Komponent: zrób unikalny'), keys: ['Shift+U'] },
  { group: _t('Edycja'), id: 'explode', name: _t('Rozbij grupę / komponent'), keys: ['Shift+Space'] },
  { group: _t('Edycja'), id: 'editGroup', name: _t('Edytuj grupę (albo dwuklik) lub bryłę / zakończ'), keys: ['Enter'] },
  { group: _t('Edycja'), id: 'move', name: _t('Przesuń'), keys: ['W'] },
  { group: _t('Edycja'), id: 'rotate', name: _t('Obróć'), keys: ['E'] },
  { group: _t('Edycja'), id: 'scale', name: _t('Skaluj'), keys: ['R'] },
  { group: _t('Edycja'), id: 'push', name: _t('Wypchnij / wciśnij'), keys: ['X'] },
  { group: _t('Edycja'), id: 'cut', name: _t('Bryła wycinająca / zwykła'), keys: ['Shift+X'] },
  { group: _t('Bryły'), id: 'intersect', name: _t('Przetnij z modelem (krawędzie przecięcia)'), keys: [] },
  { group: _t('Bryły'), id: 'intersectSel', name: _t('Przetnij z zaznaczeniem'), keys: [] },
  { group: _t('Bryły'), id: 'solidUnion', name: _t('Połącz zaznaczone bryły'), keys: [] },
  { group: _t('Bryły'), id: 'solidIntersect', name: _t('Część wspólna'), keys: [] },
  { group: _t('Bryły'), id: 'solidSubtract', name: _t('Odejmij od pierwszej (reszta znika)'), keys: [] },
  { group: _t('Bryły'), id: 'solidTrim', name: _t('Przytnij pierwszą (reszta zostaje)'), keys: [] },
  { group: _t('Edycja'), id: 'eraser', name: _t('Gumka'), keys: ['S'] },
  { group: _t('Edycja'), id: 'paint', name: _t('Wiaderko (kolor i materiał)'), keys: ['M'] },
  { group: _t('Edycja'), id: 'soften', name: _t('Wygładź krawędzie (ściany pod kątem do 30°)'), keys: [] },
  { group: _t('Edycja'), id: 'unsoften', name: _t('Przywróć wygładzone krawędzie'), keys: [] },
  { group: _t('Edycja'), id: 'reverseFaces', name: _t('Odwróć ściany'), keys: [] },
  { group: _t('Edycja'), id: 'orientFaces', name: _t('Ujednolić orientację ścian (według zaznaczonej)'), keys: [] },
  { group: _t('Edycja'), id: 'selSameMat', name: _t('Zaznacz ściany z tym samym materiałem'), keys: [] },
  { group: _t('Edycja'), id: 'cleanLines', name: _t('Usuń luźne krawędzie (z wolnym końcem)'), keys: [] },
  { group: _t('Edycja'), id: 'makeFaces', name: _t('Ściany z zaznaczonych linii'), keys: [] },
  { group: _t('Edycja'), id: 'delete', name: _t('Usuń zaznaczone'), keys: ['Delete', 'Backspace'] },
  { group: _t('Edycja'), id: 'selectAll', name: _t('Zaznacz wszystko'), keys: ['Mod+A'] },
  { group: _t('Edycja'), id: 'selectNone', name: _t('Odznacz wszystko'), keys: ['Mod+Shift+A'] },
  { group: _t('Edycja'), id: 'selectInvert', name: _t('Odwróć zaznaczenie'), keys: ['Mod+I'] },
  { group: _t('Edycja'), id: 'copy', name: _t('Kopiuj'), keys: ['Mod+C'] },
  { group: _t('Edycja'), id: 'cutClip', name: _t('Wytnij'), keys: ['Mod+X'] },
  { group: _t('Edycja'), id: 'paste', name: _t('Wklej (wskaż miejsce)'), keys: ['Mod+V'] },
  { group: _t('Edycja'), id: 'pasteInPlace', name: _t('Wklej w tym samym miejscu'), keys: ['Mod+Shift+V'] },
  { group: _t('Edycja'), id: 'flipX', name: _t('Odbij wzdłuż osi czerwonej'), keys: [] },
  { group: _t('Edycja'), id: 'flipY', name: _t('Odbij wzdłuż osi zielonej'), keys: [] },
  { group: _t('Edycja'), id: 'flipZ', name: _t('Odbij wzdłuż osi niebieskiej'), keys: [] },
  { group: _t('Edycja'), id: 'lock', name: _t('Zablokuj zaznaczone'), keys: ['Mod+L'] },
  { group: _t('Edycja'), id: 'unlockAll', name: _t('Odblokuj wszystko'), keys: ['Mod+Shift+L'] },
  { group: _t('Edycja'), id: 'undo', name: _t('Cofnij'), keys: ['Mod+Z'] },
  { group: _t('Edycja'), id: 'redo', name: _t('Ponów'), keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { group: _t('Widok'), id: 'hideRest', name: _t('Ukryj resztę modelu (drugi raz: pokaż); przy edycji grupy — schowaj albo przygaś resztę'), keys: ['F'] },
  { group: _t('Widok'), id: 'hideSimilar', name: _t('Ukryj podobne bryły'), keys: ['G'] },
  { group: _t('Widok'), id: 'hideSel', name: _t('Ukryj zaznaczone'), keys: ['H'] },
  { group: _t('Widok'), id: 'unhideAll', name: _t('Pokaż wszystko'), keys: ['Shift+H'] },
  { group: _t('Widok'), id: 'extents', name: _t('Pokaż cały model'), keys: ['Z'] },
  { group: _t('Widok'), id: 'persp', name: _t('Perspektywa / rzut równoległy'), keys: ['C'] },
  { group: _t('Widok'), id: 'viewIso', name: _t('Widok: izometria'), keys: ['Mod+1'] },
  { group: _t('Widok'), id: 'viewTop', name: _t('Widok: z góry'), keys: ['Mod+2'] },
  { group: _t('Widok'), id: 'viewFront', name: _t('Widok: z przodu'), keys: ['Mod+3'] },
  { group: _t('Widok'), id: 'viewRight', name: _t('Widok: z prawej'), keys: ['Mod+4'] },
  { group: _t('Widok'), id: 'viewBack', name: _t('Widok: z tyłu'), keys: ['Mod+5'] },
  { group: _t('Widok'), id: 'viewLeft', name: _t('Widok: z lewej'), keys: ['Mod+6'] },
  { group: _t('Widok'), id: 'viewBottom', name: _t('Widok: z dołu'), keys: ['Mod+7'] },
  { group: _t('Widok'), id: 'viewPrev', name: _t('Poprzedni widok'), keys: ['BracketLeft'] },
  { group: _t('Widok'), id: 'viewNext', name: _t('Następny widok'), keys: ['BracketRight'] },
  { group: _t('Widok'), id: 'twoPoint', name: _t('Perspektywa dwupunktowa'), keys: ['Shift+C'] },
  { group: _t('Widok'), id: 'views', name: _t('Kamera: widoki, rzut, kąt widzenia'), keys: ['K'] },
  { group: _t('Widok'), id: 'sceneAdd', name: _t('Dodaj scenę'), keys: [] },
  { group: _t('Widok'), id: 'scenePrev', name: _t('Poprzednia scena'), keys: ['PageUp'] },
  { group: _t('Widok'), id: 'sceneNext', name: _t('Następna scena'), keys: ['PageDown'] },
  { group: _t('Edycja'), id: 'library', name: _t('Biblioteka modeli'), keys: ['L'] },
  { group: _t('Widok'), id: 'panel', name: _t('Panel: element, warstwy, struktura'), keys: ['I'] },
  { group: _t('Widok'), id: 'minimal', name: _t('Tryb minimalistyczny: sam widok (drugi raz: cały interfejs)'), keys: ['Tab'] },
  { group: _t('Widok'), id: 'orbit', name: _t('Orbita'), keys: ['O'] },
  { group: _t('Widok'), id: 'pan', name: _t('Przesuń widok'), keys: ['P'] },
  { group: _t('Widok'), id: 'zoom', name: _t('Powiększ (przeciąganiem)'), keys: [] },
  { group: _t('Widok'), id: 'zoomWin', name: _t('Powiększ okno (ramką)'), keys: ['Shift+Z'] },
  { group: _t('Widok'), id: 'look', name: _t('Rozejrzyj się'), keys: [] },
  { group: _t('Widok'), id: 'walk', name: _t('Spacer'), keys: [] },
  { group: _t('Widok'), id: 'camPos', name: _t('Ustaw kamerę'), keys: [] },
  { group: _t('Widok'), id: 'xray', name: _t('Prześwit'), keys: ['J'] },
  { group: _t('Widok'), id: 'backEdges', name: _t('Krawędzie tylne (zasłonięte widać blado)'), keys: ['Alt+J'] },
  { group: _t('Widok'), id: 'guides', name: _t('Prowadnice: pokaż / ukryj'), keys: [] },
  { group: _t('Widok'), id: 'wire', name: _t('Siatka — same krawędzie'), keys: ['Shift+J'] },
  { group: _t('Widok'), id: 'fog', name: _t('Mgła'), keys: [] },
  { group: _t('Widok'), id: 'ao', name: _t('Cień otoczenia (styl Model)'), keys: [] },
  { group: _t('Widok'), id: 'modelEdges', name: _t('Krawędzie (styl Model)'), keys: [] },
  { group: _t('Widok'), id: 'pencil', name: _t('Ołówek (styl Rysunek)'), keys: [] },
  { group: _t('Widok'), id: 'faceSides', name: _t('Strony ścian (tył na niebiesko)'), keys: [] },
  { group: _t('Widok'), id: 'hiddenGeo', name: _t('Ukryta geometria'), keys: [] },
  { group: _t('Widok'), id: 'style1', name: _t('Styl: Rysunek ołówkiem'), keys: ['Shift+1'] },
  { group: _t('Widok'), id: 'style2', name: _t('Styl: Rysunek'), keys: ['Shift+2'] },
  { group: _t('Widok'), id: 'style3', name: _t('Styl: Model'), keys: ['Shift+3'] },
  { group: _t('Widok'), id: 'showAxes', name: _t('Pokaż / ukryj osie'), keys: ['Shift+A'] },
  { group: _t('Widok'), id: 'theme', name: _t('Wygląd: automatyczny / jasny / ciemny'), keys: ['Mod+Shift+D'] },
  { group: _t('Plik'), id: 'new', name: _t('Nowy szkic'), keys: ['Mod+N'] },
  { group: _t('Plik'), id: 'open', name: _t('Otwórz'), keys: ['Mod+O'] },
  { group: _t('Plik'), id: 'save', name: _t('Zapisz'), keys: ['Mod+S'] },
  { group: _t('Plik'), id: 'saveAs', name: _t('Zapisz jako'), keys: ['Mod+Shift+S'] },
  { group: _t('Plik'), id: 'saveCopy', name: _t('Zapisz kopię jako'), keys: [] },
  { group: _t('Plik'), id: 'revert', name: _t('Przywróć zapisaną wersję'), keys: [] },
  { group: _t('Plik'), id: 'updateCheck', name: _t('Sprawdź aktualizacje'), keys: [] },
  { group: _t('Plik'), id: 'png', name: _t('Eksport PNG'), keys: ['Mod+Shift+E'] },
  { group: _t('Plik'), id: 'render', name: _t('Render widoku przez Gemini'), keys: ['Mod+G'] },
  { group: _t('Plik'), id: 'obj', name: _t('Eksport OBJ (3ds Max)'), keys: ['Mod+Shift+O'] },
  { group: _t('Plik'), id: 'dxf', name: _t('Eksport DXF (AutoCAD i inne programy CAD)'), keys: [] },
  { group: _t('Plik'), id: 'dae', name: _t('Eksport DAE (SketchUp, Blender, Lumion, Twinmotion)'), keys: [] },
  { group: _t('Plik'), id: 'stl', name: _t('Eksport STL (druk 3D)'), keys: [] },
  { group: _t('Plik'), id: 'importSkp', name: _t('Importuj model SketchUpa (.skp)'), keys: [] },
  { group: _t('Plik'), id: 'underlay', name: _t('Podkład DXF / DWG'), keys: ['Mod+Shift+I'] },
  { group: _t('Plik'), id: 'imageUnder', name: _t('Podkład z obrazu (JPG, PNG)'), keys: [] },
  { group: _t('Edycja'), id: 'imageMat', name: _t('Materiał z obrazu'), keys: [] },
  { group: _t('Plik'), id: 'underToLines', name: _t('Podkład: zamień na linie do rysowania'), keys: [] },
  { group: _t('Plik'), id: 'keys', name: _t('Lista skrótów'), keys: ['Shift+Slash'] }
];

const STORE = 'modo.keys2';   // nowy klucz: stare zmiany dotyczyły poprzedniego układu
export function loadKeys() {
  let over = {};
  try { over = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  const map = new Map();
  for (const a of ACTIONS) for (const k of (over[a.id] || a.keys)) map.set(k, a.id);
  return { map, over };
}
export function saveKeyOverride(over) { try { localStorage.setItem(STORE, JSON.stringify(over)); } catch (e) {} }
export function keysFor(id, over) { return (over && over[id]) || ACTIONS.find(a => a.id === id)?.keys || []; }

// zdarzenie → „Mod+Shift+S”
export function comboOf(e, isMac) {
  const code = e.code || '';
  if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code)) return null;
  let k = code.replace(/^Key/, '').replace(/^Digit/, '');
  if (/^Numpad\d$/.test(code)) k = code.slice(6);
  const parts = [];
  if (isMac ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (isMac && e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

// do wyświetlenia: „⌘ ⇧ S” albo „Ctrl Shift S”
export function prettyCombo(c, isMac) {
  if (c === 'Shift+Slash') return '?';
  const name = { Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Ctrl: '⌃', Space: _t('Spacja'), Delete: 'Delete', Backspace: isMac ? '⌫' : 'Backspace', Slash: '/', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']' };
  return c.split('+').map(p => name[p] || p).join(isMac ? '' : '+');
}
