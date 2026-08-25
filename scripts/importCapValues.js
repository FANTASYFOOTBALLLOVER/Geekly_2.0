// Loads cap-values.csv (from generateCapValues.js) into player_cap_values.
// Matches by name, same approach as the other CSV import scripts.
//
// Usage: node scripts/importCapValues.js

import 'dotenv/config';
import fs from 'fs';
import { supabase } from '../lib/supabaseClient.js';

function normalizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Sleeper often stores names without Jr./Sr./II/III/IV — strip those as a
// fallback match when the exact name doesn't hit.
function stripSuffix(normalized) {
  return normalized.replace(/\s+(jr|sr|ii|iii|iv|v)$/, '').trim();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function findClosestMatch(name, candidateNames) {
  const key = normalizeName(name);
  let best = null, bestDist = Infinity;
  for (const candidate of candidateNames) {
    const dist = levenshtein(key, normalizeName(candidate));
    if (dist < bestDist) { bestDist = dist; best = candidate; }
  }
  return bestDist <= 3 ? { suggestion: best, distance: bestDist } : null;
}

function parseSimpleCsv(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { cells.push(current); current = ''; }
      else current += char;
    }
    cells.push(current);
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || '').trim()));
    return row;
  });
}

async function importCapValues() {
  console.log('Loading players from Supabase...');
  let players = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data: page, error: pageErr } = await supabase
      .from('players')
      .select('sleeper_id, full_name, team')
      .range(from, from + PAGE - 1);
    if (pageErr) throw pageErr;
    players = players.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }
  console.log(`Loaded ${players.length} players total.`);

  const byName = new Map();
  const byNameStripped = new Map();
  for (const p of players) {
    const key = normalizeName(p.full_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);

    const strippedKey = stripSuffix(key);
    if (!byNameStripped.has(strippedKey)) byNameStripped.set(strippedKey, []);
    byNameStripped.get(strippedKey).push(p);
  }

  console.log('Reading cap-values.csv...');
  const rows = parseSimpleCsv(fs.readFileSync('cap-values.csv', 'utf-8'));
  console.log(`Parsed ${rows.length} rows.`);

  const transformed = [];
  const unmatched = [];

  for (const r of rows) {
    const key = normalizeName(r.player_name);
    let candidates = byName.get(key) || [];

    if (candidates.length === 0) {
      candidates = byNameStripped.get(stripSuffix(key)) || [];
    }

    let match = null;
    if (candidates.length === 1) match = candidates[0];
    else if (candidates.length > 1) match = candidates[0]; // no team info in this CSV — first match

    if (!match) {
      unmatched.push(r.player_name);
      continue;
    }

    transformed.push({
      sleeper_id: match.sleeper_id,
      rank: r.rank ? Number(r.rank) : null,
      cap_percent: Number(r.cap_percent),
    });
  }

  if (unmatched.length > 0) {
    const allPlayerNames = players.map((p) => p.full_name);
    const auditLines = [`${unmatched.length} names in cap-values.csv weren't found in players:\n`];
    for (const name of unmatched) {
      const match = findClosestMatch(name, allPlayerNames);
      auditLines.push(
        match
          ? `"${name}"  ->  did you mean "${match.suggestion}"? (${match.distance} char${match.distance === 1 ? '' : 's'} different)`
          : `"${name}"  ->  no close match found among real players at all`
      );
    }
    fs.writeFileSync('unmatched-cap-values.txt', auditLines.join('\n'));
    console.warn(`${unmatched.length} unmatched — see unmatched-cap-values.txt for suggested fixes`);
  }

  // Same player can get matched twice (e.g. once via the ranked list with
  // a suffix, once via the "everyone else" 0% dump using the DB's
  // unsuffixed name) — dedupe, always keeping the real ranked entry.
  const bySleeperId = new Map();
  for (const row of transformed) {
    const existing = bySleeperId.get(row.sleeper_id);
    if (!existing || (existing.rank === null && row.rank !== null)) {
      bySleeperId.set(row.sleeper_id, row);
    }
  }
  const deduped = [...bySleeperId.values()];
  if (deduped.length < transformed.length) {
    console.log(`Deduped ${transformed.length - deduped.length} duplicate player matches.`);
  }

  console.log(`Upserting ${deduped.length} matched rows into player_cap_values...`);
  const CHUNK = 500;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    const { error } = await supabase.from('player_cap_values').upsert(chunk, { onConflict: 'sleeper_id' });
    if (error) throw error;
    console.log(`  upserted ${Math.min(i + CHUNK, deduped.length)}/${deduped.length}`);
  }

  console.log('Done.');
}

importCapValues().catch((err) => {
  console.error('importCapValues failed:', err);
  process.exit(1);
});