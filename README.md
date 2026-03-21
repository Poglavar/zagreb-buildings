# Zagreb Buildings

Javna, otvorena baza podataka o zgradama u Zagrebu usmjerena na ekonomsku aktivnost (radna mjesta, korisnici). Kombinira podatke iz više izvora s korisničkim unosima.

Korisnički unos je slobodan, a jednom uneseni podaci su dostupni bez ograničenja bilo putem API-ja, bilo kao izvoz koji se jednom dnevno automatski sprema u [data/claims.json](https://github.com/Poglavar/zagreb-buildings/blob/main/data/claims.json)

Svi podaci objavljeni su pod [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) licencom — javno dobro, bez ikakvih ograničenja korištenja.

## Arhitektura

Katastarski i OSM podaci dohvaćaju se uživo kad se klikne na zgradu. U bazi se pohranjuju samo korisnički unosi (claims).

**Izvori podataka:**

- **Katastar** (uživo) — vrsta zgrade, površina tlocrta, geometrija
- **3D izmjera** (uživo) — visina zgrade, procijenjeni broj katova
- **OpenStreetMap** (uživo putem Overpass API-ja) — visina, katovi, naziv, vrsta zgrade, poligon
- **Korisnički unosi** (pohranjeni) — bilo koje polje, s atribucijom izvora i opcionim URL-om

**Stack:** Leaflet.js karta (statički HTML), API serviran putem `cadastre-data/api`.

## Preglednik

Preglednik je samostalna HTML datoteka (`index.html`) koja komunicira s dijeljenim API-jem. U produkciji se servira kao statički sadržaj na `https://zagreb.lol/zgrade`, a nginx prosljeđuje `/zgrade/api/` na API server.

Za lokalni rad otvorite `index.html` u pregledniku — podrazumijevano koristi `localhost:3000` za API.

## Baza podataka

Projekt koristi dvije tablice u dijeljenoj PostgreSQL bazi. DDL-ovi se održavaju u `cadastre-data` repozitoriju:

- `cadastre-data/db/zagreb_building.sql` — mapiranje identiteta (interni ID na katastarski/OSM ID)
- `cadastre-data/db/zagreb_building_claim.sql` — korisnički unosi (field, value, source, source_url)

## Skripte

| Skripta                    | Opis                                              |
| -------------------------- | ------------------------------------------------- |
| `scripts/export-claims.js` | Izvoz svih korisničkih unosa u `data/claims.json` |
| `scripts/commit-claims.sh` | Izvoz + git commit + push (dnevni cron putem PM2) |

## API

API se servira putem dijeljenog `cadastre-data/api` servera (Hono). Endpointi za zgrade:

| Endpoint                                  | Opis                                                 |
| ----------------------------------------- | ---------------------------------------------------- |
| `GET /api/building-types`                 | Jedinstveni katastarski kodovi vrsta zgrada          |
| `GET /api/buildings?bbox=W,S,E,N`         | Zgrade u vidljivom području kao GeoJSON              |
| `GET /api/buildings/heatmap?bbox=W,S,E,N` | Centroidi + broj radnih mjesta za toplinski prikaz   |
| `GET /api/building/:cadastre_id`          | Spojeni detalji iz svih izvora                       |
| `POST /api/claims`                        | Unos korisničkog podatka (ograničen brojem zahtjeva) |

## Deploy

```sh
./deploy-to-server.sh
```

Postavlja frontend na `/var/www/zagreb.lol/zgrade` i konfigurira PM2 cron za izvoz. API se postavlja zasebno putem cadastre-data repozitorija.
