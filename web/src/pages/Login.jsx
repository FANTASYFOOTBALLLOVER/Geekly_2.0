import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onNavigate, onLoggedIn }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showResetSentPopup, setShowResetSentPopup] = useState(false);

  async function handleLogin() {
    setError('');
    setLoading(true);

    const { data: resolvedEmail, error: lookupErr } = await supabase.rpc('get_email_for_login', {
      p_identifier: identifier,
    });

    if (lookupErr || !resolvedEmail) {
      setError('The email or password are incorrect.');
      setLoading(false);
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    });

    setLoading(false);

    if (signInErr) {
      setError('The email or password are incorrect.');
      return;
    }

    onLoggedIn();
  }

  async function handleGoogle() {
    setError('');
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (oauthErr) setError(oauthErr.message);
  }

  async function handleForgotPassword() {
    setError('');
    const trimmed = identifier.trim();

    if (!trimmed) {
      setError('Please type an email into the email box to reset password.');
      return;
    }

    // This action specifically requires a real email — a username (or any
    // string without an @) can never be a match, so don't even bother
    // round-tripping to the server for that case.
    if (!trimmed.includes('@')) {
      setError('That email is not associated with an account.');
      return;
    }

    const { data: resolvedEmail } = await supabase.rpc('get_email_for_login', {
      p_identifier: trimmed,
    });

    if (!resolvedEmail || resolvedEmail.toLowerCase() !== trimmed.toLowerCase()) {
      setError('That email is not associated with an account.');
      return;
    }

    await supabase.auth.resetPasswordForEmail(resolvedEmail, {
  redirectTo: 'https://geeklyfantasy.com',
});
    setShowResetSentPopup(true);
  }

  return (
    <div className="page">
      <div className="form-box">
        <h2>Log In</h2>

        <input
          type="text"
          placeholder="Username or email"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />

        <button onClick={handleLogin} disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>

        {error && <div className="error-text">{error}</div>}

        <div style={{ marginTop: 10 }}>
          Need to create an account?{' '}
          <button className="link-text" onClick={() => onNavigate('signup')}>
            Click here
          </button>
        </div>
        <div style={{ marginTop: 10 }}>
          Forgot your password?{' '}
          <button className="link-text" style={{ color: 'var(--color-pos-rb)' }} onClick={handleForgotPassword}>
            click here
          </button>
        </div>
      </div>

      {showResetSentPopup && (
        <div className="modal-overlay" onClick={() => setShowResetSentPopup(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Check your email</h3>
              <button onClick={() => setShowResetSentPopup(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', padding: '0 4px' }}>✕</button>
            </div>
            <p className="muted-text" style={{ marginTop: 10 }}>We just sent a reset link to your email.</p>
          </div>
        </div>
      )}
    </div>
  );
}