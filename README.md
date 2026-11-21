# Modo

Lekki szkicownik brył architektonicznych dla Windows i Maca. Rysuje się jak w SketchUpie — linia, prostokąt, push/pull, wymiary wpisywane w trakcie, przyklejanie do końców, środków, krawędzi i osi — a obraz wygląda jak szkic koncepcyjny: krawędzie wychodzą za narożniki, linia lekko drży, kontur sylwetki jest grubszy, a słońce rzuca miękkie cienie według daty, godziny i miejsca.

## Co potrafi

- Okno 3D z nawigacją: środkowy przycisk obraca (z ⇧ przesuwa), kółko przybliża do kursora; na gładziku dwa palce obracają, z ⇧ przesuwają, szczypanie przybliża. Prawy przycisk przesuwa widok.
- Narzędzia jak w SketchUpie: linia (L), prostokąt (R), okrąg (C), łuk dwupunktowy (A), wypchnij/wciśnij (P), przesuń (M), obróć (Q), odsunięcie (F), taśma z prowadnicami (T), gumka (E), kolor bryły (B).
- Przyklejanie do końców, środków, krawędzi, ścian, osi, prowadnic i ich przecięć; linie pomocnicze „od punktu”; blokada osi strzałkami (→ czerwona, ← zielona, ↑ niebieska).
- Wymiary z klawiatury w trakcie i po zakończeniu operacji (np. `3,5`, `350cm`, `6;4`, kąt `15`); po kopii `x3` robi szyk, `/3` dzieli odstęp. Liczba bez jednostki jest w jednostce szkicu (m, cm albo mm — przełącznik obok pola wymiarów).
- `Ctrl` (Windows) albo `⌥` (Mac): przy wypychaniu nowa bryła z zostawieniem istniejących krawędzi, przy przesuwaniu i obracaniu kopia.
- Zamknięte obrysy z linii i łuków same zamieniają się w ściany; okręgi po wypchnięciu dają walce z miękkimi krawędziami.
- Słońce według daty i godziny (domyślnie Warszawa), miękkie cienie; trzy style: Szkic, Kreska, Model (`⇧1`, `⇧2`, `⇧3`); wygląd automatyczny, jasny albo ciemny.
- Podkład z DXF (warstwy, wysokość, krycie, przyklejanie); DWG przez ODA File Converter, jeśli jest zainstalowany.
- Zapis i otwieranie plików `.modo`, eksport PNG w wysokiej rozdzielczości (jasny albo ciemny).
- Skróty jak w SketchUpie, do zmiany w oknie skrótów (`?`).

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
