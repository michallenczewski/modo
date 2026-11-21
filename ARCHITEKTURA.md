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
| `renderer/mesh.js` | Bryły z dowolnych ścian (`kind: 'mesh'`): ściany jako wielokąty, dzielenie linią, przesuwanie wierzchołków, wypychanie części ściany, operacje na bryłach (`booleanMesh`), pole i objętość. |
| `renderer/annot.js` | Wymiary i opisy: rysowanie na płaskiej nakładce (okno i PNG) i trafianie kursorem. |
| `renderer/export.js` | Eksport OBJ + MTL (wycięcia odjęte, obiekty nazwane ścieżką grup, oś Y w górę). |
| `renderer/lib.js` | Biblioteka modeli budowanych z kodu (samochód, van, ludzie, drzewa 2D, krzew, ławka) i zapis własnych modeli w `localStorage` (`modo.library`). |
| `renderer/solid.js` | Operacje na bryłach przez Manifold (WASM). Każda funkcja może zwrócić `null` — wtedy `csg.js` liczy po staremu drzewami BSP. |
| `renderer/skp.js` | Import `.skp`: model z OpenSKP → bryły z dowolnych ścian, linie, grupy, komponenty, warstwy, sceny. |
| `renderer/dwg.js` | Czytanie DWG przez LibreDWG (WASM): baza encji → prosty tekst DXF → `dxf.js`; druga droga to zapis DXF samego LibreDWG. |
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

**Wymiary i opisy** (`model.dims`, `model.texts`) leżą w świecie, ale rysuje się je płasko na nakładce 2D (`drawAnnotations`), więc są czytelne pod każdym kątem; eksport PNG rysuje je drugi raz w rozdzielczości obrazu. Id w zaznaczeniu: `'d' + id`, `'t' + id`; przesuwanie i obracanie traktuje je jak odcinki (`eachTarget`).

**Przekrój** (`model.sections`: punkt `o`, normalna `n`, `on`) — jeden aktywny naraz. Ściany dostają `clippingPlanes` three.js (z `clipShadows`), shader krawędzi przycina odcinki tą samą płaszczyzną (uniform `sect`), a każda przecięta bryła dostaje drugą siatkę z materiałem `BackSide` w kolorze wypełnienia: przez przecięcie widać jej wnętrze, więc wygląda jak wypełniony przekrój. Linia cięcia to przecięcie trójkątów z płaszczyzną, rysowane na nakładce (`drawSection`).

**Warstwy** (`model.tags`) — elementy i grupy mają pole `tag`. Widoczność sprawdza `isHidden(model, e)`: własna flaga `hidden`, warstwa elementu albo warstwa którejkolwiek z grup nad nim. Wszystkie miejsca, które pomijają ukryte (scena, przyklejanie, zaznaczanie, granice modelu, eksport), korzystają z tej funkcji.

**Figury 2D** (ludzie, drzewa z biblioteki) to płaskie ściany z flagą `bill`. Viewer buduje je osobno (`addBillboard`) we własnej grupie z osią w punkcie `o` i przy każdej klatce obraca je wokół pionu do kamery (`faceBillboards`).

**Kamera**: widoki standardowe (`setView`), perspektywa dwupunktowa (`twoPoint`: kamera pozioma, a patrzenie w górę i w dół to przesunięcie obiektywu przez `setViewOffset`), kąt widzenia (`setFov`). Sceny (`app.scenes`, zapisywane w pliku obok modelu) pamiętają kamerę, styl, słońce i aktywny przekrój.

Cofanie to kopie całego modelu (model jest mały). Plik `.modo` to JSON: model, kamera, styl, słońce, sceny, podkład (już przeliczony na metry, więc działa na obu komputerach bez oryginalnego DXF).

## Rysunek

Ściany to zwykłe `MeshLambertMaterial` z cieniami (`VSMShadowMap`, promień rozmycia = „Miękkość”). Ziemia to `ShadowMaterial` — widać na niej tylko cień, reszta to kolor papieru.

Krawędzie rysuje własny shader (`EDGE_VS` w `viewer.js`): każda krawędź jest dzielona na kilka czworokątów rozciągniętych w przestrzeni ekranu. W shaderze:
- grubość zależy od tego, czy krawędź jest konturem sylwetki (jedna przyległa ściana zwrócona do kamery, druga nie) — kontur jest grubszy,
- końce wychodzą kilka pikseli za narożnik (przedłużenia),
- linia lekko faluje (ziarno losowe z położenia krawędzi, więc wygląd jest stały między klatkami),
- kolor jaśnieje w głębi,
- krawędzie przecinające płaszczyznę bliską kamery są przycinane w shaderze.

Style (`STYLES` w `viewer.js`) to zestawy tych parametrów: Szkic, Kreska, Model. Tryb ciemny podmienia w nich papier, kreskę, kolor ścian i cień (`DARK`, `styleOf`); interfejs przełącza zmienne CSS `[data-theme=dark]` jak w Gapie. Eksport PNG renderuje do bufora o zadanej rozdzielczości i skaluje grubość linii razem z rozdzielczością.

## Biblioteki zewnętrzne

Wszystkie leżą w `renderer/vendor/` jako gotowe pliki, żeby program i wersja przeglądarkowa działały bez budowania. Ciężkie moduły (OpenSKP, LibreDWG) ładują się dopiero przy pierwszym użyciu.

| Katalog | Co to | Skąd i jak odświeżyć |
| --- | --- | --- |
| `three.*` | three.js r187 (MIT) | `build/` wydania three.js |
| `manifold/` | Manifold (Apache-2.0), commit 8c41f36 z 21.11.2026 | `manifold.wasm` i klej Emscripten z gałęzi `gh-pages` repozytorium elalish/manifold (`assets/three/`): z pliku `three.js` wycięta funkcja modułu (ta z `manifold.wasm` w środku), ścieżka do `.wasm` zmieniona na względną, import pomocnika Vite zamieniony na `node:module`. Prościej: `manifold.js` i `manifold.wasm` z paczki npm `manifold-3d`. |
| `openskp/` | OpenSKP 1.5.0 (MIT), commit 8373731 | Z `packages/typescript/src` tylko pliki czytnika (`parser, vff, legacy, geometry, model, transforms, errors, observability, edge-flags, edge-store, vertex-store, face-groups, pages-dimensions, triangulator`) skompilowane `tsc --target es2020 --module esnext`; `index.js` to wycięta funkcja `parseToRaw` plus `parseSkp` i `buildScene`; importy dostają końcówkę `.js`, `fflate` i `earcut` wskazują sąsiednie katalogi. |
| `fflate/`, `earcut/` | rozpakowywanie ZIP i triangulacja dla OpenSKP (MIT, ISC) | `src/index.ts` fflate skompilowany `tsc` (wątki zastąpione atrapą `node-worker.js`); `src/earcut.js` bez zmian |
| `libredwg/` | libredwg-web (GPL-3), commit 8e307b3 | `bindings/javascript/wasm/` bez zmian oraz `bindings/javascript/src` skompilowane `tsc`; w `libredwg.js` import modułu WASM wskazuje `./wasm/`. |

**Manifold** wymaga w nagłówku CSP `'wasm-unsafe-eval'` i `'unsafe-eval'` (klej embind buduje funkcje dynamicznie). Program ładuje wyłącznie własne pliki, więc to dopuszczalne; nie ładuj w oknie niczego z sieci.

**LibreDWG bywa zawodny**: na części plików przerywa moduł WASM albo psuje jego pamięć. Dlatego `dwg.js` (1) dla każdego pliku tworzy świeży egzemplarz modułu, (2) czyta z bazy tylko encje potrzebne w podkładzie — teksty, kreskowania, bryły ACIS i pełny nagłówek są pomijane, bo to na nich wykładał się najczęściej, (3) ma drugą drogę (własny zapis DXF LibreDWG, lepszy dla formatów R13–2000), a w programie trzecią: ODA File Converter, jeśli jest zainstalowany. Na próbkach LibreDWG (R13–2018) wynik zgadza się z wzorcowymi DXF; jedna próbka z dziesięciu (`example_2018.dwg`) nie przechodzi żadną z dwóch dróg.

**Import .skp**: geometria każdego wystąpienia komponentu jest kopiowana do świata (tak działa cały model Modo), więc model z tysiącami kopii rośnie. Kolor bryły to najczęstszy materiał jej ścian — Modo nie ma koloru na pojedynczej ścianie ani tekstur. Miękkie krawędzie są zapisane w bryle jako `softs` (odcinki), rysowane tylko jako kontur.

## Sygnały, że trzeba wrócić do tematu

- **Wydajność przy dużych modelach** — dziś każda zmiana przebudowuje całą geometrię. Przy setkach brył trzeba przebudowywać tylko zmienione.
- **Geometria łączona między bryłami** (wspólne krawędzie różnych brył) — dzielenie ścian działa w obrębie jednej bryły (tryb edycji bryły); łączenie brył w jedną to „Suma brył”. Pełna lepka geometria jak w SketchUpie byłaby zmianą modelu.
- **Duże modele ze SketchUpa** — powyżej kilkudziesięciu tysięcy ścian przebudowa sceny i cofanie (kopia całego modelu) zaczynają być odczuwalne. Wtedy: przebudowa tylko zmienionych brył i współdzielona geometria kopii komponentu.
- **Kolor na ścianie i tekstury** — import .skp sprowadza materiały do jednego koloru na bryłę.
- **Wiele wycięć w dużych bryłach** — CSG liczy się przy każdej przebudowie sceny (także w trakcie push/pull). Przy dziesiątkach okien w jednej bryle trzeba będzie zapamiętywać wynik i liczyć tylko zmienione bryły.
- **Bardzo duże podkłady** — przyklejanie korzysta z siatki odcinków (`Snapper.setUnderlay`), rysowanie z jednego `LineSegments` na warstwę. Powyżej ~600 tys. odcinków czytnik przerywa.
