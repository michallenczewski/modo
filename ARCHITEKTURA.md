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
| `renderer/tools.js` | Narzędzia: zaznacz, linia, prostokąt, okrąg, łuk, wypchnij/wciśnij, przesuń, obróć, odsunięcie, taśma, gumka, wiaderko, orbita/przesuw/zoom lewym przyciskiem. Każde narzędzie pamięta swoją ostatnią operację (`last` z numerem `app.opSeq`), żeby wymiar wpisany po zakończeniu ją poprawił. |
| `renderer/keys.js` | Lista poleceń ze skrótami (domyślnie SketchUp), zapis własnych skrótów w `localStorage`. |
| `renderer/csg.js` | Odejmowanie brył (drzewa BSP na wzór csg.js) i wyciąganie krawędzi z wyniku: dzielenie na złączach T, pomijanie szwów w jednej płaszczyźnie, łączenie kawałków w całe krawędzie. |
| `renderer/dxf.js` | Czytnik DXF do podkładu (linie, polilinie z łukami, okręgi, łuki, elipsy, splajny, bloki). |
| `renderer/sun.js` | Położenie słońca (algorytm NOAA) dla daty, godziny i miejsca, z czasem letnim. |
| `renderer/units.js` | Wymiary wpisywane z klawiatury: metry domyślnie, przecinek albo kropka, `cm`/`mm`, dwa wymiary `6;4`. |

## Model

Szkic to lista **brył**, luźnych **linii** i **prowadnic** (nieskończone linie z taśmy: punkt `o` i kierunek `d`). Bryła to wielokąt w płaszczyźnie (`o`, `u`, `v`) wyciągnięty o `h` wzdłuż `n = u × v`. Płaska ściana (świeży prostokąt albo zamknięty obrys z linii) to bryła o `h = 0`. Bryły są osobne jak grupy w SketchUpie — świadomie nie ma „lepkiej” geometrii, w której ściany się łączą i dzielą. Dzięki temu model jest prosty, a push/pull przewidywalny:

- górna albo dolna ściana zmienia `h` (dolna przesuwa też `o`),
- boczna ściana przesuwa jedną krawędź wielokąta, a sąsiednie krawędzie się wydłużają,
- z `Ctrl` (Windows) albo `⌥` (Mac) push/pull robi nową bryłę na wierzchu ściany.

Luźne linie (z narzędzia linii i łuku) zamieniają się w płaską ściankę, gdy domkną obrys w jednej płaszczyźnie (`closeLoop` szuka najkrótszego cyklu przez nową linię). Okrąg to wielokąt o 24 bokach z flagą `soft`: krawędzie między jego bokami rysują się tylko jako kontur sylwetki. Przesuwanie i obracanie zmienia `o`, `u`, `v`, `n` bryły (bryła się nie deformuje); kopia dostaje nowe `id`.

**Wycięcia.** Bryła z `op: 'cut'` nie ma własnych ścian: przy budowaniu sceny (`Viewer.rebuild`) odejmuje się od każdej bryły, której prostopadłościan otaczający dotyka. Wynik CSG zachowuje w każdym wielokącie źródło (`shared`: bryła i ściana), więc ściany otworu należą do wycięcia — kliknięcie w nie wybiera wycięcie, a push/pull wydłuża je. Płaska ścianka leżąca na ścianie bryły (`hostFace`) wciśnięta w nią sama staje się wycięciem. Wycięcia rysuje się jako przerywany obrys (`ghostGroup`), którego nie ma w eksporcie.

**Grupy i komponenty.** `model.groups` to rekordy `{ id, kind: 'group' | 'comp', p, def, frame }`; `p` to grupa nadrzędna, więc grupy się zagnieżdżają. Bryły i linie należą do najbliższej grupy przez pole `g`; członkowie grupy (`membersOf`) to elementy całego jej poddrzewa. Klik zaznacza grupę leżącą bezpośrednio w edytowanej (`topUnder`), dwuklik w nią schodzi, `Esc` wychodzi o poziom. Geometria każdego wystąpienia komponentu leży w świecie jak każda inna bryła (narzędzia działają bez zmian), a `frame` (o, x, y, z) mówi, jak wystąpienie jest ustawione względem definicji. Przesuwanie, obracanie i skalowanie całej grupy przekształca też jej ramę. Po każdej zmianie w czasie edycji grupy (`postEdit` w `app.js`) nowe elementy dołączają do edytowanej grupy, a każdy komponent w łańcuchu nad edytowaną grupą (od środka na zewnątrz) odtwarza pozostałe wystąpienia z edytowanego razem z całym wnętrzem (`syncComponent`: geometria i ramy podgrup → układ definicji → rama każdego wystąpienia; podgrupy dostają nowe id, wewnętrzne komponenty zachowują definicje). „Zrób unikalny” nadaje wystąpieniu nową definicję.

**Krycie** bryły to pole `alpha` (brak = 1). Przezroczyste bryły mają materiał z `transparent`, nie zapisują głębi i nie rzucają cienia poniżej krycia 0,6.

**Ukrywanie** to flaga `hidden` w bryle albo linii; ukryte nie są rysowane, nie przyklejają i nie liczą się do „pokaż cały model”. „Podobne” bryły (`similar`) mają ten sam obrys z dokładnością do przesunięcia i obrotu, tę samą wysokość, rodzaj i kolor — czyli przede wszystkim kopie.

**Rzut równoległy**: kamera ortograficzna (`ocam`) jest ustawiana przy każdej klatce z kamery perspektywicznej (`vc()`), 3 km za nią, z wysokością kadru `orthoH`. Nawigacja zawsze porusza kamerą perspektywiczną, a w rzucie równoległym przybliżanie zmienia `orthoH`.

Cofanie to kopie całego modelu (model jest mały). Plik `.modo` to JSON: model, kamera, styl, słońce, podkład (już przeliczony na metry, więc działa na obu komputerach bez oryginalnego DXF).

## Rysunek

Ściany to zwykłe `MeshLambertMaterial` z cieniami (`VSMShadowMap`, promień rozmycia = „Miękkość”). Ziemia to `ShadowMaterial` — widać na niej tylko cień, reszta to kolor papieru.

Krawędzie rysuje własny shader (`EDGE_VS` w `viewer.js`): każda krawędź jest dzielona na kilka czworokątów rozciągniętych w przestrzeni ekranu. W shaderze:
- grubość zależy od tego, czy krawędź jest konturem sylwetki (jedna przyległa ściana zwrócona do kamery, druga nie) — kontur jest grubszy,
- końce wychodzą kilka pikseli za narożnik (przedłużenia),
- linia lekko faluje (ziarno losowe z położenia krawędzi, więc wygląd jest stały między klatkami),
- kolor jaśnieje w głębi,
- krawędzie przecinające płaszczyznę bliską kamery są przycinane w shaderze.

Style (`STYLES` w `viewer.js`) to zestawy tych parametrów: Szkic, Kreska, Model. Tryb ciemny podmienia w nich papier, kreskę, kolor ścian i cień (`DARK`, `styleOf`); interfejs przełącza zmienne CSS `[data-theme=dark]` jak w Gapie. Eksport PNG renderuje do bufora o zadanej rozdzielczości i skaluje grubość linii razem z rozdzielczością.

## Sygnały, że trzeba wrócić do tematu

- **Wydajność przy dużych modelach** — dziś każda zmiana przebudowuje całą geometrię. Przy setkach brył trzeba przebudowywać tylko zmienione.
- **Geometria łączona** (dzielenie ścian liniami, wspólne krawędzie brył) — to zmiana modelu, nie dodatek. Zastanowić się przed.
- **Wiele wycięć w dużych bryłach** — CSG liczy się przy każdej przebudowie sceny (także w trakcie push/pull). Przy dziesiątkach okien w jednej bryle trzeba będzie zapamiętywać wynik i liczyć tylko zmienione bryły.
- **Bardzo duże podkłady** — przyklejanie korzysta z siatki odcinków (`Snapper.setUnderlay`), rysowanie z jednego `LineSegments` na warstwę. Powyżej ~600 tys. odcinków czytnik przerywa.
