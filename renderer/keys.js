// Skróty klawiszowe. Domyślne to układ Michała (Q W E R jak w 3ds Maxie, A S D, Z X C); każdy można zmienić w oknie skrótów (klawisz ?).
// Zapis: kod klawisza (KeyboardEvent.code bez „Key”/„Digit”) z modyfikatorami, np. „L”, „Shift+Z”, „Mod+S”.
// „Mod” to ⌘ na Macu i Ctrl na Windows.

export const ACTIONS = [
  { group: 'Rysowanie', id: 'line', name: 'Linia', keys: ['A'] },
  { group: 'Rysowanie', id: 'rect', name: 'Prostokąt', keys: ['D'] },
  { group: 'Rysowanie', id: 'rrect', name: 'Prostokąt obrócony', keys: ['Shift+D'] },
  { group: 'Rysowanie', id: 'circle', name: 'Okrąg', keys: ['V'] },
  { group: 'Rysowanie', id: 'polygon', name: 'Wielokąt foremny', keys: ['Shift+V'] },
  { group: 'Rysowanie', id: 'arc', name: 'Łuk przez dwa punkty', keys: ['B'] },
  { group: 'Rysowanie', id: 'carc', name: 'Łuk ze środka', keys: ['Shift+B'] },
  { group: 'Rysowanie', id: 'pie', name: 'Wycinek koła', keys: ['Alt+B'] },
  { group: 'Rysowanie', id: 'offset', name: 'Odsunięcie', keys: ['T'] },
  { group: 'Rysowanie', id: 'tape', name: 'Taśma i prowadnice', keys: ['Y'] },
  { group: 'Rysowanie', id: 'protractor', name: 'Kątomierz (prowadnica pod kątem)', keys: ['Shift+Y'] },
  { group: 'Rysowanie', id: 'dim', name: 'Wymiar', keys: ['U'] },
  { group: 'Rysowanie', id: 'text', name: 'Opis z odnośnikiem', keys: ['Shift+T'] },
  { group: 'Rysowanie', id: 'section', name: 'Płaszczyzna przekroju', keys: ['N'] },
  { group: 'Widok', id: 'sectionToggle', name: 'Przekrój: włącz / wyłącz', keys: ['Shift+N'] },
  { group: 'Widok', id: 'sectionPlanes', name: 'Przekrój: pokaż / ukryj płaszczyzny', keys: ['Alt+N'] },
  { group: 'Rysowanie', id: 'clearGuides', name: 'Usuń wszystkie prowadnice', keys: [] },
  { group: 'Edycja', id: 'select', name: 'Zaznacz', keys: ['Q'] },
  { group: 'Edycja', id: 'group', name: 'Utwórz grupę', keys: ['Space'] },
  { group: 'Edycja', id: 'comp', name: 'Utwórz komponent', keys: ['Mod+Space', 'Ctrl+Space'] },
  { group: 'Edycja', id: 'unique', name: 'Komponent: zrób unikalny', keys: ['Shift+U'] },
  { group: 'Edycja', id: 'explode', name: 'Rozbij grupę / komponent', keys: ['Shift+Space'] },
  { group: 'Edycja', id: 'editGroup', name: 'Edytuj grupę (albo dwuklik) lub bryłę / zakończ', keys: ['Enter'] },
  { group: 'Edycja', id: 'move', name: 'Przesuń', keys: ['W'] },
  { group: 'Edycja', id: 'rotate', name: 'Obróć', keys: ['E'] },
  { group: 'Edycja', id: 'scale', name: 'Skaluj', keys: ['R'] },
  { group: 'Edycja', id: 'push', name: 'Wypchnij / wciśnij', keys: ['X'] },
  { group: 'Edycja', id: 'cut', name: 'Bryła wycinająca / zwykła', keys: ['Shift+X'] },
  { group: 'Bryły', id: 'solidUnion', name: 'Połącz zaznaczone bryły', keys: [] },
  { group: 'Bryły', id: 'solidIntersect', name: 'Część wspólna', keys: [] },
  { group: 'Bryły', id: 'solidSubtract', name: 'Odejmij od pierwszej (reszta znika)', keys: [] },
  { group: 'Bryły', id: 'solidTrim', name: 'Przytnij pierwszą (reszta zostaje)', keys: [] },
  { group: 'Edycja', id: 'eraser', name: 'Gumka', keys: ['S'] },
  { group: 'Edycja', id: 'paint', name: 'Wiaderko (kolor bryły)', keys: ['M'] },
  { group: 'Edycja', id: 'delete', name: 'Usuń zaznaczone', keys: ['Delete', 'Backspace'] },
  { group: 'Edycja', id: 'selectAll', name: 'Zaznacz wszystko', keys: ['Mod+A'] },
  { group: 'Edycja', id: 'selectNone', name: 'Odznacz wszystko', keys: ['Mod+Shift+A'] },
  { group: 'Edycja', id: 'selectInvert', name: 'Odwróć zaznaczenie', keys: ['Mod+I'] },
  { group: 'Edycja', id: 'copy', name: 'Kopiuj', keys: ['Mod+C'] },
  { group: 'Edycja', id: 'cutClip', name: 'Wytnij', keys: ['Mod+X'] },
  { group: 'Edycja', id: 'paste', name: 'Wklej (wskaż miejsce)', keys: ['Mod+V'] },
  { group: 'Edycja', id: 'pasteInPlace', name: 'Wklej w tym samym miejscu', keys: ['Mod+Shift+V'] },
  { group: 'Edycja', id: 'flipX', name: 'Odbij wzdłuż osi czerwonej', keys: [] },
  { group: 'Edycja', id: 'flipY', name: 'Odbij wzdłuż osi zielonej', keys: [] },
  { group: 'Edycja', id: 'flipZ', name: 'Odbij wzdłuż osi niebieskiej', keys: [] },
  { group: 'Edycja', id: 'lock', name: 'Zablokuj zaznaczone', keys: ['Mod+L'] },
  { group: 'Edycja', id: 'unlockAll', name: 'Odblokuj wszystko', keys: ['Mod+Shift+L'] },
  { group: 'Edycja', id: 'undo', name: 'Cofnij', keys: ['Mod+Z'] },
  { group: 'Edycja', id: 'redo', name: 'Ponów', keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { group: 'Widok', id: 'hideRest', name: 'Ukryj resztę modelu (drugi raz: pokaż)', keys: ['F'] },
  { group: 'Widok', id: 'hideSimilar', name: 'Ukryj podobne bryły', keys: ['G'] },
  { group: 'Widok', id: 'hideSel', name: 'Ukryj zaznaczone', keys: ['H'] },
  { group: 'Widok', id: 'unhideAll', name: 'Pokaż wszystko', keys: ['Shift+H'] },
  { group: 'Widok', id: 'extents', name: 'Pokaż cały model', keys: ['Z'] },
  { group: 'Widok', id: 'persp', name: 'Perspektywa / rzut równoległy', keys: ['C'] },
  { group: 'Widok', id: 'viewIso', name: 'Widok: izometria', keys: ['Mod+1'] },
  { group: 'Widok', id: 'viewTop', name: 'Widok: z góry', keys: ['Mod+2'] },
  { group: 'Widok', id: 'viewFront', name: 'Widok: z przodu', keys: ['Mod+3'] },
  { group: 'Widok', id: 'viewRight', name: 'Widok: z prawej', keys: ['Mod+4'] },
  { group: 'Widok', id: 'viewBack', name: 'Widok: z tyłu', keys: ['Mod+5'] },
  { group: 'Widok', id: 'viewLeft', name: 'Widok: z lewej', keys: ['Mod+6'] },
  { group: 'Widok', id: 'viewBottom', name: 'Widok: z dołu', keys: ['Mod+7'] },
  { group: 'Widok', id: 'viewPrev', name: 'Poprzedni widok', keys: ['BracketLeft'] },
  { group: 'Widok', id: 'viewNext', name: 'Następny widok', keys: ['BracketRight'] },
  { group: 'Widok', id: 'twoPoint', name: 'Perspektywa dwupunktowa', keys: ['Shift+C'] },
  { group: 'Widok', id: 'views', name: 'Widok, kamera i sceny', keys: ['K'] },
  { group: 'Widok', id: 'sceneAdd', name: 'Dodaj scenę', keys: [] },
  { group: 'Widok', id: 'scenePrev', name: 'Poprzednia scena', keys: ['PageUp'] },
  { group: 'Widok', id: 'sceneNext', name: 'Następna scena', keys: ['PageDown'] },
  { group: 'Edycja', id: 'library', name: 'Biblioteka modeli', keys: ['L'] },
  { group: 'Widok', id: 'panel', name: 'Panel: element, warstwy, struktura', keys: ['I'] },
  { group: 'Widok', id: 'orbit', name: 'Orbita', keys: ['O'] },
  { group: 'Widok', id: 'pan', name: 'Przesuń widok', keys: ['P'] },
  { group: 'Widok', id: 'zoom', name: 'Powiększ (przeciąganiem)', keys: [] },
  { group: 'Widok', id: 'zoomWin', name: 'Powiększ okno (ramką)', keys: ['Shift+Z'] },
  { group: 'Widok', id: 'xray', name: 'Prześwit', keys: ['J'] },
  { group: 'Widok', id: 'style1', name: 'Styl: Szkic', keys: ['Shift+1'] },
  { group: 'Widok', id: 'style2', name: 'Styl: Kreska', keys: ['Shift+2'] },
  { group: 'Widok', id: 'style3', name: 'Styl: Model', keys: ['Shift+3'] },
  { group: 'Widok', id: 'axes', name: 'Pokaż / ukryj osie', keys: ['Shift+A'] },
  { group: 'Widok', id: 'theme', name: 'Wygląd: automatyczny / jasny / ciemny', keys: ['Mod+Shift+D'] },
  { group: 'Plik', id: 'new', name: 'Nowy szkic', keys: ['Mod+N'] },
  { group: 'Plik', id: 'open', name: 'Otwórz', keys: ['Mod+O'] },
  { group: 'Plik', id: 'save', name: 'Zapisz', keys: ['Mod+S'] },
  { group: 'Plik', id: 'saveAs', name: 'Zapisz jako', keys: ['Mod+Shift+S'] },
  { group: 'Plik', id: 'saveCopy', name: 'Zapisz kopię jako', keys: [] },
  { group: 'Plik', id: 'revert', name: 'Przywróć zapisaną wersję', keys: [] },
  { group: 'Plik', id: 'updateCheck', name: 'Sprawdź aktualizacje', keys: [] },
  { group: 'Plik', id: 'png', name: 'Eksport PNG', keys: ['Mod+Shift+E'] },
  { group: 'Plik', id: 'render', name: 'Render widoku przez Gemini', keys: ['Mod+G'] },
  { group: 'Plik', id: 'obj', name: 'Eksport OBJ (3ds Max)', keys: ['Mod+Shift+O'] },
  { group: 'Plik', id: 'importSkp', name: 'Importuj model SketchUpa (.skp)', keys: [] },
  { group: 'Plik', id: 'underlay', name: 'Podkład DXF / DWG', keys: ['Mod+Shift+I'] },
  { group: 'Plik', id: 'keys', name: 'Lista skrótów', keys: ['Shift+Slash'] }
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
  const name = { Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Ctrl: '⌃', Space: 'Spacja', Delete: 'Delete', Backspace: isMac ? '⌫' : 'Backspace', Slash: '/', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', BracketLeft: '[', BracketRight: ']' };
  return c.split('+').map(p => name[p] || p).join(isMac ? '' : '+');
}
