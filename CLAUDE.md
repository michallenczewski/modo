# Modo — wskazówki dla asystenta

- Rozmawiamy po polsku. Właściciel (Michał) woli pełne zdania niż skróty i oszczędny, nieozdobny wygląd interfejsu — ten sam język wizualny co w Gapie (michallenczewski/gapa).
- Zmiany commituj i wypychaj sam, ale **nie wydawaj nowej wersji po każdej poprawce**. Instalatory budują się tylko po ręcznym uruchomieniu workflow. Zbieraj zmiany i wydawaj wersję tylko wtedy, gdy Michał o to poprosi; wtedy podbij wersję w `package.json` i uruchom workflow (`gh api repos/michallenczewski/modo/actions/workflows/build.yml/dispatches -f ref=main -f 'inputs[os]=oba'`; `win` albo `mac` dla jednego systemu).
- Przed większą zmianą przeczytaj `ARCHITEKTURA.md`.
- Interfejs testuj w wersji przeglądarkowej: `npm run web` (albo `python3 -m http.server` w folderze `renderer/`), potem http://localhost:8765. Most do Electrona zastępuje tam `renderer/web-api.js`.
- Michał pracuje na Windows w biurze i na Macu w domu: opisy skrótów i podpowiedzi muszą się zgadzać dla obu systemów (⌘/⌥ i Ctrl/Alt).
- Domyślne skróty to układ Michała (Q zaznacz, W przesuń, E obróć, R skaluj, A linia, S gumka, D prostokąt, F ukryj resztę, G ukryj podobne, Z pokaż wszystko, X push/pull, C perspektywa/równoległy, M wiaderko) — w `renderer/keys.js`. Nie zmieniaj ich bez jego prośby.
- three.js leży w `renderer/vendor/` (wersja r187, bez npm), żeby program i wersja przeglądarkowa działały bez budowania. Aktualizacja: podmień `three.module.js` i `three.core.js` z `build/` wydania three.js.
- ODA File Converter (DWG → DXF) nie może być dołączany do programu — licencja ODA zabrania rozpowszechniania. Modo tylko wywołuje program zainstalowany na komputerze.
- Plików .skp nie otwieramy (format zamknięty).
- Program sam sprawdza nowe wersje w wydaniach GitHuba (`releases/latest`) i szuka pliku `Modo-<wersja>-win-x64.exe` albo `Modo-<wersja>-mac-<arm64|x64>.dmg`. Nie zmieniaj tych nazw.
