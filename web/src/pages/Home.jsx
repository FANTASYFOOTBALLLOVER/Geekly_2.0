import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { canFitPosition, countByPosition } from '../draftControls';
import { useHoldToFullscreen } from '../holdToFullscreen';
import geeklyLogo from '../assets/final-logo-geekly.png';
import { NFL_TEAM_COLORS } from '../constants/teamColors';
const SHIELD_PATH = 'M50 8 Q40 14 30 20 Q20 26 12 15 Q2 20 5 45 Q8 90 50 118 Q92 90 95 45 Q98 20 88 15 Q80 26 70 20 Q60 14 50 8 Z';

const MAX_TEAM_NAME_LENGTH = 20;
const LAST_LEAGUE_KEY = 'geekly:lastLeagueId';

const GENERAL_SETTINGS_COLUMNS =
  'name, is_public, bonus_win_top_half, num_teams, relegation_tiers, season_weeks, promote_relegate_count, salary_cap, ir_voids_contract, relegation_enabled';
const GENERAL_SETTINGS_FIELDS = [
  'name', 'is_public', 'bonus_win_top_half', 'num_teams', 'relegation_tiers',
  'season_weeks', 'promote_relegate_count', 'salary_cap', 'ir_voids_contract',
];

function fieldsThatDidNotStick(submitted, saved, fields) {
  return fields.filter((f) => {
    const want = submitted[f];
    const got = saved[f];
    if (typeof got === 'boolean' || typeof want === 'boolean') return Boolean(want) !== Boolean(got);
    if (want === null || want === undefined || want === '') return false;
    if (!Number.isNaN(Number(want)) && !Number.isNaN(Number(got))) return Number(want) !== Number(got);
    return String(want) !== String(got);
  });
}

function Crest({ pattern, color1, color2, size = 40, onClick, title, empty = false }) {
  const clipId = `shield-clip-${pattern}-${(color1 || '').replace('#', '')}-${(color2 || '').replace('#', '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined} title={title}>
      {!empty && (
        <>
          <defs>
            <clipPath id={clipId}>
              <path d={SHIELD_PATH} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {pattern === 'solid' && <rect x="0" y="0" width="100" height="120" fill={color1} />}
            {pattern === 'vertical' && (
              <>
                <rect x="0" y="0" width="50" height="120" fill={color1} />
                <rect x="50" y="0" width="50" height="120" fill={color2} />
              </>
            )}
            {pattern === 'checkered' && (
              <>
                <rect x="0" y="0" width="50" height="60" fill={color1} />
                <rect x="50" y="0" width="50" height="60" fill={color2} />
                <rect x="0" y="60" width="50" height="60" fill={color2} />
                <rect x="50" y="60" width="50" height="60" fill={color1} />
              </>
            )}
            {pattern === 'diagonal' && (
              <>
                <rect x="0" y="0" width="100" height="120" fill={color2} />
                <polygon points="0,0 100,0 100,120" fill={color1} />
              </>
            )}
          </g>
        </>
      )}
      <path d={SHIELD_PATH} fill="none" stroke="var(--color-border)" strokeWidth="3" />
    </svg>
  );
}

function ProfileMenu({ onLogout, onChangeUsername, onChangePassword, onCustomizeCrest }) {
  return (
    <div className="profile-menu">
      <button onClick={onChangeUsername}>Change username</button>
      <button onClick={onChangePassword}>Change password</button>
      <button onClick={onCustomizeCrest}>Customize crest</button>
      <button onClick={onLogout}>Log out</button>
    </div>
  );
}

const DEFAULT_TIER_COLORS = [
  'var(--color-pos-rb)', 'var(--color-pos-wr)', 'var(--color-pos-te)', 'var(--color-pos-qb)',
  '#fff', '#fff', '#fff', '#fff',
];

const POSITION_SLOT_COLORS = {
  QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)',
  TE: 'var(--color-pos-te)', FLEX: '#8ab4ff', SFLEX: '#b48ee0', BENCH: '#6b6b7a',
};

const SLOT_BADGE_LABEL = { BENCH: 'BE', SFLEX: 'SF', FLEX: 'FL' };
const RANKING_POSITION_COLORS = { QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)', TE: 'var(--color-pos-te)' };

function easternWallClockToUTCISOStringHelper(dateTimeLocalStr) {
  const [datePart, timePart] = dateTimeLocalStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(guessUTC);
  const get = (type) => nyParts.find((p) => p.type === type).value;
  const nyAsUTC = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(get('hour')) === 24 ? 0 : Number(get('hour')), Number(get('minute')), Number(get('second'))
  );
  const offsetMs = guessUTC.getTime() - nyAsUTC;
  return new Date(guessUTC.getTime() + offsetMs).toISOString();
}

function getNextTuesday7amET(fromDate) {
  const nyParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(fromDate);
  const get = (type) => nyParts.find((p) => p.type === type).value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const nyToday = weekdayMap[get('weekday')];
  const dayDiff = (2 - nyToday + 7) % 7;
  const candidateDate = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  candidateDate.setUTCDate(candidateDate.getUTCDate() + dayDiff);
  const pad = (n) => String(n).padStart(2, '0');
  const candidateStr = `${candidateDate.getUTCFullYear()}-${pad(candidateDate.getUTCMonth() + 1)}-${pad(candidateDate.getUTCDate())}T07:00`;
  let target = new Date(easternWallClockToUTCISOStringHelper(candidateStr));
  if (target.getTime() <= fromDate.getTime()) {
    candidateDate.setUTCDate(candidateDate.getUTCDate() + 7);
    const candidateStr2 = `${candidateDate.getUTCFullYear()}-${pad(candidateDate.getUTCMonth() + 1)}-${pad(candidateDate.getUTCDate())}T07:00`;
    target = new Date(easternWallClockToUTCISOStringHelper(candidateStr2));
  }
  return target;
}

function getCurrentLeagueWeek(initialDraftAt, now) {
  if (!initialDraftAt) return 1;
  const draftDate = new Date(initialDraftAt);
  const week1End = getNextTuesday7amET(draftDate);
  if (now.getTime() < week1End.getTime()) return 1;
  const weeksSince = Math.floor((now.getTime() - week1End.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return 2 + weeksSince;
}

function contractCostAtWeek(signing, week) {
  const weeksElapsed = week - signing.start_week;
  const cost = signing.base_value * (1 + weeksElapsed * signing.interest_rate_applied);
  const weeksRemaining = signing.weeks_requested - weeksElapsed;
  return { cost, weeksRemaining };
}

function buildPieSlices(segments, size) {
  const nonZero = segments.filter((s) => s.value > 0);
  if (nonZero.length <= 1) {
    return [{ path: null, color: nonZero.length === 1 ? nonZero[0].color : '#000', meta: nonZero.length === 1 ? nonZero[0].meta : null }];
  }
  const total = nonZero.reduce((sum, s) => sum + s.value, 0);
  const r = size / 2;
  let angleStart = -90;
  const slices = [];
  for (const seg of nonZero) {
    const angle = (seg.value / total) * 360;
    const angleEnd = angleStart + angle;
    const startRad = (angleStart * Math.PI) / 180;
    const endRad = (angleEnd * Math.PI) / 180;
    const x1 = r + r * Math.cos(startRad);
    const y1 = r + r * Math.sin(startRad);
    const x2 = r + r * Math.cos(endRad);
    const y2 = r + r * Math.sin(endRad);
    const largeArc = angle > 180 ? 1 : 0;
    const path = `M ${r} ${r} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slices.push({ path, color: seg.color, meta: seg.meta });
    angleStart = angleEnd;
  }
  return slices;
}

function tierDisplayColor(tierNumber, tierColor) {
  if (tierColor && tierColor !== '#888888') return tierColor;
  return DEFAULT_TIER_COLORS[tierNumber - 1] || '#fff';
}

function generateRoundRobinSchedule(numTeams, numWeeks) {
  const slots = [];
  for (let i = 1; i <= numTeams; i++) slots.push(i);
  if (numTeams % 2 !== 0) slots.push(0);

  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  const n = slots.length;
  const roundsPerCycle = n - 1;

  const rounds = [];
  let arr = slots.slice();
  for (let r = 0; r < roundsPerCycle; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== 0 && b !== 0) pairs.push([a, b]);
    }
    rounds.push(pairs);
    const fixed = arr[0];
    const rest = arr.slice(1);
    rest.unshift(rest.pop());
    arr = [fixed, ...rest];
  }

  const schedule = [];
  for (let week = 1; week <= numWeeks; week++) {
    const roundIndex = (week - 1) % roundsPerCycle;
    for (const [slot1, slot2] of rounds[roundIndex]) {
      schedule.push({ week, slot1, slot2 });
    }
  }
  return schedule;
}

const FA_SEASON = 2026;
const DEAD_CAP_RATE = 0.80;
const FA_PAGE_SIZE = 60;

function contractCostInWeek(contract, week) {
  const weeksElapsed = week - contract.start_week;
  return Number(contract.base_value) * (1 + weeksElapsed * Number(contract.interest_rate_applied || 0));
}

function deadCapSchedule(contract, week) {
  const rows = [];
  for (let w = week; w <= Number(contract.end_week); w++) {
    rows.push({ week: w, cost: contractCostInWeek(contract, w) * DEAD_CAP_RATE });
  }
  return rows;
}

function FreeAgentBoard({ league, week, rosterSpec, onSigned }) {
  const [freeAgents, setFreeAgents] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [faError, setFaError] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(FA_PAGE_SIZE);
  const [target, setTarget] = useState(null);
  const [cutId, setCutId] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!league) return;
    setLoading(true);
    const [{ data: fa, error: faErr }, { data: mine, error: mineErr }] = await Promise.all([
      supabase.rpc('get_free_agents', { p_league_id: league.league_id, p_season: FA_SEASON }),
      supabase.rpc('get_team_contracts', { p_team_id: league.team_id, p_season: FA_SEASON }),
    ]);
    setLoading(false);
    if (faErr || mineErr) { setFaError((faErr || mineErr).message); return; }
    setFaError('');
    setFreeAgents(fa || []);
    setContracts(mine || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league?.league_id]);

  const positions = ['QB', 'RB', 'WR', 'TE'];
  const filtered = freeAgents.filter((p) => {
    const matchesPos = positionFilter === 'ALL' || p.player_position === positionFilter;
    const matchesSearch = !search || p.full_name.toLowerCase().includes(search.toLowerCase());
    return matchesPos && matchesSearch;
  });

  function cutMakesRoom(contract) {
    if (!target) return false;
    const remaining = contracts.filter((c) => c.signing_id !== contract.signing_id);
    return canFitPosition(rosterSpec, countByPosition(remaining), target.player_position);
  }

  async function handleSign() {
    if (!target || !cutId) return;
    setBusy(true);
    const { error } = await supabase.rpc('sign_free_agent', {
      p_team_id: league.team_id,
      p_sleeper_id: target.sleeper_id,
      p_cut_signing_id: cutId,
      p_week: week,
      p_season: FA_SEASON,
    });
    setBusy(false);
    if (error) { setFaError(error.message); return; }
    setFaError('');
    setTarget(null);
    setCutId(null);
    await load();
    if (onSigned) onSigned();
  }

  const chosenCut = contracts.find((c) => c.signing_id === cutId) || null;
  const deadRows = chosenCut ? deadCapSchedule(chosenCut, week) : [];
  const deadTotal = deadRows.reduce((sum, r) => sum + r.cost, 0);

  return (
    <div style={{ marginTop: 24, borderTop: '1px solid var(--color-border-subtle)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <strong style={{ marginRight: 4 }}>Add Players</strong>
        <input
          type="text"
          placeholder="Search free agents..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setVisible(FA_PAGE_SIZE); }}
          style={{ flex: '0 1 260px', borderRadius: 10 }}
        />
        <button
          onClick={() => { setPositionFilter('ALL'); setVisible(FA_PAGE_SIZE); }}
          title="All positions"
          style={{
            width: 32, height: 32, borderRadius: '50%', padding: 0, background: '#000',
            border: positionFilter === 'ALL' ? '2px solid #ff1493' : '2px solid #fff',
            color: '#fff', fontSize: '0.6rem', fontWeight: 'bold',
          }}
        >
          ALL
        </button>
        {positions.map((pos) => (
          <button
            key={pos}
            onClick={() => { setPositionFilter(pos); setVisible(FA_PAGE_SIZE); }}
            title={pos}
            style={{
              width: 32, height: 32, borderRadius: '50%', padding: 0,
              background: POSITION_SLOT_COLORS[pos],
              border: positionFilter === pos ? '2px solid #ff1493' : '2px solid transparent',
              color: '#111', fontSize: '0.65rem', fontWeight: 'bold',
            }}
          >
            {pos}
          </button>
        ))}
        <span className="muted-text" style={{ fontSize: '0.72rem', marginLeft: 'auto' }}>
          One week, free — but you have to cut somebody and eat {Math.round(DEAD_CAP_RATE * 100)}% of their remaining weeks.
        </span>
      </div>

      {faError && <div className="error-text" style={{ marginBottom: 8 }}>{faError}</div>}
      {loading && <div className="muted-text">Loading free agents...</div>}
      {!loading && filtered.length === 0 && (
        <div className="muted-text">No free agents match that filter.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {filtered.slice(0, visible).map((p) => (
          <div
            key={p.sleeper_id}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: 8, minWidth: 0,
              border: '1px solid var(--color-border-subtle)', borderRadius: 8,
              background: 'var(--color-bg-input)',
            }}
          >
            <img
              src={`https://sleepercdn.com/content/nfl/players/${p.sleeper_id}.jpg`}
              alt={p.full_name}
              onError={(e) => { e.target.style.visibility = 'hidden'; }}
              style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: 'var(--color-avatar-fallback)', flex: '0 0 auto' }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.full_name}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: NFL_TEAM_COLORS[p.team] || 'var(--color-text-muted)' }}>
                {p.player_position} – {p.team || 'FA'}
              </div>
            </div>
            <span className="muted-text" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
              ${Number(p.dollar_value).toFixed(0)}
            </span>
            <button
              onClick={() => { setTarget(p); setCutId(null); setFaError(''); }}
              title={`Sign ${p.full_name} for week ${week}`}
              style={{
                width: 28, height: 28, borderRadius: '50%', padding: 0, flex: '0 0 auto',
                background: 'var(--color-success)', color: '#111', border: 'none',
                fontWeight: 'bold', fontSize: '1.1rem', lineHeight: 1,
              }}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {filtered.length > visible && (
        <button
          onClick={() => setVisible((v) => v + FA_PAGE_SIZE)}
          style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline', padding: 0, cursor: 'pointer' }}
        >
          Show more ({filtered.length - visible} left)
        </button>
      )}

      {target && (
        <div
          className="modal-overlay"
          data-no-fullscreen
          style={{ zIndex: 500 }}
          onClick={() => setTarget(null)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Sign {target.full_name} for week {week}</h3>
            <p className="muted-text" style={{ marginTop: -6 }}>
              A one-week deal at no cost. Pick the contract you're cutting to make room —
              {' '}{Math.round(DEAD_CAP_RATE * 100)}% of every week it had left still counts against your cap.
            </p>

            <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>
              {contracts.length === 0 && <div className="muted-text">You have no contracts to cut.</div>}
              {contracts.map((c) => {
                const makesRoom = cutMakesRoom(c);
                const total = deadCapSchedule(c, week).reduce((sum, r) => sum + r.cost, 0);
                return (
                  <label
                    key={c.signing_id}
                    style={{
                      display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 8, alignItems: 'center',
                      padding: '6px 4px', borderBottom: '1px solid var(--color-border-subtle)',
                      opacity: makesRoom ? 1 : 0.45, cursor: makesRoom ? 'pointer' : 'not-allowed',
                    }}
                    title={makesRoom ? undefined : `Cutting ${c.full_name} still leaves nowhere to put a ${target.player_position}.`}
                  >
                    <input
                      type="radio"
                      name="cut-choice"
                      disabled={!makesRoom}
                      checked={cutId === c.signing_id}
                      onChange={() => setCutId(c.signing_id)}
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 'bold' }}>{c.full_name}</span>{' '}
                      <span className="muted-text" style={{ fontSize: '0.75rem' }}>
                        {c.player_position} – {c.team} · wks {c.start_week}–{c.end_week}
                      </span>
                    </span>
                    <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      dead ${total.toFixed(2)}
                    </span>
                  </label>
                );
              })}
            </div>

            {chosenCut && (
              <div style={{ marginTop: 12 }}>
                <div className="scoring-subheading" style={{ marginTop: 0 }}>
                  Dead cap from cutting {chosenCut.full_name}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: '0.75rem' }}>
                  {deadRows.map((r) => (
                    <span key={r.week} className="muted-text">
                      Wk {r.week}: <strong style={{ color: 'var(--color-error)' }}>${r.cost.toFixed(2)}</strong>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontWeight: 'bold' }}>
                  Total dead cap: <span style={{ color: 'var(--color-error)' }}>${deadTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button
                disabled={!cutId || busy}
                onClick={handleSign}
                style={{ background: 'var(--color-success)', color: '#111', fontWeight: 'bold' }}
              >
                {busy ? 'Signing...' : `Cut & Sign`}
              </button>
              <button onClick={() => setTarget(null)}>Cancel</button>
            </div>
            {faError && <div className="error-text" style={{ marginTop: 8 }}>{faError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

const STOCK_SEASON = 2026;
const STOCK_ROTATE_MS = 10000;
const STOCK_UP_COLOR = 'var(--color-success)';
const STOCK_DOWN_COLOR = 'var(--color-error)';
const STOCK_POSITION_COLORS = { QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)', TE: 'var(--color-pos-te)' };

function stockPlaceholder(seed) {
  let first = Math.sin(seed * 12.9898) * 43758.5453;
  let second = Math.sin((seed + 17) * 78.233) * 43758.5453;
  first -= Math.floor(first);
  second -= Math.floor(second);
  const normal = Math.sqrt(-2 * Math.log(Math.max(first, 0.0001))) * Math.cos(2 * Math.PI * second);
  return Math.max(-45, Math.min(45, normal * 15));
}

function stockMovement(row, index = 0) {
  const today = Number(row.today_dollars);
  const lastWeek = Number(row.yesterday_dollars);
  if (lastWeek > 0 && today > 0 && today !== lastWeek) return { percent: ((today / lastWeek) - 1) * 100, placeholder: false };
  return { percent: stockPlaceholder(index + String(row.stock_code || '').length), placeholder: true };
}

function StockSparkline({ series, color, height = 44 }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const points = (series || []).map((d) => Number(d.amount) || 0);
  if (points.length < 2) return <div style={{ height }} />;

  const width = 100;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const coords = points.map((v, i) => [i * step, height - ((v - min) / span) * (height - 6) - 3]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const [lastX, lastY] = coords[coords.length - 1];
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: '65%', display: 'block', cursor: 'crosshair' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const idx = Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1))));
          setHoverIdx(idx);
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={color} opacity="0.16" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
        {hoverIdx !== null && (
          <>
            <line x1={coords[hoverIdx][0]} y1="0" x2={coords[hoverIdx][0]} y2={height} stroke={color} strokeWidth="1" opacity="0.4" vectorEffect="non-scaling-stroke" />
            <circle cx={coords[hoverIdx][0]} cy={coords[hoverIdx][1]} r=".65" fill="#fff" stroke={color} strokeWidth="1.5" />
          </>
        )}
      </svg>
      {hovered && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: `${(hoverIdx / (points.length - 1)) * 100}%`,
            transform: 'translateX(-50%)', marginBottom: 4, whiteSpace: 'nowrap',
            background: 'var(--color-bg-input)', border: `1px solid ${color}`, borderRadius: 6,
            padding: '4px 8px', fontSize: '0.7rem', pointerEvents: 'none', zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 'bold' }}>${Number(hovered.amount).toFixed(2)}</div>
          <div className="muted-text">{new Date(hovered.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
        </div>
      )}
    </div>
  );
}

function PlayerStockModal({ player, stats, onClose }) {
  const teamColor = NFL_TEAM_COLORS[player.team] || 'var(--color-text)';
  const seasonsWithStats = [...new Set((stats || []).map((row) => Number(row.season)))].filter((season) => season >= 2021 && season <= STOCK_SEASON);
  const firstSeason = Math.min(...seasonsWithStats, STOCK_SEASON);
  const [season, setSeason] = useState(STOCK_SEASON);
  const seasonStats = (stats || []).filter((row) => Number(row.season) === season);
  const teams = [...new Set([player.team, ...seasonStats.map((row) => row.team)].filter(Boolean))];
  const schedule = (player.games || []).filter((game) => Number(game.season) === season && (teams.includes(game.home_team) || teams.includes(game.away_team))).sort((a, b) => a.week - b.week);
  const statByWeek = Object.fromEntries(seasonStats.map((row) => [row.week, row]));
  const value = (row, field) => row ? (row[field] ?? 0) : '-';
  const values = (player.series || []).map((point) => Number(point.amount) || 0);
  const min = values.length ? Math.min(...values) : 0;
  const span = values.length ? Math.max(...values) - min || 1 : 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - ((value - min) / span) * 28}`).join(' ');
  return (
    <div className="modal-overlay stock-player-overlay" onClick={onClose}>
      <div className="stock-player-modal" onClick={(event) => event.stopPropagation()}>
        <button className="stock-player-close" onClick={onClose} aria-label="Close player details">×</button>
        <div className="stock-player-header">
          <img src={`https://sleepercdn.com/content/nfl/players/${player.sleeper_id}.jpg`} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
          <div>
            <h3 style={{ color: teamColor }}>{player.full_name || player.stock_code}</h3>
            <div style={{ color: teamColor }}>{player.team || 'FA'} · {player.player_position || player.position || '—'}</div>
            <strong style={{ color: STOCK_POSITION_COLORS[player.player_position] || 'var(--color-text)' }}>{player.stock_code}</strong>
          </div>
        </div>
        <div className="stock-season-picker"><select value={season} onChange={(event) => setSeason(Number(event.target.value))}>{Array.from({ length: STOCK_SEASON - 2021 + 1 }, (_, index) => STOCK_SEASON - index).map((year) => <option key={year} value={year} disabled={year < firstSeason}>{year}</option>)}</select></div>
      {values.length > 1 ? <svg className="stock-detail-graph" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="var(--color-pos-rb)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg> : <div className="stock-detail-no-chart">No price history yet</div>}
        <div className="stock-player-stats"><table><thead><tr><th>Wk</th><th>Opponent</th><th>Cmp</th><th>Att</th><th>Pass Yds</th><th>Pass TD</th><th>INT</th><th>Rush Att</th><th>Rush Yds</th><th>Rush TD</th><th>Targets</th><th>Rec</th><th>Rec Yds</th><th>Rec TD</th><th>Total Yds</th><th>Total TD</th><th>Fum</th></tr></thead><tbody>
          {Array.from({ length: 18 }, (_, index) => index + 1).map((week) => { const row = statByWeek[week]; const game = schedule.find((item) => Number(item.week) === week); const opponent = game ? (teams.includes(game.home_team) ? game.away_team : game.home_team) : (row?.opponent_team || '—'); const totalYards = player.player_position === 'QB' ? '—' : Number(row?.rushing_yards || 0) + Number(row?.receiving_yards || 0); const totalTds = player.player_position === 'QB' ? '—' : Number(row?.rushing_tds || 0) + Number(row?.receiving_tds || 0); return <tr key={week}><td>{week}</td><td>{opponent}</td><td>{value(row, 'completions')}</td><td>{value(row, 'attempts')}</td><td>{value(row, 'passing_yards')}</td><td>{value(row, 'passing_tds')}</td><td>{value(row, 'interceptions')}</td><td>{value(row, 'rushing_attempts')}</td><td>{value(row, 'rushing_yards')}</td><td>{value(row, 'rushing_tds')}</td><td>{value(row, 'targets')}</td><td>{value(row, 'receptions')}</td><td>{value(row, 'receiving_yards')}</td><td>{value(row, 'receiving_tds')}</td><td>{totalYards}</td><td>{totalTds}</td><td>{value(row, 'fumbles_lost')}</td></tr>; })}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}

function StockCard({ mover }) {
  const movement = stockMovement(mover);
  const up = movement.percent >= 0;
  const color = up ? STOCK_UP_COLOR : STOCK_DOWN_COLOR;
  return (
    <div
      className="stock-card"
      style={{
        border: '1px solid rgba(190, 190, 190, 0.35)', borderRadius: 8, padding: 8,
        background: 'var(--color-bg-input)', display: 'flex', flexDirection: 'column',
        gap: 4, minWidth: 0, overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
        <span className="stock-quote-normal"><strong style={{ fontSize: '1rem', color: STOCK_POSITION_COLORS[mover.player_position] || 'var(--color-text)' }}>{mover.stock_code}</strong> <span style={{ color, fontWeight: 'bold' }}>{Math.abs(movement.percent).toFixed(1)}% {up ? '▲' : '▼'}</span></span>
        <span className="stock-quote-hover"><strong style={{ color: NFL_TEAM_COLORS[mover.team] || 'var(--color-text)' }}>{mover.full_name || mover.stock_code}</strong> <span style={{ color: STOCK_POSITION_COLORS[mover.player_position] || 'var(--color-text)' }}>({mover.stock_code})</span> <span style={{ color, fontWeight: 'bold' }}>{Math.abs(movement.percent).toFixed(1)}% {up ? '▲' : '▼'}</span></span>
      </div>
    </div>
  );
}

function PlayerStockBoard({ expanded, teamId }) {
  const [movers, setMovers] = useState([]);
  const [stockError, setStockError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState({});

  function openPlayer(player) {
    setSelectedPlayer(player);
    if (playerStats[player.sleeper_id]) return;
    Promise.all([
      supabase.from('weekly_stats').select('season, week, team, opponent_team, passing_yards, passing_tds, rushing_yards, rushing_tds, receiving_yards, receiving_tds, receptions, completions, attempts, interceptions, rushing_attempts, targets, fumbles_lost').eq('sleeper_id', player.sleeper_id).in('season', [2021, 2022, 2023, 2024, 2025, STOCK_SEASON]).order('season', { ascending: true }).order('week', { ascending: true }),
      supabase.from('games').select('season, week, home_team, away_team').gte('season', 2021).lte('season', STOCK_SEASON).eq('season_type', 'REG'),
    ]).then(([{ data: stats }, { data: games }]) => { setPlayerStats((current) => ({ ...current, [player.sleeper_id]: stats || [] })); player.games = games || []; setSelectedPlayer({ ...player }); });
  }

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('refresh_player_draft_stock', { p_season: STOCK_SEASON })
      .then(() => Promise.all([
        supabase.rpc('get_player_stock_movers', {
          p_season: STOCK_SEASON, p_team_id: teamId, p_limit: 100, p_history_days: 14,
        }),
        supabase.rpc('get_stock_ticker', { p_season: STOCK_SEASON }),
      ]))
      .then(([{ data, error: moversErr }, { data: ticker }]) => {
        if (cancelled) return;
        setLoaded(true);
        if (moversErr) { setStockError(moversErr.message); return; }
        const codes = Object.fromEntries((ticker || []).map((row) => [row.sleeper_id, row.stock_code]));
        setMovers((data || []).map((player) => ({ ...player, stock_code: player.stock_code || codes[player.sleeper_id] })).filter((player) => player.stock_code));
      });
    return () => { cancelled = true; };
  }, [teamId]);

  const codedMovers = movers.filter((m) => m.stock_code);
  const risers = codedMovers.filter((m, index) => stockMovement(m, index).percent >= 0);
  const fallers = codedMovers.filter((m, index) => stockMovement(m, index).percent < 0);
  const rotates = !expanded && (risers.length + fallers.length) > 0;

  useEffect(() => {
    if (!rotates) return undefined;
    const interval = setInterval(() => setRotation((r) => r + 1), STOCK_ROTATE_MS);
    return () => clearInterval(interval);
  }, [rotates]);

  const combined = [...risers, ...fallers];
  const [sort, setSort] = useState('value');
  const growth = (row) => stockMovement(row, codedMovers.indexOf(row)).percent;
  const sorted = [...combined].sort((a, b) => {
    if (sort === 'position') return String(a.player_position).localeCompare(String(b.player_position)) || String(a.full_name).localeCompare(String(b.full_name));
    if (sort === 'team') return String(a.team || 'FA').localeCompare(String(b.team || 'FA')) || String(a.full_name).localeCompare(String(b.full_name));
    if (sort === 'name') return String(a.full_name).localeCompare(String(b.full_name));
    if (sort === 'risers') return growth(b) - growth(a);
    if (sort === 'fallers') return growth(a) - growth(b);
    return Number(b.today_dollars) - Number(a.today_dollars);
  });
  const shown = expanded ? sorted : (sorted.length > 0 ? [sorted[rotation % sorted.length]] : []);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Player Stock</strong>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort player stock" style={{ width: 135, fontSize: '0.7rem', padding: '4px 24px 4px 6px' }}>
          <option value="value">Overall value</option>
          <option value="position">Position</option>
          <option value="team">Team</option>
          <option value="name">Name</option>
          <option value="risers">Biggest risers</option>
          <option value="fallers">Biggest fallers</option>
        </select>
      </div>

      {stockError && <div className="error-text" style={{ fontSize: '0.75rem' }}>{stockError}</div>}

      {!stockError && loaded && shown.length === 0 && (
        <div className="muted-text" style={{ fontSize: '0.8rem' }}>
          No movement yet — stock starts moving once leagues begin signing players.
        </div>
      )}

      {shown.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: expanded ? 'repeat(auto-fill, minmax(230px, 1fr))' : '1fr',
          gap: 8,
        }}>
          {shown.map((m) => (
            <div key={`${m.direction}-${m.sleeper_id}`} className="stock-hover-wrap" onClick={() => openPlayer(m)}>
              <StockCard mover={m} />
            </div>
          ))}
        </div>
      )}
      {selectedPlayer && <PlayerStockModal player={selectedPlayer} stats={playerStats[selectedPlayer.sleeper_id]} onClose={() => setSelectedPlayer(null)} />}
    </>
  );
}

function StockTicker() {
  const [rows, setRows] = useState([]);
  const [tickerError, setTickerError] = useState('');
  const [sort, setSort] = useState('value');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState({});

  function openPlayer(player) {
    setSelectedPlayer(player);
    if (playerStats[player.sleeper_id]) return;
    Promise.all([
      supabase.from('weekly_stats').select('season, week, team, opponent_team, passing_yards, passing_tds, rushing_yards, rushing_tds, receiving_yards, receiving_tds, receptions, completions, attempts, interceptions, rushing_attempts, targets, fumbles_lost').eq('sleeper_id', player.sleeper_id).in('season', [2021, 2022, 2023, 2024, 2025, STOCK_SEASON]).order('season', { ascending: true }).order('week', { ascending: true }),
      supabase.from('games').select('season, week, home_team, away_team').gte('season', 2021).lte('season', STOCK_SEASON).eq('season_type', 'REG'),
    ]).then(([{ data: stats }, { data: games }]) => { setPlayerStats((current) => ({ ...current, [player.sleeper_id]: stats || [] })); player.games = games || []; setSelectedPlayer({ ...player }); });
  }

  useEffect(() => {
    async function loadTicker() {
      const { data: ticker, error: tickerErr } = await supabase.rpc('get_stock_ticker', { p_season: STOCK_SEASON });
      if (!tickerErr && ticker?.length) {
        setTickerError('');
        setRows(ticker.filter((row) => row.stock_code));
        return;
      }
      const { data: players, error: playersErr } = await supabase
        .from('players')
        .select('sleeper_id, stock_code, position, team, full_name')
        .not('stock_code', 'is', null)
        .neq('stock_code', '');
      if (playersErr) { setTickerError(tickerErr?.message || playersErr.message); return; }
      setTickerError('');
      setRows((players || []).map((player) => ({
        ...player,
        player_position: player.position,
        pct_change: null,
        today_dollars: null,
        yesterday_dollars: null,
      })));
    }
    loadTicker().catch((error) => setTickerError(error.message || 'Could not load stock ticker.'));
  }, []);

  if (rows.length === 0) return <div className="muted-text" style={{ fontSize: '0.8rem' }}>{tickerError || 'Loading stock ticker...'}</div>;

  const tickerRows = rows.filter((row) => row.stock_code);
  const sortedRows = [...tickerRows].sort((a, b) => {
    if (sort === 'position') return String(a.player_position).localeCompare(String(b.player_position)) || String(a.stock_code).localeCompare(String(b.stock_code));
    if (sort === 'team') return String(a.team || 'FA').localeCompare(String(b.team || 'FA'));
    if (sort === 'name') return String(a.full_name || a.stock_code).localeCompare(String(b.full_name || b.stock_code));
    if (sort === 'risers') return Number(b.pct_change) - Number(a.pct_change);
    if (sort === 'fallers') return Number(a.pct_change) - Number(b.pct_change);
    return Number(b.dollar_value || b.today_dollars || 0) - Number(a.dollar_value || a.today_dollars || 0);
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <strong>Market Ticker</strong>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort market ticker" style={{ width: 135, fontSize: '0.7rem', padding: '4px 24px 4px 6px' }}>
          <option value="value">Overall value</option><option value="position">Position</option><option value="team">Team</option><option value="name">Name</option><option value="risers">Biggest risers</option><option value="fallers">Biggest fallers</option>
        </select>
      </div>
      <div className="stock-track" key={sort}>
      {[...sortedRows, ...sortedRows].map((r, index) => {
        const movement = Number(r.pct_change) !== 0
          ? { percent: Number(r.pct_change), placeholder: false }
          : stockMovement(r, index);
        const up = movement.percent >= 0;
        const color = up ? STOCK_UP_COLOR : STOCK_DOWN_COLOR;
        return (
          <span key={`${r.sleeper_id}-${index}`} className="stock-quote" onClick={() => openPlayer(r)}>
            <span className="stock-quote-normal"><strong style={{ color: POSITION_SLOT_COLORS[r.player_position] || 'var(--color-text)' }}>{r.stock_code}</strong> <span style={{ color, fontWeight: 'bold' }}>{Math.abs(movement.percent).toFixed(1)}% {up ? '▲' : '▼'}</span></span>
            <span className="stock-quote-hover"><strong style={{ color: NFL_TEAM_COLORS[r.team] || 'var(--color-text)' }}>{r.full_name || r.stock_code}</strong> <span style={{ color: POSITION_SLOT_COLORS[r.player_position] || 'var(--color-text)' }}>({r.stock_code})</span> <span style={{ color, fontWeight: 'bold' }}>{Math.abs(movement.percent).toFixed(1)}% {up ? '▲' : '▼'}</span></span>
          </span>
        );
      })}
      </div>
      {selectedPlayer && <PlayerStockModal player={selectedPlayer} stats={playerStats[selectedPlayer.sleeper_id]} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}


function ScoringRow({ label, abbr, value, touched, disabled, comingSoon, onChange, step = '0.01' }) {
  return (
    <div className="settings-row">
      <label>
        {label} {abbr && <span className="muted-text">({abbr})</span>}
        {comingSoon && <span className="coming-soon-tag">Coming soon</span>}
      </label>
      <input
        type="number"
        step={step}
        disabled={disabled || comingSoon}
        value={value ?? ''}
        onChange={onChange}
        style={{ color: touched ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      />
    </div>
  );
}

export default function Home({ profile, onLogout, onNavigate }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [mobileActiveTab, setMobileActiveTab] = useState('home');
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState('');

  const [topRankings, setTopRankings] = useState([]);
  const [showFullRankings, setShowFullRankings] = useState(false);
  const [fullRankings, setFullRankings] = useState([]);
  const [rankingPositionFilter, setRankingPositionFilter] = useState('ALL');
  const [allTierStandings, setAllTierStandings] = useState([]);
  const [projectedPlayers, setProjectedPlayers] = useState([]);
  const [projectedSignMsg, setProjectedSignMsg] = useState('');
  const [signingProjectedId, setSigningProjectedId] = useState(null);

  const [myLeagues, setMyLeagues] = useState([]);
  const [showLeagueSwitcher, setShowLeagueSwitcher] = useState(false);
  const [activeLeague, setActiveLeague] = useState(null);
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [showJoinLeague, setShowJoinLeague] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [leagueMsg, setLeagueMsg] = useState('');
  const [newScoring, setNewScoring] = useState('1.0');
  const [newRelegationTiers, setNewRelegationTiers] = useState('');
  const [newNumTeams, setNewNumTeams] = useState('');
  const [newSalaryCap, setNewSalaryCap] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [joinViaInviteLink, setJoinViaInviteLink] = useState(false);
  const [firstDraftSchedule, setFirstDraftSchedule] = useState(null);
  const [weeklyAuctionDay, setWeeklyAuctionDay] = useState(null);
  const [weeklyAuctionTime, setWeeklyAuctionTime] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showLeagueSettings, setShowLeagueSettings] = useState(false);
  const [settingsSection, setSettingsSection] = useState(null);
  const ICONS = {
    General: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2" fill="currentColor"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2" fill="currentColor"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="7" cy="18" r="2" fill="currentColor"/></svg>,
    Scoring: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-30 12 12)"/><line x1="9" y1="12" x2="15" y2="12" transform="rotate(-30 12 12)"/><line x1="10.5" y1="10" x2="10.5" y2="14" transform="rotate(-30 12 12)"/><line x1="12" y1="10" x2="12" y2="14" transform="rotate(-30 12 12)"/><line x1="13.5" y1="10" x2="13.5" y2="14" transform="rotate(-30 12 12)"/></svg>,
    Auction: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="6" rx="1.5"/><line x1="12" y1="8" x2="12" y2="21"/></svg>,
    Roster: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c0-3 2-5 5-5s5 2 5 5"/><path d="M11 19c0-3 2-5 5-5s5 2 5 5"/></svg>,
    'LM Tools': <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 16.9 5.8 20.3l1.6-6.8-5.2-4.6 6.9-.6z"/></svg>,
    'Relegation': <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  };
  const [generalSettings, setGeneralSettings] = useState(null);
  const [generalMsg, setGeneralMsg] = useState('');
  const [leagueExitConfirm, setLeagueExitConfirm] = useState(null);
  const [originalNumTeams, setOriginalNumTeams] = useState(null);
  const [scoringSettings, setScoringSettings] = useState(null);
  const [scoringTouched, setScoringTouched] = useState({});
  const [scoringMsg, setScoringMsg] = useState('');
  const [auctionSettings, setAuctionSettings] = useState(null);
  const [auctionTouched, setAuctionTouched] = useState({});
  const [auctionMsg, setAuctionMsg] = useState('');
  const [rosterSettings, setRosterSettings] = useState(null);
  const [rosterTouched, setRosterTouched] = useState({});
  const [rosterMsg, setRosterMsg] = useState('');
  const [lmSchedule, setLmSchedule] = useState([]);
  const [lmStandings, setLmStandings] = useState([]);
  const [lmMsg, setLmMsg] = useState('');
  const [removingTeam, setRemovingTeam] = useState(null);
  const [scheduleTier, setScheduleTier] = useState(1);
  const [tierCount, setTierCount] = useState(1);
  const [showFullSchedule, setShowFullSchedule] = useState(false);
  const [showFullScoring, setShowFullScoring] = useState(false);
  const [showManualBuilder, setShowManualBuilder] = useState(false);
  const [manualPatternWeeks, setManualPatternWeeks] = useState(9);
  const [manualMatchups, setManualMatchups] = useState([]);
  const [manualTeams, setManualTeams] = useState([]);
  const [relegationTiers, setRelegationTiers] = useState([]);
  const [relegationMsg, setRelegationMsg] = useState('');
  const [relegationTouched, setRelegationTouched] = useState({});
  const [confirmingShuffleAll, setConfirmingShuffleAll] = useState(false);
  const [addingTeamToTier, setAddingTeamToTier] = useState(null);
  const [addTeamSuccessTier, setAddTeamSuccessTier] = useState(null);
  const [showSeasonSchedule, setShowSeasonSchedule] = useState(false);
  const [seasonScheduleRows, setSeasonScheduleRows] = useState([]);
  const [confirmingRelegationRun, setConfirmingRelegationRun] = useState(false);
  const [relegationMoves, setRelegationMoves] = useState(null);
  const [myTierStandings, setMyTierStandings] = useState(null);
  const [teamSignings, setTeamSignings] = useState([]);
  const [deadCapContracts, setDeadCapContracts] = useState([]);
  const [rosterVersion, setRosterVersion] = useState(0);
  const [opponentTeam, setOpponentTeam] = useState(null);
  const [opponentSignings, setOpponentSignings] = useState([]);
  const [leagueRosterSpec, setLeagueRosterSpec] = useState(null);
  const [currentLeagueWeek, setCurrentLeagueWeek] = useState(1);
  const [editingTeamIdentity, setEditingTeamIdentity] = useState(false);
  const [editTeamName, setEditTeamName] = useState('');
  const [editTeamAbbr, setEditTeamAbbr] = useState('');
  const [teamIdentityMsg, setTeamIdentityMsg] = useState('');
  const [showCrestEditor, setShowCrestEditor] = useState(false);
  const [crestData, setCrestData] = useState({ pattern: 'vertical', color1: '#888888', color2: '#ffffff' });
  const [crestMsg, setCrestMsg] = useState('');
  const [showAuctionDropdown, setShowAuctionDropdown] = useState(false);
  const [tier1Cap, setTier1Cap] = useState(null);
  const [draftPhase, setDraftPhase] = useState(null);
  const [week1EndsAt, setWeek1EndsAt] = useState(null);

  const teamPanel = useHoldToFullscreen();
  const stockPanel = useHoldToFullscreen();
  const q3Panel = useHoldToFullscreen();

  useEffect(() => {
    if (profile) {
      setCrestData({
        pattern: profile.crest_pattern || 'vertical',
        color1: profile.crest_color1 || '#888888',
        color2: profile.crest_color2 || '#ffffff',
      });
    }
  }, [profile]);

  useEffect(() => {
    supabase.rpc('get_top_rankings', { p_limit: 100 }).then(({ data }) => {
      if (data) setTopRankings(data);
    });
  }, []);

  useEffect(() => {
    if (!activeLeague) { setAllTierStandings([]); return; }
    const tierTotal = Number(activeLeague.relegation_tiers || leagueRosterSpec?.relegation_tiers || 1);
    Promise.all(Array.from({ length: Math.max(1, tierTotal) }, (_, index) =>
      supabase.rpc('get_league_standings', {
        p_league_id: activeLeague.league_id, p_season: 2026, p_tier_number: index + 1,
      }).then(({ data }) => ({ tier: index + 1, teams: data || [] }))
    )).then(setAllTierStandings);
  }, [activeLeague, leagueRosterSpec]);

  useEffect(() => {
    if (!activeLeague) { setProjectedPlayers([]); return; }
    Promise.all([
      supabase.rpc('get_free_agents', { p_league_id: activeLeague.league_id, p_season: FA_SEASON }),
      supabase.from('players').select('sleeper_id, stock_code').not('stock_code', 'is', null).neq('stock_code', ''),
    ]).then(([{ data: freeAgents }, { data: playerCodes }]) => {
      const codes = Object.fromEntries((playerCodes || []).map((player) => [player.sleeper_id, player.stock_code]));
      setProjectedPlayers((freeAgents || [])
        .map((player) => ({ ...player, stock_code: player.stock_code || codes[player.sleeper_id] }))
        .sort((a, b) => Number(b.dollar_value || 0) - Number(a.dollar_value || 0))
        .slice(0, 8));
    });
  }, [activeLeague, rosterVersion]);

  useEffect(() => {
    if (settingsSection !== 'General' || !activeLeague) return;
    supabase
      .from('leagues')
      .select(GENERAL_SETTINGS_COLUMNS)
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data, error: loadErr }) => {
        if (loadErr) { setGeneralMsg(loadErr.message); return; }
        setGeneralSettings(data);
        setOriginalNumTeams(data ? data.num_teams : null);
      });
  }, [settingsSection, activeLeague]);

  useEffect(() => {
    if (settingsSection !== 'Scoring' || !activeLeague) return;
    supabase
      .rpc('get_scoring_settings', { p_league_id: activeLeague.league_id })
      .then(({ data }) => {
        setScoringSettings(data);
        setScoringTouched({});
      });
  }, [settingsSection, activeLeague]);

  function easternWallClockToUTCISOString(dateTimeLocalStr) {
    if (!dateTimeLocalStr) return null;
    const [datePart, timePart] = dateTimeLocalStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    const guessUTC = new Date(Date.UTC(year, month - 1, day, hour, minute));

    const nyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(guessUTC);
    const get = (type) => nyParts.find((p) => p.type === type).value;
    const nyAsUTC = Date.UTC(
      Number(get('year')), Number(get('month')) - 1, Number(get('day')),
      Number(get('hour')) === 24 ? 0 : Number(get('hour')), Number(get('minute')), Number(get('second'))
    );

    const offsetMs = guessUTC.getTime() - nyAsUTC;
    return new Date(guessUTC.getTime() + offsetMs).toISOString();
  }

  function toDatetimeLocalValue(isoString) {
    if (!isoString) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(isoString));
    const get = (type) => parts.find((p) => p.type === type).value;
    const hour = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
  }

  function getDateTimeParts(dateTimeLocalValue) {
    if (!dateTimeLocalValue) return { date: '', time: '18:00' };
    const [date = '', time = '18:00'] = dateTimeLocalValue.split('T');
    return { date, time: time ? time.slice(0, 5) : '18:00' };
  }

  function setInitialDraftDateTime(dateValue, timeValue) {
    if (!dateValue) {
      updateAuctionField('initial_draft_at', '');
      return;
    }
    const nextTime = timeValue || '18:00';
    updateAuctionField('initial_draft_at', `${dateValue}T${nextTime}`);
  }

  const weeklyAuctionTimeOptions = Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15;
    const hour24 = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
    const value = `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return { value, label: `${hour12}:${String(minute).padStart(2, '0')} ${suffix}` };
  });

  useEffect(() => {
    if (settingsSection !== 'Auction' || !activeLeague) return;
    supabase
      .rpc('get_auction_settings', { p_league_id: activeLeague.league_id })
      .then(({ data }) => {
        if (data) {
          setAuctionSettings({
            ...data,
            initial_draft_at: toDatetimeLocalValue(data.initial_draft_at),
            interest_rate_per_week: data.interest_rate_per_week != null ? Number(data.interest_rate_per_week) * 100 : 4,
          });
        }
        setAuctionTouched({});
      });
  }, [settingsSection, activeLeague]);
useEffect(() => {
  if (!activeLeague) { setTier1Cap(null); return; }
  supabase
    .from('leagues')
    .select('salary_cap')
    .eq('id', activeLeague.league_id)
    .single()
    .then(({ data }) => setTier1Cap(data ? Number(data.salary_cap) : null));
}, [activeLeague]);
  useEffect(() => {
    if (settingsSection !== 'Roster' || !activeLeague) return;
    supabase
      .from('leagues')
      .select('roster_qb, roster_rb, roster_wr, roster_te, roster_flex, roster_superflex, roster_bench, roster_bye_slots, max_draft_qb, max_draft_rb, max_draft_wr, max_draft_te')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
        setRosterSettings(data);
        setRosterTouched({});
      });
  }, [settingsSection, activeLeague]);

  async function refreshLmTools(tier) {
    const t = tier ?? scheduleTier;
    const [{ data: schedule }, { data: standings }] = await Promise.all([
      supabase.rpc('get_league_schedule', { p_league_id: activeLeague.league_id, p_season: 2026, p_tier_number: t }),
      supabase.rpc('get_league_standings', { p_league_id: activeLeague.league_id, p_season: 2026, p_tier_number: t }),
    ]);
    setLmSchedule(schedule || []);
    setLmStandings(standings || []);
  }

  useEffect(() => {
    if (settingsSection !== 'LM Tools' || !activeLeague) return;
    supabase
      .from('leagues')
      .select('relegation_enabled, relegation_tiers')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
        const count = data && data.relegation_enabled ? data.relegation_tiers : 1;
        setTierCount(count);
        setScheduleTier(1);
        setShowFullSchedule(false);
        setShowFullScoring(false);
        setLmMsg('');
        refreshLmTools(1);
      });
  }, [settingsSection, activeLeague]);

  function handleTierChange(newTier) {
    setScheduleTier(newTier);
    setShowFullSchedule(false);
    setShowFullScoring(false);
    setLmMsg('');
    refreshLmTools(newTier);
  }
  function capDollarValue(percent) {
  if (tier1Cap === null) return null;
  return (tier1Cap * percent / 100).toFixed(2);
}

  useEffect(() => {
    supabase.rpc('get_my_leagues').then(({ data }) => {
      if (data && data.length > 0) {
        setMyLeagues(data);
        const remembered = Number(localStorage.getItem(LAST_LEAGUE_KEY));
        setActiveLeague(data.find((l) => Number(l.league_id) === remembered) || data[0]);
      }
    });
  }, []);

  useEffect(() => {
    if (activeLeague) localStorage.setItem(LAST_LEAGUE_KEY, String(activeLeague.league_id));
  }, [activeLeague]);

  useEffect(() => {
    if (!activeLeague) { setDraftPhase(null); return; }
    let cancelled = false;
    supabase
      .from('draft_sessions')
      .select('phase')
      .eq('league_id', activeLeague.league_id)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setDraftPhase(data ? data.phase : null); });

    const channel = supabase
      .channel(`home_draft_session_${activeLeague.league_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'draft_sessions',
        filter: `league_id=eq.${activeLeague.league_id}`,
      }, (payload) => setDraftPhase(payload.new ? payload.new.phase : null))
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [activeLeague]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteFromUrl = params.get('invite');
    if (inviteFromUrl) {
      localStorage.setItem('pendingInviteCode', inviteFromUrl);
      setJoinCode(inviteFromUrl);
      setJoinViaInviteLink(true);
      setShowJoinLeague(true);
      params.delete('invite');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
      return;
    }
    const pending = localStorage.getItem('pendingInviteCode');
    if (pending) {
      setJoinCode(pending);
      setJoinViaInviteLink(true);
      setShowJoinLeague(true);
    }
  }, []);

  useEffect(() => {
    if (!activeLeague) { setMyTierStandings(null); return; }
    supabase
      .rpc('get_my_tier_standings', { p_league_id: activeLeague.league_id, p_season: 2026 })
      .then(({ data }) => setMyTierStandings(data));
  }, [activeLeague]);

  useEffect(() => {
    if (!activeLeague || !activeLeague.team_id || !currentLeagueWeek) {
      setOpponentTeam(null);
      setOpponentSignings([]);
      return;
    }
    supabase
      .rpc('get_current_matchup_opponent', {
        p_team_id: activeLeague.team_id,
        p_league_id: activeLeague.league_id,
        p_week: currentLeagueWeek,
      })
      .then(({ data, error: oppErr }) => {
        if (oppErr) { console.error('get_current_matchup_opponent failed:', oppErr); return; }
        const rows = data || [];
        if (rows.length === 0) { setOpponentTeam(null); setOpponentSignings([]); return; }
        setOpponentTeam({
          team_id: rows[0].opponent_team_id,
          team_name: rows[0].opponent_team_name,
          crest_pattern: rows[0].opponent_crest_pattern || 'vertical',
          crest_color1: rows[0].opponent_crest_color1 || '#888888',
          crest_color2: rows[0].opponent_crest_color2 || '#ffffff',
        });
        setOpponentSignings(rows.filter((r) => r.sleeper_id).map((r) => ({
          sleeper_id: r.sleeper_id,
          full_name: r.full_name,
          player_position: r.player_position,
          team: r.team,
          start_week: r.start_week,
          weeks_requested: r.weeks_requested,
          base_value: Number(r.base_value),
          interest_rate_applied: Number(r.interest_rate_applied),
        })));
      });
  }, [activeLeague, currentLeagueWeek]);

  useEffect(() => {
    if (!activeLeague) { setTeamSignings([]); setLeagueRosterSpec(null); return; }
    supabase
      .from('leagues')
      .select('initial_draft_at, roster_qb, roster_rb, roster_wr, roster_te, roster_flex, roster_superflex, roster_bench, salary_cap, promote_relegate_count, relegation_enabled, relegation_tiers, max_draft_qb, max_draft_rb, max_draft_wr, max_draft_te')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
  setLeagueRosterSpec(data);
  if (data) setCurrentLeagueWeek(getCurrentLeagueWeek(data.initial_draft_at, new Date(now)));
  setFirstDraftSchedule(data ? data.initial_draft_at : null);
});

    supabase
      .rpc('get_team_active_signings', { p_team_id: activeLeague.team_id, p_season: 2026 })
      .then(({ data }) => setTeamSignings(data || []));

    supabase
      .rpc('get_team_dead_cap', { p_team_id: activeLeague.team_id, p_season: 2026 })
      .then(({ data, error: deadErr }) => {
        if (deadErr) { console.error('get_team_dead_cap failed:', deadErr); return; }
        setDeadCapContracts(data || []);
      });
  }, [activeLeague, rosterVersion]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    supabase
      .from('games')
      .select('game_date')
      .eq('season', 2026)
      .eq('season_type', 'REG')
      .eq('week', 1)
      .order('game_date', { ascending: false })
      .limit(1)
      .then(({ data, error: gamesErr }) => {
        if (gamesErr) { console.error('week 1 schedule fetch failed:', gamesErr); return; }
        const lastGameDate = data && data[0] && data[0].game_date;
        if (!lastGameDate) return;
        setWeek1EndsAt(new Date(easternWallClockToUTCISOStringHelper(`${lastGameDate}T23:59`)));
      });
  }, []);

  function nextRecurringAuction(fromMs) {
    if (!weeklyAuctionDay || !weeklyAuctionTime) return null;
    const candidate = getNextRecurringAuctionDate(weeklyAuctionDay, weeklyAuctionTime, new Date(fromMs));
    if (!candidate) return null;
    const firstAllowed = week1EndsAt
      ? getNextRecurringAuctionDate(weeklyAuctionDay, weeklyAuctionTime, week1EndsAt)
      : null;
    if (firstAllowed && candidate.getTime() < firstAllowed.getTime()) return firstAllowed;
    return candidate;
  }

  async function openFullRankings() {
  const { data } = await supabase.rpc('get_top_rankings', { p_limit: 1000 });
  if (data) {
    const [{ data: projRows }, { data: scoring }] = await Promise.all([
      supabase.from('season_projections').select('*').eq('season', 2026),
      supabase.rpc('get_scoring_settings', { p_league_id: activeLeague.league_id }),
    ]);
    const projBySleeperId = {};
    (projRows || []).forEach((p) => { projBySleeperId[p.sleeper_id] = p; });

    const merged = data.map((r) => {
      const p = projBySleeperId[r.sleeper_id];
      if (!p) return r;

      const totalTDs = (Number(p.proj_rush_tds) || 0) + (Number(p.proj_rec_tds) || 0);

      let totalPoints = 0;
      if (scoring) {
        totalPoints += (Number(p.proj_pass_yards) || 0) * Number(scoring.pass_yd || 0);
        totalPoints += (Number(p.proj_pass_tds) || 0) * Number(scoring.pass_td || 0);
        totalPoints += (Number(p.proj_interceptions) || 0) * Number(scoring.pass_int || 0);
        totalPoints += (Number(p.proj_rush_yards) || 0) * Number(scoring.rush_yd || 0);
        totalPoints += (Number(p.proj_rush_tds) || 0) * Number(scoring.rush_td || 0);
        totalPoints += (Number(p.proj_receptions) || 0) * Number(scoring.reception || 0);
        totalPoints += (Number(p.proj_rec_yards) || 0) * Number(scoring.rec_yd || 0);
        totalPoints += (Number(p.proj_rec_tds) || 0) * Number(scoring.rec_td || 0);
        if (r.player_position === 'TE') {
          totalPoints += (Number(p.proj_receptions) || 0) * Number(scoring.te_bonus_per_reception || 0);
        }
      }
      const projPPG = scoring ? totalPoints / 15 : null;

      return {
        ...r,
        proj_receptions: p.proj_receptions,
        proj_rec_yards: p.proj_rec_yards,
        proj_rush_yards: p.proj_rush_yards,
        proj_total_tds: totalTDs,
        proj_pass_yards: p.proj_pass_yards,
        proj_pass_tds: p.proj_pass_tds,
        proj_interceptions: p.proj_interceptions,
        proj_ppg: projPPG,
      };
    });
    setFullRankings(merged);
  }
  setShowFullRankings(true);
}

  async function signProjectedPlayer(player) {
    if (!activeLeague?.team_id || signingProjectedId) return;
    setSigningProjectedId(player.sleeper_id);
    setProjectedSignMsg('');
    const { error } = await supabase.rpc('sign_free_agent', {
      p_team_id: activeLeague.team_id,
      p_sleeper_id: player.sleeper_id,
      p_cut_signing_id: null,
      p_week: currentLeagueWeek,
      p_season: FA_SEASON,
    });
    setSigningProjectedId(null);
    setProjectedSignMsg(error ? error.message : `${player.full_name} signed.`);
    if (!error) setRosterVersion((v) => v + 1);
  }

  const filteredPreviewRankings = topRankings.filter((row) => rankingPositionFilter === 'ALL' || row.player_position === rankingPositionFilter);
  const visibleTierStandings = (() => {
    const total = allTierStandings.reduce((sum, tier) => sum + tier.teams.length, 0);
    if (total <= 24) return allTierStandings;
    const currentTier = Number(myTierStandings?.tier_number || 1);
    return allTierStandings.filter((tier) => tier.tier === currentTier);
  })();

  function getNextRecurringAuctionDate(dayName, timeStr, fromDate) {
    const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDay = dayMap[dayName];
    if (targetDay === undefined || !timeStr) return null;

    const nyParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(fromDate);
    const get = (type) => nyParts.find((p) => p.type === type).value;
    const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const nyToday = weekdayMap[get('weekday')];

    let dayDiff = (targetDay - nyToday + 7) % 7;
    let candidateDate = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
    candidateDate.setUTCDate(candidateDate.getUTCDate() + dayDiff);

    const pad = (n) => String(n).padStart(2, '0');
    const candidateStr = `${candidateDate.getUTCFullYear()}-${pad(candidateDate.getUTCMonth() + 1)}-${pad(candidateDate.getUTCDate())}T${timeStr.slice(0, 5)}`;
    let targetUTC = new Date(easternWallClockToUTCISOString(candidateStr));

    if (targetUTC.getTime() <= fromDate.getTime()) {
      candidateDate.setUTCDate(candidateDate.getUTCDate() + 7);
      const candidateStr2 = `${candidateDate.getUTCFullYear()}-${pad(candidateDate.getUTCMonth() + 1)}-${pad(candidateDate.getUTCDate())}T${timeStr.slice(0, 5)}`;
      targetUTC = new Date(easternWallClockToUTCISOString(candidateStr2));
    }
    return targetUTC;
  }
function minutesUntilAuction() {
  let target = null;
  if (firstDraftSchedule && new Date(firstDraftSchedule).getTime() > now) {
    target = new Date(firstDraftSchedule);
  } else {
    target = nextRecurringAuction(now);
  }
  if (!target) return null;
  return (target.getTime() - now) / 60000;
}
  function draftMessageSuffix() {
    let target = null;

    if (firstDraftSchedule && new Date(firstDraftSchedule).getTime() > now) {
      target = new Date(firstDraftSchedule);
    } else {
      target = nextRecurringAuction(now);
    }

    if (target) {
      const diff = target.getTime() - now;
      if (diff <= 0) return ': time!';
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      return ` starts in: ${days}d ${hours}h ${minutes}m`;
    }

    return activeLeague.is_owner ? ': schedule your first one in settings.' : ': not scheduled.';
  }

  function buildRosterSlotsFor(signings) {
    if (!leagueRosterSpec) return [];
    const positionCounts = [
      ['QB', leagueRosterSpec.roster_qb], ['RB', leagueRosterSpec.roster_rb],
      ['WR', leagueRosterSpec.roster_wr], ['TE', leagueRosterSpec.roster_te],
      ['FLEX', leagueRosterSpec.roster_flex], ['SFLEX', leagueRosterSpec.roster_superflex],
      ['BENCH', leagueRosterSpec.roster_bench],
    ];
    const byPosition = { QB: [], RB: [], WR: [], TE: [] };
    signings.forEach((s) => { if (byPosition[s.player_position]) byPosition[s.player_position].push(s); });
    const used = new Set();
    const slots = [];
    for (const [pos, count] of positionCounts) {
      for (let i = 0; i < (count || 0); i++) {
        let player = null;
        if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
          player = byPosition[pos].find((p) => !used.has(p.sleeper_id)) || null;
        } else if (pos === 'FLEX') {
          player = ['RB', 'WR', 'TE'].flatMap((p) => byPosition[p]).find((p) => !used.has(p.sleeper_id)) || null;
        } else {
          player = signings.find((p) => !used.has(p.sleeper_id)) || null;
        }
        if (player) used.add(player.sleeper_id);
        slots.push({ position: pos, player });
      }
    }
    return slots;
  }

  function buildRosterSlots() {
    return buildRosterSlotsFor(teamSignings);
  }

  function buildWeekCapSegments(week) {
    const byPosition = {};
    let totalSpent = 0;
    for (const s of teamSignings) {
      if (week >= s.start_week && week <= s.end_week) {
        const { cost } = contractCostAtWeek(s, week);
        if (!byPosition[s.player_position]) byPosition[s.player_position] = { value: 0, meta: [] };
        byPosition[s.player_position].value += cost;
        byPosition[s.player_position].meta.push({ name: s.full_name, cost });
        totalSpent += cost;
      }
    }
    const segments = Object.entries(byPosition).map(([pos, v]) => ({
      value: v.value,
      color: POSITION_SLOT_COLORS[pos] || '#888',
      meta: v.meta,
    }));
    const deadMeta = [];
    let deadTotal = 0;
    for (const c of deadCapContracts) {
      const from = Math.max(Number(c.cut_at_week) || 1, Number(c.start_week));
      if (week < from || week > Number(c.end_week)) continue;
      const cost = contractCostInWeek(c, week) * Number(c.dead_cap_pct ?? DEAD_CAP_RATE);
      if (cost <= 0) continue;
      deadMeta.push({ name: `${c.full_name} (dead)`, cost });
      deadTotal += cost;
    }
    if (deadTotal > 0) {
      segments.push({ value: deadTotal, color: 'var(--color-error)', meta: deadMeta });
      totalSpent += deadTotal;
    }

    const cap = leagueRosterSpec ? Number(leagueRosterSpec.salary_cap) : 300;
    const remaining = Math.max(0, cap - totalSpent);
    segments.push({ value: remaining, color: '#000', meta: [{ name: 'Cap Remaining', cost: remaining }] });
    return segments;
  }

  async function handleSaveCrest() {
    setCrestMsg('');
    const { error } = await supabase.rpc('update_crest', {
      p_pattern: crestData.pattern,
      p_color1: crestData.color1,
      p_color2: crestData.color2,
    });
    if (error) { setCrestMsg(error.message); return; }
    setShowCrestEditor(false);
  }

  async function handleSaveTeamIdentity() {
    setTeamIdentityMsg('');
    const trimmedName = editTeamName.trim();
    if (!trimmedName) { setTeamIdentityMsg('Team name cannot be empty.'); return; }
    if (trimmedName.length > MAX_TEAM_NAME_LENGTH) {
      setTeamIdentityMsg(`Team name must be ${MAX_TEAM_NAME_LENGTH} characters or fewer.`);
      return;
    }
    const { error } = await supabase.rpc('update_team_identity', {
      p_team_id: activeLeague.team_id,
      p_team_name: trimmedName,
      p_team_abbr: editTeamAbbr.trim(),
    });
    if (error) { setTeamIdentityMsg(error.message); return; }
    setEditingTeamIdentity(false);
    refreshLeagues(activeLeague.league_id);
  }

  async function handleSaveGeneralSettings() {
    setGeneralMsg('');
    const submitted = generalSettings;
    const tierCount = Math.max(1, Number(submitted.relegation_tiers) || 1);
    try {
      const { error } = await supabase.rpc('update_general_settings', {
        p_league_id: activeLeague.league_id,
        p_name: submitted.name,
        p_is_public: submitted.is_public,
        p_bonus_win_top_half: submitted.bonus_win_top_half,
        p_num_teams: Number(submitted.num_teams),
        p_relegation_tiers: tierCount,
        p_season_weeks: Number(submitted.season_weeks),
        p_promote_relegate_count: Number(submitted.promote_relegate_count),
        p_salary_cap: Number(submitted.salary_cap),
        p_ir_voids_contract: submitted.ir_voids_contract,
      });
      if (error) { setGeneralMsg(error.message); return; }

      const { error: relErr } = await supabase.rpc('update_league_relegation_enabled', {
        p_league_id: activeLeague.league_id,
        p_enabled: tierCount > 1,
      });
      if (relErr) { setGeneralMsg(relErr.message); return; }

      if (Number(submitted.num_teams) !== Number(originalNumTeams)) {
        for (let tier = 1; tier <= tierCount; tier++) {
          await supabase.rpc('resize_league_tier_teams', {
            p_league_id: activeLeague.league_id,
            p_tier_number: tier,
            p_new_num_teams: Number(submitted.num_teams),
          });
          await supabase.rpc('clear_tier_schedule', {
            p_league_id: activeLeague.league_id,
            p_season: 2026,
            p_tier_number: tier,
          });
          const schedule = generateRoundRobinSchedule(Number(submitted.num_teams), Number(submitted.season_weeks));
          await supabase.rpc('insert_matchups_bulk', {
            p_league_id: activeLeague.league_id,
            p_season: 2026,
            p_tier_number: tier,
            p_matchups: schedule,
          });
        }
        setOriginalNumTeams(Number(submitted.num_teams));
      }

      const { data: saved } = await supabase
        .from('leagues')
        .select(GENERAL_SETTINGS_COLUMNS)
        .eq('id', activeLeague.league_id)
        .single();
      if (saved) {
        setGeneralSettings(saved);
        setOriginalNumTeams(saved.num_teams);
        const stuck = fieldsThatDidNotStick(submitted, saved, GENERAL_SETTINGS_FIELDS);
        setGeneralMsg(stuck.length === 0 ? 'Saved.' : `Saved, except: ${stuck.join(', ')} — the database rejected those values.`);
      } else {
        setGeneralMsg('Saved.');
      }

      refreshLeagues(activeLeague.league_id);
    } catch (err) {
      setGeneralMsg(err.message || String(err));
    }
  }

  function updateScoringField(field, value) {
    setScoringSettings({ ...scoringSettings, [field]: value });
    setScoringTouched({ ...scoringTouched, [field]: true });
  }

  async function handleSaveScoringSettings() {
    setScoringMsg('');
    const s = scoringSettings;
    try {
    const { error } = await supabase.rpc('update_scoring_settings', {
      p_league_id: activeLeague.league_id,
      p_pass_yd: Number(s.pass_yd),
      p_pass_td: Number(s.pass_td),
      p_pass_int: Number(s.pass_int),
      p_pass_2pt: Number(s.pass_2pt),
      p_pass_td_40_bonus: Number(s.pass_td_40_bonus),
      p_pass_td_50_bonus: Number(s.pass_td_50_bonus),
      p_pass_300_bonus: Number(s.pass_300_bonus),
      p_pass_400_bonus: Number(s.pass_400_bonus),
      p_rush_yd: Number(s.rush_yd),
      p_rush_td: Number(s.rush_td),
      p_rush_2pt: Number(s.rush_2pt),
      p_rush_td_40_bonus: Number(s.rush_td_40_bonus),
      p_rush_td_50_bonus: Number(s.rush_td_50_bonus),
      p_rush_first_down: Number(s.rush_first_down),
      p_rush_100_bonus: Number(s.rush_100_bonus),
      p_rush_200_bonus: Number(s.rush_200_bonus),
      p_fumble_lost: Number(s.fumble_lost),
      p_rec_yd: Number(s.rec_yd),
      p_reception: Number(s.reception),
      p_rec_td: Number(s.rec_td),
      p_rec_td_40_bonus: Number(s.rec_td_40_bonus),
      p_rec_td_50_bonus: Number(s.rec_td_50_bonus),
      p_rec_first_down: Number(s.rec_first_down),
      p_rec_2pt: Number(s.rec_2pt),
      p_rec_100_bonus: Number(s.rec_100_bonus),
      p_rec_200_bonus: Number(s.rec_200_bonus),
      p_te_bonus_per_reception: Number(s.te_bonus_per_reception),
    });
    setScoringMsg(error ? error.message : 'Saved.');
    if (!error) refreshLeagues(activeLeague.league_id);
    } catch (err) {
      setScoringMsg(err.message || String(err));
    }
  }

  function updateAuctionField(field, value) {
    setAuctionSettings({ ...auctionSettings, [field]: value });
    setAuctionTouched({ ...auctionTouched, [field]: true });
  }

  function updateTierCap(tierNumber, value) {
    setAuctionSettings({
      ...auctionSettings,
      tiers: auctionSettings.tiers.map((t) =>
        t.tier_number === tierNumber ? { ...t, salary_cap: value } : t
      ),
    });
    setAuctionTouched({ ...auctionTouched, [`tier_${tierNumber}`]: true });
  }

  async function handleSaveAuctionSettings() {
    setAuctionMsg('');
    const s = auctionSettings;

    if (s.weekly_auction_day === 'Tuesday' && s.weekly_auction_time < '12:00') {
      setAuctionMsg('On Tuesday, the auction time must be at or after 12:00 PM.');
      return;
    }
    if (s.weekly_auction_day === 'Thursday' && s.weekly_auction_time > '11:00') {
      setAuctionMsg('On Thursday, the auction time must be at or before 11:00 AM.');
      return;
    }

    const tierCaps = Array.isArray(s.tiers)
      ? s.tiers.map((t) => ({ tier_number: t.tier_number, salary_cap: Number(t.salary_cap) }))
      : [];

    try {
    const { error } = await supabase.rpc('update_auction_settings', {
      p_league_id: activeLeague.league_id,
      p_initial_draft_at: easternWallClockToUTCISOString(s.initial_draft_at),
      p_weekly_auction_day: s.weekly_auction_day,
      p_weekly_auction_time: s.weekly_auction_time,
      p_initial_countdown_minutes: Number(s.initial_countdown_minutes),
      p_min_bid_reset_seconds: Number(s.min_bid_reset_seconds),
      p_players_per_auction: Number(s.players_per_auction),
      p_interest_rate_per_week: Number(s.interest_rate_per_week) / 100,
      p_max_one_week_contracts: Number(s.max_one_week_contracts),
      p_max_two_week_contracts: Number(s.max_two_week_contracts),
      p_max_long_term_contracts: Number(s.max_long_term_contracts),
      p_cap_rollover_pct: Number(s.cap_rollover_pct),
      p_allow_cap_trading: s.allow_cap_trading,
      p_tier_caps: tierCaps,
    });
    setAuctionMsg(error ? error.message : 'Saved.');
    if (!error) refreshLeagues(activeLeague.league_id);
    } catch (err) {
      setAuctionMsg(err.message || String(err));
    }
  }

  function updateRosterField(field, value) {
    setRosterSettings({ ...rosterSettings, [field]: value });
    setRosterTouched({ ...rosterTouched, [field]: true });
  }

  async function handleSaveRosterSettings() {
    setRosterMsg('');
    const s = rosterSettings;
    const toIntOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    try {
    const { error } = await supabase.rpc('update_roster_settings', {
      p_league_id: activeLeague.league_id,
      p_roster_qb: Number(s.roster_qb),
      p_roster_rb: Number(s.roster_rb),
      p_roster_wr: Number(s.roster_wr),
      p_roster_te: Number(s.roster_te),
      p_roster_flex: Number(s.roster_flex),
      p_roster_superflex: Number(s.roster_superflex),
      p_roster_bench: Number(s.roster_bench),
      p_roster_bye_slots: Number(s.roster_bye_slots),
      p_max_draft_qb: toIntOrNull(s.max_draft_qb),
      p_max_draft_rb: toIntOrNull(s.max_draft_rb),
      p_max_draft_wr: toIntOrNull(s.max_draft_wr),
      p_max_draft_te: toIntOrNull(s.max_draft_te),
    });
    if (error) { setRosterMsg(error.message); return; }

    const { data: saved } = await supabase
      .from('leagues')
      .select('roster_qb, roster_rb, roster_wr, roster_te, roster_flex, roster_superflex, roster_bench, roster_bye_slots, max_draft_qb, max_draft_rb, max_draft_wr, max_draft_te')
      .eq('id', activeLeague.league_id)
      .single();
    if (saved) {
      setRosterSettings(saved);
      const stuck = fieldsThatDidNotStick(s, saved, Object.keys(saved));
      setRosterMsg(stuck.length === 0 ? 'Saved.' : `Saved, except: ${stuck.join(', ')} — the database rejected those values.`);
    } else {
      setRosterMsg('Saved.');
    }
    refreshLeagues(activeLeague.league_id);
    } catch (err) {
      setRosterMsg(err.message || String(err));
    }
  }

  function updateMatchupScoreLocal(matchupId, field, value) {
    setLmSchedule(lmSchedule.map((m) => (m.matchup_id === matchupId ? { ...m, [field]: value } : m)));
  }

  useEffect(() => {
    if (settingsSection !== 'Relegation' || !activeLeague) return;
    setRelegationMsg('');
    supabase
      .rpc('get_relegation_settings', { p_league_id: activeLeague.league_id })
      .then(({ data }) => setRelegationTiers(data || []));
  }, [settingsSection, activeLeague]);

  function updateTierField(tierNumber, field, value) {
    setRelegationTiers(relegationTiers.map((t) => (t.tier_number === tierNumber ? { ...t, [field]: value } : t)));
  }

  async function handleSaveTierNamesColors() {
    setRelegationMsg('');
    try {
      const { error } = await supabase.rpc('update_tier_names_colors', {
        p_league_id: activeLeague.league_id,
        p_tiers: (relegationTiers || []).map((t) => ({
          tier_number: t.tier_number, tier_name: t.tier_name,
          tier_color: t.tier_color, salary_cap: Number(t.salary_cap),
        })),
      });
      if (error) { setRelegationMsg(error.message); return; }
      const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
      setRelegationTiers(data || []);
      setRelegationTouched({});
      setRelegationMsg('Saved.');
    } catch (err) {
      setRelegationMsg(err.message || String(err));
    }
  }

  async function handleShuffleAllTeams() {
    setRelegationMsg('');
    const { error } = await supabase.rpc('shuffle_all_teams_across_tiers', { p_league_id: activeLeague.league_id });
    setConfirmingShuffleAll(false);
    if (error) { setRelegationMsg(error.message); return; }

    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('season_weeks, relegation_enabled, relegation_tiers')
      .eq('id', activeLeague.league_id)
      .single();
    const tierCountAfterShuffle = leagueRow.relegation_enabled ? leagueRow.relegation_tiers : 1;

    for (let tier = 1; tier <= tierCountAfterShuffle; tier++) {
      const { data: tierTeams } = await supabase.rpc('get_league_teams', {
        p_league_id: activeLeague.league_id,
        p_tier_number: tier,
      });
      if (!tierTeams || tierTeams.length < 2) continue;
      const schedule = generateRoundRobinSchedule(tierTeams.length, leagueRow.season_weeks);
      await supabase.rpc('insert_matchups_bulk', {
        p_league_id: activeLeague.league_id,
        p_season: 2026,
        p_tier_number: tier,
        p_matchups: schedule,
      });
    }

    const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
    setRelegationTiers(data || []);
    setRelegationMsg('Saved.');
    refreshMyTierStandings();
  }

  async function handleRunRelegation() {
    setRelegationMsg('');
    setRelegationMoves(null);
    const { data, error } = await supabase.rpc('apply_end_of_season_relegation', {
      p_league_id: activeLeague.league_id,
      p_season: 2026,
    });
    setConfirmingRelegationRun(false);
    if (error) { setRelegationMsg(error.message); return; }

    setRelegationMoves(data || []);
    const { data: tiers } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
    setRelegationTiers(tiers || []);
    setRelegationMsg((data || []).length === 0 ? 'No teams changed tier.' : 'Saved.');
    refreshMyTierStandings();
  }

  async function handleMoveTeamTier(teamId, direction) {
    setRelegationMsg('');
    const { error } = await supabase.rpc('move_team_tier', { p_team_id: teamId, p_direction: direction });
    if (error) { setRelegationMsg(error.message); return; }

    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('season_weeks, relegation_enabled, relegation_tiers')
      .eq('id', activeLeague.league_id)
      .single();
    const tierCountForRegen = leagueRow.relegation_enabled ? leagueRow.relegation_tiers : 1;

    for (let tier = 1; tier <= tierCountForRegen; tier++) {
      const { data: tierTeams } = await supabase.rpc('get_league_teams', {
        p_league_id: activeLeague.league_id,
        p_tier_number: tier,
      });
      if (!tierTeams || tierTeams.length < 2) continue;
      const schedule = generateRoundRobinSchedule(tierTeams.length, leagueRow.season_weeks);
      await supabase.rpc('insert_matchups_bulk', {
        p_league_id: activeLeague.league_id,
        p_season: 2026,
        p_tier_number: tier,
        p_matchups: schedule,
      });
    }

    const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
    setRelegationTiers(data || []);
    setRelegationMsg('Saved.');
    refreshMyTierStandings();
  }

   async function handleAddTeamToTier(tierNumber) {
  setRelegationMsg('');
  setAddingTeamToTier(null);
  const { error } = await supabase.rpc('add_uncoached_team_to_tier', {
    p_league_id: activeLeague.league_id,
    p_tier_number: tierNumber,
  });
  if (error) { setRelegationMsg(error.message); return; }
  const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
  setRelegationTiers(data || []);
  setAddTeamSuccessTier(tierNumber);
  setTimeout(() => setAddTeamSuccessTier((current) => (current === tierNumber ? null : current)), 10000);
}

  useEffect(() => {
    if (!showSeasonSchedule || !activeLeague?.team_id) return;
    supabase
      .rpc('get_my_season_schedule', { p_team_id: activeLeague.team_id, p_season: 2026 })
      .then(({ data, error: schedErr }) => {
        if (schedErr) { console.error('get_my_season_schedule failed:', schedErr); return; }
        setSeasonScheduleRows(data || []);
      });
  }, [showSeasonSchedule, activeLeague]);

  async function refreshMyTierStandings() {
    const { data } = await supabase.rpc('get_my_tier_standings', { p_league_id: activeLeague.league_id, p_season: 2026 });
    setMyTierStandings(data);
  }

  function showLmMsg(text) {
    setLmMsg(text);
    if (text === 'Saved.') {
      setTimeout(() => setLmMsg((current) => (current === 'Saved.' ? '' : current)), 2500);
    }
  }

  async function handleSaveAllScores() {
    for (const m of lmSchedule) {
      const { error } = await supabase.rpc('update_matchup_score', {
        p_matchup_id: m.matchup_id,
        p_score1: Number(m.score1),
        p_score2: Number(m.score2),
      });
      if (error) { setLmMsg(error.message); return; }
    }
    showLmMsg('Saved.');
    refreshLmTools();
    refreshMyTierStandings();
  }

  async function handleReshuffleSchedule() {
    setLmMsg('');
    const { error: backfillError } = await supabase.rpc('backfill_bot_teams', { p_league_id: activeLeague.league_id });
    if (backfillError) { setLmMsg('Backfill failed: ' + backfillError.message); return; }

    const { data: leagueRow, error: leagueError } = await supabase
      .from('leagues')
      .select('season_weeks')
      .eq('id', activeLeague.league_id)
      .single();
    if (leagueError) { setLmMsg('Could not load league: ' + leagueError.message); return; }

    const { data: tierTeams, error: teamsError } = await supabase.rpc('get_league_teams', {
      p_league_id: activeLeague.league_id,
      p_tier_number: scheduleTier,
    });
    if (teamsError) { setLmMsg('Could not load teams: ' + teamsError.message); return; }
    if (!tierTeams || tierTeams.length < 2) { setLmMsg('This tier needs at least 2 teams before a schedule can be made.'); return; }

    const { error: clearError } = await supabase.rpc('clear_tier_schedule', {
      p_league_id: activeLeague.league_id,
      p_season: 2026,
      p_tier_number: scheduleTier,
    });
    if (clearError) { setLmMsg('Could not clear old schedule: ' + clearError.message); return; }

    const schedule = generateRoundRobinSchedule(tierTeams.length, leagueRow.season_weeks);
    const { error: insertError } = await supabase.rpc('insert_matchups_bulk', {
      p_league_id: activeLeague.league_id,
      p_season: 2026,
      p_tier_number: scheduleTier,
      p_matchups: schedule,
    });
    if (insertError) { setLmMsg('Could not save new schedule: ' + insertError.message); return; }

    showLmMsg('Saved.');
    refreshLmTools();
    refreshMyTierStandings();
  }

  async function handleOpenManualBuilder() {
    setLmMsg('');
    const { data: teams } = await supabase.rpc('get_league_teams', {
      p_league_id: activeLeague.league_id,
      p_tier_number: scheduleTier,
    });
    setManualTeams(teams || []);
    setManualMatchups([]);
    setManualPatternWeeks(9);
    setShowManualBuilder(true);
  }

  function updateManualMatchup(week, slotIndex, field, value) {
    const key = `${week}-${slotIndex}`;
    const existing = manualMatchups.find((m) => m.key === key);
    if (existing) {
      setManualMatchups(manualMatchups.map((m) => (m.key === key ? { ...m, [field]: value } : m)));
    } else {
      setManualMatchups([...manualMatchups, { key, week, [field]: value }]);
    }
  }

  async function handleSaveManualPattern() {
    setLmMsg('');
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('season_weeks')
      .eq('id', activeLeague.league_id)
      .single();

    const matchups = manualMatchups
      .filter((m) => m.slot1 && m.slot2)
      .map((m) => ({ week: m.week, slot1: Number(m.slot1), slot2: Number(m.slot2) }));

    if (matchups.length === 0) {
      setLmMsg('Fill in at least one matchup before saving.');
      return;
    }

    const { error } = await supabase.rpc('save_manual_schedule_pattern', {
      p_league_id: activeLeague.league_id,
      p_season: 2026,
      p_tier_number: scheduleTier,
      p_pattern_weeks: manualPatternWeeks,
      p_season_weeks: leagueRow.season_weeks,
      p_matchups: matchups,
    });
    showLmMsg(error ? error.message : 'Saved.');
    if (!error) {
      setShowManualBuilder(false);
      refreshLmTools();
    }
  }

  async function handleRemoveUser(teamId) {
    setLmMsg('');
    const { error } = await supabase.rpc('remove_team_user', { p_team_id: teamId });
    showLmMsg(error ? error.message : 'Saved.');
    setRemovingTeam(null);
    if (!error) {
      if (settingsSection === 'LM Tools') refreshLmTools();
      if (settingsSection === 'Relegation' && activeLeague) {
        const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
        setRelegationTiers(data || []);
      }
    }
  }

  async function handleRemoveSlot(teamId, tierNumber) {
  setLmMsg('');
  const { error } = await supabase.rpc('remove_team_slot', { p_team_id: teamId });
  showLmMsg(error ? error.message : 'Saved.');
  setRemovingTeam(null);
  if (error) return;

  if (settingsSection === 'LM Tools') refreshLmTools();
  if (settingsSection === 'Relegation' && activeLeague) {
    const { data } = await supabase.rpc('get_relegation_settings', { p_league_id: activeLeague.league_id });
    setRelegationTiers(data || []);
  }

  if (tierNumber && activeLeague) {
    const { data: leagueRow } = await supabase
      .from('leagues')
      .select('season_weeks')
      .eq('id', activeLeague.league_id)
      .single();
    const { data: tierTeams } = await supabase.rpc('get_league_teams', {
      p_league_id: activeLeague.league_id,
      p_tier_number: tierNumber,
    });
    if (tierTeams && tierTeams.length >= 2) {
      const schedule = generateRoundRobinSchedule(tierTeams.length, leagueRow.season_weeks);
      await supabase.rpc('insert_matchups_bulk', {
        p_league_id: activeLeague.league_id,
        p_season: 2026,
        p_tier_number: tierNumber,
        p_matchups: schedule,
      });
    }
  }
}

  async function handleChangeUsername() {
    setAccountMsg('');
    const { error } = await supabase.rpc('claim_username', { p_username: newUsername });
    setAccountMsg(error ? error.message : 'Username updated.');
    if (!error) setEditingUsername(false);
  }

  async function handleChangePassword() {
    setAccountMsg('');
    if (newPassword.length < 8) {
      setAccountMsg('Password must be at least 8 characters.');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setAccountMsg(error ? error.message : 'Password updated.');
    if (!error) setEditingPassword(false);
  }

  async function refreshLeagues(preferId) {
    const { data } = await supabase.rpc('get_my_leagues');
    const list = data || [];
    setMyLeagues(list);
    setActiveLeague(list.find((l) => l.league_id === preferId) || list[0] || null);
  }

  async function handleLeaveLeague() {
    setGeneralMsg('');
    const { error } = await supabase.rpc('leave_league', { p_league_id: activeLeague.league_id });
    if (error) { setLeagueExitConfirm(null); setGeneralMsg(error.message); return; }
    localStorage.removeItem(LAST_LEAGUE_KEY);
    setLeagueExitConfirm(null);
    setShowLeagueSettings(false);
    setSettingsSection(null);
    refreshLeagues();
  }

  async function handleDeleteLeague() {
    setGeneralMsg('');
    const { error } = await supabase.rpc('delete_league', { p_league_id: activeLeague.league_id });
    if (error) { setLeagueExitConfirm(null); setGeneralMsg(error.message); return; }
    localStorage.removeItem(LAST_LEAGUE_KEY);
    setLeagueExitConfirm(null);
    setShowLeagueSettings(false);
    setSettingsSection(null);
    refreshLeagues();
  }
  async function handleWipeDraftResults() {
  setGeneralMsg('');
  const { error } = await supabase.rpc('wipe_draft_results', { p_league_id: activeLeague.league_id, p_season: 2026 });
  setLeagueExitConfirm(null);
  if (error) { setGeneralMsg(error.message); return; }
  setGeneralMsg('Saved.');
}

  async function handleCreateLeague() {
    setLeagueMsg('');
    if (newLeagueName.length > 20) {
      setLeagueMsg('League name must be 20 characters or fewer.');
      return;
    }
    const { data, error } = await supabase.rpc('create_league', {
      p_name: newLeagueName,
      p_reception_points: Number(newScoring),
      p_relegation_enabled: newRelegationTiers > 0,
      p_relegation_tiers: Number(newRelegationTiers) || 1,
      p_num_teams: Number(newNumTeams),
      p_salary_cap: Number(newSalaryCap),
    });
    if (error) { setLeagueMsg(error.message); return; }

    const tierCount = data.relegation_enabled ? data.relegation_tiers : 1;
    for (let tier = 1; tier <= tierCount; tier++) {
      const schedule = generateRoundRobinSchedule(data.num_teams, data.season_weeks);
      await supabase.rpc('insert_matchups_bulk', {
        p_league_id: data.id,
        p_season: 2026,
        p_tier_number: tier,
        p_matchups: schedule,
      });
    }

    setShowCreateLeague(false);
    resetCreateLeagueForm();
    refreshLeagues(data.id);
  }

  function resetCreateLeagueForm() {
    setNewLeagueName('');
    setNewScoring('');
    setNewRelegationTiers('');
    setNewNumTeams('');
    setNewSalaryCap('');
    setLeagueMsg('');
  }

  async function handleJoinLeague() {
    setLeagueMsg('');
    const { data, error } = await supabase.rpc('join_league_by_code', { p_invite_code: joinCode });
    if (error) { setLeagueMsg(error.message); return; }
    localStorage.removeItem('pendingInviteCode');
    setShowJoinLeague(false);
    setJoinCode('');
    setJoinViaInviteLink(false);
    refreshLeagues(data.id);
  }

  function handleDeclineInvite() {
    localStorage.removeItem('pendingInviteCode');
    setShowJoinLeague(false);
    setJoinCode('');
    setJoinViaInviteLink(false);
    setLeagueMsg('');
  }

  function copyInviteLink() {
    const link = `https://geeklyfantasy.com?invite=${activeLeague.invite_code}`;
    navigator.clipboard.writeText(link);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  }

  const totalTeams = Number(newRelegationTiers) > 0 && Number(newNumTeams) > 0
    ? Number(newRelegationTiers) * Number(newNumTeams)
    : 0;

  const promoteRelegateCount = Math.max(
    1,
    Number(leagueRosterSpec?.promote_relegate_count)
      || Number(myTierStandings?.promote_count)
      || 1
  );

  const draftIsLive = draftPhase !== null && draftPhase !== 'pending' && draftPhase !== 'ended';

  return (
    <div className="home-grid">
      {tooltip && (
        <div
          style={{
            position: 'fixed', left: tooltip.x + 12, top: tooltip.y + 12, zIndex: 500,
            background: 'var(--color-bg-input)', border: '1px solid var(--color-border)',
            borderRadius: 6, padding: '8px 10px', fontSize: '0.8rem', pointerEvents: 'none',
            maxWidth: 220,
          }}
        >
          {tooltip.meta.map((m, i) => (
            <div key={i}>{m.name}: <strong>${m.cost.toFixed(2)}</strong></div>
          ))}
        </div>
      )}
      <div className="grid-header">
        <button onClick={() => setShowFullRankings(false)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
  <img src={geeklyLogo} alt="Geekly" style={{ height: 62.5 }} />
</button>
        <div style={{ position: 'relative' }}>
          <Crest
            pattern={crestData.pattern}
            color1={crestData.color1}
            color2={crestData.color2}
            size={60}
            onClick={() => setMenuOpen((v) => !v)}
            title="Account"
          />
          {menuOpen && (
            <>
              <div className="click-outside-backdrop" onClick={() => setMenuOpen(false)} />
              <ProfileMenu
                onLogout={onLogout}
                onChangeUsername={() => { setEditingUsername(true); setMenuOpen(false); }}
                onChangePassword={() => { setEditingPassword(true); setMenuOpen(false); }}
                onCustomizeCrest={() => { setShowCrestEditor(true); setMenuOpen(false); setCrestMsg(''); }}
              />
            </>
          )}
        </div>
        <div className="home-stock-header"><StockTicker /></div>
      </div>

      <div className={`quadrant quadrant-1 ${mobileActiveTab === 'rankings' ? 'mobile-active' : ''}`} style={{ cursor: 'pointer' }} onClick={openFullRankings}>
        <strong>Rest of Season Rankings</strong>
        <div className="home-rankings-filters" onClick={(event) => event.stopPropagation()}>
          {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
            <button
              key={pos}
              title={pos === 'ALL' ? 'All positions' : pos}
              onClick={() => setRankingPositionFilter(pos)}
              style={{
                background: pos === 'ALL' ? '#000' : RANKING_POSITION_COLORS[pos],
                border: rankingPositionFilter === pos ? '2px solid #ff1493' : '2px solid transparent',
                color: pos === 'ALL' ? '#fff' : '#111',
              }}
            >{pos}</button>
          ))}
        </div>
        <ul className="rankings-list">
          {filteredPreviewRankings.map((r) => (
            <li key={r.rank ?? r.full_name} className="ranking-row">
              <span>
                {r.rank ?? '-'}. <span className={`pos-${r.player_position}-highlight`}>{r.full_name}</span>
              </span>
              <span>{tier1Cap !== null ? `$${capDollarValue(r.cap_percent)}` : `${r.cap_percent}%`}</span>
            </li>
          ))}
        </ul>
        <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: 6 }}>*Click to Expand rankings</div>
      </div>
      <div
        className={`quadrant quadrant-2 ${mobileActiveTab === 'home' ? 'mobile-active' : ''} ${teamPanel.isFullscreen ? 'panel-fullscreen' : ''}`}
        {...teamPanel.holdProps}
      >
        {teamPanel.isFullscreen && <div className="fullscreen-hint">Hold 2.5s or press Esc to shrink</div>}
        {!activeLeague ? (
          <div style={{ position: 'relative' }}>

            <button
              className="gold-shine-button"
              onClick={() => setShowCreateLeague(true)}
              style={{ position: 'absolute', top: 0, right: 0 }}
            >
              Create League
            </button>

            <div style={{ maxWidth: 340 }}>
              <div className="muted-text" style={{ marginBottom: 10 }}>
                Already have a league code?
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Enter league code"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinLeague()}
                  style={{
                    flex: '0 1 220px', fontSize: '1.1rem', textAlign: 'center',
                    padding: '16px 20px', letterSpacing: '2px',
                  }}
                />
                <button onClick={handleJoinLeague} style={{ fontSize: '1rem', padding: '0 28px' }}>
                  Join
                </button>
              </div>
              {leagueMsg && <div className="error-text" style={{ marginTop: 8 }}>{leagueMsg}</div>}
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <button style={{ borderRadius: '16px' }} onClick={() => setShowLeagueSwitcher((v) => !v)}>
                    {activeLeague.league_name} ▾
                  </button>
                  {showLeagueSwitcher && (
                    <>
                      <div className="click-outside-backdrop" onClick={() => setShowLeagueSwitcher(false)} />
                      <div className="profile-menu" style={{ left: 0, top: '100%', marginTop: 6, minWidth: 220, border: '2px solid var(--color-border)' }}>
                        {myLeagues.filter((l) => l.league_id !== activeLeague.league_id).map((l) => (
                          <button
                            key={l.league_id}
                            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
                            onClick={() => { setActiveLeague(l); setShowLeagueSwitcher(false); }}
                          >
                            {l.league_name}
                          </button>
                        ))}
                        {myLeagues.length > 1 && <div style={{ borderTop: '1px solid var(--color-border-subtle)', margin: '6px 0' }} />}
                        <button
                          style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }}
                          onClick={() => { setShowLeagueSwitcher(false); setShowCreateLeague(true); }}
                        >
                          + Create New League
                        </button>
                        <button
                          style={{ display: 'block', width: '100%', textAlign: 'left' }}
                          onClick={() => { setShowLeagueSwitcher(false); setJoinViaInviteLink(false); setJoinCode(''); setLeagueMsg(''); setShowJoinLeague(true); }}
                        >
                          + Join with Code
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button style={{ background: 'rgba(127, 126, 160, 0.62)', color: 'var(--color-text-muted)' }}
                  onClick={() => { setShowLeagueSettings(true); setSettingsSection(null); setGeneralMsg(''); setScoringMsg(''); setAuctionMsg(''); setRosterMsg(''); setLmMsg(''); }}>⚙️</button>
              </div>
              {(() => {
  const minsLeft = minutesUntilAuction();
  if (draftIsLive || (minsLeft !== null && minsLeft <= 60)) {
    return (
      <button
        onClick={() => onNavigate('draft-room', activeLeague)}
        style={{ background: 'var(--color-error)', color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', padding: '10px 24px', justifyContent: 'center', position: 'absolute', left: '50%' }}
      >
        {draftIsLive ? 'Enter Draft Room' : 'Enter Draft Room'}
      </button>
    );
  }
  return (
    <span className="draft-clock" style={{ position: 'relative', left: '16.4%' }}>
      <button className="auction-pill" onClick={() => setShowAuctionDropdown((v) => !v)}>Auction</button>
      {draftMessageSuffix()}
      {showAuctionDropdown && (
        <>
          <div className="click-outside-backdrop" onClick={() => setShowAuctionDropdown(false)} />
          <div className="profile-menu" style={{ left: 0, top: '100%', marginTop: 6 }}>
            <button onClick={() => onNavigate('mock-draft', activeLeague)}>Mock Draft</button>
            <button onClick={() => onNavigate('draft-room', activeLeague)}>Enter Draft Room</button>
          </div>
        </>
      )}
    </span>
  );
})()}
          
            </div>

            <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
              <div style={{ flex: '0 0 68%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '8% 1fr 6% 7% 6% 1fr 8%', gap: 4, alignItems: 'center' }}>
                  <button
                    style={{
                      padding: '4px 6px', background: 'none', justifySelf: 'start',
                      border: editingTeamIdentity ? '2px solid #d4af37' : 'none',
                      borderRadius: 4,
                    }}
                    onClick={() => {
                      if (editingTeamIdentity) {
                        handleSaveTeamIdentity();
                      } else {
                        setEditTeamName(activeLeague.team_name);
                        setEditTeamAbbr(activeLeague.team_abbr || '');
                        setTeamIdentityMsg('');
                        setEditingTeamIdentity(true);
                      }
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>

                  {!editingTeamIdentity ? (
                    <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}>{activeLeague.team_name}</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="text"
                        value={editTeamName}
                        maxLength={MAX_TEAM_NAME_LENGTH}
                        onChange={(e) => setEditTeamName(e.target.value)}
                        title={`Up to ${MAX_TEAM_NAME_LENGTH} characters`}
                        style={{ width: 110 }}
                      />
                      <span className="muted-text" style={{ fontSize: '0.7rem' }}>
                        {editTeamName.length}/{MAX_TEAM_NAME_LENGTH}
                      </span>
                      <input type="text" value={editTeamAbbr} maxLength={3} onChange={(e) => setEditTeamAbbr(e.target.value.toUpperCase())} style={{ width: 44, textAlign: 'center' }} />
                    </div>
                  )}

                  <div style={editingTeamIdentity ? { border: '2px solid #fff', borderRadius: 8, padding: 2, display: 'inline-flex', justifySelf: 'end' } : { justifySelf: 'end' }}>
                    <Crest
                      pattern={crestData.pattern}
                      color1={crestData.color1}
                      color2={crestData.color2}
                      size={34}
                      onClick={editingTeamIdentity ? () => { setShowCrestEditor(true); setCrestMsg(''); } : undefined}
                      title={editingTeamIdentity ? 'Customize crest' : undefined}
                    />
                  </div>

                  <span className="muted-text" style={{ textAlign: 'center', fontSize: '0.75rem', justifySelf: 'center' }}>vs</span>

                  <div style={{ justifySelf: 'start' }}>
                    {opponentTeam ? (
                      <Crest pattern={opponentTeam.crest_pattern} color1={opponentTeam.crest_color1} color2={opponentTeam.crest_color2} size={34} />
                    ) : (
                      <Crest pattern="solid" color1="#888888" color2="#888888" size={34} />
                    )}
                  </div>

                  <span style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%', textAlign: 'right' }}>{opponentTeam ? opponentTeam.team_name : 'No opponent yet'}</span>
                  <span></span>
                </div>
                {teamIdentityMsg && <div className="error-text" style={{ marginTop: 4 }}>{teamIdentityMsg}</div>}

                <div style={{ marginTop: 14 }}>
                  {(() => {
                    const myRows = buildRosterSlotsFor(teamSignings);
                    const oppRows = buildRosterSlotsFor(opponentSignings);
                    const rowCount = Math.max(myRows.length, oppRows.length);

                    const totalSlots = leagueRosterSpec
                      ? (Number(leagueRosterSpec.roster_qb) || 0) + (Number(leagueRosterSpec.roster_rb) || 0)
                        + (Number(leagueRosterSpec.roster_wr) || 0) + (Number(leagueRosterSpec.roster_te) || 0)
                        + (Number(leagueRosterSpec.roster_flex) || 0) + (Number(leagueRosterSpec.roster_superflex) || 0)
                        + (Number(leagueRosterSpec.roster_bench) || 0)
                      : 0;
                    const shrinkSteps = Math.max(0, totalSlots - 7);
                    const rowVerticalPadding = Math.max(5 - shrinkSteps * 1.5, 1);
                    const rowFontSize = totalSlots > 11 ? '0.78rem' : '0.85rem';

                    return Array.from({ length: rowCount }, (_, i) => {
                      const mine = myRows[i];
                      const opp = oppRows[i];
                      const myCost = mine?.player ? contractCostAtWeek(mine.player, currentLeagueWeek) : null;
                      const oppCost = opp?.player ? contractCostAtWeek(opp.player, currentLeagueWeek) : null;
                      const position = mine?.position || opp?.position;
                      const benchRow = position === 'BENCH';
                      const nameOpacity = benchRow ? 0.55 : 1;
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '8% 1fr 6% 7% 6% 1fr 8%', gap: 4, alignItems: 'center', padding: `${rowVerticalPadding}px 0`, borderBottom: '1px solid var(--color-border-subtle)', fontSize: rowFontSize }}>
                          <span className="muted-text" style={{ fontSize: '0.7rem' }}>
                            {mine?.player && myCost ? <>${myCost.cost.toFixed(0)}/{myCost.weeksRemaining}</> : ''}
                          </span>
                          <span style={{ opacity: nameOpacity, color: mine?.player ? (NFL_TEAM_COLORS[mine.player.team] || 'var(--color-text)') : 'var(--color-text)' }}>
                            {mine?.player ? mine.player.full_name : '—'}
                          </span>
                          <span className="muted-text" style={{ textAlign: 'right', fontSize: '0.75rem' }}>—</span>
                          <span className="roster-slot-badge" style={{ background: POSITION_SLOT_COLORS[position], textAlign: 'center', justifySelf: 'center' }}>{SLOT_BADGE_LABEL[position] || position}</span>
                          <span className="muted-text" style={{ fontSize: '0.75rem' }}>—</span>
                          <span style={{ opacity: nameOpacity, textAlign: 'right', color: opp?.player ? (NFL_TEAM_COLORS[opp.player.team] || 'var(--color-text)') : 'var(--color-text)' }}>
                            {opp?.player ? opp.player.full_name : '—'}
                          </span>
                          <span className="muted-text" style={{ textAlign: 'right', fontSize: '0.7rem' }}>
                            {opp?.player && oppCost ? <>${oppCost.cost.toFixed(0)}/{oppCost.weeksRemaining}</> : ''}
                          </span>
                        </div>
                      );
                    });
                  })()}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 7% 1fr', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border-subtle)', fontSize: '0.85rem' }}>
                    <span style={{ textAlign: 'right', paddingRight: 8 }}>—</span>
                    <span></span>
                    <span style={{ textAlign: 'left', paddingLeft: 8 }}>—</span>
                  </div>
                </div>

                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start', gap: 26, alignItems: 'flex-end' }}>
                  {Array.from({ length: 6 }, (_, i) => currentLeagueWeek + i).map((week, idx) => {
                    const slices = buildPieSlices(buildWeekCapSegments(week), 64);
                    return (
                      <div key={week} style={{ textAlign: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div className="muted-text" style={{ fontSize: '0.7rem', marginBottom: 2 }}>Week {week}</div>
                          <svg width="64" height="64" viewBox="0 0 64 64">
                            {slices.map((s, i) =>
                              s.path
                                ? <path
                                    key={i} d={s.path} fill={s.color} stroke="var(--color-border)" strokeWidth="1"
                                    onMouseEnter={(e) => s.meta && setTooltip({ x: e.clientX, y: e.clientY, meta: s.meta })}
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                                : <circle
                                    key={i} cx="32" cy="32" r="31" fill={s.color} stroke="var(--color-border)" strokeWidth="1"
                                    onMouseEnter={(e) => s.meta && setTooltip({ x: e.clientX, y: e.clientY, meta: s.meta })}
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                            )}
                          </svg>
                        </div>
                        {idx === 5 && (
                          <button
                            onClick={() => setShowSeasonSchedule(true)}
                            title="View full season schedule"
                            style={{
                              padding: '5px 12px', fontSize: '0.7rem', whiteSpace: 'nowrap',
                              background: 'rgba(127, 126, 160, 0.62)', color: 'var(--color-text-muted)',
                              border: 'none', borderRadius: 6,
                            }}
                          >
                            View Schedule
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ flex: '0 0 30%' }}>
                {myTierStandings && (
                  <div>
                    <div
                      className="tier-header"
                      style={{ background: tierDisplayColor(myTierStandings.tier_number, myTierStandings.tier_color), textAlign: 'left', marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {myTierStandings.tier_name || `Tier ${myTierStandings.tier_number}`}
                      </span>
                      <button
                        className="black-shine-button"
                        style={{padding: '5px 24px', fontSize: '0.8rem', color: '#fcfafa' }}
                        onClick={() => setShowInviteModal(true)}
                      >
                        Invite Users
                      </button>
                    </div>
                    <table className="tier-standings-table tier-standings-table-compact">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Team</th>
                          <th>W</th>
                          <th>L</th>
                          <th>PPG</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myTierStandings.teams.map((t) => {
                          const isTopTier = myTierStandings.tier_number === 1;
                          const isBottomTier = myTierStandings.tier_number === myTierStandings.total_tiers;
                          const teamCount = myTierStandings.teams.length;

                          const isMyTeam = activeLeague.team_id === t.team_id;

                          const inPromoZone = isTopTier
                            ? t.rank === 1
                            : t.rank <= promoteRelegateCount;
                          const inRelegationZone = !isBottomTier && t.rank > teamCount - promoteRelegateCount;

                          let cellClass = '';
                          if (inPromoZone) {
                            const cutoff = isTopTier ? 2 : promoteRelegateCount + 1;
                            const nextTeam = myTierStandings.teams.find((x) => x.rank === cutoff);
                            const clinched = nextTeam ? t.min_possible_wins > nextTeam.max_possible_wins : true;
                            cellClass = clinched ? 'promo-solid' : 'promo-light';
                          } else if (inRelegationZone) {
                            const prevTeam = myTierStandings.teams.find((x) => x.rank === teamCount - promoteRelegateCount);
                            const clinched = prevTeam ? t.max_possible_wins < prevTeam.min_possible_wins : true;
                            cellClass = clinched ? 'releg-solid' : 'releg-light';
                          }

                          return (
                            <tr key={t.team_id}>
                              <td>
  {isMyTeam ? (
    <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={20} />
  ) : (
    <Crest pattern={t.crest_pattern || 'vertical'} color1={t.crest_color1 || '#888888'} color2={t.crest_color2 || '#ffffff'} size={20} />
  )}
</td>
                              <td style={{ maxWidth: 120 }}>
                                <span className={cellClass} style={{ ...(isMyTeam ? { fontWeight: 'bold' } : {}), display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {t.team_name}
                                </span>
                              </td>
                              <td>{t.wins}</td>
                              <td>{t.losses}</td>
                              <td>{t.wins + t.losses > 0 ? (t.points_for / (t.wins + t.losses)).toFixed(1) : '0.0'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {visibleTierStandings.length > 0 && (
              <div className="standings-all-tiers">
                {visibleTierStandings.map((tier) => (
                  <div key={tier.tier}>
                    <div className="scoring-subheading" style={{ marginTop: 0 }}>Tier {tier.tier}</div>
                    <table className="tier-standings-table tier-standings-table-compact">
                      <thead><tr><th>Team</th><th>W</th><th>L</th><th>PPG</th></tr></thead>
                      <tbody>
                        {tier.teams.map((team) => (
                          <tr key={team.team_id}>
                            <td style={team.team_id === activeLeague.team_id ? { fontWeight: 'bold' } : undefined}>{team.team_name}</td>
                            <td>{team.wins}</td>
                            <td>{team.losses}</td>
                            <td>{team.wins + team.losses > 0 ? (team.points_for / (team.wins + team.losses)).toFixed(1) : '0.0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            <div className="projected-player-board">
              <strong>Available Players</strong>
              <div className="muted-text" style={{ fontSize: '0.72rem', margin: '4px 0 8px' }}>Highest projected players available for a one-week contract.</div>
              {projectedPlayers.map((player) => (
                <div className="projected-player-row" key={player.sleeper_id}>
                  <span style={{ color: RANKING_POSITION_COLORS[player.player_position], fontWeight: 'bold' }}>{player.stock_code || player.player_position}</span>
                  <span className="player-name">{player.full_name}</span>
                  <span className="muted-text" style={{ fontSize: '0.72rem' }}>${Number(player.dollar_value || 0).toFixed(0)}</span>
                  <button
                    title={`Sign ${player.full_name} for one week`}
                    disabled={signingProjectedId === player.sleeper_id}
                    onClick={() => signProjectedPlayer(player)}
                  >+</button>
                </div>
              ))}
              {projectedSignMsg && <div className={projectedSignMsg.endsWith('signed.') ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>{projectedSignMsg}</div>}
            </div>

            {teamPanel.isFullscreen && (
              <FreeAgentBoard
                league={activeLeague}
                week={currentLeagueWeek}
                rosterSpec={leagueRosterSpec}
                onSigned={() => setRosterVersion((v) => v + 1)}
              />
            )}
          </div>
        )}
      </div>
      <div className={`quadrant quadrant-3 ${mobileActiveTab === 'q4' ? 'mobile-active' : ''} ${stockPanel.isFullscreen ? 'panel-fullscreen' : ''}`} {...stockPanel.holdProps}>
        {stockPanel.isFullscreen && <div className="fullscreen-hint">Hold 2.5s or press Esc to shrink</div>}
        <PlayerStockBoard expanded={stockPanel.isFullscreen} teamId={activeLeague?.team_id} />
      </div>

      <nav className="mobile-bottom-nav">
        <button className={mobileActiveTab === 'home' ? 'active' : ''} onClick={() => setMobileActiveTab('home')}>Home</button>
        <button className={mobileActiveTab === 'rankings' ? 'active' : ''} onClick={() => setMobileActiveTab('rankings')}>Rankings</button>
        <button className={mobileActiveTab === 'q3' ? 'active' : ''} onClick={() => setMobileActiveTab('q3')}>Coming Soon</button>
        <button className={mobileActiveTab === 'q4' ? 'active' : ''} onClick={() => setMobileActiveTab('q4')}>Stock</button>
      </nav>

      {showFullRankings && (
        <div className="modal-overlay" onClick={() => setShowFullRankings(false)}>
          <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Full Rankings</h3>
            <div className="home-rankings-filters">
              {['ALL', 'QB', 'RB', 'WR', 'TE'].map((pos) => (
                <button
                  key={pos}
                  title={pos === 'ALL' ? 'All positions' : pos}
                  onClick={() => setRankingPositionFilter(pos)}
                  style={{
                    background: pos === 'ALL' ? '#000' : RANKING_POSITION_COLORS[pos],
                    border: rankingPositionFilter === pos ? '2px solid #ff1493' : '2px solid transparent',
                    color: pos === 'ALL' ? '#fff' : '#111',
                  }}
                >{pos}</button>
              ))}
            </div>
            <table className="rankings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>Rec</th>
                  <th>Rec Yards</th>
                  <th>Rush Yards</th>
                  <th>Tot TDs</th>
                  <th>Pass Yds</th>
                  <th>Pass TDs</th>
                  <th>INTs</th>
                  <th>PPG</th>
                  <th>Proj. Value</th>
                </tr>
              </thead>
              <tbody>
                {fullRankings.filter((r) => rankingPositionFilter === 'ALL' || r.player_position === rankingPositionFilter).map((r) => (
                  <tr key={r.rank ?? r.full_name}>
                    <td>{r.rank ?? '-'}</td>
                    <td className={`pos-${r.player_position}-highlight`}>{r.full_name}</td>
                    <td>{r.player_position}</td>
                   <td>{r.proj_receptions != null ? Math.round(r.proj_receptions) : '—'}</td>
<td>{r.proj_rec_yards != null ? Math.round(r.proj_rec_yards) : '—'}</td>
<td>{r.proj_rush_yards != null ? Math.round(r.proj_rush_yards) : '—'}</td>
<td>{r.proj_total_tds != null ? r.proj_total_tds.toFixed(1) : '—'}</td>
<td>{r.proj_pass_yards != null ? Math.round(r.proj_pass_yards) : '—'}</td>
<td>{r.proj_pass_tds != null ? r.proj_pass_tds.toFixed(1) : '—'}</td>
<td>{r.proj_interceptions != null ? r.proj_interceptions.toFixed(1) : '—'}</td>
<td>{r.proj_ppg != null ? r.proj_ppg.toFixed(1) : '—'}</td>
<td>{tier1Cap !== null ? `$${capDollarValue(r.cap_percent)}` : `${r.cap_percent}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setShowFullRankings(false)}>Close</button>
          </div>
        </div>
      )}

      {editingUsername && (
        <div className="modal-overlay" onClick={() => setEditingUsername(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Change username</h3>
            <input
              type="text"
              placeholder="New username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={handleChangeUsername}>Save</button>
              <button onClick={() => setEditingUsername(false)}>Cancel</button>
            </div>
            {accountMsg && <div style={{ marginTop: 8 }}>{accountMsg}</div>}
          </div>
        </div>
      )}

      {editingPassword && (
        <div className="modal-overlay" onClick={() => setEditingPassword(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Change password</h3>
            <input
              type="password"
              placeholder="New password (min. 8 characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={handleChangePassword}>Save</button>
              <button onClick={() => setEditingPassword(false)}>Cancel</button>
            </div>
            {accountMsg && <div style={{ marginTop: 8 }}>{accountMsg}</div>}
          </div>
        </div>
      )}

      {showCreateLeague && (
        <div className="modal-overlay" onClick={() => setShowCreateLeague(false)}>
          <div className="modal-box modal-box-narrow" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center', color: 'var(--color-pos-wr)' }}>Create a League</h3>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="field-label" style={{ flex: 1, minWidth: 180 }}>League name</label>
                <input
                  type="text"
                  style={{ flex: 2 }}
                  placeholder="League name"
                  value={newLeagueName}
                  maxLength={20}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="field-label" style={{ flex: 1, minWidth: 180 }}>How many points per reception?</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="e.g. 0.5"
                  style={{ flex: 2 }}
                  value={newScoring}
                  onChange={(e) => setNewScoring(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="field-label" style={{ flex: 1, minWidth: 180 }}>How many relegation tiers would you like to do?</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Number of tiers"
                  style={{ flex: 2 }}
                  value={newRelegationTiers}
                  onChange={(e) => setNewRelegationTiers(Number(e.target.value))}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="field-label" style={{ flex: 1, minWidth: 180 }}>Teams per tier (4-16)</label>
                <input
                  type="number"
                  min="4"
                  max="16"
                  step="1"
                  placeholder="Teams per tier"
                  style={{ flex: 2 }}
                  value={newNumTeams}
                  onChange={(e) => setNewNumTeams(Number(e.target.value))}
                />
              </div>

              {totalTeams > 0 && (
                <div style={{ marginTop: 4, color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                  This League will have <strong>{totalTeams}</strong> teams total.
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label className="field-label" style={{ flex: 1, minWidth: 180 }}>Salary cap ($100-$1000000)</label>
                <div style={{ position: 'relative', flex: 2 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>$</span>
                  <input
                    type="number"
                    min="100"
                    max="100000"
                    step="1"
                    style={{ paddingLeft: 24, width: '100%' }}
                    value={newSalaryCap}
                    onChange={(e) => setNewSalaryCap(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={handleCreateLeague} style={{ background: 'var(--color-pos-rb)', color: '#111' }}>Create</button>
              <button onClick={() => { setShowCreateLeague(false); resetCreateLeagueForm(); }}>Cancel</button>
            </div>
            {leagueMsg && <div className="error-text" style={{ marginTop: 8 }}>{leagueMsg}</div>}
          </div>
        </div>
      )}

      {showCrestEditor && (
        <div className="modal-overlay" onClick={() => setShowCrestEditor(false)}>
          <div className="modal-box modal-box-narrow" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center' }}>Customize Crest</h3>

            <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1 }}>
                {['vertical', 'checkered', 'diagonal', 'solid'].map((p) => (
                  <div
                    key={p}
                    onClick={() => setCrestData({ ...crestData, pattern: p })}
                    style={{
                      border: crestData.pattern === p ? '2px solid var(--color-pos-rb)' : '2px solid transparent',
                      borderRadius: 8,
                      padding: 4,
                      display: 'flex',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Crest pattern={p} color1={crestData.color1} color2={crestData.color2} size={70} onClick={() => setCrestData({ ...crestData, pattern: p })} />
                  </div>
                ))}
              </div>

              <div style={{ flex: '0 0 110px', display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
                <div>
                  <label className="field-label">Color 1</label>
                  <input
                    type="color"
                    value={crestData.color1}
                    onChange={(e) => setCrestData({ ...crestData, color1: e.target.value })}
                    style={{ width: '100%', height: 40, padding: 2 }}
                  />
                </div>
                <div>
                  <label className="field-label">Color 2</label>
                  <input
                    type="color"
                    value={crestData.color2}
                    onChange={(e) => setCrestData({ ...crestData, color2: e.target.value })}
                    style={{ width: '100%', height: 40, padding: 2 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button onClick={handleSaveCrest} style={{ background: 'var(--color-pos-rb)', color: '#111' }}>Save</button>
              <button onClick={() => setShowCrestEditor(false)}>Cancel</button>
            </div>
            {crestMsg && <div className="error-text" style={{ marginTop: 8 }}>{crestMsg}</div>}
          </div>
        </div>
      )}

      {removingTeam && (
        <div className="modal-overlay" style={{ zIndex: 200 }} onClick={() => setRemovingTeam(null)}>
          <div className="modal-box modal-box-narrow" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center' }}>Remove {removingTeam.team_name}?</h3>
            <p className="muted-text" style={{ textAlign: 'center' }}>
              Remove just the user (a bot takes over their slot), or remove the team slot entirely?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => handleRemoveUser(removingTeam.team_id)}>Remove User</button>
              <button onClick={() => handleRemoveSlot(removingTeam.team_id, removingTeam.tier_number)}>Remove Team Slot</button>
              <button onClick={() => setRemovingTeam(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showSeasonSchedule && (
        <div className="modal-overlay" onClick={() => setShowSeasonSchedule(false)}>
          <div className="modal-box modal-box-narrow" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center' }}>Season Schedule</h3>
            {seasonScheduleRows.length === 0 ? (
              <div className="muted-text" style={{ textAlign: 'center', marginTop: 10 }}>No schedule found.</div>
            ) : (
              <table className="rankings-table" style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Week</th>
                    <th>Opponent</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonScheduleRows.map((row) => (
                    <tr key={row.week} style={row.week === currentLeagueWeek ? { fontWeight: 'bold' } : undefined}>
                      <td>{row.week}</td>
                      <td>{row.opponent_name || 'Bye'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <button onClick={() => setShowSeasonSchedule(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showJoinLeague && (
        <div className="modal-overlay" onClick={() => (joinViaInviteLink ? handleDeclineInvite() : setShowJoinLeague(false))}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>{joinViaInviteLink ? 'League Invitation' : 'Join League'}</h3>
            {joinViaInviteLink && (
              <p className="muted-text" style={{ marginTop: -4, marginBottom: 10 }}>
                You've been invited to join a league. Accept to join, or decline to dismiss this invite.
              </p>
            )}
            <input
              type="text"
              placeholder="Invite code"
              value={joinCode}
              disabled={joinViaInviteLink}
              onChange={(e) => setJoinCode(e.target.value)}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={handleJoinLeague}>{joinViaInviteLink ? 'Accept' : 'Join'}</button>
              <button onClick={() => (joinViaInviteLink ? handleDeclineInvite() : setShowJoinLeague(false))}>
                {joinViaInviteLink ? 'Decline' : 'Cancel'}
              </button>
            </div>
            {leagueMsg && <div className="error-text" style={{ marginTop: 8 }}>{leagueMsg}</div>}
          </div>
        </div>
      )}

      {showInviteModal && activeLeague && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Invite Users</h3>
            <p className="muted-text">Share this code, or send the link directly — either lets someone join {activeLeague.league_name}.</p>
            <div style={{
              textAlign: 'center', fontSize: '1.8rem', fontWeight: 'bold', letterSpacing: '2px',
              padding: '14px', marginTop: 10, background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)', borderRadius: 8,
            }}>
              {activeLeague.invite_code}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button onClick={copyInviteLink}>{copiedInvite ? 'Copied!' : 'Copy Link'}</button>
              <button onClick={() => setShowInviteModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showLeagueSettings && activeLeague && (
        <div className="modal-overlay" onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>
          <div className="modal-box modal-box-settings" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center', fontFamily: 'Georgia', fontSize: '1.8rem' }}>{activeLeague.league_name} Settings</h3>
            <div className="settings-grid">
              {[
                ['General', '⚙️'],
                ['Scoring', '🏈'],
                ['Auction', '💰'],
                ['Roster', '👥'],
                ['LM Tools', '🛠️'],
                ['Relegation', ''],
              ].map(([label]) => {
                const isLmTools = label === 'LM Tools';
                const disabled = isLmTools && !activeLeague.is_owner;
                return (
                  <button
                    key={label}
                    className="settings-cell"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      setSettingsSection(label);
                      setGeneralMsg('');
                      setScoringMsg('');
                      setAuctionMsg('');
                      setRosterMsg('');
                      setLmMsg('');
                      setRelegationMsg('');
                    }}
                  >
                    <div style={{ fontSize: '1.8rem' }}>{ICONS[label]}</div>
                    <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{label}</div>
                  </button>
                );
              })}
            </div>

            {settingsSection === 'General' && generalSettings && (
              <div style={{ marginTop: 20 }}>
                <div className="settings-row" style={{ gridTemplateColumns: '1fr 280px' }}>
                  <label>League Name</label>
                  <input
                    type="text"
                    disabled={!activeLeague.is_owner}
                    maxLength={20}
                    value={generalSettings.name}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, name: e.target.value })}
                  />
                </div>

                <div className="settings-row">
                  <label>Make league public</label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        disabled={!activeLeague.is_owner}
                        checked={generalSettings.is_public}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, is_public: e.target.checked })}
                      />
                      <span className="switch-slider"></span>
                    </label>
                    <span className="switch-label">{generalSettings.is_public ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label>Bonus win for top half of week in scoring <em>(recommended)</em></label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        disabled={!activeLeague.is_owner}
                        checked={generalSettings.bonus_win_top_half}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, bonus_win_top_half: e.target.checked })}
                      />
                      <span className="switch-slider"></span>
                    </label>
                    <span className="switch-label">{generalSettings.bonus_win_top_half ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div className="settings-row">
                  <label># of teams</label>
                  <input
                    type="number"
                    min="4"
                    max="16"
                    disabled={!activeLeague.is_owner}
                    value={generalSettings.num_teams ?? ''}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, num_teams: e.target.value })}
                  />
                </div>

                <div className="settings-row">
                  <label># of tiers for relegation</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    disabled={!activeLeague.is_owner}
                    value={generalSettings.relegation_tiers ?? ''}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, relegation_tiers: e.target.value })}
                  />
                </div>

                <div className="settings-row">
                  <label>Weeks in a season</label>
                  <input
                    type="number"
                    min="1"
                    max="18"
                    disabled={!activeLeague.is_owner}
                    value={generalSettings.season_weeks ?? 17}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, season_weeks: e.target.value })}
                  />
                </div>

                <div>
                  <div className="settings-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <label>Teams relegated / promoted each season</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      disabled={!activeLeague.is_owner}
                      value={generalSettings.promote_relegate_count ?? ''}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, promote_relegate_count: e.target.value })}
                    />
                  </div>
                  <div className="settings-note">2 of every 10 teams is recommended</div>
                </div>

                <div className="settings-row">
                  <label>Salary cap</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>$</span>
                    <input
                      type="number"
                      min="100"
                      max="1000000"
                      disabled={!activeLeague.is_owner}
                      value={generalSettings.salary_cap ?? ''}
                      onChange={(e) => setGeneralSettings({ ...generalSettings, salary_cap: e.target.value })}
                      style={{ paddingLeft: 18 }}
                    />
                  </div>
                </div>

                <div className="settings-row" style={{ borderBottom: 'none' }}>
                  <label>Contract nulled if player placed on IR</label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        disabled={!activeLeague.is_owner}
                        checked={generalSettings.ir_voids_contract}
                        onChange={(e) => setGeneralSettings({ ...generalSettings, ir_voids_contract: e.target.checked })}
                      />
                      <span className="switch-slider"></span>
                    </label>
                    <span className="switch-label">{generalSettings.ir_voids_contract ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  {activeLeague.is_owner && (
                    <button style={{ background: 'var(--color-pos-rb)', color: '#111' }} onClick={handleSaveGeneralSettings}>
                      Save
                    </button>
                  )}
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Close</button>
                </div>

                <div className="scoring-subheading" style={{ marginTop: 24 }}>Danger Zone</div>
                <div className="settings-note" style={{ marginBottom: 10 }}>
                  {activeLeague.is_owner
                    ? 'Leaving hands the league to another member. Deleting removes the league, its teams and every contract in it, for everyone. Neither can be undone.'
                    : 'Leaving gives up your team and every contract on it. This cannot be undone.'}
                </div>
                {leagueExitConfirm === null ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setGeneralMsg(''); setLeagueExitConfirm('leave'); }}>
                      Leave League
                    </button>
                    {activeLeague.is_owner && (
                      <button
                        style={{ background: 'var(--color-error)', color: '#111', fontWeight: 'bold' }}
                        onClick={() => { setGeneralMsg(''); setLeagueExitConfirm('delete'); }}
                      >
                        Delete League
                      </button>
                    )}
                    {activeLeague.is_owner && (
                      <button
                        style={{ background: 'var(--color-error)', color: '#111', fontWeight: 'bold' }}
                        onClick={() => { setGeneralMsg(''); setLeagueExitConfirm('wipe'); }}
                      >
                        Wipe Draft Results
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span className="error-text" style={{ fontSize: '0.85rem' }}>
                      {leagueExitConfirm === 'delete'
                        ? `Permanently delete ${activeLeague.league_name}?`
                        : leagueExitConfirm === 'wipe'
                        ? `Remove every player from every team in ${activeLeague.league_name} and allow a new draft to be scheduled?`
                        : `Leave ${activeLeague.league_name}?`}
                    </span>
                    <button
                      style={{ background: 'var(--color-error)', color: '#111', fontWeight: 'bold' }}
                      onClick={
                        leagueExitConfirm === 'delete' ? handleDeleteLeague
                        : leagueExitConfirm === 'wipe' ? handleWipeDraftResults
                        : handleLeaveLeague
                      }
                    >
                      Yes, {leagueExitConfirm === 'delete' ? 'delete it' : leagueExitConfirm === 'wipe' ? 'wipe it' : 'leave'}
                    </button>
                    <button onClick={() => setLeagueExitConfirm(null)}>Cancel</button>
                  </div>
                )}

                {generalMsg && (
                  <div className={generalMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                    {generalMsg}
                  </div>
                )}
              </div>
            )}

            {settingsSection === 'Scoring' && scoringSettings && (
              <div style={{ marginTop: 20 }}>
                <div className="scoring-subheading">Passing</div>
                <ScoringRow label="Passing Yards" abbr="PY" value={scoringSettings.pass_yd} touched={scoringTouched.pass_yd} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('pass_yd', e.target.value)} />
                <ScoringRow label="TD Pass" abbr="PTD" value={scoringSettings.pass_td} touched={scoringTouched.pass_td} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('pass_td', e.target.value)} />
                <ScoringRow label="Interceptions Thrown" abbr="INT" value={scoringSettings.pass_int} touched={scoringTouched.pass_int} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('pass_int', e.target.value)} />
                <ScoringRow label="2pt Passing Conversion" abbr="2PC" value={scoringSettings.pass_2pt} touched={scoringTouched.pass_2pt} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('pass_2pt', e.target.value)} />
                <ScoringRow label="40+ yard TD pass bonus" abbr="PTD40" value={scoringSettings.pass_td_40_bonus} touched={scoringTouched.pass_td_40_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('pass_td_40_bonus', e.target.value)} />
                <ScoringRow label="50+ yard TD pass bonus" abbr="PTD50" value={scoringSettings.pass_td_50_bonus} touched={scoringTouched.pass_td_50_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('pass_td_50_bonus', e.target.value)} />
                <ScoringRow label="300-399 yard passing game" abbr="P300" value={scoringSettings.pass_300_bonus} touched={scoringTouched.pass_300_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('pass_300_bonus', e.target.value)} />
                <ScoringRow label="400+ yard passing game" abbr="P400" value={scoringSettings.pass_400_bonus} touched={scoringTouched.pass_400_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('pass_400_bonus', e.target.value)} />

                <div className="scoring-subheading">Rushing</div>
                <ScoringRow label="Rushing Yards" value={scoringSettings.rush_yd} touched={scoringTouched.rush_yd} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rush_yd', e.target.value)} />
                <ScoringRow label="Rushing TD" value={scoringSettings.rush_td} touched={scoringTouched.rush_td} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rush_td', e.target.value)} />
                <ScoringRow label="2pt Rushing Conversion" value={scoringSettings.rush_2pt} touched={scoringTouched.rush_2pt} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rush_2pt', e.target.value)} />
                <ScoringRow label="40+ yard TD rush bonus" abbr="RTD40" value={scoringSettings.rush_td_40_bonus} touched={scoringTouched.rush_td_40_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rush_td_40_bonus', e.target.value)} />
                <ScoringRow label="50+ yard TD rush bonus" abbr="RTD50" value={scoringSettings.rush_td_50_bonus} touched={scoringTouched.rush_td_50_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rush_td_50_bonus', e.target.value)} />
                <ScoringRow label="Rushing First Down" abbr="RFD" value={scoringSettings.rush_first_down} touched={scoringTouched.rush_first_down} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rush_first_down', e.target.value)} />
                <ScoringRow label="100-199 yard rushing game" abbr="RY100" value={scoringSettings.rush_100_bonus} touched={scoringTouched.rush_100_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rush_100_bonus', e.target.value)} />
                <ScoringRow label="200+ yard rushing game" abbr="RY200" value={scoringSettings.rush_200_bonus} touched={scoringTouched.rush_200_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rush_200_bonus', e.target.value)} />
                <ScoringRow label="Fumbles Lost" value={scoringSettings.fumble_lost} touched={scoringTouched.fumble_lost} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('fumble_lost', e.target.value)} />

                <div className="scoring-subheading">Receiving</div>
                <ScoringRow label="Receiving Yards" value={scoringSettings.rec_yd} touched={scoringTouched.rec_yd} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rec_yd', e.target.value)} />
                <ScoringRow label="Receptions" value={scoringSettings.reception} touched={scoringTouched.reception} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('reception', e.target.value)} />
                <ScoringRow label="TD Catch" value={scoringSettings.rec_td} touched={scoringTouched.rec_td} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rec_td', e.target.value)} />
                <ScoringRow label="40+ yard TD rec bonus" abbr="RETD40" value={scoringSettings.rec_td_40_bonus} touched={scoringTouched.rec_td_40_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rec_td_40_bonus', e.target.value)} />
                <ScoringRow label="50+ yard TD rec bonus" abbr="RETD50" value={scoringSettings.rec_td_50_bonus} touched={scoringTouched.rec_td_50_bonus} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rec_td_50_bonus', e.target.value)} />
                <ScoringRow label="Receiving First Down" abbr="REFD" value={scoringSettings.rec_first_down} touched={scoringTouched.rec_first_down} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rec_first_down', e.target.value)} />
                <ScoringRow label="2pt Receiving Conversion" abbr="2PRE" value={scoringSettings.rec_2pt} touched={scoringTouched.rec_2pt} disabled={!activeLeague.is_owner} comingSoon onChange={(e) => updateScoringField('rec_2pt', e.target.value)} />
                <ScoringRow label="100-199 yard receiving game" abbr="REY100" value={scoringSettings.rec_100_bonus} touched={scoringTouched.rec_100_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rec_100_bonus', e.target.value)} />
                <ScoringRow label="200+ yard receiving game" abbr="REY200" value={scoringSettings.rec_200_bonus} touched={scoringTouched.rec_200_bonus} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('rec_200_bonus', e.target.value)} />
                <ScoringRow label="Tight End Bonus (pts per reception)" value={scoringSettings.te_bonus_per_reception} touched={scoringTouched.te_bonus_per_reception} disabled={!activeLeague.is_owner} onChange={(e) => updateScoringField('te_bonus_per_reception', e.target.value)} />

                <div className="settings-note" style={{ marginTop: 8 }}>
                  Note: 40+/50+ yard TD bonuses, first-down bonuses, and 2pt conversion bonuses are stored here but don't affect real scores yet — that needs play-by-play stat tracking we don't have. Yardage-milestone bonuses and the TE bonus are fully live.
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  {activeLeague.is_owner && (
                    <button style={{ background: 'var(--color-pos-rb)', color: '#111' }} onClick={handleSaveScoringSettings}>
                      Save
                    </button>
                  )}
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Close</button>
                </div>
                {scoringMsg && <div className="success-text" style={{ marginTop: 8 }}>{scoringMsg}</div>}
              </div>
            )}
{settingsSection === 'Auction' && auctionSettings && (() => {
  const { date: initialDraftDate, time: initialDraftTime } = getDateTimeParts(auctionSettings.initial_draft_at);
  return (
    <div style={{ marginTop: 20 }}>
      <div className="scoring-subheading">Scheduling</div>

      <div className="settings-row" style={{ gridTemplateColumns: '1fr auto' }}>
        <label>Initial draft date</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="date"
            disabled={!activeLeague.is_owner}
            value={initialDraftDate ?? ''}
            onChange={(e) => setInitialDraftDateTime(e.target.value, initialDraftTime)}
            style={{ width: 150, color: auctionTouched.initial_draft_at ? 'var(--color-text)' : 'var(--color-white)' }}
          />
        <select
  disabled={!activeLeague.is_owner}
  value={initialDraftTime ?? '18:00'}
  onChange={(e) => setInitialDraftDateTime(initialDraftDate, e.target.value)}
  style={{ width: 140, color: auctionTouched.initial_draft_at ? 'var(--color-text)' : 'var(--color-text-muted)' }}
>
  {weeklyAuctionTimeOptions.map((option) => (
    <option key={option.value} value={option.value}>
      {option.label}
    </option>
  ))}
</select>
        </div>
      </div>

      <div className="settings-row" style={{ gridTemplateColumns: '1fr auto' }}>
        <label>Weekly auction day</label>
        <select
          disabled={!activeLeague.is_owner}
          value={auctionSettings.weekly_auction_day ?? 'Wednesday'}
          onChange={(e) => updateAuctionField('weekly_auction_day', e.target.value)}
          style={{ width: 140, color: auctionTouched.weekly_auction_day ? 'var(--color-text)' : 'var(--color-text-muted)' }}
        >
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
        </select>
      </div>

      <div>
        <div className="settings-row" style={{ gridTemplateColumns: '1fr auto', borderBottom: 'none', paddingBottom: 0 }}>
          <label>Weekly auction time</label>
          <select
            disabled={!activeLeague.is_owner}
            value={auctionSettings.weekly_auction_time ?? '18:00'}
            onChange={(e) => updateAuctionField('weekly_auction_time', e.target.value)}
            style={{ width: 140, color: auctionTouched.weekly_auction_time ? 'var(--color-text)' : 'var(--color-text-muted)' }}
          >
            {weeklyAuctionTimeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-note">
          Must fall between Tuesday 12:00 PM and Thursday 11:00 AM, Eastern time.
        </div>
      </div>
                  <div className="scoring-subheading">Auction</div>
                  <ScoringRow label="Time per player (min)" step="1" value={auctionSettings.initial_countdown_minutes} touched={auctionTouched.initial_countdown_minutes} disabled={!activeLeague.is_owner} onChange={(e) => updateAuctionField('initial_countdown_minutes', e.target.value)} />
                  <ScoringRow label="Timer reset after bid (seconds)" step="1" value={auctionSettings.min_bid_reset_seconds} touched={auctionTouched.min_bid_reset_seconds} disabled={!activeLeague.is_owner} onChange={(e) => updateAuctionField('min_bid_reset_seconds', e.target.value)} />
                  <ScoringRow label="Players put up at a time (max 4)" step="1" value={auctionSettings.players_per_auction} touched={auctionTouched.players_per_auction} disabled={!activeLeague.is_owner} onChange={(e) => updateAuctionField('players_per_auction', e.target.value)} />
                  <div className="settings-note">
                    Turn order isn't editable. It always starts with the top teams in the highest tier and works down the standings — e.g. the top 4 in Tier 1 go first, then the next 4, then the bottom 2 in Tier 1 together with the top 2 in Tier 2, and so on. Whoever's turn it is to select a player automatically places the first bid.
                  </div>
                  <div className="scoring-subheading">Financials</div>

                {auctionSettings.tiers && auctionSettings.tiers.map((t) => (
                  <div key={t.tier_number} className="settings-row">
                    <label>Tier {t.tier_number} Salary Cap</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>$</span>
                      <input
                        type="number"
                        min="10"
                        disabled={!activeLeague.is_owner}
                        value={t.salary_cap ?? ''}
                        onChange={(e) => updateTierCap(t.tier_number, e.target.value)}
                        style={{ paddingLeft: 18, color: auctionTouched[`tier_${t.tier_number}`] ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                      />
                    </div>
                  </div>
                ))}
                <div className="settings-note">
                  It's highly recommended to lower the cap as you drop tiers.
                </div>

                <div>
                  <div className="settings-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                    <label>Weekly interest</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        disabled={!activeLeague.is_owner}
                        value={auctionSettings.interest_rate_per_week ?? ''}
                        onChange={(e) => updateAuctionField('interest_rate_per_week', e.target.value)}
                        style={{ paddingRight: 20, color: auctionTouched.interest_rate_per_week ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                      />
                      <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>%</span>
                    </div>
                  </div>
                  <div className="settings-note">
                    Example: 4% interest on a $50 contract signed for 10 weeks costs 50 × (1 + (10 × .04)) = $70 of cap space by week 10. Recommended between 1%-4%.
                  </div>
                </div>

                <div className="settings-row">
                  <label>Max number of 1 week contracts</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!activeLeague.is_owner}
                    value={auctionSettings.max_one_week_contracts ?? ''}
                    onChange={(e) => updateAuctionField('max_one_week_contracts', e.target.value)}
                    style={{ color: auctionTouched.max_one_week_contracts ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                  />
                </div>

                <div className="settings-row">
                  <label>Max number of 2 week contracts</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!activeLeague.is_owner}
                    value={auctionSettings.max_two_week_contracts ?? ''}
                    onChange={(e) => updateAuctionField('max_two_week_contracts', e.target.value)}
                    style={{ color: auctionTouched.max_two_week_contracts ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                  />
                </div>

                <div className="settings-row">
                  <label>Max number of 10+ week contracts</label>
                  <input
                    type="number"
                    min="0"
                    disabled={!activeLeague.is_owner}
                    value={auctionSettings.max_long_term_contracts ?? ''}
                    onChange={(e) => updateAuctionField('max_long_term_contracts', e.target.value)}
                    style={{ color: auctionTouched.max_long_term_contracts ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                  />
                </div>

                <div className="settings-row">
                  <label>Unused cap that rolls over each week</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      disabled={!activeLeague.is_owner}
                      value={auctionSettings.cap_rollover_pct ?? ''}
                      onChange={(e) => updateAuctionField('cap_rollover_pct', e.target.value)}
                      style={{ paddingRight: 20, color: auctionTouched.cap_rollover_pct ? 'var(--color-text)' : 'var(--color-text-muted)' }}
                    />
                    <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>%</span>
                  </div>
                </div>

                <div className="settings-row" style={{ borderBottom: 'none' }}>
                  <label>Can users trade future weeks cap space?</label>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <label className="switch">
                      <input
                        type="checkbox"
                        disabled={!activeLeague.is_owner}
                        checked={auctionSettings.allow_cap_trading}
                        onChange={(e) => updateAuctionField('allow_cap_trading', e.target.checked)}
                      />
                      <span className="switch-slider"></span>
                    </label>
                    <span className="switch-label">{auctionSettings.allow_cap_trading ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  {activeLeague.is_owner && (
                    <button style={{ background: 'var(--color-pos-rb)', color: '#111' }} onClick={handleSaveAuctionSettings}>
                      Save
                    </button>
                  )}
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Close</button>
                </div>
                {auctionMsg && (
                  <div className={auctionMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                    {auctionMsg}
                  </div>
                )}
              </div>
              );
            })()}

            {settingsSection === 'Roster' && rosterSettings && (
              <div style={{ marginTop: 20 }}>
                <div className="scoring-subheading">Roster Slots</div>
                <ScoringRow label="QB" step="1" value={rosterSettings.roster_qb} touched={rosterTouched.roster_qb} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_qb', e.target.value)} />
                <ScoringRow label="RB" step="1" value={rosterSettings.roster_rb} touched={rosterTouched.roster_rb} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_rb', e.target.value)} />
                <ScoringRow label="WR" step="1" value={rosterSettings.roster_wr} touched={rosterTouched.roster_wr} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_wr', e.target.value)} />
                <ScoringRow label="TE" step="1" value={rosterSettings.roster_te} touched={rosterTouched.roster_te} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_te', e.target.value)} />
                <ScoringRow label="Flex" step="1" value={rosterSettings.roster_flex} touched={rosterTouched.roster_flex} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_flex', e.target.value)} />
                <ScoringRow label="Superflex" step="1" value={rosterSettings.roster_superflex} touched={rosterTouched.roster_superflex} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_superflex', e.target.value)} />
                <ScoringRow label="Bench" step="1" value={rosterSettings.roster_bench} touched={rosterTouched.roster_bench} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_bench', e.target.value)} />
                <ScoringRow label="Bye week slots" step="1" value={rosterSettings.roster_bye_slots} touched={rosterTouched.roster_bye_slots} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('roster_bye_slots', e.target.value)} />

                <div className="scoring-subheading">Maximum drafted per position</div>
                <ScoringRow label="Max QB" step="1" value={rosterSettings.max_draft_qb} touched={rosterTouched.max_draft_qb} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('max_draft_qb', e.target.value)} />
                <ScoringRow label="Max RB" step="1" value={rosterSettings.max_draft_rb} touched={rosterTouched.max_draft_rb} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('max_draft_rb', e.target.value)} />
                <ScoringRow label="Max WR" step="1" value={rosterSettings.max_draft_wr} touched={rosterTouched.max_draft_wr} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('max_draft_wr', e.target.value)} />
                <ScoringRow label="Max TE" step="1" value={rosterSettings.max_draft_te} touched={rosterTouched.max_draft_te} disabled={!activeLeague.is_owner} onChange={(e) => updateRosterField('max_draft_te', e.target.value)} />
                <div className="settings-note">Leave blank for no limit.</div>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  {activeLeague.is_owner && (
                    <button style={{ background: 'var(--color-pos-rb)', color: '#111' }} onClick={handleSaveRosterSettings}>
                      Save
                    </button>
                  )}
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Close</button>
                </div>
                {rosterMsg && (
                  <div className={rosterMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                    {rosterMsg}
                  </div>
                )}
              </div>
            )}

            {settingsSection === 'LM Tools' && (
              <div style={{ marginTop: 20 }}>
                {tierCount > 1 && (
                  <div className="settings-row" style={{ gridTemplateColumns: '160fr 1px' }}>
                    <select value={scheduleTier} onChange={(e) => handleTierChange(Number(e.target.value))}>
                      {Array.from({ length: tierCount }, (_, i) => i + 1).map((t) => (
                        <option key={t} value={t}>Tier {t}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="scoring-subheading">Schedule</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={handleReshuffleSchedule} style={{ color: 'var(--color-success)' }}>Reshuffle Schedule</button>
                  <button onClick={handleOpenManualBuilder}>Manually Make Schedule</button>
                </div>

                {lmSchedule.length === 0 && (
                  <div className="muted-text" style={{ marginBottom: 8 }}>No schedule found for this tier yet.</div>
                )}

                {(showFullSchedule
                  ? Array.from(new Set(lmSchedule.map((m) => m.week)))
                  : Array.from(new Set(lmSchedule.map((m) => m.week))).slice(0, 1)
                ).map((week) => (
                  <div key={week} style={{ marginBottom: 10 }}>
                    <div className="muted-text" style={{ fontSize: '0.85rem' }}>Week {week}</div>
                    {lmSchedule.filter((m) => m.week === week).map((m) => (
                      <div key={m.matchup_id} className="settings-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <label>{m.team1_name}</label>
                        <label>{m.team2_name}</label>
                      </div>
                    ))}
                  </div>
                ))}
                {lmSchedule.length > 0 && (
                  <button
                    onClick={() => setShowFullSchedule(!showFullSchedule)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline', padding: 0, cursor: 'pointer' }}
                  >
                    {showFullSchedule ? 'Show Just Week 1' : 'View Rest of Schedule'}
                  </button>
                )}

                <div className="scoring-subheading">Scoring</div>
                {(showFullScoring ? lmSchedule : lmSchedule.filter((m) => m.week === lmSchedule[0]?.week)).map((m) => (
                  <div key={m.matchup_id} className="settings-row" style={{ gridTemplateColumns: '1fr 90px 90px' }}>
                    <label>Wk {m.week}: {m.team1_name} vs {m.team2_name}</label>
                    <input type="number" value={m.score1} onChange={(e) => updateMatchupScoreLocal(m.matchup_id, 'score1', e.target.value)} />
                    <input type="number" value={m.score2} onChange={(e) => updateMatchupScoreLocal(m.matchup_id, 'score2', e.target.value)} />
                  </div>
                ))}
                {lmSchedule.length > 0 && (
                  <button
                    onClick={() => setShowFullScoring(!showFullScoring)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline', padding: 0, cursor: 'pointer' }}
                  >
                    {showFullScoring ? 'Show Just Week 1' : 'View More'}
                  </button>
                )}

                <div className="scoring-subheading">Standings</div>
                <table className="rankings-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Team</th>
                      <th>W</th>
                      <th>L</th>
                      <th>T</th>
                      <th>PPG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lmStandings.map((s) => (
                      <tr key={s.team_id}>
                        <td>
                          <svg width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer' }} onClick={() => setRemovingTeam({ ...s, tier_number: scheduleTier })}>
                            <circle cx="12" cy="12" r="10" fill="none" stroke="var(--color-error)" strokeWidth="2" />
                            <line x1="5" y1="19" x2="19" y2="5" stroke="var(--color-error)" strokeWidth="2" />
                          </svg>
                        </td>
                        <td>{s.team_name}</td>
                        <td>{s.wins}</td>
                        <td>{s.losses}</td>
                        <td>{s.ties}</td>
                        <td>{s.wins + s.losses + s.ties > 0 ? (s.points_for / (s.wins + s.losses + s.ties)).toFixed(1) : '0.0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Cancel</button>
                  <button onClick={handleSaveAllScores} style={{ background: 'var(--color-pos-rb)', color: '#111' }}>Save</button>
                </div>
                {lmMsg && (
                  <div className={lmMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                    {lmMsg}
                  </div>
                )}
              </div>
            )}

            {showManualBuilder && (
              <div className="modal-overlay" onClick={() => setShowManualBuilder(false)}>
                <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
                  <h3>Manually Make Schedule — Tier {scheduleTier}</h3>
                  <div className="settings-row" style={{ gridTemplateColumns: '1fr 120px' }}>
                    <label>How many weeks is your pattern?</label>
                    <input
                      type="number"
                      min="1"
                      value={manualPatternWeeks}
                      onChange={(e) => setManualPatternWeeks(Number(e.target.value))}
                    />
                  </div>
                  <div className="settings-note" style={{ marginBottom: 10 }}>
                    Fill in as many matchups as you want per week. Once saved, this pattern repeats for the rest of the season.
                  </div>

                  {Array.from({ length: manualPatternWeeks }, (_, i) => i + 1).map((week) => (
                    <div key={week} style={{ marginBottom: 14 }}>
                      <div className="muted-text" style={{ fontSize: '0.85rem', marginBottom: 4 }}>Week {week}</div>
                      {Array.from({ length: Math.ceil(manualTeams.length / 2) }, (_, i) => i).map((slotIndex) => {
                        const key = `${week}-${slotIndex}`;
                        const m = manualMatchups.find((row) => row.key === key) || {};
                        return (
                          <div key={key} className="settings-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                            <select value={m.slot1 || ''} onChange={(e) => updateManualMatchup(week, slotIndex, 'slot1', e.target.value)}>
                              <option value="">Select team</option>
                              {manualTeams.map((t) => (
                                <option key={t.team_id} value={t.slot_number}>{t.team_name}</option>
                              ))}
                            </select>
                            <select value={m.slot2 || ''} onChange={(e) => updateManualMatchup(week, slotIndex, 'slot2', e.target.value)}>
                              <option value="">Select team</option>
                              {manualTeams.map((t) => (
                                <option key={t.team_id} value={t.slot_number}>{t.team_name}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                    <button onClick={handleSaveManualPattern} style={{ background: 'var(--color-pos-rb)', color: '#111' }}>
                      Save & Continue Pattern
                    </button>
                    <button onClick={() => setShowManualBuilder(false)}>Cancel</button>
                  </div>
                  {lmMsg && (
                    <div className={lmMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                      {lmMsg}
                    </div>
                  )}
                </div>
              </div>
            )}

            {settingsSection === 'Relegation' && (
              <div style={{ marginTop: 20 }}>
                <div className="scoring-subheading">Tier Names & Colors</div>
                {relegationTiers.map((t) => (
  <div key={t.tier_number} className="settings-row" style={{ gridTemplateColumns: '1fr 100px 90px 60px' }}>
    <input
      type="text"
      placeholder={`Tier ${t.tier_number} name`}
      disabled={!activeLeague.is_owner}
      value={t.tier_name || ''}
      onChange={(e) => updateTierField(t.tier_number, 'tier_name', e.target.value)}
    />
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>$</span>
      <input
        type="number"
        disabled={!activeLeague.is_owner}
        value={t.salary_cap ?? ''}
        onChange={(e) => {
          updateTierField(t.tier_number, 'salary_cap', e.target.value);
          setRelegationTouched({ ...relegationTouched, [t.tier_number]: true });
        }}
        style={{ paddingLeft: 18, color: relegationTouched[t.tier_number] ? 'var(--color-text)' : 'var(--color-text-muted)' }}
      />
    </div>
    <label className="muted-text" style={{ textAlign: 'right', paddingRight: 8 }}>Tier {t.tier_number}</label>
    <input
      type="color"
      disabled={!activeLeague.is_owner}
      value={t.tier_color || '#888888'}
      onChange={(e) => updateTierField(t.tier_number, 'tier_color', e.target.value)}
      style={{ width: '100%', height: 34, padding: 2 }}
    />
  </div>
))}

                <div className="scoring-subheading">&nbsp;</div>
                {relegationTiers.map((t) => (
                  <div key={t.tier_number} style={{ marginBottom: 12 }}>
<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontWeight: 'bold', color: t.tier_color || 'var(--color-text)' }}>
    {t.tier_name || `Tier ${t.tier_number}`}
  </span>
  <span style={{ fontWeight: 'bold', color: t.tier_color || 'var(--color-text)' }}>
    ({(t.teams || []).length})
  </span>
  {activeLeague.is_owner && (
    addingTeamToTier === t.tier_number ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="error-text" style={{ fontSize: '0.72rem' }}>
          This will reshuffle the schedule.
        </span>
        <button
          onClick={() => handleAddTeamToTier(t.tier_number)}
          style={{ background: 'var(--color-success)', color: '#111', fontSize: '0.72rem', padding: '2px 10px' }}
        >
          Create Team
        </button>
        <button onClick={() => setAddingTeamToTier(null)} style={{ fontSize: '0.72rem', padding: '2px 10px' }}>
          Cancel
        </button>
      </span>
    ) : (
      <button
        onClick={() => setAddingTeamToTier(t.tier_number)}
        title={`Add a team to ${t.tier_name || `Tier ${t.tier_number}`}`}
        style={{
          width: 20, height: 20, borderRadius: '50%', padding: 0,
          background: 'var(--color-success)', color: '#111', border: 'none',
          fontWeight: 'bold', fontSize: '0.9rem', lineHeight: 1,
        }}
      >
        +
      </button>
    )
  )}
  {addTeamSuccessTier === t.tier_number && (
    <span className="success-text" style={{ fontSize: '0.72rem' }}>Team created</span>
  )}
</span>
  {t.tier_number === 1 && activeLeague.is_owner && (
    !confirmingShuffleAll ? (
      <button style={{ color: 'var(--color-success)' }} onClick={() => setConfirmingShuffleAll(true)}>
        Shuffle All Teams
      </button>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="error-text" style={{ fontSize: '0.8rem' }}>Are you sure?</span>
        <button style={{ background: 'var(--color-success)', color: '#111' }} onClick={handleShuffleAllTeams}>
          Yes
        </button>
        <button onClick={() => setConfirmingShuffleAll(false)}>Cancel</button>
      </div>
    )
  )}
</div>                    <ul className="rankings-list">
                      {(t.teams || []).map((team) => (
                        <li key={team.team_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{team.team_name}</span>
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {activeLeague.is_owner && (
                              <svg
                                width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer' }}
                                onClick={() => setRemovingTeam({ ...team, tier_number: t.tier_number })}
                                title={`Remove ${team.team_name}`}
                              >
                                <circle cx="12" cy="12" r="10" fill="var(--color-error)" />
                                <line x1="6" y1="12" x2="18" y2="12" stroke="#fff" strokeWidth="2.5" />
                              </svg>
                            )}
                            <button
                              disabled={!activeLeague.is_owner || t.tier_number === 1}
                              onClick={() => handleMoveTeamTier(team.team_id, 'up')}
                              style={{ padding: '2px 8px' }}
                            >▲</button>
                            <button
                              disabled={!activeLeague.is_owner || t.tier_number === relegationTiers.length}
                              onClick={() => handleMoveTeamTier(team.team_id, 'down')}
                              style={{ padding: '2px 8px' }}
                            >▼</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                {activeLeague.is_owner && relegationTiers.length > 1 && (
                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--color-border-subtle)' }}>
                    <div className="scoring-subheading" style={{ marginTop: 0 }}>End of Season</div>
                    <div className="settings-note" style={{ marginBottom: 10 }}>
                      Promotes the top {promoteRelegateCount} and relegates the bottom {promoteRelegateCount} of every
                      tier, using the final standings. Run this once, after the last week has been scored.
                    </div>
                    {!confirmingRelegationRun ? (
                      <button style={{ color: 'var(--color-success)' }} onClick={() => setConfirmingRelegationRun(true)}>
                        Run Promotion &amp; Relegation
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="error-text" style={{ fontSize: '0.8rem' }}>This moves teams for real. Are you sure?</span>
                        <button style={{ background: 'var(--color-success)', color: '#111' }} onClick={handleRunRelegation}>Yes</button>
                        <button onClick={() => setConfirmingRelegationRun(false)}>Cancel</button>
                      </div>
                    )}
                    {relegationMoves && relegationMoves.length > 0 && (
                      <ul className="rankings-list">
                        {relegationMoves.map((m) => (
                          <li key={m.team_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>{m.team_name}</span>
                            <span className={m.movement === 'promoted' ? 'promo-solid' : 'releg-solid'}>
                              Tier {m.from_tier} → {m.to_tier}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {relegationMsg && (
                  <div className={relegationMsg === 'Saved.' ? 'success-text' : 'error-text'} style={{ marginTop: 8 }}>
                    {relegationMsg}
                  </div>
                )}

                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowLeagueSettings(false); setSettingsSection(null); }}>Close</button>
                  {activeLeague.is_owner && (
                    <button style={{ background: 'var(--color-pos-rb)', color: '#111' }} onClick={handleSaveTierNamesColors}>
                      Save
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}