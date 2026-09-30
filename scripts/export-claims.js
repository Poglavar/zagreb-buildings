/**
 * export-claims.js — Export all user claims as JSON.
 *
 * Joins zagreb_building_claim with zagreb_building to include external IDs
 * so the export is self-contained (no dependency on internal serial IDs).
 *
 * Every supported assertion is reconstructible from its row: numeric claims carry `value`, a
 * text claim (history_url) carries its URL in `text_value` (its `value` is a dummy 0), and an AI
 * year carries the interval and confidence the model gave (`ai_*`), not just its point estimate.
 * The contributor-ownership hash is never selected.
 *
 * Output: data/claims.json (an array of rows) and data/claims.manifest.json (when it was
 * generated, how many rows, the newest claim, a checksum of claims.json) — so an unchanged
 * archive can be told apart from an export job that stopped.
 *
 * Usage:
 *   node scripts/export-claims.js
 *   CLAIMS_EXPORT_OUT=/path/claims.json node scripts/export-claims.js   (manifest lands beside it)
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const OUTPUT = process.env.CLAIMS_EXPORT_OUT
    ? path.resolve(process.env.CLAIMS_EXPORT_OUT)
    : path.resolve(__dirname, '../data/claims.json');
const MANIFEST = path.join(path.dirname(OUTPUT), 'claims.manifest.json');
// Bump when a column is added, removed or changes meaning.
const SCHEMA_VERSION = 2;

async function main() {
    const { rows } = await pool.query(`
        SELECT
            c.id,
            b.cadastre_building_id,
            b.osm_building_id,
            c.field,
            c.value,
            c.text_value,
            c.source,
            c.source_url,
            c.created_at,
            d.year_low   AS ai_year_low,
            d.year_high  AS ai_year_high,
            ROUND(d.confidence::numeric, 3)::float AS ai_confidence,
            d.style_label       AS ai_style_label
        FROM zagreb_building_claim c
        JOIN zagreb_building b ON b.id = c.building_id
        -- one dating row per building, so this adds columns, never rows
        LEFT JOIN zagreb_building_dating d
               ON d.building_id = c.building_id AND c.field = 'year_built' AND c.source LIKE 'ai:%'
        ORDER BY c.id
    `);

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    const body = JSON.stringify(rows);
    fs.writeFileSync(OUTPUT, body);

    // created_at arrives as a Date; the newest one is the source cutoff of this export.
    const newest = rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), rows[0]?.created_at ?? null);
    fs.writeFileSync(MANIFEST, JSON.stringify({
        schema_version: SCHEMA_VERSION,
        generated_at: new Date().toISOString(),
        row_count: rows.length,
        latest_claim_at: newest ? new Date(newest).toISOString() : null,
        claims_sha256: crypto.createHash('sha256').update(body).digest('hex'),
        columns: rows.length ? Object.keys(rows[0]) : [],
    }, null, 2) + '\n');

    console.log(`Exported ${rows.length} claims to ${OUTPUT} (manifest: ${MANIFEST})`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
