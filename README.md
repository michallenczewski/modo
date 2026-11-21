# Modo

Lekki szkicownik brył architektonicznych dla Windows i Maca. Rysuje się jak w SketchUpie — linia, prostokąt, push/pull, wymiary wpisywane w trakcie, przyklejanie do końców, środków, krawędzi i osi — a obraz wygląda jak szkic koncepcyjny: krawędzie wychodzą za narożniki, linia lekko drży, kontur sylwetki jest grubszy, a słońce rzuca miękkie cienie według daty, godziny i miejsca.

## Co jest w wersji 0.1

- Okno 3D z nawigacją: środkowy przycisk obraca (z ⇧ przesuwa), kółko przybliża do kursora; na gładziku dwa palce obracają, z ⇧ przesuwają, szczypanie przybliża. Prawy przycisk przesuwa widok.
- Linia, prostokąt, wypchnij/wciśnij z przyklejaniem i liniami pomocniczymi, blokada osi strzałkami (→ czerwona, ← zielona, ↑ niebieska), wymiary z klawiatury (np. `3,5`, `350cm`, `6;4`) — także już po zakończeniu operacji, żeby poprawić ostatni prostokąt albo wypchnięcie. Liczba bez jednostki jest w jednostce szkicu (m, cm albo mm — przełącznik obok pola wymiarów).
- Push/pull z `Ctrl` (Windows) albo `⌥` (Mac) zostawia istniejące krawędzie i robi nową bryłę, jak w SketchUpie; przy kursorze pojawia się wtedy plus.
- Kolor bryły (wiaderko, `B`).
- Słońce według daty i godziny (domyślnie Warszawa), miękkie cienie; trzy style: Szkic, Kreska, Model (`⇧1`, `⇧2`, `⇧3`).
- Podkład z DXF (warstwy, wysokość, krycie, przyklejanie); DWG przez ODA File Converter, jeśli jest zainstalowany.
- Zapis i otwieranie plików `.modo`, eksport PNG w wysokiej rozdzielczości.
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
