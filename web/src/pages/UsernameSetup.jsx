import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function UsernameSetup({ onDone }) {
  const [username, setUsername] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function checkUsername(value) {
    setUsername(value);
    if (value.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    const { data, error: checkErr } = await supabase.rpc('check_username_available', { p_username: value });
    if (!checkErr) setUsernameAvailable(data);
  }

  async function handleSubmit() {
    setError('');
    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (usernameAvailable === false) {
      setError('That username is already taken.');
      return;
    }

    setLoading(true);
    const { error: claimErr } = await supabase.rpc('claim_username', { p_username: username });
    setLoading(false);

    if (claimErr) {
      setError(claimErr.message);
      return;
    }
    onDone();
  }

  return (
    <div className="page">
      <div className="form-box">
        <h2>Pick a username</h2>
        <div className="muted-text" style={{ fontSize: '0.85rem' }}>
          You won't be able to create an account until you've verified your email.
        </div>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => checkUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        {usernameAvailable === false && <div className="error-text">Username taken</div>}
        {usernameAvailable === true && <div className="success-text">Username available</div>}

        <button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Saving...' : 'Continue'}
        </button>
        {error && <div className="error-text">{error}</div>}
      </div>
    </div>
  );
}