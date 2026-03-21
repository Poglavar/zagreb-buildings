# Zagreb Buildings

A public, open, building-level database for Zagreb focused on economic activity (jobs, visitors). Combines live data from multiple sources — Croatian cadastre, 3D building survey, OpenStreetMap — with crowdsourced user claims.

## Architecture

Data is **never duplicated**. Cadastre and OSM data are fetched live when a building is clicked. Only user-contributed claims are stored in the database.

**Data sources:**
- **Cadastre** (live) — building type, footprint area, geometry
- **3D survey** (live) — building height, derived floor count
- **OpenStreetMap** (live via Overpass API) — height, floors, name, building type, polygon
- **User claims** (stored) — any field, with source attribution and optional supporting URL

**Stack:** Leaflet.js map viewer (static HTML), API served by [cadastre-data/api](../cadastre-data/api).

## Viewer

The viewer is a standalone HTML file (`index.html`) that talks to the shared API. In production it's served as static files at `https://zagreb.lol/zgrade` with nginx proxying `/zgrade/api/` to the API server.

To run locally, open `index.html` in a browser — it defaults to `localhost:3000` for the API.

## Database

This project uses two tables in the shared PostgreSQL database. DDLs are maintained in the [cadastre-data](../cadastre-data) repo:

- [`cadastre-data/db/zagreb_building.sql`](../cadastre-data/db/zagreb_building.sql) — identity mapping (internal ID to cadastre/OSM IDs)
- [`cadastre-data/db/zagreb_building_claim.sql`](../cadastre-data/db/zagreb_building_claim.sql) — user-contributed claims (field, value, source, source_url)

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/export-claims.js` | Export all user claims to `data/claims.json` |
| `scripts/commit-claims.sh` | Export + git commit + push (daily cron via PM2) |

## API

The API is served by the shared [cadastre-data/api](../cadastre-data/api) server (Hono). Building endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/building-types` | Distinct cadastre building type codes |
| `GET /api/buildings?bbox=W,S,E,N` | Buildings in viewport as GeoJSON |
| `GET /api/buildings/heatmap?bbox=W,S,E,N` | Centroids + job counts for heatmap |
| `GET /api/building/:cadastre_id` | Merged detail from all sources |
| `POST /api/claims` | Submit a user claim (rate limited) |

## Deployment

```sh
./deploy-to-server.sh
```

Deploys the frontend to `/var/www/zagreb.lol/zgrade` and sets up the PM2 export cron. The API is deployed separately via the cadastre-data repo.
