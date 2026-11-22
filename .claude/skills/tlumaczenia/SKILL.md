---
name: tlumaczenia
description: Dodawanie i sprawdzanie napisów interfejsu Modo w wersji polskiej i angielskiej (renderer/i18n.js, renderer/lang/en.js, scripts/tlumaczenia.mjs). Używaj zawsze, gdy zmiana dodaje albo zmienia tekst widoczny dla użytkownika.
---

# Tłumaczenia

## Zasada

- Napis w kodzie jest po polsku i sam jest kluczem słownika: `_t('Zaznacz bryłę.')` albo szablon `_t\`Liczba boków: ${n}.\``.
- W szablonie klucz to tekst dosłowny ze znacznikami `{0}`, `{1}`… w kolejności wstawek, np. `"Liczba boków: {0}."`.
- Angielska wersja trafia do `renderer/lang/en.js`. Musi zachować znaczniki `{n}`, znaczniki HTML (`<kbd>`, `<b>`), symbole klawiszy i spacje na początku i końcu (fragmenty są sklejane z liczbami).
- Nie składaj zdania z kawałków, gdy da się tego uniknąć — szyk angielski bywa inny. Lepiej jeden szablon z `{0}`.
- Stałe napisy w `renderer/index.html` tłumaczy `translateDom()`. Wystarczy wpis w słowniku.
- Napisy okienek systemowych (zapis, zamykanie) są w `main.js`, w słowniku `EN`.
- Kody klawiszy, nazwy własne (SketchUp, Gemini), kod shaderów i wiersze plików OBJ nie idą do `_t`. Napis celowo bez tłumaczenia (np. dwujęzyczny „Język / Language”) oznacz w tym samym wierszu komentarzem `// i18n-ok`.

## Słowniczek (jak w angielskim SketchUpie 2017)

Zaznacz = Select, Linia = Line, Prostokąt = Rectangle, Okrąg = Circle, Wielokąt = Polygon, Łuk = Arc, Wypchnij/Wciśnij = Push/Pull, Przesuń = Move, Obróć = Rotate, Skaluj = Scale, Odsunięcie = Offset, Taśma = Tape Measure, Kątomierz = Protractor, Wymiar = Dimension, Opis = Text, Gumka = Eraser, Wiaderko = Paint Bucket, Orbita = Orbit, Przesuw = Pan, Rozejrzyj się = Look Around, Spacer = Walk, Przekrój = Section Plane, Grupa = Group, Komponent = Component, wyst. = inst., Rozbij = Explode, Warstwa = Layer, Prowadnica = Guide, Ściana = Face, Krawędź = Edge, Bryła = Solid, Wygładź krawędzie = Soften Edges, Ukryj resztę modelu = Hide Rest of Model, Ukryta geometria = Hidden Geometry, Prześwit = X-ray, Rzut równoległy = Parallel Projection, Szkic/Kreska/Model (style) = Sketch/Line/Model, szkic (dokument) = sketch, Podkład = Underlay, Struktura = Outliner, Element = Entity, Wklej w tym samym miejscu = Paste in Place, Punkt końcowy = Endpoint, Środek = Midpoint, Od punktu = From Point.

Cudzysłów „…” po angielsku to “…”. Styl: spokojne, pełne zdania w trybie rozkazującym („Click…”, „Drag…”).

## Sprawdzenie (obowiązkowe przed zapisem zmian)

```bash
node scripts/tlumaczenia.mjs
```

Pokazuje polskie napisy bez `_t`, napisy bez tłumaczenia, brakujące napisy z `index.html` i nieużywane wpisy słownika; kod wyjścia 1 = jest coś do poprawienia. Potem rzuć okiem na angielski interfejs: `localStorage['modo.lang'] = 'en'`, przeładowanie, a potem z powrotem `pl`.

Przy dużej porcji napisów (dziesiątki i więcej) zleć tłumaczenie pomocnikowi `tlumacz`.
