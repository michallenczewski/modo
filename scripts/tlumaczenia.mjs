// Sprawdzenie tłumaczeń: node scripts/tlumaczenia.mjs
// 1. polskie napisy w kodzie, które nie są owinięte w _t (zostałyby po polsku w wersji angielskiej),
// 2. napisy w _t bez wpisu w renderer/lang/en.js,
// 3. stałe napisy z renderer/index.html bez wpisu w słowniku,
// 4. wpisy słownika, których kod już nie używa (do usunięcia).
// Kończy się kodem 1, gdy znajdzie coś z punktów 1–3.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lex } from './lib/lex.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'renderer');
const FILES = fs.readdirSync(root).filter(f => f.endsWith('.js') && !['i18n.js', 'web-api.js'].includes(f));
const EN = (await import(path.join(root, 'lang', 'en.js'))).default;
const PL = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/;
// polskie słowa bez polskich liter (np. „beton”, „deski”) — inaczej takie napisy umykają sprawdzeniu
const PL_WORDS = /\b(albo|oraz|jest|nie|dla|przez|kliknij|wpisz|zapisz|beton|drewno|deski|trawa|blacha|grafit|jasny|ciemny|metry|zapisano|zmieniono|grupa|warstwa|szkic|widok|kolor|nazwa|brak|rodzaj|tekst|godzina|miejsce|okno|bryla|linia|sciana)\b/i;
// wiersz z komentarzem „i18n-ok” jest pomijany (napis celowo bez tłumaczenia, np. dwujęzyczny)
// napisy, które nie są tekstem interfejsu (kody klawiszy, nazwy własne, kod shaderów…)
const NOT_UI = k => /gl_Position|gl_FragColor|^(Tr|Ks|Ka|Kd) |^Europe\//.test(k);

const keyOf = t => t.kind === 'str'
  ? Function('"use strict"; return (' + t.text + ')')()
  : t.parts.map((p, i) => Function('"use strict"; return `' + p + '`')() + (i < t.parts.length - 1 ? '{' + i + '}' : '')).join('');

const unwrapped = [], missing = new Map(), used = new Set();
for (const f of FILES) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const t of lex(src)) {
    let k; try { k = keyOf(t); } catch (e) { continue; }
    const before = src.slice(Math.max(0, t.start - 3), t.start), line = src.slice(0, t.start).split('\n').length;
    const wrapped = t.kind === 'str' ? before === '_t(' : before.endsWith('_t');
    if (wrapped) { used.add(k); if (!(k in EN) && !NOT_UI(k)) missing.set(k, f + ':' + line); continue; }
    if (NOT_UI(k) || /i18n-ok/.test(src.split('\n')[line - 1])) continue;
    // polski tekst poza _t; w szablonach liczy się tylko tekst dosłowny (bez wstawek ${…})
    const plain = t.kind === 'tpl' ? t.parts.join(' ') : k;
    if ((PL.test(plain) || (!/^[a-z]+$/.test(plain) && PL_WORDS.test(plain.replace(/<[^>]*>/g, ' ')))) && !/^\s*\/\//.test(plain)) unwrapped.push(f + ':' + line + '  ' + JSON.stringify(k).slice(0, 120));
  }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<svg[\s\S]*?<\/svg>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, '');
const htmlKeys = new Set();
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = m[1].trim(); if (/[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]{2,}/.test(t)) htmlKeys.add(t); }
for (const m of html.matchAll(/\b(?:title|aria-label|placeholder)="([^"]+)"/g)) htmlKeys.add(m[1]);
const htmlMissing = [...htmlKeys].filter(k => PL.test(k) && !(k in EN));
for (const k of htmlKeys) used.add(k);
const unused = Object.keys(EN).filter(k => !used.has(k));

const show = (title, list) => { console.log(`\n${title}: ${list.length}`); for (const x of list.slice(0, 80)) console.log('  ' + x); if (list.length > 80) console.log('  …'); };
show('Polskie napisy bez _t', unwrapped);
show('Napisy w _t bez tłumaczenia w lang/en.js', [...missing].map(([k, w]) => w + '  ' + JSON.stringify(k).slice(0, 120)));
show('Napisy z index.html bez tłumaczenia', htmlMissing.map(k => JSON.stringify(k)));
console.log(`\nWpisy słownika nieużywane w kodzie: ${unused.length}` + (unused.length ? ' (np. ' + unused.slice(0, 5).map(k => JSON.stringify(k)).join(', ') + ')' : ''));
process.exit(unwrapped.length || missing.size || htmlMissing.length ? 1 : 0);
