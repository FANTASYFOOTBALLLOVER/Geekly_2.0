import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import geeklyLogo from '../assets/final-logo-geekly.png';
const SHIELD_PATH = 'M50 8 Q40 14 30 20 Q20 26 12 15 Q2 20 5 45 Q8 90 50 118 Q92 90 95 45 Q98 20 88 15 Q80 26 70 20 Q60 14 50 8 Z';

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
  'var(--color-pos-rb)',   // gold
  'var(--color-pos-wr)',   // silver
  'var(--color-pos-te)',   // bronze
  'var(--color-pos-qb)',   // platinum
  '#fff', '#fff', '#fff', '#fff',
];

const NFL_TEAM_COLORS = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D', CAR: '#0085CA',
  CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00', DAL: '#003594', DEN: '#FB4F14',
  DET: '#0076B6', GB: '#203731', HOU: '#03202F', IND: '#002C5F', JAX: '#101820',
  KC: '#E31837', LAC: '#0080C6', LAR: '#003594', LV: '#000000', MIA: '#008E97',
  MIN: '#4F2683', NE: '#002244', NO: '#D3BC8D', NYG: '#0B2265', NYJ: '#125740',
  PHI: '#004C54', PIT: '#FFB612', SEA: '#69BE28', SF: '#AA0000', TB: '#D50A0A',
  TEN: '#4B92DB', WAS: '#5A1414',
};

const POSITION_SLOT_COLORS = {
  QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)',
  TE: 'var(--color-pos-te)', FLEX: '#8ab4ff', SFLEX: '#b48ee0',
};

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
  if (numTeams % 2 !== 0) slots.push(0); // 0 = bye

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
  const [mobileActiveTab, setMobileActiveTab] = useState('home'); // 'home' | 'rankings' | 'q3' | 'q4' — mobile-only, ignored on desktop
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState('');

  const [topRankings, setTopRankings] = useState([]);
  const [showFullRankings, setShowFullRankings] = useState(false);
  const [fullRankings, setFullRankings] = useState([]);

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
  const [myTierStandings, setMyTierStandings] = useState(null);
  const [teamSignings, setTeamSignings] = useState([]);
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
    supabase.rpc('get_top_rankings', { p_limit: 12 }).then(({ data }) => {
      if (data) setTopRankings(data);
    });
  }, []);

  useEffect(() => {
    if (settingsSection !== 'General' || !activeLeague) return;
    supabase
      .from('leagues')
      .select('name, is_public, bonus_win_top_half, num_teams, relegation_tiers, season_weeks, promote_relegate_count, salary_cap, ir_voids_contract')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
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
        setActiveLeague(data[0]);
      }
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteFromUrl = params.get('invite');
    if (inviteFromUrl) {
      localStorage.setItem('pendingInviteCode', inviteFromUrl);
      setJoinCode(inviteFromUrl);
      setJoinViaInviteLink(true);
      setShowJoinLeague(true);
      // Clean the param out of the visible URL without losing the code (already saved above)
      params.delete('invite');
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
      return;
    }
    // Fallback: the code may have been captured before a signup/login redirect
    const pending = localStorage.getItem('pendingInviteCode');
    if (pending) {
      setJoinCode(pending);
      setJoinViaInviteLink(true);
      setShowJoinLeague(true);
    }
  }, []);

  useEffect(() => {
    if (!activeLeague) return;
    supabase
      .from('leagues')
      .select('initial_draft_at, weekly_auction_day, weekly_auction_time')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
        setFirstDraftSchedule(data ? data.initial_draft_at : null);
        setWeeklyAuctionDay(data ? data.weekly_auction_day : null);
        setWeeklyAuctionTime(data ? data.weekly_auction_time : null);
      });
  }, [activeLeague]);

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
      .select('initial_draft_at, roster_qb, roster_rb, roster_wr, roster_te, roster_flex, roster_superflex, roster_bench, salary_cap')
      .eq('id', activeLeague.league_id)
      .single()
      .then(({ data }) => {
        setLeagueRosterSpec(data);
        if (data) setCurrentLeagueWeek(getCurrentLeagueWeek(data.initial_draft_at, new Date(now)));
      });

    supabase
      .rpc('get_team_active_signings', { p_team_id: activeLeague.team_id, p_season: 2026 })
      .then(({ data }) => setTeamSignings(data || []));
  }, [activeLeague]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  async function openFullRankings() {
    const { data } = await supabase.rpc('get_top_rankings', { p_limit: 1000 });
    if (data) setFullRankings(data);
    setShowFullRankings(true);
  }

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
  } else if (weeklyAuctionDay && weeklyAuctionTime) {
    target = getNextRecurringAuctionDate(weeklyAuctionDay, weeklyAuctionTime, new Date(now));
  }
  if (!target) return null;
  return (target.getTime() - now) / 60000;
}
  function draftMessageSuffix() {
    let target = null;

    if (firstDraftSchedule && new Date(firstDraftSchedule).getTime() > now) {
      target = new Date(firstDraftSchedule);
    } else if (weeklyAuctionDay && weeklyAuctionTime) {
      target = getNextRecurringAuctionDate(weeklyAuctionDay, weeklyAuctionTime, new Date(now));
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
        byPosition[s.player_position] = (byPosition[s.player_position] || 0) + cost;
        totalSpent += cost;
      }
    }
    const segments = Object.entries(byPosition).map(([pos, val]) => ({
      value: val,
      color: POSITION_SLOT_COLORS[pos] || '#888',
      meta: [{ name: pos, cost: val }],
    }));
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
    const { error } = await supabase.rpc('update_team_identity', {
      p_team_id: activeLeague.team_id,
      p_team_name: editTeamName,
      p_team_abbr: editTeamAbbr,
    });
    if (error) { setTeamIdentityMsg(error.message); return; }
    setEditingTeamIdentity(false);
    refreshLeagues(activeLeague.league_id);
  }

  async function handleSaveGeneralSettings() {
    setGeneralMsg('');
    const { error } = await supabase.rpc('update_general_settings', {
      p_league_id: activeLeague.league_id,
      p_name: generalSettings.name,
      p_is_public: generalSettings.is_public,
      p_bonus_win_top_half: generalSettings.bonus_win_top_half,
      p_num_teams: Number(generalSettings.num_teams),
      p_relegation_tiers: Number(generalSettings.relegation_tiers),
      p_season_weeks: Number(generalSettings.season_weeks),
      p_promote_relegate_count: Number(generalSettings.promote_relegate_count),
      p_salary_cap: Number(generalSettings.salary_cap),
      p_ir_voids_contract: generalSettings.ir_voids_contract,
    });
    setGeneralMsg(error ? error.message : 'Saved.');
    if (error) return;

    if (Number(generalSettings.num_teams) !== Number(originalNumTeams)) {
      const tierCountForResize = generalSettings.relegation_tiers > 1 ? Number(generalSettings.relegation_tiers) : 1;
      for (let tier = 1; tier <= tierCountForResize; tier++) {
        await supabase.rpc('resize_league_tier_teams', {
          p_league_id: activeLeague.league_id,
          p_tier_number: tier,
          p_new_num_teams: Number(generalSettings.num_teams),
        });
        await supabase.rpc('clear_tier_schedule', {
          p_league_id: activeLeague.league_id,
          p_season: 2026,
          p_tier_number: tier,
        });
        const schedule = generateRoundRobinSchedule(Number(generalSettings.num_teams), Number(generalSettings.season_weeks));
        await supabase.rpc('insert_matchups_bulk', {
          p_league_id: activeLeague.league_id,
          p_season: 2026,
          p_tier_number: tier,
          p_matchups: schedule,
        });
      }
      setOriginalNumTeams(Number(generalSettings.num_teams));
    }

    refreshLeagues(activeLeague.league_id);
  }

  function updateScoringField(field, value) {
    setScoringSettings({ ...scoringSettings, [field]: value });
    setScoringTouched({ ...scoringTouched, [field]: true });
  }

  async function handleSaveScoringSettings() {
    setScoringMsg('');
    const s = scoringSettings;
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
      p_tier_caps: s.tiers.map((t) => ({ tier_number: t.tier_number, salary_cap: Number(t.salary_cap) })),
    });
    setAuctionMsg(error ? error.message : 'Saved.');
    if (!error) refreshLeagues(activeLeague.league_id);
  }

  function updateRosterField(field, value) {
    setRosterSettings({ ...rosterSettings, [field]: value });
    setRosterTouched({ ...rosterTouched, [field]: true });
  }

  async function handleSaveRosterSettings() {
    setRosterMsg('');
    const s = rosterSettings;
    const toIntOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

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
    setRosterMsg(error ? error.message : 'Saved.');
    if (!error) refreshLeagues(activeLeague.league_id);
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
    const { error } = await supabase.rpc('update_tier_names_colors', {
      p_league_id: activeLeague.league_id,
      p_tiers: relegationTiers.map((t) => ({ tier_number: t.tier_number, tier_name: t.tier_name, tier_color: t.tier_color, salary_cap: t.salary_cap })),
    });
    setRelegationMsg(error ? error.message : 'Saved.');
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
    if (!error) refreshLmTools();
  }

  async function handleRemoveSlot(teamId) {
    setLmMsg('');
    const { error } = await supabase.rpc('remove_team_slot', { p_team_id: teamId });
    showLmMsg(error ? error.message : 'Saved.');
    setRemovingTeam(null);
    if (!error) refreshLmTools();
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
    if (data) {
      setMyLeagues(data);
      setActiveLeague(data.find((l) => l.league_id === preferId) || data[0]);
    }
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
      </div>

      <div className={`quadrant quadrant-1 ${mobileActiveTab === 'rankings' ? 'mobile-active' : ''}`} style={{ cursor: 'pointer' }} onClick={openFullRankings}>
        <strong>Rest of Season Rankings</strong>
        <ul className="rankings-list">
          {topRankings.map((r) => (
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
      <div className={`quadrant quadrant-2 ${mobileActiveTab === 'home' ? 'mobile-active' : ''}`}>
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
                    flex: '0 1 220px', fontSize: '1.2rem', textAlign: 'center',
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
  if (minsLeft !== null && minsLeft <= 60) {
    return (
      <button
        onClick={() => onNavigate('draft-room', activeLeague)}
        style={{ background: 'var(--color-error)', color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', padding: '10px 24px' }}
      >
        Enter Draft Room
      </button>
    );
  }
  return (
    <span className="draft-clock" style={{ position: 'relative' }}>
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
              <button
                style={{
                  background: 'linear-gradient(135deg, #e6c458, #d4af37, #8a6d1f)',
                  color: '#111',
                  fontWeight: 'bold',
                  borderRadius: '50px',
                  padding: '10px 32px',
                  border: 'none',
                  boxShadow: '0 3px 10px rgba(212, 175, 55, 0.5)',
                }}
              >
                Enter Lockerroom
              </button>
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
                      <input type="text" value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} style={{ width: 110 }} />
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
                    const rowCount = Math.min(Math.max(myRows.length, oppRows.length), 9);

                    // Vertical-only sizing: stays full-size through 7 total roster
                    // slots, shrinks a little at 8 and a little more at 9 — anything
                    // beyond 9 is simply not rendered at all (rowCount above already
                    // caps the loop there).
                    const totalSlots = leagueRosterSpec
                      ? (Number(leagueRosterSpec.roster_qb) || 0) + (Number(leagueRosterSpec.roster_rb) || 0)
                        + (Number(leagueRosterSpec.roster_wr) || 0) + (Number(leagueRosterSpec.roster_te) || 0)
                        + (Number(leagueRosterSpec.roster_flex) || 0) + (Number(leagueRosterSpec.roster_superflex) || 0)
                        + (Number(leagueRosterSpec.roster_bench) || 0)
                      : 0;
                    const shrinkSteps = Math.max(0, Math.min(totalSlots, 9) - 7);
                    const rowVerticalPadding = Math.max(5 - shrinkSteps * 1.5, 2);

                    return Array.from({ length: rowCount }, (_, i) => {
                      const mine = myRows[i];
                      const opp = oppRows[i];
                      const myCost = mine?.player ? contractCostAtWeek(mine.player, currentLeagueWeek) : null;
                      const oppCost = opp?.player ? contractCostAtWeek(opp.player, currentLeagueWeek) : null;
                      const position = mine?.position || opp?.position;
                      return (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '8% 1fr 6% 7% 6% 1fr 8%', gap: 4, alignItems: 'center', padding: `${rowVerticalPadding}px 0`, borderBottom: '1px solid var(--color-border-subtle)', fontSize: '0.85rem' }}>
                          <span className="muted-text" style={{ fontSize: '0.7rem' }}>
                            {mine?.player && myCost ? <>${myCost.cost.toFixed(0)}/{myCost.weeksRemaining}</> : ''}
                          </span>
                          <span style={{ color: mine?.player ? (NFL_TEAM_COLORS[mine.player.team] || 'var(--color-text)') : 'var(--color-text)' }}>
                            {mine?.player ? mine.player.full_name : '—'}
                          </span>
                          <span className="muted-text" style={{ textAlign: 'right', fontSize: '0.75rem' }}>—</span>
                          <span className="roster-slot-badge" style={{ background: POSITION_SLOT_COLORS[position], textAlign: 'center', justifySelf: 'center' }}>{position}</span>
                          <span className="muted-text" style={{ fontSize: '0.75rem' }}>—</span>
                          <span style={{ textAlign: 'right', color: opp?.player ? (NFL_TEAM_COLORS[opp.player.team] || 'var(--color-text)') : 'var(--color-text)' }}>
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

                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-start', gap: 26 }}>
                  {Array.from({ length: 6 }, (_, i) => currentLeagueWeek + i).map((week) => {
                    const slices = buildPieSlices(buildWeekCapSegments(week), 64);
                    return (
                      <div key={week} style={{ textAlign: 'center' }}>
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
                            : t.rank <= myTierStandings.promote_count;
                          const inRelegationZone = !isBottomTier && t.rank > teamCount - myTierStandings.relegate_count;

                          let cellClass = '';
                          if (inPromoZone) {
                            const nextTeam = myTierStandings.teams.find((x) => x.rank === myTierStandings.promote_count + 1);
                            const clinched = nextTeam ? t.min_possible_wins > nextTeam.max_possible_wins : true;
                            cellClass = clinched ? 'promo-solid' : 'promo-light';
                          } else if (inRelegationZone) {
                            const prevTeam = myTierStandings.teams.find((x) => x.rank === teamCount - myTierStandings.relegate_count);
                            const clinched = prevTeam ? t.max_possible_wins < prevTeam.min_possible_wins : true;
                            cellClass = clinched ? 'releg-solid' : 'releg-light';
                          }

                          return (
                            <tr key={t.team_id}>
                              <td>
                                {isMyTeam ? (
                                  <Crest pattern={crestData.pattern} color1={crestData.color1} color2={crestData.color2} size={20} />
                                ) : (
                                  <Crest pattern="solid" color1="none" color2="none" size={20} empty />
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
          </div>
        )}
      </div>
      <div className="bottom-row">
        <div className={`quadrant ${mobileActiveTab === 'q3' ? 'mobile-active' : ''}`}>Coming soon</div>
        <div className={`quadrant ${mobileActiveTab === 'q4' ? 'mobile-active' : ''}`}>Coming soon</div>
      </div>

      <nav className="mobile-bottom-nav">
        <button className={mobileActiveTab === 'home' ? 'active' : ''} onClick={() => setMobileActiveTab('home')}>Home</button>
        <button className={mobileActiveTab === 'rankings' ? 'active' : ''} onClick={() => setMobileActiveTab('rankings')}>Rankings</button>
        <button className={mobileActiveTab === 'q3' ? 'active' : ''} onClick={() => setMobileActiveTab('q3')}>Coming Soon</button>
        <button className={mobileActiveTab === 'q4' ? 'active' : ''} onClick={() => setMobileActiveTab('q4')}>Coming Soon</button>
      </nav>

      {showFullRankings && (
        <div className="modal-overlay" onClick={() => setShowFullRankings(false)}>
          <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Full Rankings</h3>
            <table className="rankings-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>Rec</th>
                  <th>Yards</th>
                  <th>TDs</th>
                  <th>Pass Yds</th>
                  <th>Pass TDs</th>
                  <th>INTs</th>
                  <th>Proj PPG</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {fullRankings.map((r) => (
                  <tr key={r.rank ?? r.full_name}>
                    <td>{r.rank ?? '-'}</td>
                    <td className={`pos-${r.player_position}-highlight`}>{r.full_name}</td>
                    <td>{r.player_position}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
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
              <button onClick={() => handleRemoveSlot(removingTeam.team_id)} style={{ background: 'var(--color-error)', color: '#111' }}>Remove Team Slot</button>
              <button onClick={() => setRemovingTeam(null)}>Cancel</button>
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

      {showLeagueSettings && (
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
                {generalMsg && <div className="success-text" style={{ marginTop: 8 }}>{generalMsg}</div>}
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
            style={{ width: 150, color: auctionTouched.initial_draft_at ? 'var(--color-text)' : 'var(--color-text-muted)' }}
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
                  <button onClick={() => setShowFullSchedule(!showFullSchedule)}                    style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', textDecoration: 'underline', padding: 0, cursor: 'pointer' }}
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
                          <svg width="18" height="18" viewBox="0 0 24 24" style={{ cursor: 'pointer' }} onClick={() => setRemovingTeam(s)}>
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
  <span style={{ fontWeight: 'bold', color: t.tier_color || 'var(--color-text)' }}>
    {t.tier_name || `Tier ${t.tier_number}`}
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
                          <span style={{ display: 'flex', gap: 4 }}>
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