// Downloads nflverse's full game schedule (every season, every game) and
// loads it into `games`. As a last step, calls populate_bye_weeks() so bye
// weeks get computed from the real schedule instead of entered by hand.
//
// Run any time after the schema is in place:
//   node scripts/importSchedule.js
//
// Re-run this if the schedule changes mid-season (flexed games, moved
// games) — it's a straight upsert, so it's always safe to run again.

import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { supabase } from '../lib/supabaseClient.js';

const SCHEDULE_URL =
  'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';

const CURRENT_SEASON = 2026;

function toNum(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

async function importSchedule() {
  console.log('Downloading nflverse schedules.csv...');
  const res = await fetch(SCHEDULE_URL);
  if (!res.ok) throw new Error(`Failed to fetch schedules.csv: ${res.status}`);
  const text = await res.text();

  console.log('Parsing CSV...');
  const rows = parse(text, { columns: true, skip_empty_lines: true });
  console.log(`Parsed ${rows.length} games across all seasons.`);

  const transformed = rows
    .filter((r) => r.game_id && r.home_team && r.away_team)
    .map((r) => ({
      game_id: r.game_id,
      season: toNum(r.season),
      week: toNum(r.week),
      season_type: r.game_type || 'REG',
      game_date: r.gameday || null,
      game_time: r.gametime || null,
      home_team: r.home_team,
      away_team: r.away_team,
    }));

  console.log('Upserting into games...');
  const CHUNK = 500;
  for (let i = 0; i < transformed.length; i += CHUNK) {
    const chunk = transformed.slice(i, i + CHUNK);
    const { error } = await supabase.from('games').upsert(chunk, { onConflict: 'game_id' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, transformed.length)}/${transformed.length}`);
  }

  console.log(`Computing bye weeks for season ${CURRENT_SEASON}...`);
  const { error: byeErr } = await supabase.rpc('populate_bye_weeks', { p_season: CURRENT_SEASON });
  if (byeErr) throw byeErr;

  console.log('Done. games is populated and bye_weeks is up to date.');
}

importSchedule().catch((err) => {
  console.error('importSchedule failed:', err);
  process.exit(1);
});