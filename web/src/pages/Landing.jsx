import { useEffect, useMemo, useState } from 'react';
import geeklyLogo from '../assets/final-logo-geekly.png';
import { supabase } from '../supabaseClient';
import { NFL_TEAM_COLORS } from '../constants/teamColors';

const STOCK_SEASON = 2026;
const STOCK_SORTS = [
  ['value', 'Overall value'],
  ['position', 'Position'],
  ['team', 'Team'],
  ['name', 'Name'],
  ['risers', 'Biggest risers'],
  ['fallers', 'Biggest fallers'],
];
const STOCK_POSITION_COLORS = { QB: 'var(--color-pos-qb)', RB: 'var(--color-pos-rb)', WR: 'var(--color-pos-wr)', TE: 'var(--color-pos-te)' };

function normalPlaceholder(seed) {
  let first = Math.sin(seed * 12.9898) * 43758.5453;
  let second = Math.sin((seed + 17) * 78.233) * 43758.5453;
  first -= Math.floor(first);
  second -= Math.floor(second);
  const normal = Math.sqrt(-2 * Math.log(Math.max(first, 0.0001))) * Math.cos(2 * Math.PI * second);
  return Math.max(-45, Math.min(45, normal * 15));
}

function movementPercent(player, index) {
  const tickerChange = Number(player.pct_change);
  if (Number.isFinite(tickerChange) && tickerChange !== 0) return tickerChange;
  const today = Number(player.today_dollars);
  const lastWeek = Number(player.yesterday_dollars);
  if (lastWeek > 0 && today > 0 && today !== lastWeek) return ((today / lastWeek) - 1) * 100;
  return normalPlaceholder(index + String(player.stock_code || '').length);
}

function isPlaceholderMovement(player) {
  return !(Number.isFinite(Number(player.pct_change)) && Number(player.pct_change) !== 0)
    && !(Number(player.yesterday_dollars) > 0 && Number(player.today_dollars) > 0 && Number(player.today_dollars) !== Number(player.yesterday_dollars));
}

function StockHistoryGraph({ series }) {
  const values = (series || []).map((point) => Number(point.amount) || 0);
  if (values.length < 2) return <div className="stock-detail-no-chart">No price history yet</div>;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${34 - ((value - min) / span) * 28}`).join(' ');
  return (
    <svg className="stock-detail-graph" viewBox="0 0 100 40" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="var(--color-pos-rb)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function PlayerStockModal({ player, stats, games, onClose }) {
  const teamColor = NFL_TEAM_COLORS[player.team] || 'var(--color-text)';
  const seasonsWithStats = [...new Set((stats || []).map((row) => Number(row.season)))].filter((season) => season >= 2021 && season <= STOCK_SEASON);
  const firstSeason = Math.min(...seasonsWithStats, STOCK_SEASON);
  const [season, setSeason] = useState(STOCK_SEASON);
  const seasonStats = (stats || []).filter((row) => Number(row.season) === season);
  const seasonTeams = [...new Set(seasonStats.map((row) => row.team).filter(Boolean))];
  const teams = season === STOCK_SEASON ? [...new Set([player.team, ...seasonTeams].filter(Boolean))] : seasonTeams;
  const schedule = (games || []).filter((game) => Number(game.season) === season && teams.includes(game.home_team) || Number(game.season) === season && teams.includes(game.away_team)).sort((a, b) => a.week - b.week);
  const statByWeek = Object.fromEntries(seasonStats.map((row) => [row.week, row]));
  const value = (row, field) => row ? (row[field] ?? 0) : '-';
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
        <div className="stock-season-picker">
          <select value={season} onChange={(event) => setSeason(Number(event.target.value))}>
            {Array.from({ length: STOCK_SEASON - 2021 + 1 }, (_, index) => STOCK_SEASON - index).map((year) => (
              <option key={year} value={year} disabled={year < firstSeason}>{year}</option>
            ))}
          </select>
        </div>
        <StockHistoryGraph series={player.series} />
        <div className="stock-player-stats">
          <table><thead><tr><th>Wk</th><th>Opponent</th><th>Cmp</th><th>Att</th><th>Pass Yds</th><th>Pass TD</th><th>INT</th><th>Rush Att</th><th>Rush Yds</th><th>Rush TD</th><th>Targets</th><th>Rec</th><th>Rec Yds</th><th>Rec TD</th><th>Total Yds</th><th>Total TD</th><th>Fum</th></tr></thead>
            <tbody>{Array.from({ length: 18 }, (_, index) => index + 1).map((week) => {
              const row = statByWeek[week];
              const game = schedule.find((item) => Number(item.week) === week);
              const opponent = game ? (teams.includes(game.home_team) ? game.away_team : game.home_team) : (row?.opponent_team || '—');
              const isQuarterback = player.player_position === 'QB';
              const totalYards = isQuarterback ? '—' : Number(row?.rushing_yards || 0) + Number(row?.receiving_yards || 0);
              const totalTds = isQuarterback ? '—' : Number(row?.rushing_tds || 0) + Number(row?.receiving_tds || 0);
              return <tr key={week}><td>{week}</td><td>{opponent}</td><td>{value(row, 'completions')}</td><td>{value(row, 'attempts')}</td><td>{value(row, 'passing_yards')}</td><td>{value(row, 'passing_tds')}</td><td>{value(row, 'interceptions')}</td><td>{value(row, 'rushing_attempts')}</td><td>{value(row, 'rushing_yards')}</td><td>{value(row, 'rushing_tds')}</td><td>{value(row, 'targets')}</td><td>{value(row, 'receptions')}</td><td>{value(row, 'receiving_yards')}</td><td>{value(row, 'receiving_tds')}</td><td>{totalYards}</td><td>{totalTds}</td><td>{value(row, 'fumbles_lost')}</td></tr>;
            })}</tbody></table>
        </div>
      </div>
    </div>
  );
}

function LandingStockExchange() {
  const [players, setPlayers] = useState([]);
  const [stockError, setStockError] = useState('');
  const [sort, setSort] = useState('value');
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState({});
  const [playerGames, setPlayerGames] = useState({});

  function openPlayer(player) {
    setSelectedPlayer(player);
    if (playerStats[player.sleeper_id]) return;
    Promise.all([
      supabase.from('weekly_stats')
      .select('season, week, team, opponent_team, passing_yards, passing_tds, rushing_yards, rushing_tds, receiving_yards, receiving_tds, receptions, completions, attempts, interceptions, rushing_attempts, targets, fumbles_lost')
      .eq('sleeper_id', player.sleeper_id).in('season', [2021, 2022, 2023, 2024, 2025, STOCK_SEASON]).order('season', { ascending: true }).order('week', { ascending: true }),
      supabase.from('games').select('season, week, home_team, away_team').gte('season', 2021).lte('season', STOCK_SEASON).eq('season_type', 'REG'),
    ]).then(([{ data: stats }, { data: games }]) => {
      setPlayerStats((current) => ({ ...current, [player.sleeper_id]: stats || [] }));
      setPlayerGames((current) => ({ ...current, [player.sleeper_id]: games || [] }));
    });
  }

  useEffect(() => {
    let cancelled = false;
    async function loadStock() {
      const { data: ticker, error: tickerError } = await supabase
        .rpc('get_stock_ticker', { p_season: STOCK_SEASON });
      if (!tickerError && ticker?.length) {
        if (!cancelled) {
          setStockError('');
          setPlayers(ticker.filter((player) => player.stock_code));
        }
        return;
      }

      const { data: playerRows, error: playersError } = await supabase
        .from('players')
        .select('sleeper_id, stock_code, full_name, position, team')
        .not('stock_code', 'is', null)
        .neq('stock_code', '');
      if (cancelled) return;
      if (playersError) {
        setStockError(tickerError?.message || playersError.message || 'Could not load stock.');
        return;
      }
      setStockError('');
      setPlayers((playerRows || []).map((player) => ({
        ...player,
        player_position: player.position,
        full_name: player.full_name,
        pct_change: null,
        today_dollars: null,
        yesterday_dollars: null,
      })));
    }
    loadStock().catch((error) => { if (!cancelled) setStockError(error.message || 'Could not load stock.'); });
    return () => { cancelled = true; };
  }, []);

  const sortedPlayers = useMemo(() => [...players].sort((a, b) => {
    const growth = (row) => movementPercent(row, players.indexOf(row));
    if (sort === 'position') return String(a.player_position).localeCompare(String(b.player_position)) || String(a.stock_code).localeCompare(String(b.stock_code));
    if (sort === 'team') return String(a.team || 'FA').localeCompare(String(b.team || 'FA')) || String(a.stock_code).localeCompare(String(b.stock_code));
    if (sort === 'name') return String(a.full_name).localeCompare(String(b.full_name));
    if (sort === 'risers') return growth(b) - growth(a);
    if (sort === 'fallers') return growth(a) - growth(b);
    return Number(b.today_dollars || 0) - Number(a.today_dollars || 0);
  }), [players, sort]);

  return (
    <section className="stock-strip" aria-label="Player stock">
      <div className="stock-heading">
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort player stock">
          {STOCK_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="stock-track" key={sort}>
        {[...sortedPlayers, ...sortedPlayers].map((player, index) => {
          const growthPct = movementPercent(player, players.indexOf(player));
          const rising = growthPct >= 0;
          return (
            <div
              className="stock-quote"
              key={`${player.sleeper_id}-${index}`}
              onClick={() => openPlayer(player)}
            >
              <span className="stock-quote-normal"><strong style={{ color: STOCK_POSITION_COLORS[player.player_position] || 'var(--color-text)' }}>{player.stock_code}</strong> <span className={rising ? 'stock-up' : 'stock-down'}>{Math.abs(growthPct).toFixed(1)}% {rising ? '▲' : '▼'}</span></span>
              <span className="stock-quote-hover"><strong style={{ color: NFL_TEAM_COLORS[player.team] || 'var(--color-text)' }}>{player.full_name || player.stock_code}</strong> <span style={{ color: STOCK_POSITION_COLORS[player.player_position] || 'var(--color-text)' }}>({player.stock_code})</span> <span className={rising ? 'stock-up' : 'stock-down'}>{Math.abs(growthPct).toFixed(1)}% {rising ? '▲' : '▼'}</span></span>
            </div>
          );
        })}
        {stockError && <span className="error-text">Stock unavailable: {stockError}</span>}
        {!stockError && sortedPlayers.length === 0 && <span className="muted-text">Loading stock...</span>}
      </div>
      {selectedPlayer && <PlayerStockModal player={selectedPlayer} stats={playerStats[selectedPlayer.sleeper_id]} games={playerGames[selectedPlayer.sleeper_id]} onClose={() => setSelectedPlayer(null)} />}
    </section>
  );
}

const featureBars = [
  {
    className: 'feature-bar feature-bar-gold',
    style: { bottom: 500, left: 350, width: 350, height: 72 },
    label: 'Weekly Leasing',
    text:
      'Leagues have salary cap drafts multiple times a year (typically weekly). Users will be able to sign players for as few or many weeks as they want, giving them the opportunity to try different players and draft strategies in a season.'
  },
  {
    className: 'feature-bar feature-bar-silver',
    style: { bottom: 350, left: 500, width: 350, height: 72 },
    label: 'Relegation Tiers',
    text:
      'Geekly was designed to make large leagues more fun and accessible. Leagues typically split users into tiers of relegation. All users are buying the same players, but their salary cap will differ based on which tier they are in.'
  },
  {
    className: 'feature-bar feature-bar-bronze',
    style: { bottom: 200, left: 650, width: 350, height: 72 },
    label: 'Play more-skilled fantasy',
    text:
      'Standard Geekly Leagues do not have benches, when a player is on a bye they’ll be automatically stored in a bye slot and not count against your cap for that week. Players who go on IR can be cut, nullifying the contract. A torn ACL will never ruin your season again.'
  }
];

export default function Landing({ onNavigate, authMode = null }) {
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupPassword2, setSignupPassword2] = useState('');
  const [signupUsernameAvailable, setSignupUsernameAvailable] = useState(null);
  const [signupError, setSignupError] = useState('');
  const [signupLoading, setSignupLoading] = useState(false);

  const isAuthActive = authMode === 'login' || authMode === 'signup';
  const isLogin = authMode === 'login';

  async function checkUsername(value) {
    setSignupUsername(value);
    if (value.length < 3) {
      setSignupUsernameAvailable(null);
      return;
    }
    const { data, error: checkErr } = await supabase.rpc('check_username_available', { p_username: value });
    if (!checkErr) setSignupUsernameAvailable(data);
  }

  async function handleLogin() {
    setLoginError('');
    setLoginLoading(true);

    const { data: resolvedEmail, error: lookupErr } = await supabase.rpc('get_email_for_login', {
      p_identifier: loginIdentifier,
    });

    if (lookupErr || !resolvedEmail) {
      setLoginError('The email or password are incorrect.');
      setLoginLoading(false);
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: loginPassword,
    });

    setLoginLoading(false);

    if (signInErr) {
      setLoginError('The email or password are incorrect.');
      return;
    }

    onNavigate('home');
  }

  async function handleGoogle() {
    setLoginError('');
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (oauthErr) setLoginError(oauthErr.message);
  }

  async function handleCreateAccount() {
    setSignupError('');

    if (!email.includes('@')) {
      setSignupError('Enter a valid email.');
      return;
    }
    if (signupUsername.length < 3) {
      setSignupError('Username must be at least 3 characters.');
      return;
    }
    if (signupUsernameAvailable === false) {
      setSignupError('That username is already taken.');
      return;
    }
    if (signupPassword.length < 8) {
      setSignupError('Password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== signupPassword2) {
      setSignupError('Passwords do not match.');
      return;
    }

    setSignupLoading(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password: signupPassword,
      options: { emailRedirectTo: window.location.origin },
    });

    if (signUpErr) {
      setSignupError(signUpErr.message);
      setSignupLoading(false);
      return;
    }

    if (data.session) {
      const { error: claimErr } = await supabase.rpc('claim_username', { p_username: signupUsername });
      if (claimErr) {
        setSignupError(claimErr.message);
        setSignupLoading(false);
        return;
      }
      onNavigate('home');
      return;
    }

    setSignupLoading(false);
    setSignupError('Check your email to confirm your account, then log in to finish setting up your username.');
  }

  return (
    <div className="landing-page">
      <header className="landing-header">
        <img src={geeklyLogo} alt="Geekly" className="landing-logo" />

        <p className="mobile-only-notice">This site is built for computer/desktop use and may not display correctly on mobile.</p>

        <div className="landing-actions">
          <button className="landing-button landing-button-secondary" onClick={() => onNavigate('login')}>
            Log In
          </button>
          <button className="landing-button landing-button-primary" onClick={() => onNavigate('signup')}>
            Sign Up
          </button>
        </div>
      </header>

      <LandingStockExchange />

      <main className="landing-main">
        <div className="feature-bar-stack" aria-label="League features">
          {featureBars.map((bar) => (
            <div key={bar.label} className={bar.className} style={bar.style}>
              <div className="feature-bar-content">
                <span className="feature-bar-label">{bar.label}</span>
                <span className="feature-bar-text">{bar.text}</span>
              </div>
            </div>
          ))}
        </div>

        {isAuthActive && (
          <aside className="landing-auth-panel">
            <div className="landing-auth-card">
              <h2>{isLogin ? 'Log In' : 'Sign Up'}</h2>

              {isLogin ? (
                <>
                  <input
                    type="text"
                    placeholder="Username or email"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                  <button onClick={handleLogin} disabled={loginLoading}>
                    {loginLoading ? 'Logging in...' : 'Log In'}
                  </button>
                  <button onClick={handleGoogle}>Continue with Google</button>
                  {loginError && <div className="error-text">{loginError}</div>}
                  <div className="auth-copy">
                    Need to create an account?{' '}
                    <button className="link-text" onClick={() => onNavigate('signup')}>Click here</button>
                  </div>
                </>
              ) : (
                <>
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Username"
                    value={signupUsername}
                    onChange={(e) => checkUsername(e.target.value)}
                  />
                  {signupUsernameAvailable === false && <div className="error-text">Username taken</div>}
                  {signupUsernameAvailable === true && <div className="success-text">Username available</div>}
                  <input
                    type="password"
                    placeholder="Password (min. 8 characters)"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                  />
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={signupPassword2}
                    onChange={(e) => setSignupPassword2(e.target.value)}
                  />
                  <button onClick={handleCreateAccount} disabled={signupLoading}>
                    {signupLoading ? 'Creating account...' : 'Create Account'}
                  </button>
                  {signupError && <div className="error-text">{signupError}</div>}
                  <div className="auth-copy">
                    Already geeked?{' '}
                    <button className="link-text" onClick={() => onNavigate('login')}>Log In</button>
                  </div>
                </>
              )}
            </div>
          </aside>
        )}
      </main>
    </div>
  );
}