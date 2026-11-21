# Modo

Lekki szkicownik brył architektonicznych dla Windows i Maca. Rysuje się jak w SketchUpie — linia, prostokąt, push/pull, wymiary wpisywane w trakcie, przyklejanie do końców, środków, krawędzi i osi — a obraz wygląda jak szkic koncepcyjny: krawędzie wychodzą za narożniki, linia lekko drży, kontur sylwetki jest grubszy, a słońce rzuca miękkie cienie według daty, godziny i miejsca.

## Co potrafi

- Okno 3D z nawigacją: środkowy przycisk obraca (z ⇧ przesuwa), kółko przybliża do kursora; na gładziku dwa palce obracają, z ⇧ przesuwają, szczypanie przybliża. Prawy przycisk przesuwa widok.
- Narzędzia: zaznacz (Q), przesuń (W), obróć (E), skaluj (R), linia (A), gumka (S), prostokąt (D), okrąg (V), łuk (B), odsunięcie (T), taśma z prowadnicami (Y), wypchnij/wciśnij (X), kolor bryły (M).
- Widok: Z pokazuje cały model, C przełącza perspektywę i rzut równoległy, F ukrywa resztę modelu (drugi raz pokazuje), G ukrywa bryły podobne do zaznaczonej, H ukrywa zaznaczone, ⇧H pokazuje wszystko.
- Grupy (`Spacja`) i komponenty (`Ctrl+Spacja`, na Macu `⌃Spacja`): klik zaznacza całość, dwuklik (albo `Enter`) wchodzi do środka, `Esc` kończy edycję. Grupy i komponenty można zagnieżdżać (np. komponent okna w komponencie elewacji); dwuklik schodzi o poziom niżej, `Esc` wychodzi o poziom wyżej. Zmiana w jednym wystąpieniu komponentu zmienia wszystkie, także te ukryte w innych komponentach; `⇧U` robi wystąpienie unikalnym, `⇧Spacja` rozbija grupę (jej zawartość przechodzi piętro wyżej).
- Kolor i krycie bryły (wiaderko, `M`): gotowa paleta ze szkłem i suwak krycia; przezroczyste bryły są przezroczyste także w PNG (również z przezroczystym tłem).
- Bryły wycinające: prostokąt (albo inny obrys) narysowany na ścianie bryły i wciśnięty w nią wycina otwór, wnękę albo dziedziniec; każdą bryłę można też przełączyć na wycinającą (⇧X). Wycięcia widać jako przerywany obrys — można je przesuwać, skalować i wypychać dalej.
- Przyklejanie do końców, środków, krawędzi, ścian, osi, prowadnic i ich przecięć; linie pomocnicze „od punktu”; blokada osi strzałkami (→ czerwona, ← zielona, ↑ niebieska).
- Wymiary z klawiatury w trakcie i po zakończeniu operacji (np. `3,5`, `350cm`, `6;4`, kąt `15`); po kopii `x3` robi szyk, `/3` dzieli odstęp. Liczba bez jednostki jest w jednostce szkicu (m, cm albo mm — przełącznik obok pola wymiarów).
- `Ctrl` (Windows) albo `⌥` (Mac): przy wypychaniu nowa bryła z zostawieniem istniejących krawędzi, przy przesuwaniu i obracaniu kopia.
- Zamknięte obrysy z linii i łuków same zamieniają się w ściany; okręgi po wypchnięciu dają walce z miękkimi krawędziami.
- Słońce według daty i godziny (domyślnie Warszawa), miękkie cienie; trzy style: Szkic, Kreska, Model (`⇧1`, `⇧2`, `⇧3`); wygląd automatyczny, jasny albo ciemny.
- Podkład z DXF (warstwy, wysokość, krycie, przyklejanie); DWG przez ODA File Converter, jeśli jest zainstalowany.
- Zapis i otwieranie plików `.modo`, eksport PNG w wysokiej rozdzielczości (jasny albo ciemny).
- Skróty w układzie Q W E R / A S D / Z X C, każdy do zmiany w oknie skrótów (`?`).

## Instalacja

Instalatory są w [Wydaniach](https://github.com/michallenczewski/modo/releases). Na Macu program nie jest podpisany u Apple: przy pierwszym uruchomieniu kliknij go w Aplikacjach prawym przyciskiem → Otwórz.

Do plików DWG potrzebny jest darmowy [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter). Licencja ODA nie pozwala dołączyć go do Modo, więc instaluje się go osobno; Modo znajdzie go sam.

## Praca nad programem

```
npm install
npm start        # program
npm run web      # wersja w przeglądarce do testów interfejsu: http://localhost:8765
```

Opis budowy programu jest w [ARCHITEKTURA.md](ARCHITEKTURA.md).
