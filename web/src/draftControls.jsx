// Pieces shared by the live Draft Room and the Mock Draft. Both screens run
// the same auction board, so anything that governs how a week's fixture is
// written belongs here rather than being copied into each.

export const MAX_CONTRACT_WEEKS = 18; // no real "max contract length" setting exists yet — hardcoded per spec
export const MIN_BID = 1; // a team with less than this left for the week can't sign anyone else

// "vs KC" at home, "@ KC" away, "BYE" on a bye week. Empty string when the
// schedule hasn't loaded yet or the player has no NFL team, so the caller can
// render the price on its own rather than a placeholder.
export function formatMatchup(scheduleByTeam, nflTeam, week) {
  if (!nflTeam) return '';
  const teamGames = scheduleByTeam[nflTeam];
  if (!teamGames) return '';
  const game = teamGames[week];
  if (!game) return 'BYE';
  return `${game.isHome ? 'vs' : '@'} ${game.opponent}`;
}

// --- Roster capacity ------------------------------------------------------
// A team may only bid on a player it could actually field. Dedicated position
// slots fill first; RB/WR/TE spill into FLEX; whatever is left over (QBs
// included) needs a SUPERFLEX or BENCH spot. If nothing is free, the player
// can't be signed — so the board must refuse the bid, opening bid included.

const REAL_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

// Turns a list of already-owned players into { QB: n, RB: n, ... }.
export function countByPosition(players, getPosition = (p) => p.player_position) {
  const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const p of players) {
    const pos = getPosition(p);
    if (counts[pos] !== undefined) counts[pos] += 1;
  }
  return counts;
}

// Would one more player at `position` still fit, given what's already rostered?
// `rosterSpec` is the league row (roster_qb, roster_flex, roster_bench, and the
// optional max_draft_* ceilings). A missing spec means we haven't loaded the
// league yet — allow the bid rather than blocking the whole board.
export function canFitPosition(rosterSpec, counts, position) {
  if (!rosterSpec) return true;
  if (!REAL_POSITIONS.includes(position)) return true;

  const next = { ...counts, [position]: (counts[position] || 0) + 1 };

  const drafted = rosterSpec[`max_draft_${position.toLowerCase()}`];
  if (drafted !== null && drafted !== undefined && drafted !== '' && next[position] > Number(drafted)) {
    return false;
  }

  // Split the overflow by where it is allowed to land.
  let flexNeed = 0;   // RB/WR/TE — FLEX, then SUPERFLEX/BENCH
  let wildNeed = 0;   // QB — SUPERFLEX/BENCH only
  for (const pos of REAL_POSITIONS) {
    const dedicated = Number(rosterSpec[`roster_${pos.toLowerCase()}`]) || 0;
    const overflow = Math.max(0, (next[pos] || 0) - dedicated);
    if (pos === 'QB') wildNeed += overflow;
    else flexNeed += overflow;
  }

  const flexSlots = Number(rosterSpec.roster_flex) || 0;
  const wildSlots = (Number(rosterSpec.roster_superflex) || 0) + (Number(rosterSpec.roster_bench) || 0);
  const spilloverToWild = Math.max(0, flexNeed - flexSlots) + wildNeed;
  return spilloverToWild <= wildSlots;
}

// Why a bid is refused, for the button's tooltip. Null when the bid is fine.
export function positionBlockedReason(rosterSpec, counts, position) {
  if (canFitPosition(rosterSpec, counts, position)) return null;
  const drafted = rosterSpec?.[`max_draft_${position.toLowerCase()}`];
  if (drafted !== null && drafted !== undefined && drafted !== '' && (counts[position] || 0) >= Number(drafted)) {
    return `You already have the maximum of ${drafted} ${position}${Number(drafted) === 1 ? '' : 's'}.`;
  }
  return `No roster slot left for another ${position}.`;
}
