// Pieces shared by the live Draft Room and the Mock Draft. Both screens run
// the same auction UI, so anything that governs how a bid is entered or how a
// week's fixture is written belongs here rather than being copied into each.

export const MAX_CONTRACT_WEEKS = 18; // no real "max contract length" setting exists yet — hardcoded per spec
export const MIN_BID = 1; // a team with less than this left for the week can't sign anyone else

export const STEPPER_BUTTON_STYLE = {
  width: 22, height: 22, padding: 0, borderRadius: '50%', lineHeight: 1,
  background: 'var(--color-button-bg)', border: '1px solid var(--color-border)',
  color: 'var(--color-text)', fontWeight: 'bold', flex: '0 0 auto',
};

// Bidding without having to type: the amount defaults to the smallest bid that
// would take the lead, +/- nudge it a dollar or a week at a time, and the
// button says what it will actually cost. The number fields still accept
// typing for anyone who'd rather jump straight to a figure.
export function BidControls({
  amountValue, weeksValue, highBid, capMax, isLeading, statSize, compact,
  onAmountChange, onWeeksChange, onSubmit,
}) {
  const minimumBid = highBid + MIN_BID;
  const nextBid = Number(amountValue) > 0 ? Number(amountValue) : minimumBid;
  const weeks = Number(weeksValue) > 0 ? Number(weeksValue) : 1;
  const canBid = !isLeading && nextBid > highBid && nextBid <= capMax;

  const nudgeAmount = (delta) => {
    const base = Number(amountValue) > 0 ? Number(amountValue) : minimumBid;
    onAmountChange(String(Math.max(0, Math.min(capMax, base + delta))));
  };
  const nudgeWeeks = (delta) => {
    onWeeksChange(String(Math.max(1, Math.min(MAX_CONTRACT_WEEKS, weeks + delta))));
  };

  const row = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 };

  return (
    <div style={{ width: '100%' }}>
      <div style={{ ...row, marginTop: 8, flexWrap: 'wrap', columnGap: 3 }}>
        <button type="button" disabled={isLeading} onClick={() => nudgeAmount(-1)} style={STEPPER_BUTTON_STYLE} title="Bid a dollar less">−</button>
        <span>$</span>
        <input
          type="number"
          disabled={isLeading}
          value={amountValue}
          placeholder={String(minimumBid)}
          onChange={(e) => {
            const raw = e.target.value;
            onAmountChange(raw === '' ? '' : String(Math.min(Number(raw) || 0, capMax)));
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && canBid) onSubmit(nextBid, weeks); }}
          style={{ width: compact ? 46 : 62, padding: '2px 4px', textAlign: 'center' }}
        />
        <button type="button" disabled={isLeading} onClick={() => nudgeAmount(1)} style={STEPPER_BUTTON_STYLE} title="Bid a dollar more">+</button>

        <span style={{ width: 6, flex: '0 0 auto' }} />

        <button type="button" disabled={isLeading} onClick={() => nudgeWeeks(-1)} style={STEPPER_BUTTON_STYLE} title="One week shorter">−</button>
        <input
          type="number"
          disabled={isLeading}
          value={weeksValue}
          placeholder="1"
          onChange={(e) => onWeeksChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canBid) onSubmit(nextBid, weeks); }}
          style={{ width: compact ? 36 : 48, padding: '2px 4px', textAlign: 'center' }}
        />
        <button type="button" disabled={isLeading} onClick={() => nudgeWeeks(1)} style={STEPPER_BUTTON_STYLE} title="One week longer">+</button>
        <span style={{ fontSize: statSize, color: '#fff' }}>
          {compact ? (weeks === 1 ? 'wk' : 'wks') : (weeks === 1 ? 'week' : 'weeks')}
        </span>
      </div>

      <button
        disabled={!canBid}
        onClick={() => onSubmit(nextBid, weeks)}
        style={{
          marginTop: 8, width: '100%', border: '3px solid white',
          background: isLeading ? 'var(--color-success)' : 'var(--color-button-bg)',
          color: isLeading ? '#111' : 'var(--color-text)', fontWeight: 'bold',
        }}
      >
        {isLeading ? 'Leading' : `Bid $${nextBid}`}
      </button>
    </div>
  );
}

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
