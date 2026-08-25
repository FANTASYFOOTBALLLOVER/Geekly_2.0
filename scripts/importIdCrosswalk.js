// nflverse's historical stats are keyed by `gsis_id` (the NFL's own player ID),
// but our `players` table is keyed by Sleeper's `sleeper_id`. This script builds
// the bridge between them using nflverse's free, versioned roster files, which
// include both IDs side by side.
//
// Run this AFTER importPlayers.js: node scripts/importIdCrosswalk.js

import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { supabase } from '../lib/supabaseClient.js';

// Pull enough seasons back to cover most active players' careers.
// Adjust the range if you want to go back further.
const CURRENT_SEASON = 2026;
const SEASONS_BACK = 12;
const SEASONS = Array.from({ length: SEASONS_BACK }, (_, i) => CURRENT_SEASON - i);

async function fetchRosterCsv(season) {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  no roster file for ${season} (status ${res.status}), skipping`);
    return [];
  }
  const text = await res.text();
  return parse(text, { columns: true, skip_empty_lines: true });
}

async function importIdCrosswalk() {
  const crosswalk = new Map(); // sleeper_id -> gsis_id

  for (const season of SEASONS) {
    console.log(`Fetching roster crosswalk for ${season}...`);
    const rows = await fetchRosterCsv(season);
    for (const row of rows) {
      if (row.sleeper_id && row.gsis_id && !crosswalk.has(row.sleeper_id)) {
        crosswalk.set(row.sleeper_id, row.gsis_id);
      }
    }
  }

  console.log(`Built crosswalk for ${crosswalk.size} players. Updating players table...`);

  const entries = [...crosswalk.entries()];
  const BATCH = 25; // small concurrent batches so we don't hammer Supabase
  let updated = 0;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(([sleeper_id, gsis_id]) =>
        supabase.from('players').update({ gsis_id }).eq('sleeper_id', sleeper_id)
      )
    );
    results.forEach((r) => {
      if (r.error) console.warn('  update failed:', r.error.message);
      else updated++;
    });
    console.log(`  processed ${Math.min(i + BATCH, entries.length)}/${entries.length}`);
  }

  console.log(`Done. Updated gsis_id for ${updated} players.`);
}

importIdCrosswalk().catch((err) => {
  console.error('importIdCrosswalk failed:', err);
  process.exit(1);
});