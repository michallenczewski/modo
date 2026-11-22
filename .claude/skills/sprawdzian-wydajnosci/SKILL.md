---
name: sprawdzian-wydajnosci
description: Pomiar wydajności Modo na dużym modelu (dokładna wieża Turning Torso, ok. 2575 grup i 42 tys. ścian). Używaj po zmianach w wyświetlaniu, zaznaczaniu, przyciąganiu, cofaniu albo w modelu danych, i gdy Michał zgłasza, że program „muli”.
---

# Sprawdzian wydajności

1. Wersja przeglądarkowa (umiejętność `test-w-przegladarce`), okno 1280×800.
2. W konsoli strony:
   ```js
   modoTest.reset();
   const budowa = await modoTest.tower();   // czasy kroków budowy (ms) + liczby modelu
   const czasy = modoTest.bench();          // przebudowa widoku, klatka, zaznaczenie, przyciąganie, zapis do historii
   const klatki = await modoTest.fps(1500);  // płynność obracania
   ```
3. Zmierz też typową edycję: zaznacz segment (`modoTest.select(id)` dla grupy „Segment”), przesuń go (`translateShape` + `app.changed()`), cofnij (`modoTest.run('undo')`).
4. Porównaj z wynikami odniesienia (22.11.2026, MacBook z Apple Silicon, wersja w przeglądarce):

| Pomiar | Wynik |
|---|---|
| polecenia rysowania na klatkę | 14 |
| klatki przy obracaniu | ok. 60 |
| przebudowa widoku (bez zmian w bryłach) | ok. 40–110 ms |
| przesunięcie segmentu (`changed`) | ok. 0,3 s |
| cofnięcie | ok. 0,35 s |
| budowa całej wieży | ok. 4 s |
| pamięć | ok. 250–400 MB |

Znane słabe miejsca: `selectionChanged` przy pustym zaznaczeniu potrafi zająć ok. 0,4 s; krok „trzon” budowy (grupowanie po skopiowaniu) ok. 2 s.

5. Pogorszenie o więcej niż ok. 30% to sygnał do sprawdzenia przed zapisem zmian. Nowe wyniki odniesienia wpisz tutaj, gdy coś świadomie przyspieszysz.

Model buduje `renderer/dev/wieza.js` — tymi samymi poleceniami co program (komponenty, kopie, grupy), więc mierzy też kopiowanie i zlewanie geometrii. Gotowy model można zapisać do pliku i otworzyć w oknie programu (`scripts/cdp.mjs`, `window.api.saveFile`).
