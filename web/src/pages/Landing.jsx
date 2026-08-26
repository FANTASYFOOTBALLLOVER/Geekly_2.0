import { useState } from 'react';
import geeklyLogo from '../assets/final-logo-geekly.png';
import { supabase } from '../supabaseClient';

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