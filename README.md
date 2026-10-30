# Due date

En enkel PWA som visar hur långt gången du är i graviditeten (vecka+dag), trimester och beräknat förlossningsdatum (BF = sista mens + 280 dagar, eller BF enligt ultraljud). Barnmorsketider, ultraljud och andra besök kan läggas in, med graviditetsvecka för varje besök och kalenderfil med påminnelse dagen innan.

Allt sparas lokalt på enheten (`localStorage`). Inget konto och ingen server.

## Struktur

- `app/` – hela appen (statiska filer, inget byggsteg). Det här publiceras på GitHub Pages.
  - `calc.js` – datumberäkningar (ren modul, enhetstestad)
  - `store.js` – lagring och säkerhetskopia
  - `app.js` – gränssnitt
  - `sw.js` – offline-cache och påminnelsenotiser
- `tests/` – enhetstester (`npm test`, kräver Node 22)
- `plans/gravid/` – kravplan och klickbar prototyp (reqplan)

## Köra lokalt

```sh
npm start        # http://localhost:8080
npm test
```

## Publicering

`.github/workflows/pages.yml` kör testerna och publicerar `app/` vid push till `main`.
Första gången: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Påminnelser

Riktiga push-notiser kräver en server, så appen använder:
1. **Lägg till i kalendern** (.ics med påminnelse dagen innan) – fungerar överallt.
2. **Notiser** (om webbläsaren stöder det) för besök idag/imorgon, när appen öppnas eller via Periodic Background Sync (Chrome på Android, installerad app). På iPhone krävs att appen är tillagd på hemskärmen.
