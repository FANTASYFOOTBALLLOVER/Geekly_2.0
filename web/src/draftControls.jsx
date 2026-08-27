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
