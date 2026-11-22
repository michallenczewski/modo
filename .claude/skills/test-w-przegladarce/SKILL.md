---
name: test-w-przegladarce
description: Jak sprawdzić zmianę w Modo — w wersji przeglądarkowej (http://localhost:8765, polecenia window.modoTest) albo w oknie programu uruchomionym ze źródeł. Używaj po każdej zmianie widocznej w interfejsie, przed zapisem zmian w repozytorium.
---

# Test Modo w przeglądarce i w programie

## Wersja przeglądarkowa

1. Serwer: `node scripts/serve-web.js` w tle (port 8765; Node leży w `~/.local/node/bin`). Serwer wysyła `Cache-Control: no-store`, więc zwykłe przeładowanie strony bierze nowe pliki. (Stary sposób z `python3 -m http.server` trzymał moduły w pamięci przeglądarki — nie używaj go.)
2. Otwórz `http://localhost:8765/` we wbudowanej przeglądarce. Do zrzutów ustaw rozmiar 1280×800 (`resize_window`), a na końcu wróć do `preset: desktop`.
3. Testuj przez `window.modoTest` (plik `renderer/testapi.js`) zamiast klikać po współrzędnych:

| Polecenie | Co robi |
|---|---|
| `modoTest.reset({ dark })` | pusty szkic, czysta historia |
| `await modoTest.load(model \| tekst .modo \| adres)` | wczytuje model i pokazuje całość |
| `modoTest.box([x,y,z], [szer, głęb, wys], { color, alpha })` | prostopadłościan, zlewany jak narysowany ręcznie |
| `modoTest.group('group' \| 'comp', nazwa)` | grupa/komponent z luźnej geometrii; zwraca id |
| `modoTest.select(idGrupy)` | zaznacza grupę (bez argumentu — odznacza) |
| `modoTest.run('polecenie')` | dowolne polecenie z `renderer/keys.js` (np. `undo`, `hideRest`) |
| `modoTest.tool('rect')` | wybiera narzędzie; zwraca podpowiedź z paska |
| `modoTest.camera(p, f)` | ustawia kamerę; bez argumentów — cały model |
| `modoTest.screen([x,y,z])` | gdzie na stronie jest punkt modelu |
| `modoTest.stats()` / `bench()` / `await fps()` | liczby modelu, czasy operacji, klatki przy obracaniu |
| `modoTest.errors()` | błędy z konsoli od wczytania strony — **sprawdź na końcu każdego testu** |

4. Klikanie jest potrzebne tylko tam, gdzie sprawdzasz samą obsługę myszy. Zrzut ekranu ma inną skalę niż strona: przy oknie 1280×800 i zrzucie 800×500 współrzędne strony mnożysz przez 0,625. Przed `hover` musi być świeży zrzut. Kliknięcie tuż po naciśnięciu klawisza bywa gubione — po wyborze narzędzia zrób zrzut, potem klikaj.
5. W konsoli zostaje stary błąd „does not provide an export named 'LineTool'” z dawnej sesji — nie jest nowy.

## Okno programu ze źródeł

- Start w tle: `npx electron . --user-data-dir=/private/tmp/claude-501/modo-dev-profile-N --remote-debugging-port=93NN` (osobny profil, żeby nie ruszać ustawień Michała).
- Polecenia do okna: `node scripts/cdp.mjs <port> '<wyrażenie JS>'` — w oknie działają te same `window.modo` i `window.modoTest`.
- **Zanim zamkniesz okno programu, sprawdź `…/autozapis` w jego profilu i `modo.file.dirty`.** Okno z niezapisanym szkicem Michała zostaw w spokoju.

## Na koniec

- `modoTest.errors()` puste, polski i angielski interfejs bez błędów (`localStorage['modo.lang'] = 'en'` i przeładowanie; potem z powrotem `pl`).
- Jeśli zmieniły się napisy — umiejętność `tlumaczenia`.
- Sprawdzaj opisy skrótów dla obu systemów (⌘/⌥ na Macu, Ctrl/Alt na Windows).
