# Architektura Modo

Modo to lekki szkicownik brył architektonicznych: rysuje się jak w SketchUpie, a obraz wygląda jak szkic koncepcyjny na papierze. Program to Electron z jednym oknem; cała logika siedzi w `renderer/` jako zwykłe moduły JavaScript (bez budowania), a proces główny (`main.js`) zajmuje się tylko plikami, oknem i aktualizacjami.

## Pliki

| Plik | Co robi |
| --- | --- |
| `main.js` | Okno (pasek tytułu schowany jak w Gapie), protokół `modo://app/` do ładowania modułów, zapis i odczyt `.modo`, zapis PNG, wybór podkładu, zamiana DWG → DXF przez ODA File Converter, aktualizacje z GitHuba. |
| `preload.js` | `window.api` — most do procesu głównego. |
| `renderer/web-api.js` | To samo `window.api` w wersji przeglądarkowej (pobieranie plików zamiast zapisu na dysk). |
| `renderer/app.js` | Interfejs: pasek narzędzi, okienka (słońce, PNG, podkład, kolor, skróty), klawiatura, pole wymiarów, cofanie, plik. |
| `renderer/viewer.js` | Scena three.js: kamera z osią Z w górę, nawigacja, słońce i cienie, szkicowe krawędzie (shader), eksport PNG, podkład. |
| `renderer/model.js` | Dane modelu i geometria: bryły, ściany, krawędzie, push/pull, ściana z zamkniętego obrysu. |
| `renderer/snap.js` | Przyklejanie kursora (inferencje): końce, środki, krawędzie, ściany, osie, „od punktu”, blokada osi. |
| `renderer/tools.js` | Narzędzia: zaznacz, linia, prostokąt, wypchnij/wciśnij, wiaderko, orbita/przesuw/zoom lewym przyciskiem. |
| `renderer/keys.js` | Lista poleceń ze skrótami (domyślnie SketchUp), zapis własnych skrótów w `localStorage`. |
| `renderer/dxf.js` | Czytnik DXF do podkładu (linie, polilinie z łukami, okręgi, łuki, elipsy, splajny, bloki). |
| `renderer/sun.js` | Położenie słońca (algorytm NOAA) dla daty, godziny i miejsca, z czasem letnim. |
| `renderer/units.js` | Wymiary wpisywane z klawiatury: metry domyślnie, przecinek albo kropka, `cm`/`mm`, dwa wymiary `6;4`. |

## Model

Szkic to lista **brył** i luźnych **linii**. Bryła to wielokąt w płaszczyźnie (`o`, `u`, `v`) wyciągnięty o `h` wzdłuż `n = u × v`. Płaska ściana (świeży prostokąt albo zamknięty obrys z linii) to bryła o `h = 0`. Bryły są osobne jak grupy w SketchUpie — świadomie nie ma „lepkiej” geometrii, w której ściany się łączą i dzielą. Dzięki temu model jest prosty, a push/pull przewidywalny:

- górna albo dolna ściana zmienia `h` (dolna przesuwa też `o`),
- boczna ściana przesuwa jedną krawędź wielokąta, a sąsiednie krawędzie się wydłużają,
- z `Ctrl` (Windows) albo `⌥` (Mac) push/pull robi nową bryłę na wierzchu ściany.

Cofanie to kopie całego modelu (model jest mały). Plik `.modo` to JSON: model, kamera, styl, słońce, podkład (już przeliczony na metry, więc działa na obu komputerach bez oryginalnego DXF).

## Rysunek

Ściany to zwykłe `MeshLambertMaterial` z cieniami (`VSMShadowMap`, promień rozmycia = „Miękkość”). Ziemia to `ShadowMaterial` — widać na niej tylko cień, reszta to kolor papieru.

Krawędzie rysuje własny shader (`EDGE_VS` w `viewer.js`): każda krawędź jest dzielona na kilka czworokątów rozciągniętych w przestrzeni ekranu. W shaderze:
- grubość zależy od tego, czy krawędź jest konturem sylwetki (jedna przyległa ściana zwrócona do kamery, druga nie) — kontur jest grubszy,
- końce wychodzą kilka pikseli za narożnik (przedłużenia),
- linia lekko faluje (ziarno losowe z położenia krawędzi, więc wygląd jest stały między klatkami),
- kolor jaśnieje w głębi,
- krawędzie przecinające płaszczyznę bliską kamery są przycinane w shaderze.

Style (`STYLES` w `viewer.js`) to zestawy tych parametrów: Szkic, Kreska, Model. Eksport PNG renderuje do bufora o zadanej rozdzielczości i skaluje grubość linii razem z rozdzielczością.

## Sygnały, że trzeba wrócić do tematu

- **Wydajność przy dużych modelach** — dziś każda zmiana przebudowuje całą geometrię. Przy setkach brył trzeba przebudowywać tylko zmienione.
- **Geometria łączona** (dzielenie ścian liniami, wspólne krawędzie brył) — to zmiana modelu, nie dodatek. Zastanowić się przed.
- **Bardzo duże podkłady** — przyklejanie korzysta z siatki odcinków (`Snapper.setUnderlay`), rysowanie z jednego `LineSegments` na warstwę. Powyżej ~600 tys. odcinków czytnik przerywa.
