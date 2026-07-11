# Klas van '76 — Wie is wie?

Een klein, feestelijk hulpje voor de reünie van de **Klas van 1976** (John High
School). Je laadt je jaarboekpagina's in de app, en op de reünie maak je een
foto van iemand — de app raadt dan wie het was in het jaarboek, met een
speels percentage.

Alles draait **volledig op je eigen telefoon**. Er gaat geen enkele foto het
internet op: gezichtsherkenning én tekstherkenning gebeuren lokaal in de
browser, en de klasgenoten worden opgeslagen in de telefoon zelf (IndexedDB).

## Zo gebruik je 'm

1. **Instellen** (eenmalig, thuis): tik op *Instellen* en kies een foto van een
   jaarboekpagina (één of dubbele pagina). De app knipt de gezichten uit en
   leest de namen eronder. Je controleert ze even, vinkt weg wat geen
   klasgenoot is, en slaat op. Herhaal voor elke pagina.
2. **Reünie**: tik op *Reünie*, richt de camera op iemand en maak een foto. De
   app toont de drie meest waarschijnlijke klasgenoten met een percentage.

> **Eerlijk over de gok:** een foto van nu vergelijken met een korrelige
> zwart-witfoto van bijna vijftig jaar geleden is lastig. Zie het percentage
> als een speelse hint, niet als de waarheid — daarom toont de app altijd de
> top 3.

## Op je telefoon zetten

De app is een **PWA** (web-app). Je hebt geen Play Store en geen APK nodig.

1. Zet de app online via GitHub Pages (zie hieronder) — dat geeft je een
   `https://…`-adres.
2. Open dat adres in **Chrome op je Android-telefoon**.
3. Menu (⋮) → **App installeren** / **Zet op startscherm**.
4. Open 'm één keer met internet zodat alles gedownload wordt; daarna werkt de
   app **offline** — handig als het wifi op de reünielocatie tegenvalt.

> Camera werkt alleen op een `https://`-adres (of `localhost`). GitHub Pages is
> `https`, dus dat zit goed.

## Online zetten met GitHub Pages

Er zit een kant-en-klare workflow bij (`.github/workflows/reunion-pages.yml`).

1. Ga in deze repo naar **Settings → Pages**.
2. Zet **Source** op **GitHub Actions**.
3. De workflow draait automatisch bij elke push naar de app-branch (of start
   'm handmatig via het tabblad **Actions → Reünie-app op GitHub Pages → Run
   workflow**).
4. Na afloop staat het adres bij **Settings → Pages** en in de Actions-run.

Werkt de deploy niet vanwege een branch-beperking op de `github-pages`
omgeving? Zet die dan open in **Settings → Environments → github-pages**, of
merge de map naar je standaardbranch.

## Lokaal uitproberen (op een computer)

De app moet via http(s) geserveerd worden (niet als `file://`), anders werken
de service worker en de modules niet.

```bash
cd reunion-matcher
python3 -m http.server 8000
# open daarna http://localhost:8000 in de browser
```

Voor een snelle test zonder camera kun je bij *Reünie* op *"of kies uit
galerij"* tikken en een bestaande foto kiezen.

## Hoe het werkt (techniek)

- **Gezichten**: [face-api.js] (SSD MobileNet v1 voor detectie, 68 landmarks,
  128-dimensionale gezichts-"vingerafdruk"). Matchen gebeurt op de euclidische
  afstand tussen die vingerafdrukken; de top 3 met de kleinste afstand wint.
- **Namen**: [Tesseract.js] (OCR) leest de tekst op de pagina; elk gezicht
  krijgt de tekstregel die er het dichtst onder staat.
- **Offline**: een service worker (`sw.js`) cachet de app én de modellen, zodat
  alles zonder internet werkt na de eerste keer laden.
- **Opslag**: klasgenoten (naam + uitgeknipt portret + vingerafdruk) staan in
  IndexedDB op het toestel.

Alle libraries en modellen staan lokaal in `vendor/` — er worden geen externe
CDN's aangeroepen.

### Debug-knopje

De werkresolutie voor het inlezen staat standaard op 2200px. Op een traag
toestel kun je 'm verlagen via de browserconsole:

```js
localStorage.setItem('klas76_maxw', '1500'); // daarna pagina herladen
```

[face-api.js]: https://github.com/vladmandic/face-api
[Tesseract.js]: https://github.com/naptha/tesseract.js
