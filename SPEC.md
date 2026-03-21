1. Problem Statement

We aim to build a public, open, extensible database of buildings in Zagreb to support:
• Estimation of job distribution
• Modeling of traffic and commuting patterns
• Analysis of urban economic activity

Existing systems are insufficient:
• OpenStreetMap (OSM) provides excellent geometry and observable facts, but:
• does not allow inferred or estimated data (e.g. jobs)
• lacks stable building identity semantics
• Wikidata provides stable identifiers and rich semantics, but:
• requires notability
• does not scale to all buildings
• lacks detailed geometry and economic attributes

Therefore, we must build a new layer focused on building-level economic activity, while linking to existing datasets.

⸻

2. Design Goals

The system must:
• Assign a unique, stable identifier to every building
• Support lifecycle tracking (construction, renovation, demolition)
• Allow crowdsourced contributions
• Be publicly accessible and forkable
• Avoid duplication of existing datasets where possible
• Store derived and estimated data (jobs, visitors, usage)
• Be extensible for future use cases

⸻

3. Approaches Considered

3.1 Use OSM as Primary Database

Pros:
• Comprehensive building coverage
• Strong geometry
• Open and collaborative

Cons:
• Only allows verifiable, observable data
• Rejects inferred/estimated attributes (jobs, office class, etc.)
• No stable building identity abstraction

Conclusion:
Rejected as primary system. Will be used as a geometry and reference layer.

⸻

3.2 Use Wikidata as Primary Database

Pros:
• Stable global identifiers (URIs)
• Strong semantic model
• Open and persistent

Cons:
• Notability constraints
• Not suitable for bulk data (e.g. all buildings)
• Limited geometry

Conclusion:
Rejected as primary system. Will be used as a linking and enrichment layer for notable buildings.

⸻

3.3 No Database (Only Linking External Sources)

Pros:
• Avoids duplication
• Simpler architecture

Cons:
• External data is unstable
• APIs can change or disappear
• No place to store derived data
• Poor reproducibility

Conclusion:
Rejected. A local database is required.

⸻

3.4 Centroid / Location-Based ID

Idea:

Use a point (e.g. centroid) as the building identifier

Pros:
• Spatially intuitive
• Easy to generate
• Naturally unique

Cons:
• Cannot distinguish demolition/rebuild at same location
• Breaks on geometry edits
• Fails on building splits/merges
• Encodes identity as location (incorrect abstraction)

Conclusion:
Rejected as primary ID. Can be used as auxiliary anchor point.

⸻

3.5 Parcel-Based ID

Idea:

Use cadastral parcel as building identity

Pros:
• Legal grounding
• Often associated with buildings

Cons:
• Parcels can contain multiple buildings
• Parcels can merge/split
• Legal vs physical structure mismatch

Conclusion:
Rejected as primary ID. Can be used as linked attribute.

⸻

3.6 Name-Based ID

Idea:

Use building name as identifier

Pros:
• Human-readable
• Intuitive

Cons:
• Many buildings have no name
• Names change over time
• Not unique
• Language/format inconsistencies

Conclusion:
Rejected as primary ID. Names will be stored as attributes.

⸻

4. Final Decisions

4.1 Identity Model
• Each building receives a sequential integer ID (SERIAL primary key)
• Integer IDs are simple, performant, and sufficient — human-friendly lookup is by address, not by ID
• External IDs are stored as linked attributes (cadastre zgrada_id, OSM way/relation ID, etc.)

Lifecycle Rules
• Renovation / extension → same ID
• Demolition → building marked inactive
• New building on same site → new ID
• Split → new IDs created
• Merge → new ID created

⸻

4.2 External Data Strategy

Live-fetch approach:
• Cadastre and OSM data are fetched live, never duplicated locally
• Only user-contributed claims are stored in the database
• All sources are shown with attribution in the viewer

Sources:
• Cadastre → building type, area, geometry (live from database)
• 3D survey → height (live from database)
• OSM → height, floors, name, polygon (live via Overpass API)
• User claims → any field (stored in zagreb_building_claim)

⸻

4.3 Public Data Strategy

To ensure trust and participation:
• Open license (preferably CC0)
• Regular full data exports (GeoJSON, CSV)
• Public repository (e.g. GitHub)
• Schema documentation
• Easy forkability

⸻

4.4 Conceptual Model

[ building_id (integer) ] ← primary identity

    ↓ links to external IDs

cadastre_building_id → zgrada_id from Croatian cadastre
osm_building_id → OSM way/relation ID
wikidata_id → Wikidata Q-item (notable buildings only)

    ↓ has claims (multi-source observations)

zagreb_building_claim table:
  building_id, field, value, source, source_url, created_at
  UNIQUE(building_id, field, source)

Each attribute (area, height, floors, jobs, building_type, etc.) can have
multiple claims from different sources. The viewer shows all claims per field
with source attribution. No free-text notes — only a supporting URL to prevent
spam and enable verification.

⸻

5. Core Data Concepts

5.1 Separation of Concerns

Geometry
• footprint
• height
• floors

Classification
• actual use (real-world)
• design use (optional)

Economic Activity
• jobs (staff and workers)
• pupils (students, schoolchildren, kindergarteners)
• visitors (customers, patients, etc.)
• total inflow (for traffic modeling)

Real Estate
• rent_eur_m2 (estimated monthly rent per m²)

⸻

5.2 Jobs, Pupils & Visitors

These must be modeled separately:
• Jobs → people working in the building (staff, employees)
• Pupils → people attending for education (schoolchildren, university students, kindergarteners)
• Visitors → transient users (customers, patients, shoppers, etc.)

Total inflow:

daily_people_inflow = jobs + pupils + visitors

⸻

5.3 Estimates and Uncertainty

All derived data must include:
• estimation method
• confidence
• source

The system stores claims, not absolute truth.

⸻

5.4 Naming
• Buildings may have:
• official name
• colloquial name
• multiple aliases

Names are:
• searchable
• mutable
• non-identifying

⸻

6. Data Schema

6.1 Core Table

TABLE zagreb_building (
  id                    SERIAL PRIMARY KEY,
  cadastre_building_id  INTEGER UNIQUE,  -- zgrada_id from Croatian cadastre
  osm_building_id       TEXT UNIQUE,     -- OSM way/relation ID (e.g. 'w123456')
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

⸻

6.2 Claims Table (Multi-Source Observations)

All building attributes are stored as claims — multiple sources can
provide values for the same field. The system shows all values with
source attribution rather than picking a single "truth".

Known fields (all numeric): area_m2, height_m, floors, jobs, pupils, visitors, rent_eur_m2, building_type

TABLE zagreb_building_claim (
  id              SERIAL PRIMARY KEY,
  building_id     INTEGER NOT NULL REFERENCES zagreb_building(id),
  field           TEXT NOT NULL,             -- e.g. 'area_m2', 'jobs'
  value           DOUBLE PRECISION NOT NULL, -- all current fields are numeric
  source          TEXT NOT NULL,             -- e.g. 'user:john99', 'survey:2026'
  source_url      TEXT,                      -- optional supporting URL (validated)
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (building_id, field, source)
);

No free-text notes or comments — only source_url — to prevent spam
while enabling verification. URLs are validated on submission:
format check + HEAD request to reject 404s.

Write access is open (no auth) with per-IP rate limiting.

⸻

7. Future Extensions
   • Per-unit / per-floor data
   • 3D building models
   • Company-level linkage
   • Integration with traffic models
   • Automated estimation pipelines

⸻

8. Summary

We are building:

A public, open, building-level knowledge layer focused on economic activity and human movement.

Key principles:
• Stable synthetic IDs
• Separation of geometry, semantics, and economics
• Estimates with explicit uncertainty
• Open, forkable data infrastructure
• Tight integration with OSM and other sources

This approach balances:
• practicality
• scalability
• openness
• analytical usefulness

⸻
