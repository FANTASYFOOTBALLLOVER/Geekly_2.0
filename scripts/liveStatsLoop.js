// Meant to be triggered by a scheduler (GitHub Actions), not run by hand.
// Auto-detects the current season/week from Sleeper's own state endpoint,
// then polls live stats repeatedly for a bounded window before exiting —
// this way a cron trigger firing every ~5 minutes still gets near-
// continuous coverage without the job running forever between triggers.

import 'dotenv/config';
import { supabase } from '../lib/supabaseClient.js';

const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
const POLL_INTERVAL_MS = 45_000;       // poll every 45 seconds
const RUN_DURATION_MS = 4.5 * 60_000;  // stay alive ~4.5 minutes, then exit

function toNum(val) {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
}

async function getCurrentSeasonWeek() {
  const res = await fetch('https://api.sleeper.app/v1/state/nfl');
  if (!res.ok) throw new Error(`Failed to fetch NFL state: ${res.status}`);
  const state = await res.json();
  return { season: Number(state.season), week: Number(state.week), seasonType: state.season_type };
}

function buildStatsUrl(season, week) {
  const params = new URLSearchParams({ season_type: 'regular' });
  POSITIONS.forEach((pos) => params.append('position[]', pos));
  return `https://api.sleeper.app/stats/nfl/${season}/${week}?${params.toString()}`;
}

async function pollOnce(season, week, knownSleeperIds, gsisBySleeperId) {
  const res = await fetch(buildStatsUrl(season, week));
  if (!res.ok) {
    console.warn(`Sleeper stats API returned ${res.status}, skipping this poll`);
    return;
  }
  const data = await res.json();
  const rows = Array.isArray(data) ? data : [];

  const transformed = rows
    .filter((r) => knownSleeperIds.has(String(r.player_id)))
    .map((r) => {
      const s = r.stats || {};
      return {
        sleeper_id: String(r.player_id),
        gsis_id: gsisBySleeperId.get(String(r.player_id)) || null,
        season,
        week,
        season_type: 'REG',
        team: r.team || null,
        opponent_team: r.opponent || null,
        completions: toNum(s.pass_cmp),
        attempts: toNum(s.pass_att),
        passing_yards: toNum(s.pass_yd),
        passing_tds: toNum(s.pass_td),
        interceptions: toNum(s.pass_int),
        rushing_attempts: toNum(s.rush_att),
        rushing_yards: toNum(s.rush_yd),
        rushing_tds: toNum(s.rush_td),
        receptions: toNum(s.rec),
        targets: toNum(s.rec_tgt),
        receiving_yards: toNum(s.rec_yd),
        receiving_tds: toNum(s.rec_td),
        fumbles_lost: toNum(s.fum_lost),
      };
    });

  if (transformed.length === 0) return;

  const { error } = await supabase
    .from('weekly_stats')
    .upsert(transformed, { onConflict: 'gsis_id,season,week,season_type' });
  if (error) throw error;

  console.log(`[${new Date().toISOString()}] upserted ${transformed.length} rows for week ${week}`);
}

async function run() {
  let players = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('sleeper_id, gsis_id')
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  const knownSleeperIds = new Set(players.map((p) => p.sleeper_id));
  const gsisBySleeperId = new Map(players.map((p) => [p.sleeper_id, p.gsis_id]));

  const { season, week, seasonType } = await getCurrentSeasonWeek();
  console.log(`Detected season ${season}, week ${week}, type ${seasonType}`);

  if (seasonType !== 'regular' && seasonType !== 'post') {
    console.log('Not currently in season — nothing to poll. Exiting.');
    return;
  }

  const stopAt = Date.now() + RUN_DURATION_MS;
  while (Date.now() < stopAt) {
    await pollOnce(season, week, knownSleeperIds, gsisBySleeperId);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('Loop window finished, exiting cleanly.');
}

run().catch((err) => {
  console.error('liveStatsLoop failed:', err);
  process.exit(1);
});