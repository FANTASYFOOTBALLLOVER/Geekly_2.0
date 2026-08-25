// Pulls every current QB/RB/WR/TE from Sleeper's free player API
// and upserts them into the `players` table in Supabase.
//
// Run this first: node scripts/importPlayers.js

import 'dotenv/config';
import { supabase } from '../lib/supabaseClient.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const SLEEPER_PLAYERS_URL = 'https://api.sleeper.app/v1/players/nfl';

async function importPlayers() {
  console.log('Fetching players from Sleeper...');
  const res = await fetch(SLEEPER_PLAYERS_URL);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  const allPlayers = await res.json();

  const rows = Object.values(allPlayers)
    .filter((p) => POSITIONS.includes(p.position))
    .map((p) => ({
      sleeper_id: p.player_id,
      full_name: p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      first_name: p.first_name ?? null,
      last_name: p.last_name ?? null,
      position: p.position,
      team: p.team ?? null,
      status: p.status ?? null,
      years_exp: p.years_exp ?? null,
    }));

  console.log(`Found ${rows.length} QB/RB/WR/TE players. Upserting into Supabase...`);

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'sleeper_id' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, rows.length)}/${rows.length}`);
  }

  console.log('Done. Players table is populated.');
}

importPlayers().catch((err) => {
  console.error('importPlayers failed:', err);
  process.exit(1);
});