# Zagreb Buildings

Javna, otvorena baza podataka o zgradama u Zagrebu usmjerena na ekonomsku aktivnost (radna mjesta, korisnici). Kombinira podatke iz više izvora s korisničkim unosima.

Korisnički unos je slobodan, a jednom uneseni podaci su dostupni bez ograničenja bilo putem API-ja, bilo kao izvoz koji se jednom dnevno automatski sprema u [data/claims.json](https://github.com/Poglavar/zagreb-buildings/blob/main/data/claims.json)

Svi podaci objavljeni su pod [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) licencom — javno dobro, bez ikakvih ograničenja korištenja.

## Arhitektura

Katastarski i OSM podaci dohvaćaju se uživo kad se klikne na zgradu. U bazi se pohranjuju samo korisnički unosi (claims).

**Izvori podataka:**

- **Katastar / DGU** (`cadastre`) — vrsta zgrade, površina tlocrta, geometrija. Katastar **ne** objavljuje visinu ni broj katova — svaka visina u pregledniku dolazi iz GDI-ja ili Overturea.
- **GDI** (`gdi`) — fotogrametrijska izmjera Grada Zagreba: visina (sljeme), katovi izvedeni iz visine vijenca, površina i volumen objekta, namjena (`use_class`), godina i metoda izmjere, tlocrt i LOD2 3D model. Jedan GDI objekt često obuhvaća **više katastarskih zgrada** (cijeli niz kuća kao jedno tijelo) — takve vrijednosti su u pregledniku označene s `×N`.
- **Overture** (`osm`, `microsoft`, `google`, `meta_lidar`) — visina, katovi, naziv, vrsta zgrade, poligon; svaki podatak nosi oznaku skupa iz kojeg je došao.
- **Korisnički unosi** (pohranjeni) — bilo koje polje, s atribucijom izvora i opcionim URL-om

Sva tri geometrijska izvora mogu se istovremeno prikazati na karti (`Tlocrt:` prekidači u popupu) i usporediti u 3D dijalogu (gumb `3D`), gdje svaki model koristi isključivo podatke svog izvora.

**Stack:** Leaflet.js karta (statički HTML), three.js za 3D usporedbu, API serviran putem `cadastre-data/api`.

## Preglednik

Preglednik je samostalna HTML datoteka (`index.html`) koja komunicira s dijeljenim API-jem. U produkciji se servira kao statički sadržaj na `https://zagreb.lol/zgrade`, a nginx prosljeđuje `/zgrade/api/` na API server.

Za lokalni rad poslužite direktorij preko HTTP-a (npr. `npx http-server . -p 8097 -c-1`) i otvorite `http://localhost:8097/` — podrazumijevano koristi `localhost:3001` za API, a drugi se može zadati s `?apiBase=`. 3D dijalog učitava `js/` kao ES module, pa ne radi kad se `index.html` otvori kao `file://`.

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
| `GET /api/buildings/field-coverage`       | Broj zgrada koje imaju podatak, po polju (za izbornik) |
| `GET /api/building/:cadastre_id`          | Spojeni detalji iz svih izvora + GDI objekt i njegov tlocrt |
| `GET /api/building/:cadastre_id/models3d` | Tri geometrijska zapisa iste zgrade za 3D usporedbu  |
| `GET /api/building-by-object/:object_id`  | Obrnuti smjer: iz GDI objekta u katastarske zgrade i čestice |
| `POST /api/claims`                        | Unos korisničkog podatka (ograničen brojem zahtjeva) |

## Deploy

```sh
./deploy-to-server.sh
```

Postavlja frontend na `/var/www/zagreb.lol/zgrade` i konfigurira PM2 cron za izvoz. API se postavlja zasebno putem cadastre-data repozitorija.
