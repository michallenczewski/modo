---
name: wydanie
description: Wydanie nowej wersji Modo (instalatory Windows i Mac przez GitHub Actions). Używaj WYŁĄCZNIE wtedy, gdy Michał wprost prosi o nową wersję — nigdy po zwykłej poprawce.
---

# Wydanie wersji

Instalatory budują się tylko po ręcznym uruchomieniu workflow `.github/workflows/build.yml` („Buduj instalatory”). Program sam szuka aktualizacji w `releases/latest` po nazwach `Modo-<wersja>-win-x64.exe` i `Modo-<wersja>-mac-<arm64|x64>.dmg` — tych nazw nie zmieniaj (`artifactName` w `package.json`).

1. Upewnij się, że wszystko jest zapisane i wypchnięte (`git status` czysty poza plikami tymczasowymi), testy przeszły (umiejętności `test-w-przegladarce`, `tlumaczenia`).
2. Podbij wersję w `package.json` (zwykle trzecia liczba; nowe narzędzia albo większe zmiany — druga). Zapisz zmianę: „Wersja X.Y.Z”, wypchnij.
3. Uruchom budowanie:
   ```bash
   gh api repos/michallenczewski/modo/actions/workflows/build.yml/dispatches -f ref=main -f 'inputs[os]=oba'
   ```
   `win` albo `mac` zamiast `oba` — tylko jeden system.
   `gh` leży w `~/.local/bin` (dopisz do `PATH`). Jeśli `gh auth status` mówi, że nie jest zalogowany, poproś Michała, żeby sam uruchomił `gh auth login` — nigdy nie wpisuj za niego hasła ani klucza.
4. Śledź przebieg: `gh run list --workflow build.yml --limit 1`, potem `gh run watch <id>`. Budowanie trwa kilkanaście minut.
5. Po zakończeniu sprawdź wydanie: `gh release view v<wersja>` — muszą być oba instalatory o właściwych nazwach.
6. Napisz Michałowi krótko, co weszło do wersji (zwykłymi słowami, bez nazw plików), i że program na obu komputerach sam zaproponuje aktualizację.
