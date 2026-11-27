# Modo — wskazówki dla asystenta

Tu są tylko zasady Modo. Zasady wspólne dla wszystkich programów Michała (współpraca, interfejs, wydania, technika) są w `../rodzina/claude/CLAUDE.md` — na Macu wczytują się same jako `~/.claude/CLAUDE.md`; jeśli ich nie widzisz, przeczytaj ten plik. Procedury krok po kroku są w umiejętnościach (`.claude/skills/`), a stali pomocnicy w `.claude/agents/` — wczytuj je, gdy zadanie ich dotyczy.

## Współpraca z Michałem

- Domyślne skróty Modo to układ Michała (Q zaznacz, W przesuń, E obróć, R skaluj, A linia, S gumka, D prostokąt, F ukryj resztę, G ukryj podobne, Z pokaż wszystko, X push/pull, C perspektywa/równoległy, M wiaderko) — w `renderer/keys.js`. Nie zmieniaj ich bez jego prośby; nowe polecenia dostają wolne klawisze albo żadnego.

## Jak pracujemy

- Przed większą zmianą przeczytaj `ARCHITEKTURA.md`.
- Każdą zmianę w geometrii (wypychanie, ściany, krawędzie, rysowanie) sprawdź umiejętnością `sprawdziany-modelowania` (`node scripts/sprawdziany.mjs` musi przejść), a zgłoszony błąd modelowania najpierw dopisz jako przypadek.
- Każdą zmianę widoczną w interfejsie sprawdź w wersji przeglądarkowej — umiejętność `test-w-przegladarce` (polecenia `window.modoTest`). Zmiany w wyświetlaniu, zaznaczaniu, przyciąganiu i cofaniu sprawdź też umiejętnością `sprawdzian-wydajnosci`.
- Wygląd i zachowanie interfejsu: umiejętność `rodzina-interfejs` (wytyczne i wzorzec przycisków leżą w `../rodzina/`).
- Nowy albo zmieniony napis interfejsu: umiejętność `tlumaczenia`; przed zapisem `node scripts/tlumaczenia.mjs` musi przejść.
- Zmianę zrobioną skryptem albo dużą zmianę daj przed zapisem pomocnikowi `recenzent`.
- Node leży w `~/.local/node/bin`, `gh` w `~/.local/bin` (dopisz do `PATH` w każdym poleceniu). Gdy `git push` wisi, uruchom go z limitem czasu (`perl -e 'alarm 50; exec @ARGV' git push origin main`).

## Zasady kodu

- Model jest jak w SketchUpie: wszystko narysowane luzem w jednym kontekście to jedna wspólna geometria (bryła z flagą `geo`, `renderer/geo.js`); obiektem jest tylko grupa albo komponent. Nowe narzędzie nie tworzy trwałych osobnych brył — tworzy bryłę albo płaską ścianę, a `absorb` w `postEdit` zlewa ją z resztą. Zaznaczone ściany leżą w `app.sub`; polecenie działające na obiektach najpierw woła `app.liftSub()`.
- Nowe miejsce, które pomija ukryte elementy, musi korzystać z `isHidden(model, e)` (warstwy, ukrywanie, chowanie reszty modelu), a nie z samego pola `hidden`.
- Napisy: `_t` z `renderer/i18n.js`, angielska wersja w `renderer/lang/en.js`.
- Instalatory: `Modo-<wersja>-win-x64.exe` i `Modo-<wersja>-mac-<arm64|x64>.dmg` (tych nazw szuka sprawdzanie aktualizacji).

## Biblioteki i licencje

- Modo jest na licencji GPL-3.0-or-later, bo dołącza LibreDWG (GPL-3). Michał nie planuje sprzedaży programu; nie dodawaj zależności, których licencja kłóci się z GPL-3.
- Biblioteki w `renderer/vendor/` są dołączone jako gotowe pliki (bez npm), żeby program i wersja przeglądarkowa działały bez budowania: three.js (r187), Manifold (bryły), OpenSKP + fflate + earcut (import .skp), LibreDWG. Skąd i jak je odświeżyć — `ARCHITEKTURA.md`, rozdział „Biblioteki zewnętrzne”.
- DWG czyta wbudowany LibreDWG (`renderer/dwg.js`); ODA File Converter jest tylko zapasem i nie może być dołączany do programu (licencja ODA zabrania rozpowszechniania) — Modo najwyżej wywołuje program zainstalowany na komputerze.
- Pliki .skp importujemy przez OpenSKP (`renderer/skp.js`), czytnik odtworzony z formatu — nie dodawaj oficjalnego SDK Trimble.
- `package-lock.json` jest w repozytorium i pilnuje wersji Electrona i electron-buildera przy budowaniu instalatorów — zmieniaj go tylko razem z `package.json`.
