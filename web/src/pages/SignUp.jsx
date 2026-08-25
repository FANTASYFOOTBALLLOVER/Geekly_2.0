import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function SignUp({ onNavigate, onSignedUp }) {
  const [step, setStep] = useState('email'); // 'email' | 'details'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleEmailContinue() {
    setError('');
    if (!email.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    setStep('details');
  }

  async function checkUsername(value) {
    setUsername(value);
    if (value.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    const { data, error: checkErr } = await supabase.rpc('check_username_available', { p_username: value });
    if (!checkErr) setUsernameAvailable(data);
  }



  async function handleCreateAccount() {
    setError('');

    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (usernameAvailable === false) {
      setError('That username is already taken.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    if (signUpErr) {
      setError(signUpErr.message);
      setLoading(false);
      return;
    }

    // If email confirmation is required, there's no session yet — the
    // username gets claimed once they confirm and log in instead.
    if (data.session) {
      const { error: claimErr } = await supabase.rpc('claim_username', { p_username: username });
      if (claimErr) {
        setError(claimErr.message);
        setLoading(false);
        return;
      }
      onSignedUp();
    } else {
      setLoading(false);
      setError('Check your email to confirm your account, then log in to finish setting up your username.');
    }
  }

  return (
    <div className="page">
      <div className="form-box">
        <h2>Sign Up</h2>

        {step === 'email' && (
          <>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button onClick={handleEmailContinue}>Continue</button>
          </>
        )}

        {step === 'details' && (
          <>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => checkUsername(e.target.value)}
            />
            {usernameAvailable === false && <div className="error-text">Username taken</div>}
            {usernameAvailable === true && <div className="success-text">Username available</div>}

            <input
              type="password"
              placeholder="Password (min. 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
            <button onClick={handleCreateAccount} disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </>
        )}

        {error && <div className="error-text">{error}</div>}

        <div style={{ marginTop: 10 }}>
          Already geeked?{' '}
          <button className="link-text" onClick={() => onNavigate('login')}>
            Log In
          </button>
        </div>
      </div>
    </div>
  );
}