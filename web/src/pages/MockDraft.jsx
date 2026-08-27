import { Fragment, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { BidControls, formatMatchup, MAX_CONTRACT_WEEKS } from '../draftControls';

const SHIELD_PATH = 'M50 8 Q40 14 30 20 Q20 26 12 15 Q2 20 5 45 Q8 90 50 118 Q92 90 95 45 Q98 20 88 15 Q80 26 70 20 Q60 14 50 8 Z';

const NFL_TEAM_COLORS = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#fcfcfc', BUF: '#f52318', CAR: '#0085CA',
  CHI: '#d6710b', CIN: '#FB4F14', CLE: '#c6820c', DAL: '#82a2dd', DEN: '#FB4F14',
  DET: '#0076B6', GB: '#a9b117', HOU: '#d51e0a', IND: '#025ec7', JAX: '#3294a5',
  KC: '#E31837', LAC: '#0080C6', LAR: '#e6c614', LV: '#f7f2f2', MIA: '#008E97',
  MIN: '#7a36d4', NE: '#1172d2', NO: '#D3BC8D', NYG: '#de180e', NYJ: '#125740',
  PHI: '#0fa354', PIT: '#FFB612', SEA: '#69BE28', SF: '#AA0000', TB: '#D50A0A',
  TEN: '#4B92DB', WAS: '#c9a31b',
};

const POSITION_COLORS = {
  QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)', TE: 'var(--color-pos-te)',
};

const POSITION_ROW_TINT = {
  QB: 'rgba(229, 228, 226, 0.12)', // platinum, toned down
  RB: 'rgba(212, 175, 55, 0.12)',  // gold, toned down
  WR: 'rgba(192, 192, 192, 0.12)', // silver, toned down
  TE: 'rgba(205, 127, 50, 0.12)',  // bronze, toned down
};

const NOMINATION_SECONDS = 20;
const CPU_NOMINATE_DELAY_MS = 1000;
const WINNERS_DISPLAY_MS = 2000;

function Crest({ pattern, color1, color2, size = 28, onClick }) {
  const clipId = `crest-${pattern}-${(color1 || '').replace('#', '')}-${(color2 || '').replace('#', '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 120" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
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
      <path d={SHIELD_PATH} fill="none" stroke="var(--color-border)" strokeWidth="3" />
    </svg>
  );
}

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function getCardSizing(n) {
  if (n <= 2) return { imgSize: 140, nameSize: '1.4rem', padding: 20, statSize: '0.85rem' };
  if (n <= 4) return { imgSize: 120, nameSize: '1.1rem', padding: 14, statSize: '0.85rem' };
  if (n <= 8) return { imgSize: 70, nameSize: '1rem', padding: 10, statSize: '0.75rem' };
  return { imgSize: 50, nameSize: '0.85rem', padding: 8, statSize: '0.65rem' };
}

function pieLayoutForVisibleCount(count) {
  if (count >= 17) return { cols: null, size: 55 }; // null cols = keep the original fixed 4-top/5-bottom split
  if (count === 16) return { cols: 4, size: 58 };
  if (count === 12) return { cols: 3, size: 68 };
  if (count === 9) return { cols: 3, size: 72 };
  if (count <= 4) return { cols: 2, size: 95 };
  const cols = Math.ceil(Math.sqrt(count));
  const size = 55 + Math.round((18 - count) * 2);
  return { cols, size };
}

function computeGridColumns(n) {
  if (n <= 4) return n;
  return Math.ceil(n / 2);
}

function buildMultiSlices(segments, size) {
  const nonZero = segments.filter((s) => s.value > 0);
  if (nonZero.length === 0) return [{ path: null, color: '#000', meta: null }];
  if (nonZero.length === 1) return [{ path: null, color: nonZero[0].color, meta: nonZero[0].meta }];
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

function statOrDash(value, decimals = 0) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (num === 0) return '—';
  return num.toFixed(decimals);
}

function bidAmountColor(amount, cap) {
  const percentOfCap = Math.min(1, Math.max(0, cap > 0 ? amount / cap : 0));
  const stops = [
    [0.00, [255, 255, 255]], // white
    [0.06, [255, 250, 205]], // light yellow
    [0.14, [255, 215, 0]],   // yellow
    [0.23, [255, 200, 120]], // light orange
    [0.3, [255, 140, 0]],   // orange
    [0.36, [255, 105, 180]], // pink
    [0.42, [255, 90, 90]],   // light red
    [1.00, [220, 30, 30]],   // red
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (percentOfCap >= stops[i][0] && percentOfCap <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const t = (percentOfCap - lo[0]) / (hi[0] - lo[0] || 1);
  const rgb = lo[1].map((c, i) => Math.round(c + (hi[1][i] - c) * t));
  return `rgb(${rgb.join(',')})`;
}

function costAtWeek(baseValue, startWeek, week, interestRate) {
  const weeksElapsed = week - startWeek;
  return baseValue * (1 + weeksElapsed * interestRate);
}

function costAtWeekWithBye(baseValue, startWeek, week, interestRate, byeWeek) {
  if (byeWeek && week === byeWeek) return 0;
  let weeksElapsed = week - startWeek;
  if (byeWeek && week > byeWeek && byeWeek >= startWeek) weeksElapsed -= 1;
  return baseValue * (1 + weeksElapsed * interestRate);
}

function contractEndWeek(startWeek, weeksRequested, byeWeek) {
  const naiveEnd = startWeek + weeksRequested - 1;
  if (byeWeek && byeWeek >= startWeek && byeWeek <= naiveEnd) return naiveEnd + 1;
  return naiveEnd;
}

function playBing() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

export default function MockDraft({ league, profile, onBack }) {
  const [started, setStarted] = useState(false);
  const [playersPerAuction, setPlayersPerAuction] = useState(4);
  const [salaryCap, setSalaryCap] = useState(300);
  const [initialCountdownSeconds, setInitialCountdownSeconds] = useState(120);
  const [interestRatePerWeek, setInterestRatePerWeek] = useState(0);
  const [byeWeeksByTeam, setByeWeeksByTeam] = useState({});
  const [scheduleByTeam, setScheduleByTeam] = useState({});
  const [leagueRosterSpec, setLeagueRosterSpec] = useState(null);
  const [bidResetSeconds, setBidResetSeconds] = useState(20);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [slots, setSlots] = useState([]);
  const [wonPlayers, setWonPlayers] = useState([]);
  const [allWonPlayers, setAllWonPlayers] = useState([]);
  const [viewingTeamName, setViewingTeamName] = useState(null);
  const [crestData, setCrestData] = useState({ pattern: 'vertical', color1: '#888888', color2: '#ffffff' });
  const [teamName, setTeamName] = useState('My Team');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [relegationTiers, setRelegationTiers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [positionFilter, setPositionFilter] = useState('ALL');
  const [tooltip, setTooltip] = useState(null);
  const [soloPlayerStats, setSoloPlayerStats] = useState({});
  const [seasonStats2025, setSeasonStats2025] = useState({});
  const [seasonStats2024, setSeasonStats2024] = useState({});
  const [statsView, setStatsView] = useState('current');
  const [hiddenWeeks, setHiddenWeeks] = useState([]);
  const holdTimerRef = useRef(null);

  // --- Turn-based nomination phase state ---
  const [phase, setPhase] = useState('nomination'); // 'nomination' | 'auction' | 'winners'
  const [teamTurnOrder, setTeamTurnOrder] = useState([]); // flat list of team names, in tier order
  const [turnIndex, setTurnIndex] = useState(0);
  const [nominationSlots, setNominationSlots] = useState([]); // { teamName, isMe, player }
  const [nominationTimerEndsAt, setNominationTimerEndsAt] = useState(null);
  const [cpuNominateAt, setCpuNominateAt] = useState(null);
  const [winnersDisplay, setWinnersDisplay] = useState([]);
  const [winnersShownAt, setWinnersShownAt] = useState(null);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const rankedPlayersRef = useRef(rankedPlayers);
  rankedPlayersRef.current = rankedPlayers;
  const nominationSlotsRef = useRef(nominationSlots);
  nominationSlotsRef.current = nominationSlots;

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
    if (!league) return;
    setTeamName(league.team_name || 'My Team');
    supabase
      .from('leagues')
      .select('players_per_auction, salary_cap, initial_countdown_minutes, min_bid_reset_seconds, initial_draft_at, interest_rate_per_week, roster_qb, roster_rb, roster_wr, roster_te, roster_flex, roster_superflex')
      .eq('id', league.league_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setPlayersPerAuction(data.players_per_auction || 4);
          setSalaryCap(Number(data.salary_cap) || 300);
          setInitialCountdownSeconds((Number(data.initial_countdown_minutes) || 2) * 60);
          setBidResetSeconds(Number(data.min_bid_reset_seconds) || 20);
          setInterestRatePerWeek(Number(data.interest_rate_per_week) || 0);
          setLeagueRosterSpec(data);
          setCurrentWeek(getCurrentLeagueWeek(data.initial_draft_at, new Date()));
        }
      });
    supabase
      .rpc('get_relegation_settings', { p_league_id: league.league_id })
      .then(({ data }) => setRelegationTiers(data || []));
  }, [league]);

  // Ticking clock drives countdown displays and all phase resolution
  useEffect(() => {
    const interval = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

function buildNominationRound(order, startIndex, myTeamName) {
  const round = [];
  let cpuCounter = 0;
  for (let i = 0; i < playersPerAuction; i++) {
    const tName = order[(startIndex + i) % order.length];
    const isMe = tName === myTeamName;
    const cpuPickAt = isMe ? null : Date.now() + 3000 + cpuCounter * 1000;
    if (!isMe) cpuCounter++;
    round.push({ teamName: tName, isMe, player: null, cpuPickAt });
  }
  return round;
}

  async function handleStart() {
    setError('');
    if (!league) { setError('No league selected — go back and open a league first.'); return; }

    const { data, error: fetchError } = await supabase.rpc('get_all_players_for_draft');
    if (fetchError) { setError(fetchError.message); return; }
    const withTeams = data || [];
    setRankedPlayers(withTeams);

    supabase
      .from('games')
      .select('week, home_team, away_team')
      .eq('season', 2026)
      .eq('season_type', 'REG')
      .then(({ data: gameRows, error: gamesErr }) => {
        if (gamesErr) { console.error('Schedule fetch failed:', gamesErr); return; }
        const byTeam = {};
        (gameRows || []).forEach((g) => {
          if (!byTeam[g.home_team]) byTeam[g.home_team] = {};
          if (!byTeam[g.away_team]) byTeam[g.away_team] = {};
          byTeam[g.home_team][g.week] = { opponent: g.away_team, isHome: true };
          byTeam[g.away_team][g.week] = { opponent: g.home_team, isHome: false };
        });
        setScheduleByTeam(byTeam);
      });

    supabase.rpc('get_team_bye_weeks', { p_season: 2026 }).then(({ data: byeRows, error: byeErr }) => {
      if (byeErr) { console.error('Bye week fetch failed:', byeErr); return; }
      const byTeam = {};
      (byeRows || []).forEach((row) => { byTeam[row.team] = row.bye_week; });
      setByeWeeksByTeam(byTeam);
    });

    const toById = (rows) => {
      const byId = {};
      (rows || []).forEach((row) => { byId[row.sleeper_id] = row; });
      return byId;
    };
    supabase.rpc('get_bulk_player_stats_by_season', { p_league_id: league.league_id, p_season: 2025 })
      .then(({ data: rows, error: statsErr }) => {
        if (statsErr) { console.error('2025 stats fetch failed:', statsErr); setError(`2025 stats failed: ${statsErr.message}`); }
        setSeasonStats2025(toById(rows));
      });
    supabase.rpc('get_bulk_player_stats_by_season', { p_league_id: league.league_id, p_season: 2024 })
      .then(({ data: rows, error: statsErr }) => {
        if (statsErr) { console.error('2024 stats fetch failed:', statsErr); setError(`2024 stats failed: ${statsErr.message}`); }
        setSeasonStats2024(toById(rows));
      });

    const { data: tiersData } = await supabase.rpc('get_relegation_settings', { p_league_id: league.league_id });
    const tiers = tiersData || relegationTiers;
    const shuffleWithinTier = (teams) => {
      const arr = [...teams];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const flatOrder = (tiers || []).flatMap((t) => shuffleWithinTier((t.teams || []).map((x) => x.team_name)));
    const order = flatOrder.length > 0 ? flatOrder : [league.team_name || 'My Team'];
    setTeamTurnOrder(order);

    const myTeamName = league.team_name || 'My Team';
    const round = buildNominationRound(order, 0, myTeamName);
    setNominationSlots(round);
    setTurnIndex(playersPerAuction % order.length);
    setNominationTimerEndsAt(Date.now() + NOMINATION_SECONDS * 1000);
    setCpuNominateAt(Date.now() + CPU_NOMINATE_DELAY_MS);
    setPhase('nomination');
    setStarted(true);
  }

  // CPU auto-nominate + timeout auto-fill during nomination phase
  useEffect(() => {
  if (phase !== 'nomination') return;

  const timedOut = nominationTimerEndsAt && tick >= nominationTimerEndsAt;
  const currentSlots = nominationSlotsRef.current;

  const readyToPick = currentSlots.filter((s) =>
    !s.player && (timedOut || (!s.isMe && s.cpuPickAt && tick >= s.cpuPickAt))
  );
  if (readyToPick.length === 0) return;

  setRankedPlayers((pool) => {
    const nextPool = [...pool];
    const updatedSlots = currentSlots.map((s) => {
      const shouldPick = !s.player && (timedOut || (!s.isMe && s.cpuPickAt && tick >= s.cpuPickAt));
      if (!shouldPick) return s;
      const picked = nextPool.shift();
      return picked ? { ...s, player: picked } : s;
    });
    setNominationSlots(updatedSlots);
    return nextPool;
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [tick, phase]);
  // Once every nomination slot has a player, transition into the auction phase
  useEffect(() => {
    if (phase !== 'nomination') return;
    if (nominationSlots.length === 0) return;
    if (nominationSlots.some((s) => !s.player)) return;

    const newSlots = nominationSlots.map((s) => ({
      key: Math.random(),
      player: s.player,
      highBid: 1,
      highBidder: s.isMe ? 'me' : 'bot',
      highBidderTeamName: s.teamName,
      myBidAmount: '',
      myWeeks: '',
      timerEndsAt: Date.now() + initialCountdownSeconds * 1000,
      completed: false,
      flipped: false,
    }));
    setSlots(newSlots);
    setPhase('auction');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nominationSlots, phase]);

  // Resolve individual auction slots as their timers expire (no immediate refill —
  // wait for the whole board to finish, then show winners, per spec)
  useEffect(() => {
    if (phase !== 'auction') return;
    const current = slotsRef.current;
    const newlyExpired = current.filter((s) => !s.completed && s.timerEndsAt && tick >= s.timerEndsAt);
    if (newlyExpired.length === 0) return;

    setSlots(current.map((s) => (
      !s.completed && s.timerEndsAt && tick >= s.timerEndsAt ? { ...s, completed: true } : s
    )));

    const allResolved = newlyExpired.filter((s) => Number(s.highBid) > 0);
    if (allResolved.length > 0) {
      setAllWonPlayers((prev) => [
        ...prev,
        ...allResolved.map((s) => ({
          teamName: s.highBidderTeamName,
          isMe: s.highBidder === 'me',
          player: s.player,
          startWeek: currentWeek,
          weeksRequested: Number(s.myWeeks) > 0 ? Number(s.myWeeks) : 1,
          baseValue: Number(s.highBid),
        })),
      ]);
    }

    const won = newlyExpired.filter((s) => s.highBidder === 'me' && Number(s.myBidAmount) > 0 && Number(s.myWeeks) > 0);
    if (won.length > 0) {
      setWonPlayers((prev) => [
        ...prev,
        ...won.map((s) => ({
          player: s.player,
          startWeek: currentWeek,
          weeksRequested: Number(s.myWeeks),
          baseValue: Number(s.myBidAmount),
        })),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase]);

  // Once every slot on the board is completed, show winners, then advance to next nomination round
  useEffect(() => {
    if (phase !== 'auction') return;
    if (slots.length === 0) return;
    if (slots.some((s) => !s.completed)) return;

    setWinnersDisplay(slots.map((s) => ({
      player: s.player,
      teamName: s.highBidderTeamName,
      isMe: s.highBidder === 'me',
      amount: s.highBid,
    })));
    setWinnersShownAt(Date.now());
    setPhase('winners');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, phase]);

  // After the winners are shown for a couple seconds, kick off the next nomination round
  useEffect(() => {
    if (phase !== 'winners') return;
    if (!winnersShownAt || tick < winnersShownAt + WINNERS_DISPLAY_MS) return;

    const order = teamTurnOrder;
    const myTeamName = league?.team_name || 'My Team';
    const round = buildNominationRound(order, turnIndex, myTeamName);
    setNominationSlots(round);
    setTurnIndex((turnIndex + playersPerAuction) % Math.max(1, order.length));
    setNominationTimerEndsAt(Date.now() + NOMINATION_SECONDS * 1000);
    setCpuNominateAt(Date.now() + CPU_NOMINATE_DELAY_MS);
    setPhase('nomination');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, phase, winnersShownAt]);

  function myPendingNominationSlot() {
    if (phase !== 'nomination') return null;
    return nominationSlots.find((s) => s.isMe && !s.player) || null;
  }

  function statsRowFor(player, view) {
    if (view === 'current') return seasonStats2025[player.sleeper_id] || null;
    if (view === 'previous') return seasonStats2024[player.sleeper_id] || null;
    return null;
  }

  function nominatePlayer(player) {
    const mySlot = myPendingNominationSlot();
    if (!mySlot) return;
    setRankedPlayers((pool) => pool.filter((p) => p.sleeper_id !== player.sleeper_id));
    setNominationSlots(nominationSlots.map((s) => (s === mySlot ? { ...s, player } : s)));
  }

  function updateSlotBidAmount(key, value) {
    setSlots(slots.map((s) => (s.key === key ? { ...s, myBidAmount: value } : s)));
  }

  function updateSlotWeeks(key, value) {
    setSlots(slots.map((s) => (s.key === key ? { ...s, myWeeks: value } : s)));
  }

  function toggleFlip(key) {
    setSlots(slots.map((s) => (s.key === key ? { ...s, flipped: !s.flipped } : s)));
  }

  function committedAtWeek(week, excludeSlotKey) {
    let committed = 0;
    for (const w of wonPlayers) {
      const byeWeek = byeWeeksByTeam[w.player.team];
      const endWeek = contractEndWeek(w.startWeek, w.weeksRequested, byeWeek);
      if (week >= w.startWeek && week <= endWeek) {
        committed += costAtWeekWithBye(w.baseValue, w.startWeek, week, interestRatePerWeek, byeWeek);
      }
    }
    for (const other of slots) {
      if (other.key === excludeSlotKey) continue;
      if (other.highBidder !== 'me') continue;
      const otherWeeks = Number(other.myWeeks) || 0;
      if (otherWeeks <= 0) continue;
      const byeWeek = byeWeeksByTeam[other.player.team];
      const endWeek = contractEndWeek(currentWeek, otherWeeks, byeWeek);
      if (week >= currentWeek && week <= endWeek) {
        committed += costAtWeekWithBye(other.highBid, currentWeek, week, interestRatePerWeek, byeWeek);
      }
    }
    return committed;
  }

  function startHoldToHide(week) {
    holdTimerRef.current = setTimeout(() => {
      setHiddenWeeks((prev) => (prev.includes(week) ? prev : [...prev, week]));
      setTooltip(null);
    }, 600);
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function restoreLastHiddenWeek() {
    setHiddenWeeks((prev) => prev.slice(0, -1));
  }

  function submitBid(key, amountOverride, weeksOverride) {
    const s = slots.find((row) => row.key === key);
    if (!s || s.completed) return;
    if (s.highBidder === 'me') return; // already leading — locked until outbid
    const amount = Number(amountOverride ?? s.myBidAmount);
    const rawWeeks = Number(weeksOverride ?? s.myWeeks);
    const weeksEntered = rawWeeks > 0 ? rawWeeks : 1;
    if (!amount || amount <= s.highBid) return;

    const violatedWeeks = [];
    const byeWeek = byeWeeksByTeam[s.player.team];
    const endWeek = contractEndWeek(currentWeek, weeksEntered, byeWeek);
    for (let w = currentWeek; w <= endWeek; w++) {
      const cost = costAtWeekWithBye(amount, currentWeek, w, interestRatePerWeek, byeWeek);
      if (cost === 0) continue;
      const committed = committedAtWeek(w, key);
      if (committed + cost > salaryCap) violatedWeeks.push(w);
    }

    if (violatedWeeks.length > 0) {
      setError(`This bid exceeds your cap in week(s) ${violatedWeeks.join(', ')}.`);
      setSlots(slots.map((row) => (row.key === key ? { ...row, myBidAmount: '' } : row)));
      return;
    }
    setError('');
   setSlots(slots.map((row) => {
  if (row.key !== key) return row;
  const minFloorEndsAt = Date.now() + bidResetSeconds * 1000;
  const timerWasExtended = row.timerEndsAt <= minFloorEndsAt;
  const newTimerEndsAt = timerWasExtended ? minFloorEndsAt : row.timerEndsAt;
  return {
    ...row,
    highBid: amount,
    highBidder: 'me',
    highBidderTeamName: teamName,
    myWeeks: String(weeksEntered),
    timerEndsAt: newTimerEndsAt,
    flashUntil: timerWasExtended ? Date.now() + 1000 : row.flashUntil,
  };
}));
  }

  function buildMyRosterSlots() {
    if (!leagueRosterSpec) return [];
    const positionCounts = [
      ['QB', leagueRosterSpec.roster_qb], ['RB', leagueRosterSpec.roster_rb],
      ['WR', leagueRosterSpec.roster_wr], ['TE', leagueRosterSpec.roster_te],
      ['FLEX', leagueRosterSpec.roster_flex], ['SFLEX', leagueRosterSpec.roster_superflex],
    ];
    const byPosition = { QB: [], RB: [], WR: [], TE: [] };
    wonPlayers.forEach((w) => { if (byPosition[w.player.player_position]) byPosition[w.player.player_position].push(w); });
    const used = new Set();
    const rosterSlots = [];
    for (const [pos, count] of positionCounts) {
      for (let i = 0; i < count; i++) {
        let won = null;
        if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
          won = byPosition[pos].find((w) => !used.has(w.player.sleeper_id)) || null;
        } else {
          won = ['RB', 'WR', 'TE'].flatMap((p) => byPosition[p]).find((w) => !used.has(w.player.sleeper_id)) || null;
        }
        if (won) used.add(won.player.sleeper_id);
        rosterSlots.push({ position: pos, won });
      }
    }
    return rosterSlots;
  }

  function buildRosterSlotsForTeam(teamName) {
    if (!leagueRosterSpec) return [];
    const positionCounts = [
      ['QB', leagueRosterSpec.roster_qb], ['RB', leagueRosterSpec.roster_rb],
      ['WR', leagueRosterSpec.roster_wr], ['TE', leagueRosterSpec.roster_te],
      ['FLEX', leagueRosterSpec.roster_flex], ['SFLEX', leagueRosterSpec.roster_superflex],
    ];
    const teamPicks = allWonPlayers.filter((w) => w.teamName === teamName);
    const byPosition = { QB: [], RB: [], WR: [], TE: [] };
    teamPicks.forEach((w) => { if (byPosition[w.player.player_position]) byPosition[w.player.player_position].push(w); });
    const used = new Set();
    const rosterSlots = [];
    for (const [pos, count] of positionCounts) {
      for (let i = 0; i < count; i++) {
        let won = null;
        if (['QB', 'RB', 'WR', 'TE'].includes(pos)) {
          won = byPosition[pos].find((w) => !used.has(w.player.sleeper_id)) || null;
        } else {
          won = ['RB', 'WR', 'TE'].flatMap((p) => byPosition[p]).find((w) => !used.has(w.player.sleeper_id)) || null;
        }
        if (won) used.add(won.player.sleeper_id);
        rosterSlots.push({ position: pos, won });
      }
    }
    return rosterSlots;
  }

  function totalSpentByTeam(teamName) {
    return allWonPlayers
      .filter((w) => w.teamName === teamName)
      .reduce((sum, w) => sum + costAtWeekWithBye(w.baseValue, w.startWeek, currentWeek, interestRatePerWeek, byeWeeksByTeam[w.player.team]), 0);
  }

  function buildWeekSegments(weekNumber) {
    const byPosition = {};

    for (const w of wonPlayers) {
      const byeWeek = byeWeeksByTeam[w.player.team];
      const endWeek = contractEndWeek(w.startWeek, w.weeksRequested, byeWeek);
      if (weekNumber < w.startWeek || weekNumber > endWeek) continue;
      const pos = w.player.player_position;
      const cost = costAtWeekWithBye(w.baseValue, w.startWeek, weekNumber, interestRatePerWeek, byeWeek);
      if (cost === 0) continue;
      if (!byPosition[pos]) byPosition[pos] = { value: 0, meta: [] };
      byPosition[pos].value += cost;
      byPosition[pos].meta.push({ name: w.player.full_name, cost });
    }

    const segments = Object.entries(byPosition).map(([pos, v]) => ({
      value: v.value,
      color: POSITION_COLORS[pos] || '#888',
      meta: v.meta,
    }));

    for (const s of slots) {
      if (s.completed) continue;
      const weeksEntered = Number(s.myWeeks) || 0;
      const baseAmount = Number(s.myBidAmount) || 0;
      if (weeksEntered <= 0 || baseAmount <= 0) continue;
      const byeWeek = byeWeeksByTeam[s.player.team];
      const endWeek = contractEndWeek(currentWeek, weeksEntered, byeWeek);
      const coversThisWeek = weekNumber >= currentWeek && weekNumber <= endWeek;
      if (!coversThisWeek) continue;
      const previewCost = costAtWeekWithBye(baseAmount, currentWeek, weekNumber, interestRatePerWeek, byeWeek);
      if (previewCost === 0) continue;
      const previewColor = s.highBidder === 'me' ? 'var(--color-success)' : '#ff1493';
      segments.push({
        value: previewCost,
        color: previewColor,
        meta: [{ name: `${s.player.full_name} (pending)`, cost: previewCost }],
      });
    }

    const used = segments.reduce((sum, seg) => sum + seg.value, 0);
    const remaining = Math.max(0, salaryCap - used);
    segments.push({ value: remaining, color: '#000', meta: [{ name: 'Cap Remaining', cost: remaining }] });
    return segments;
  }

  useEffect(() => {
    if (phase !== 'auction' || playersPerAuction !== 1 || slots.length === 0) return;
    const sleeperId = slots[0].player.sleeper_id;
    if (soloPlayerStats[sleeperId]) return;
    supabase
      .rpc('get_player_season_stats', { p_sleeper_id: sleeperId, p_num_seasons: 5 })
      .then(({ data }) => setSoloPlayerStats((prev) => ({ ...prev, [sleeperId]: data || [] })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, phase, playersPerAuction]);

  const gridCols = computeGridColumns(playersPerAuction);
  const weekNumbers = Array.from({ length: MAX_CONTRACT_WEEKS }, (_, i) => currentWeek + i);


  const availablePositions = leagueRosterSpec
    ? [
        leagueRosterSpec.roster_qb > 0 && 'QB',
        leagueRosterSpec.roster_rb > 0 && 'RB',
        leagueRosterSpec.roster_wr > 0 && 'WR',
        leagueRosterSpec.roster_te > 0 && 'TE',
      ].filter(Boolean)
    : ['QB', 'RB', 'WR', 'TE'];

  const filteredUndrafted = rankedPlayers.filter((p) => {
    const matchesSearch = !searchText || p.full_name.toLowerCase().includes(searchText.toLowerCase());
    const matchesPos = positionFilter === 'ALL' || p.player_position === positionFilter;
    return matchesSearch && matchesPos;
  });

  const canNominate = myPendingNominationSlot() !== null;

  if (!started) {
    return (
      <div style={{ padding: '5vh 5vw', minHeight: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <h1>Mock Draft</h1>
        {error && <div className="error-text" style={{ marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleStart}
          style={{
            background: 'linear-gradient(135deg, #e6c458, #d4af37, #8a6d1f)',
            color: '#111', fontWeight: 'bold', fontSize: '1.2rem',
            padding: '14px 40px', borderRadius: '50px', border: 'none',
          }}
        >
          Start Mock Draft
        </button>
        <button onClick={onBack} style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline' }}>
          Back to Home
        </button>
      </div>
    );
  }

  const nominationSecondsLeft = nominationTimerEndsAt ? Math.max(0, Math.round((nominationTimerEndsAt - tick) / 1000)) : NOMINATION_SECONDS;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {error && (
        <div
          className="error-text"
          style={{
            position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 600,
            background: 'var(--color-bg-input)', border: '1px solid var(--color-error)',
            borderRadius: 8, padding: '8px 16px', fontWeight: 'bold',
          }}
        >
          {error}
        </div>
      )}
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

      {/* My Team box — top right */}
      <div style={{
        width: 400, height: 400, background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)', borderRadius: 8,
        position: 'absolute', top: 25, right: 25, padding: 14, boxSizing: 'border-box',
        overflowY: 'auto',
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            onClick={() => setShowTeamDropdown((v) => !v)}
          >
            {(viewingTeamName === null || viewingTeamName === teamName) ? (
              <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={36} />
            ) : (
              <Crest pattern="solid" color1="#888888" color2="#888888" size={36} />
            )}
            <span style={{ fontWeight: 'bold' }}>{viewingTeamName || teamName} ▾</span>
          </div>
          <button
            onClick={onBack}
            style={{ background: 'var(--color-error)', color: '#111', fontWeight: 'bold', padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: '0.85rem' }}
          >
            End Draft
          </button>
          {showTeamDropdown && (
            <>
              <div className="click-outside-backdrop" onClick={() => setShowTeamDropdown(false)} />
              <div className="profile-menu" style={{ top: '100%', left: 0, marginTop: 6, maxHeight: 300, overflowY: 'auto', zIndex: 400 }}>
                {relegationTiers.map((t) => (
                  <div key={t.tier_number} style={{ marginBottom: 8 }}>
                    <div className="muted-text" style={{ fontSize: '0.75rem', color: t.tier_color || 'var(--color-text-muted)' }}>
                      {t.tier_name || `Tier ${t.tier_number}`}
                    </div>
                    {(t.teams || []).map((team) => (
                      <button
                        key={team.team_id}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: t.tier_color || 'var(--color-button-bg)', marginTop: 2 }}
                        onClick={() => { setViewingTeamName(team.team_name === teamName ? null : team.team_name); setShowTeamDropdown(false); }}
                      >
                        {team.team_name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {viewingTeamName && viewingTeamName !== teamName && (
          <div className="muted-text" style={{ fontSize: '0.75rem', marginTop: 6 }}>
            Total spent: <span style={{ color: 'var(--color-success)', fontWeight: 'bold' }}>${totalSpentByTeam(viewingTeamName).toFixed(2)}</span>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 55px', gap: 4 }}>
            <span></span>
            <span className="muted-text" style={{ fontSize: '0.7rem' }}>Player</span>
            <span className="muted-text" style={{ fontSize: '0.7rem' }}>Cost</span>
          </div>
          {(viewingTeamName && viewingTeamName !== teamName ? buildRosterSlotsForTeam(viewingTeamName) : buildMyRosterSlots()).map((slot, i) => {
            const cost = slot.won ? costAtWeekWithBye(slot.won.baseValue, slot.won.startWeek, currentWeek, interestRatePerWeek, byeWeeksByTeam[slot.won.player.team]) : null;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '45px 1fr 55px', gap: 4, alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span className="roster-slot-badge" style={{ background: POSITION_COLORS[slot.position] || '#8ab4ff' }}>{slot.position}</span>
                <span style={{ fontSize: '0.85rem' }}>{slot.won ? slot.won.player.full_name : '—'}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-success)', fontWeight: 'bold' }}>
                  {cost !== null ? `$${cost.toFixed(2)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Auction / nomination board — top left */}
      <div style={{
        width: 980, height: 520, background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)', borderRadius: 8,
        position: 'absolute', top: 25, left: 25, padding: 14, boxSizing: 'border-box',
        overflowY: 'auto',
      }}>
        {(phase === 'nomination' || phase === 'winners') && (
          <div className="draft-clock" style={{ textAlign: 'center', fontSize: '1.6rem', marginBottom: 10 }}>
            {phase === 'nomination' ? formatMMSS(nominationSecondsLeft) : 'Round Complete'}
          </div>
        )}

        {phase === 'nomination' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 12 }}>
            {nominationSlots.map((s, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--color-bg-input)', border: s.isMe ? '3px solid var(--color-pos-rb)' : '2px solid #f8f3f3',
                  borderRadius: 10, padding: 12, textAlign: 'center', minHeight: 160,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {s.player ? (
  <>
    <img
      src={`https://sleepercdn.com/content/nfl/players/${s.player.sleeper_id}.jpg`}
      alt={s.player.full_name}
      onError={(e) => { e.target.style.display = 'none'; }}
      style={{ width: 90, height: 90, borderRadius: 8, objectFit: 'cover', background: 'var(--color-avatar-fallback)' }}
    />
    <div style={{ fontWeight: 'bold', marginTop: 8, fontSize: '1rem' }}>{s.player.full_name}</div>
    <div style={{ color: NFL_TEAM_COLORS[s.player.team] || 'var(--color-text)', fontWeight: 'bold', fontSize: '0.85rem' }}>
      {s.player.player_position} – {s.player.team}
    </div>
    <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: 4 }}>
      {[0, 1, 2].map((offset) => {
        const wk = currentWeek + offset;
        const matchup = formatMatchup(scheduleByTeam, s.player.team, wk);
        return (
          <div key={wk} style={{ whiteSpace: 'nowrap' }}>
            Wk {wk}: —{matchup && <span style={{ marginLeft: 4 }}>{matchup}</span>}
          </div>
        );
      })}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
      {s.isMe ? (
        <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={22} />
      ) : (
        <Crest pattern="solid" color1="#fefefe" color2="#10ae3d" size={22} />
      )}
      <span className="muted-text" style={{ fontSize: '0.8rem' }}>{s.teamName}</span>
    </div>
  </>
) : (
                  <>
                    <Crest pattern="solid" color1="#888888" color2="#888888" size={50} />
                    <div style={{ fontWeight: 'bold', marginTop: 8 }}>{s.teamName}</div>
                    <div className="muted-text" style={{ fontSize: '0.75rem' }}>{s.isMe ? 'Your pick' : 'choosing...'}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {phase === 'winners' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 12 }}>
            {winnersDisplay.map((w, i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(0,0,0,0.6)', border: '2px solid #000', borderRadius: 10,
                  padding: 16, textAlign: 'center', minHeight: 260,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  filter: 'grayscale(0.6) brightness(0.7)',
                }}
              >
                <img
                  src={`https://sleepercdn.com/content/nfl/players/${w.player.sleeper_id}.jpg`}
                  alt={w.player.full_name}
                  onError={(e) => { e.target.style.display = 'none'; }}
                  style={{ width: 90, height: 90, borderRadius: 8, objectFit: 'cover', background: 'var(--color-avatar-fallback)' }}
                />
                <div style={{ fontWeight: 'bold', marginTop: 8 }}>{w.player.full_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  {w.isMe ? (
                    <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={32} />
                  ) : (
                    <Crest pattern="solid" color1="#888888" color2="#888888" size={32} />
                  )}
                  <span className="muted-text" style={{ fontSize: '0.85rem' }}>{w.teamName}</span>
                </div>
                <div style={{ color: 'var(--color-success)', fontWeight: 'bold', marginTop: 8 }}>${w.amount}</div>
              </div>
            ))}
          </div>
        )}

        {phase === 'auction' && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 12 }}>
            {slots.map((s) => {
              const teamColor = NFL_TEAM_COLORS[s.player.team] || 'var(--color-text)';
              const isMyBid = s.highBidder === 'me';
              const secondsLeft = Math.max(0, Math.round((s.timerEndsAt - tick) / 1000));
              const sizing = getCardSizing(playersPerAuction);
              const projectedValue = salaryCap * (Number(s.player.cap_percent) || 0) / 100;

              if (s.completed) {
                return (
                  <div
                    key={s.key}
                    style={{
                      background: 'rgba(0,0,0,0.6)', border: '2px solid #000', borderRadius: 10,
                      padding: sizing.padding, textAlign: 'center',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      filter: 'grayscale(0.6) brightness(0.7)',
                    }}
                  >
                    {isMyBid ? (
                      <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={sizing.imgSize * 0.4} />
                    ) : (
                      <Crest pattern="solid" color1="#888888" color2="#888888" size={sizing.imgSize * 0.4} />
                    )}
                    <div style={{ fontWeight: 'bold', marginTop: 6 }}>{s.highBidderTeamName}</div>
                    <div className="muted-text" style={{ fontSize: sizing.statSize }}>{s.player.full_name}</div>
                    <div style={{ color: 'var(--color-success)', fontWeight: 'bold', marginTop: 4 }}>${s.highBid}</div>
                  </div>
                );
              }

              if (playersPerAuction === 1) {
                const seasons = soloPlayerStats[s.player.sleeper_id] || [];
                return (
                  <div
                    key={s.key}
                    style={{
                      background: 'var(--color-bg-input)',
                      border: isMyBid ? '4px solid var(--color-success)' : '2px solid #000',
                      borderRadius: 10, padding: 20,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 20 }}>
                      <div style={{ flex: '0 0 160px' }}>
                        <img
                          src={`https://sleepercdn.com/content/nfl/players/${s.player.sleeper_id}.jpg`}
                          alt={s.player.full_name}
                          onError={(e) => { e.target.style.display = 'none'; }}
                          style={{ width: 160, height: 160, borderRadius: 10, objectFit: 'cover', background: 'var(--color-avatar-fallback)' }}
                        />
                        <div style={{ fontWeight: 'bold', fontSize: '1.4rem', marginTop: 8 }}>{s.player.full_name}</div>
                        <div style={{ color: teamColor, fontWeight: 'bold', fontSize: '1.2rem' }}>
                          {s.player.player_position} – {s.player.team}{byeWeeksByTeam[s.player.team] ? ` (${byeWeeksByTeam[s.player.team]})` : ''}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                          {isMyBid ? (
                            <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={40} />
                          ) : (
                            <Crest pattern="solid" color1="#888888" color2="#888888" size={40} />
                          )}
                          <span style={{ fontWeight: 'bold', color: bidAmountColor(s.highBid, salaryCap) }}>${s.highBid}</span>
                        </div>

                        <BidControls
                          amountValue={s.myBidAmount}
                          weeksValue={s.myWeeks}
                          highBid={s.highBid}
                          capMax={Math.max(0, salaryCap - committedAtWeek(currentWeek, s.key))}
                          isLeading={isMyBid}
                          statSize="0.85rem"
                          onAmountChange={(v) => updateSlotBidAmount(s.key, v)}
                          onWeeksChange={(v) => updateSlotWeeks(s.key, v)}
                          onSubmit={(amount, weeks) => submitBid(s.key, amount, weeks)}
                        />

                    <div className="draft-clock" style={{ marginTop: 8, color: secondsLeft <= 20 ? 'var(--color-error)' : '#fff', background: s.flashUntil && tick < s.flashUntil ? '#e6c458' : 'transparent' }}>{formatMMSS(secondsLeft)}</div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <div className="scoring-subheading" style={{ marginTop: 0 }}>Last {seasons.length || 5} Seasons</div>
                        <table className="rankings-table">
                          <thead>
                            <tr>
                              {s.player.player_position === 'QB' && (
                                <><th>Yr</th><th>G</th><th>Pass Yd</th><th>Pass TD</th><th>INT</th></>
                              )}
                              {s.player.player_position === 'RB' && (
                                <><th>Yr</th><th>G</th><th>Att</th><th>Rush Yd</th><th>RuTD</th><th>YPA</th></>
                              )}
                              {(s.player.player_position === 'WR' || s.player.player_position === 'TE') && (
                                <><th>Yr</th><th>G</th><th>Tgt</th><th>Rec</th><th>Rec Yd</th><th>RecTD</th><th>Yd/Tgt</th></>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {seasons.map((yr) => (
                              <tr key={yr.season}>
                                {s.player.player_position === 'QB' && (
                                  <>
                                    <td>{yr.season}</td>
                                    <td>{yr.games}</td>
                                    <td>{yr.passing_yards ?? 0}</td>
                                    <td>{yr.passing_tds ?? 0}</td>
                                    <td>{yr.passing_ints ?? 0}</td>
                                  </>
                                )}
                                {s.player.player_position === 'RB' && (
                                  <>
                                    <td>{yr.season}</td>
                                    <td>{yr.games}</td>
                                    <td>{yr.rushing_attempts ?? 0}</td>
                                    <td>{yr.rushing_yards ?? 0}</td>
                                    <td>{yr.rushing_tds ?? 0}</td>
                                    <td>{yr.rushing_attempts ? (yr.rushing_yards / yr.rushing_attempts).toFixed(1) : '—'}</td>
                                  </>
                                )}
                                {(s.player.player_position === 'WR' || s.player.player_position === 'TE') && (
                                  <>
                                    <td>{yr.season}</td>
                                    <td>{yr.games}</td>
                                    <td>{yr.targets ?? 0}</td>
                                    <td>{yr.receptions ?? 0}</td>
                                    <td>{yr.receiving_yards ?? 0}</td>
                                    <td>{yr.receiving_tds ?? 0}</td>
                                    <td>{yr.targets ? (yr.receiving_yards / yr.targets).toFixed(1) : '—'}</td>
                                  </>
                                )}
                              </tr>
                            ))}
                            {seasons.length === 0 && (
                              <tr><td colSpan={7} className="muted-text">No historical stats found.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={s.key}
                  style={{
                    background: 'var(--color-bg-input)',
                    border: isMyBid ? '4px solid var(--color-success)' : '2px solid #fdfcfc',
                    borderRadius: 10, padding: sizing.padding,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                    position: 'relative',
                  }}
                >
                  <button
                    onClick={() => toggleFlip(s.key)}
                    title={s.flipped ? 'Show projections' : 'Show stats'}
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      width: 22, height: 22, padding: 0, borderRadius: '50%',
                      background: 'var(--color-button-bg)', border: '1px solid var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 2.1l4 4-4 4" />
                      <path d="M3 12.1v-2a4 4 0 0 1 4-4h14" />
                      <path d="M7 21.9l-4-4 4-4" />
                      <path d="M21 11.9v2a4 4 0 0 1-4 4H3" />
                    </svg>
                  </button>

                  {!s.flipped && (
                    <img
                      src={`https://sleepercdn.com/content/nfl/players/${s.player.sleeper_id}.jpg`}
                      alt={s.player.full_name}
                      onError={(e) => { e.target.style.display = 'none'; }}
                      style={{ width: sizing.imgSize, height: sizing.imgSize, borderRadius: 8, objectFit: 'cover', marginBottom: 6, background: 'var(--color-avatar-fallback)' }}
                    />
                  )}

                  <div style={{ fontWeight: 'bold', fontSize: sizing.nameSize }}>{s.player.full_name}</div>
                  <div style={{ color: teamColor, fontWeight: 'bold', fontSize: sizing.statSize }}>
                    {s.player.player_position} – {s.player.team}{byeWeeksByTeam[s.player.team] ? ` (${byeWeeksByTeam[s.player.team]})` : ''}
                  </div>

                  {s.flipped ? (
                    (() => {
                      const rowCurrent = statsRowFor(s.player, 'current');
                      const rowPrevious = statsRowFor(s.player, 'previous');
                      const isQBCard = s.player.player_position === 'QB';

                      const buildRows = (row) => {
                        if (!row) return null;
                        if (isQBCard) {
                          return {
                            'Pass Yd': statOrDash(row.passing_yards),
                            'Rush Yd': statOrDash(row.rushing_yards),
                            'Pass TD': statOrDash(row.passing_tds),
                            'Rush TD': statOrDash(row.rushing_tds),
                          };
                        }
                        return {
                          'Tot Yard': statOrDash((Number(row.rushing_yards) || 0) + (Number(row.receiving_yards) || 0)),
                          'TD': statOrDash((Number(row.rushing_tds) || 0) + (Number(row.receiving_tds) || 0)),
                          'Rec': statOrDash(row.receptions),
                        };
                      };

                      const statLabels = isQBCard ? ['Pass Yd', 'Rush Yd', 'Pass TD', 'Rush TD'] : ['Tot Yard', 'TD', 'Rec'];
                      const currentVals = buildRows(rowCurrent);
                      const previousVals = buildRows(rowPrevious);

                      return (
                        <div style={{ marginTop: 8, width: '100%' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '3px 6px' }}>
                            <span></span>
                            <span className="muted-text" style={{ fontSize: sizing.statSize, fontWeight: 'bold' }}>25-26</span>
                            <span className="muted-text" style={{ fontSize: sizing.statSize, fontWeight: 'bold' }}>24-25</span>
                            {statLabels.map((label) => (
                              <Fragment key={label}>
                                <span className="muted-text" style={{ fontSize: sizing.statSize, textAlign: 'left' }}>{label}</span>
                                <span style={{ fontSize: sizing.statSize, fontWeight: 'bold' }}>{currentVals ? currentVals[label] : '—'}</span>
                                <span style={{ fontSize: sizing.statSize, fontWeight: 'bold' }}>{previousVals ? previousVals[label] : '—'}</span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="muted-text" style={{ fontSize: sizing.statSize, marginTop: 4 }}>
                      {[0, 1, 2, 3].map((offset) => {
                        const wk = currentWeek + offset;
                        const matchup = formatMatchup(scheduleByTeam, s.player.team, wk);
                        return (
                          <div key={wk} style={{ whiteSpace: 'nowrap' }}>
                            Wk {wk}: ${(projectedValue * Math.pow(1.0123, offset)).toFixed(2)}
                            {matchup && <span style={{ marginLeft: 4 }}>{matchup}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                    {isMyBid ? (
                      <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={34} />
                    ) : (
                      <Crest pattern="solid" color1="#888888" color2="#888888" size={34} />
                    )}
                    <span style={{ fontWeight: 'bold', color: bidAmountColor(s.highBid, salaryCap) }}>${s.highBid}</span>
                  </div>

                  <BidControls
                    compact
                    amountValue={s.myBidAmount}
                    weeksValue={s.myWeeks}
                    highBid={s.highBid}
                    capMax={Math.max(0, salaryCap - committedAtWeek(currentWeek, s.key))}
                    isLeading={isMyBid}
                    statSize={sizing.statSize}
                    onAmountChange={(v) => updateSlotBidAmount(s.key, v)}
                    onWeeksChange={(v) => updateSlotWeeks(s.key, v)}
                    onSubmit={(amount, weeks) => submitBid(s.key, amount, weeks)}
                  />

            <div className="draft-clock" style={{ marginTop: 6, fontSize: sizing.statSize, color: secondsLeft <= 20 ? 'var(--color-error)' : '#fff', background: s.flashUntil && tick < s.flashUntil ? '#e6c458' : 'transparent' }}>{formatMMSS(secondsLeft)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pie chart grid — bottom right */}
      <div style={{
        width: 400, height: 390, background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)', borderRadius: 8,
        position: 'absolute', bottom: 50, right: 25, padding: 10, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        {(() => {
          const visibleWeeks = weekNumbers.filter((w) => !hiddenWeeks.includes(w));
          const visibleCount = visibleWeeks.length;
          const { cols, size } = pieLayoutForVisibleCount(visibleCount);
          const r = size / 2;

          const renderPie = (week) => {
            const slices = buildMultiSlices(buildWeekSegments(week), size);
            return (
              <div
                key={week}
                style={{ textAlign: 'center', userSelect: 'none' }}
                onMouseDown={() => startHoldToHide(week)}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={() => startHoldToHide(week)}
                onTouchEnd={cancelHold}
              >
                <div className="muted-text" style={{ fontSize: '0.55rem' }}>Wk {week}</div>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                  {slices.map((slice, i) => (
                    slice.path ? (
                      <path
                        key={i} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="1"
                        onMouseEnter={(e) => slice.meta && setTooltip({ x: e.clientX, y: e.clientY, meta: slice.meta })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ) : (
                      <circle
                        key={i} cx={r} cy={r} r={r - 1} fill={slice.color} stroke="#fff" strokeWidth="1"
                        onMouseEnter={(e) => slice.meta && setTooltip({ x: e.clientX, y: e.clientY, meta: slice.meta })}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    )
                  ))}
                </svg>
              </div>
            );
          };

          const grid = cols === null ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, flex: 1, justifyItems: 'center', alignItems: 'center' }}>
                {visibleWeeks.slice(0, 8).map(renderPie)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, flex: 1, justifyItems: 'center', alignItems: 'center' }}>
                {visibleWeeks.slice(8).map(renderPie)}
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, flex: 1, justifyItems: 'center', alignItems: 'center' }}>
              {visibleWeeks.map(renderPie)}
            </div>
          );

          return (
            <>
              {grid}
              {hiddenWeeks.length > 0 && (
                <button
                  onClick={restoreLastHiddenWeek}
                  title="Bring back the last hidden week"
                  style={{
                    position: 'absolute', bottom: 6, right: 6,
                    width: 28, height: 28, borderRadius: '50%', padding: 0,
                    background: 'var(--color-success)', color: '#111', fontWeight: 'bold',
                    border: 'none', fontSize: '1.1rem', lineHeight: 1,
                  }}
                >
                  +
                </button>
              )}
            </>
          );
        })()}
      </div>

      {/* Undrafted players — bottom left */}
      <div style={{
        width: 980, height: 280, background: 'var(--color-bg-panel)',
        border: '1px solid var(--color-border-subtle)', borderRadius: 8,
        position: 'absolute', bottom: 90, left: 25, padding: 14, boxSizing: 'border-box',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <input
            type="text"
            placeholder="Search players..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ flex: '0 1 340px', borderRadius: '10px' }}
          />

          <button
            onClick={() => setPositionFilter('ALL')}
            title="All positions"
            style={{
              width: 32, height: 32, borderRadius: '50%', padding: 0,
              background: '#000', border: positionFilter === 'ALL' ? '2px solid #ff1493' : '2px solid #fff',
              color: '#fff', fontSize: '0.6rem', fontWeight: 'bold',
            }}
          >
            ALL
          </button>

          {availablePositions.map((pos) => (
            <button
              key={pos}
              onClick={() => setPositionFilter(pos)}
              title={pos}
              style={{
                width: 32, height: 32, borderRadius: '50%', padding: 0,
                background: POSITION_COLORS[pos], border: positionFilter === pos ? '2px solid #ff1493' : '2px solid transparent',
                color: '#111', fontSize: '0.65rem', fontWeight: 'bold',
              }}
            >
              {pos}
            </button>
          ))}

          <select
            value={statsView}
            onChange={(e) => setStatsView(e.target.value)}
            style={{ marginLeft: 'auto', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-input)', color: 'var(--color-text)' }}
          >
            <option value="projected">Projections</option>
            <option value="current">25-26 Stats</option>
            <option value="previous">24-25 Stats</option>
          </select>
        </div>
        <table className="rankings-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '1%', whiteSpace: 'nowrap' }}>#</th>
              <th style={{ width: '1%', whiteSpace: 'nowrap' }}>Player</th>
              <th>Team</th>
              <th>Pos</th>
              <th>Pass Yd</th>
              <th>PTD</th>
              <th>INT</th>
              <th>Rush Yd</th>
              <th>RuTD</th>
              <th>Rec</th>
              <th>Rec Yd</th>
              <th>RecTD</th>
              <th>PPG</th>
              <th>Proj. Value</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredUndrafted.map((p) => {
              const statRow = statsView !== 'projected' ? statsRowFor(p, statsView) : null;
              const isQB = p.player_position === 'QB';
              const isSkill = ['RB', 'WR', 'TE'].includes(p.player_position);
              return (
                <tr key={p.sleeper_id} style={{ background: POSITION_ROW_TINT[p.player_position] || 'transparent' }}>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.rank ?? '-'}</td>
                  <td
                    className={`pos-${p.player_position}-highlight`}
                    style={{ whiteSpace: 'nowrap', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    title={p.full_name}
                  >
                    {p.full_name}
                  </td>
                  <td style={{ color: NFL_TEAM_COLORS[p.team] || 'var(--color-text)', fontWeight: 'bold' }}>{p.team}</td>
                  <td>{p.player_position}</td>
                  <td>{isQB && statRow ? statOrDash(statRow.passing_yards) : '—'}</td>
                  <td>{isQB && statRow ? statOrDash(statRow.passing_tds) : '—'}</td>
                  <td>{isQB && statRow ? statOrDash(statRow.interceptions) : '—'}</td>
                  <td>{statRow ? statOrDash(statRow.rushing_yards) : '—'}</td>
                  <td>{statRow ? statOrDash(statRow.rushing_tds) : '—'}</td>
                  <td>{isSkill && statRow ? statOrDash(statRow.receptions) : '—'}</td>
                  <td>{isSkill && statRow ? statOrDash(statRow.receiving_yards) : '—'}</td>
                  <td>{isSkill && statRow ? statOrDash(statRow.receiving_tds) : '—'}</td>
                  <td>{statRow ? Number(statRow.ppg).toFixed(1) : '—'}</td>
                  <td>${(salaryCap * (Number(p.cap_percent) || 0) / 100).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      disabled={!canNominate}
                      onClick={() => nominatePlayer(p)}
                      className={canNominate ? 'bid-flash' : ''}
                      style={{
                        padding: '2px 10px',
                        fontSize: '0.8rem',
                        borderRadius: '10px',
                        fontWeight: 'bold',
                        background: '#fff',
                        color: '#111',
                        cursor: canNominate ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Bid
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {statsView === 'projected' && (
          <div className="settings-note" style={{ marginTop: 6 }}>
            Projections aren't wired up to real data yet — switch to 25-26 or 24-25 to see actual stats and PPG based on your league's real scoring settings.
          </div>
        )}
      </div>

    </div>
  );
}