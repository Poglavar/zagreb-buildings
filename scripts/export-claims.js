/**
 * export-claims.js — Export all user claims as JSON.
 *
 * Joins zagreb_building_claim with zagreb_building to include external IDs
 * so the export is self-contained (no dependency on internal serial IDs).
 *
 * Output: data/claims.json
 *
 * Usage:
 *   node scripts/export-claims.js
 */

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const OUTPUT = path.resolve(__dirname, '../data/claims.json');

async function main() {
    const { rows } = await pool.query(`
        SELECT
            c.id,
            b.cadastre_building_id,
            b.osm_building_id,
            c.field,
            c.value,
            c.source,
            c.source_url,
            c.created_at
        FROM zagreb_building_claim c
        JOIN zagreb_building b ON b.id = c.building_id
        ORDER BY c.id
    `);

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(rows));

    console.log(`Exported ${rows.length} claims to ${OUTPUT}`);
    await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
