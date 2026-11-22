---
name: sprawdziany-modelowania
description: Automatyczne sprawdziany rdzenia geometrii Modo (scripts/sprawdziany.mjs) — przypadki z SketchUpa 2017: pudło, komin, wnęka, otwór na wylot, okna i drzwi, bryły obok siebie, ⌥. Uruchamiaj przed zapisem KAŻDEJ zmiany w geo.js, mesh.js, stitch.js, model.js (wypychanie, ściany, krawędzie) i w narzędziach rysowania; dopisuj nowy przypadek przy każdym zgłoszonym błędzie modelowania.
---

# Sprawdziany modelowania

```bash
~/.local/node/bin/node scripts/sprawdziany.mjs          # wszystkie, kod wyjścia 1 przy błędzie
~/.local/node/bin/node scripts/sprawdziany.mjs drzwi    # tylko przypadki z „drzwi” w nazwie
~/.local/node/bin/node scripts/sprawdziany.mjs -v       # ze szczegółami udanych
```

Działa bez przeglądarki, w kilka sekund. Kroki naśladują program: po każdej zmianie to samo co `postEdit` w `app.js` (`stitch` + `absorb`).

## Zasady

- Oczekiwany wynik to zawsze to, co zrobiłby SketchUp 2017 — nie to, co Modo robi dziś. Przypadek, który nie przechodzi, zostaje w zestawie, dopóki program nie zostanie poprawiony.
- Każdy błąd modelowania zgłoszony przez Michała najpierw staje się przypadkiem (odtworzenie), potem poprawką.
- Pomiary: `faces` (ściany = obszary), `volume` (zawyżona przez ściany wewnętrzne — przegroda, stary dach po ⌥; tam sprawdzaj obecność ścian), `open` (krawędzie nierówno użyte w obie strony; 0 = bryła domknięta), `has(p, n)` (czy jest ściana w punkcie p, zwrócona w stronę n).
- Prostokąt na ziemi ma normalną w dół — do wyciągania w górę służy pomocnik `wyciagnij`.
- Zmiana przechodzi tylko wtedy, gdy przechodzą wszystkie przypadki; potem jeszcze test w przeglądarce (umiejętność `test-w-przegladarce`), bo sprawdziany nie obejmują narzędzi (kliknięć, przyciągania, wyboru ściany pod kursorem).
