import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSetNewPassword() {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="page">
        <div className="form-box">
          <h2>Password Updated</h2>
          <p className="success-text">Try logging back in with your new password.</p>
          <button onClick={onDone}>Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="form-box">
        <h2>Set a New Password</h2>

        <input
          type="password"
          placeholder="New password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSetNewPassword()}
        />

        <button onClick={handleSetNewPassword} disabled={loading}>
          {loading ? 'Saving...' : 'Save New Password'}
        </button>

        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}