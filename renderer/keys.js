// Skróty klawiszowe. Domyślnie takie jak w SketchUpie; każdy można zmienić w oknie skrótów (klawisz ?).
// Zapis: kod klawisza (KeyboardEvent.code bez „Key”/„Digit”) z modyfikatorami, np. „L”, „Shift+Z”, „Mod+S”.
// „Mod” to ⌘ na Macu i Ctrl na Windows.

export const ACTIONS = [
  { group: 'Rysowanie', id: 'line', name: 'Linia', keys: ['L'] },
  { group: 'Rysowanie', id: 'rect', name: 'Prostokąt', keys: ['R'] },
  { group: 'Rysowanie', id: 'circle', name: 'Okrąg', keys: ['C'] },
  { group: 'Rysowanie', id: 'arc', name: 'Łuk', keys: ['A'] },
  { group: 'Edycja', id: 'select', name: 'Zaznacz', keys: ['Space'] },
  { group: 'Edycja', id: 'push', name: 'Wypchnij / wciśnij', keys: ['P'] },
  { group: 'Edycja', id: 'paint', name: 'Wiaderko (kolor bryły)', keys: ['B'] },
  { group: 'Edycja', id: 'move', name: 'Przesuń', keys: ['M'] },
  { group: 'Edycja', id: 'rotate', name: 'Obróć', keys: ['Q'] },
  { group: 'Edycja', id: 'offset', name: 'Odsunięcie', keys: ['F'] },
  { group: 'Edycja', id: 'tape', name: 'Taśma', keys: ['T'] },
  { group: 'Edycja', id: 'eraser', name: 'Gumka', keys: ['E'] },
  { group: 'Edycja', id: 'clearGuides', name: 'Usuń wszystkie prowadnice', keys: [] },
  { group: 'Edycja', id: 'delete', name: 'Usuń zaznaczone', keys: ['Delete', 'Backspace'] },
  { group: 'Edycja', id: 'selectAll', name: 'Zaznacz wszystko', keys: ['Mod+A'] },
  { group: 'Edycja', id: 'undo', name: 'Cofnij', keys: ['Mod+Z'] },
  { group: 'Edycja', id: 'redo', name: 'Ponów', keys: ['Mod+Shift+Z', 'Mod+Y'] },
  { group: 'Widok', id: 'orbit', name: 'Orbita', keys: ['O'] },
  { group: 'Widok', id: 'pan', name: 'Przesuń widok', keys: ['H'] },
  { group: 'Widok', id: 'zoom', name: 'Powiększ', keys: ['Z'] },
  { group: 'Widok', id: 'extents', name: 'Pokaż wszystko', keys: ['Shift+Z'] },
  { group: 'Widok', id: 'style1', name: 'Styl: Szkic', keys: ['Shift+1'] },
  { group: 'Widok', id: 'style2', name: 'Styl: Kreska', keys: ['Shift+2'] },
  { group: 'Widok', id: 'style3', name: 'Styl: Model', keys: ['Shift+3'] },
  { group: 'Widok', id: 'axes', name: 'Pokaż / ukryj osie', keys: ['Shift+A'] },
  { group: 'Widok', id: 'theme', name: 'Wygląd: automatyczny / jasny / ciemny', keys: ['Mod+Shift+D'] },
  { group: 'Plik', id: 'new', name: 'Nowy szkic', keys: ['Mod+N'] },
  { group: 'Plik', id: 'open', name: 'Otwórz', keys: ['Mod+O'] },
  { group: 'Plik', id: 'save', name: 'Zapisz', keys: ['Mod+S'] },
  { group: 'Plik', id: 'saveAs', name: 'Zapisz jako', keys: ['Mod+Shift+S'] },
  { group: 'Plik', id: 'png', name: 'Eksport PNG', keys: ['Mod+Shift+E'] },
  { group: 'Plik', id: 'underlay', name: 'Podkład DXF / DWG', keys: ['Mod+Shift+I'] },
  { group: 'Plik', id: 'keys', name: 'Lista skrótów', keys: ['Shift+Slash'] }
];

const STORE = 'modo.keys';
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
  const name = { Mod: isMac ? '⌘' : 'Ctrl', Shift: isMac ? '⇧' : 'Shift', Alt: isMac ? '⌥' : 'Alt', Ctrl: '⌃', Space: 'Spacja', Delete: 'Delete', Backspace: isMac ? '⌫' : 'Backspace', Slash: '/', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
  return c.split('+').map(p => name[p] || p).join(isMac ? '' : '+');
}
