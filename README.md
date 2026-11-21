# Modo

Lekki szkicownik brył architektonicznych dla Windows i Maca. Rysuje się jak w SketchUpie — linia, prostokąt, push/pull, wymiary wpisywane w trakcie, przyklejanie do końców, środków, krawędzi i osi — a obraz wygląda jak szkic koncepcyjny: krawędzie wychodzą za narożniki, linia lekko drży, kontur sylwetki jest grubszy, a słońce rzuca miękkie cienie według daty, godziny i miejsca.

## Co potrafi

- Okno 3D z nawigacją: środkowy przycisk obraca (z ⇧ przesuwa), kółko przybliża do kursora; na gładziku dwa palce obracają, z ⇧ przesuwają, szczypanie przybliża. Prawy przycisk przesuwa widok.
- Narzędzia: zaznacz (Q), przesuń (W), obróć (E), skaluj (R), linia (A), gumka (S), prostokąt (D) i prostokąt obrócony (⇧D), okrąg (V) i wielokąt foremny (⇧V, liczbę boków wpisuje się jako `8s`), łuk przez dwa punkty (B), łuk ze środka (⇧B), wycinek koła (Alt+B, na Macu ⌥B), odsunięcie (T), taśma z prowadnicami (Y), kątomierz (⇧Y), wymiar (U), opis z odnośnikiem (⇧T), przekrój (N), wypchnij/wciśnij (X), kolor bryły (M). Narzędzia z tej samej rodziny (np. prostokąty, łuki) mają na pasku jeden przycisk; warianty wysuwają się po najechaniu.
- Zaznaczanie ramką: przeciągnięcie w prawo zaznacza to, co w całości mieści się w ramce, w lewo — wszystko, czego ramka dotknie. Prawy klik bez przeciągania otwiera menu podręczne (grupowanie, bryły, ukrywanie, przekrój, usuwanie).
- Widok: Z pokazuje cały model, C przełącza perspektywę i rzut równoległy, ⇧C perspektywę dwupunktową (piony zostają pionowe), Ctrl+1…6 (⌘1…6) to widoki: izometria, góra, przód, prawy, tył, lewy. Okienko Widok (K) ma też kąt widzenia w stopniach i milimetrach oraz sceny (widok, styl, słońce i przekrój; PgUp/PgDn przełączają). F ukrywa resztę modelu (drugi raz pokazuje), G ukrywa bryły podobne do zaznaczonej, H ukrywa zaznaczone, ⇧H pokazuje wszystko.
- Grupy (`Spacja`) i komponenty (`Ctrl+Spacja`, na Macu `⌃Spacja`): klik zaznacza całość, dwuklik (albo `Enter`) wchodzi do środka, `Esc` kończy edycję. Grupy i komponenty można zagnieżdżać (np. komponent okna w komponencie elewacji); dwuklik schodzi o poziom niżej, `Esc` wychodzi o poziom wyżej. Zmiana w jednym wystąpieniu komponentu zmienia wszystkie, także te ukryte w innych komponentach; `⇧U` robi wystąpienie unikalnym, `⇧Spacja` rozbija grupę (jej zawartość przechodzi piętro wyżej).
- Kolor i krycie bryły (wiaderko, `M`): gotowa paleta ze szkłem i suwak krycia; przezroczyste bryły są przezroczyste także w PNG (również z przezroczystym tłem).
- Bryły wycinające: prostokąt (albo inny obrys) narysowany na ścianie bryły i wciśnięty w nią wycina otwór, wnękę albo dziedziniec; każdą bryłę można też przełączyć na wycinającą (⇧X). Wycięcia widać jako przerywany obrys — można je przesuwać, skalować i wypychać dalej.
- Przyklejanie do końców, środków, krawędzi, ścian, osi, prowadnic i ich przecięć; linie pomocnicze „od punktu”; blokada osi strzałkami (→ czerwona, ← zielona, ↑ niebieska).
- Wymiary z klawiatury w trakcie i po zakończeniu operacji (np. `3,5`, `350cm`, `6;4`, kąt `15`); po kopii `x3` robi szyk, `/3` dzieli odstęp. Liczba bez jednostki jest w jednostce szkicu (m, cm albo mm — przełącznik obok pola wymiarów).
- `Ctrl` (Windows) albo `⌥` (Mac): przy wypychaniu nowa bryła z zostawieniem istniejących krawędzi, przy przesuwaniu i obracaniu kopia.
- Zamknięte obrysy z linii i łuków same zamieniają się w ściany; okręgi po wypchnięciu dają walce z miękkimi krawędziami.
- Słońce według daty i godziny (domyślnie Warszawa), miękkie cienie; trzy style: Szkic, Kreska, Model (`⇧1`, `⇧2`, `⇧3`); wygląd automatyczny, jasny albo ciemny.
- Podkład z DXF (warstwy, wysokość, krycie, przyklejanie); DWG przez ODA File Converter, jeśli jest zainstalowany.
- Zapis i otwieranie plików `.modo`, eksport PNG w wysokiej rozdzielczości (jasny albo ciemny) i OBJ.
- Skróty w układzie Q W E R / A S D / Z X C, każdy do zmiany w oknie skrótów (`?`).
- Bryły z dowolnych ścian: dwuklik w bryłę pozwala przesuwać jej wierzchołki, krawędzie i ściany (W), dzielić ściany linią i wypychać część ściany. Bryły można łączyć, przecinać, odejmować i przycinać (menu podręczne albo okno skrótów).
- Przekrój (N): płaszczyzna stawiana na ścianie i przesuwana w głąb; przecięte bryły dostają ciemne wypełnienie i grubą linię cięcia, także w PNG. Włącza się i wyłącza w okienku Widok, w menu podręcznym albo ⇧N; Alt+N ukrywa płaszczyzny.
- Wymiary i opisy z odnośnikiem: zawsze czytelne, w jednostce szkicu, widoczne w eksporcie PNG; tekst opisu zmienia się dwuklikiem.
- Panel boczny (I): informacje o elemencie (nazwa, wymiary, pole ścian, objętość), warstwy z widocznością i struktura grup i komponentów.
- Biblioteka modeli (L): samochód, van, ludzie i drzewa 2D zawsze zwrócone do kamery, krzew, ławka. Własne modele zapisuje się z zaznaczenia; są dostępne w każdym szkicu na danym komputerze.
- Eksport OBJ z plikiem materiałów (Ctrl+⇧O, na Macu ⌘⇧O) dla 3ds Maxa: każda bryła to osobny obiekt nazwany ścieżką grup, wycięcia są odjęte, oś Y w górę.

## Instalacja

Instalatory są w [Wydaniach](https://github.com/michallenczewski/modo/releases). Na Macu program nie jest podpisany u Apple: przy pierwszym uruchomieniu kliknij go w Aplikacjach prawym przyciskiem → Otwórz.

Plików SketchUpa (`.skp`) Modo nie otwiera — to format zamknięty. Model ze SketchUpa można przenieść przez DXF albo OBJ.

Do plików DWG potrzebny jest darmowy [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter). Licencja ODA nie pozwala dołączyć go do Modo, więc instaluje się go osobno; Modo znajdzie go sam.

## Praca nad programem

```
npm install
npm start        # program
npm run web      # wersja w przeglądarce do testów interfejsu: http://localhost:8765
```

Opis budowy programu jest w [ARCHITEKTURA.md](ARCHITEKTURA.md).
