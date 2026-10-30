import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

// Every Mario Super Sluggers character with their in-game stats (1-10 scale),
// valued against the league's highest cap the same way football players are.

const STAT_KEYS = [
  { key: 'pitching', label: 'Pitch' },
  { key: 'batting', label: 'Bat' },
  { key: 'fielding', label: 'Field' },
  { key: 'running', label: 'Run' },
];

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'CAPTAINS', label: 'Captains' },
  { key: 'pitching', label: 'Pitch' },
  { key: 'batting', label: 'Bat' },
  { key: 'fielding', label: 'Field' },
  { key: 'running', label: 'Run' },
];

function StatBar({ value }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ display: 'inline-block', width: 50, height: 6, background: 'var(--color-bg-input)', borderRadius: 3, overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${value * 10}%`, height: '100%', background: value >= 8 ? 'var(--color-pos-rb)' : value <= 3 ? 'var(--color-pos-qb)' : 'var(--color-pos-wr)' }} />
      </span>
      {value}
    </span>
  );
}

export default function SluggersCharacterBoard({ valuationCap }) {
  const [characters, setCharacters] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState('rank');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('sluggers_character_values')
      .select('*')
      .order('rank', { ascending: true })
      .then(({ data, error }) => {
        if (error) { setLoadError('Could not load characters: ' + error.message); return; }
        setCharacters(data || []);
      });
  }, []);

  const dollarValue = (pct) =>
    valuationCap ? `$${(valuationCap * Number(pct) / 100).toFixed(2)}` : `${pct}%`;

  const filtered = useMemo(() => {
    let rows = characters;
    if (filter === 'CAPTAINS') rows = rows.filter((c) => c.is_captain);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q) || (c.default_team || '').toLowerCase().includes(q));
    }
    const key = STAT_KEYS.some((s) => s.key === filter) ? filter : sortKey;
    if (key === 'rank') return rows;
    if (key === 'name') return [...rows].sort((a, b) => a.name.localeCompare(b.name));
    return [...rows].sort((a, b) => b[key] - a[key] || a.rank - b.rank);
  }, [characters, filter, search, sortKey]);

  const filterButtons = (
    <div className="home-rankings-filters" onClick={(e) => e.stopPropagation()}>
      {FILTERS.map((f) => (
        <button
          key={f.key}
          onClick={() => setFilter(f.key)}
          style={{
            background: f.key === 'ALL' ? '#000' : 'var(--color-bg-input)',
            color: '#fff',
            border: filter === f.key ? '2px solid #ff1493' : '2px solid transparent',
          }}
        >{f.label}</button>
      ))}
    </div>
  );

  const sortHeader = (key, label) => (
    <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => { setFilter('ALL'); setSortKey(key); }}>
      {label}{sortKey === key ? ' ▾' : ''}
    </th>
  );

  return (
    <>
      <div onClick={() => setExpanded(true)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
        <strong>Character Rankings</strong>
        {filterButtons}
        {loadError && <div className="error-text">{loadError}</div>}
        <ul className="rankings-list">
          {filtered.map((c, i) => (
            <li key={c.id} className="ranking-row">
              <span>
                {filter === 'ALL' ? c.rank : i + 1}. {c.name}
                {c.is_captain && <span title="Team captain" style={{ marginLeft: 4, color: '#ffd400' }}>★</span>}
              </span>
              <span>
                {STAT_KEYS.some((s) => s.key === filter) && <span style={{ marginRight: 10 }}>{c[filter]}/10</span>}
                {dollarValue(c.cap_percent)}
              </span>
            </li>
          ))}
        </ul>
        <div className="muted-text" style={{ fontSize: '0.8rem', marginTop: 6 }}>*Click to see every character's stats</div>
      </div>

      {expanded && (
        <div className="modal-overlay" onClick={() => setExpanded(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0 }}>Mario Super Sluggers characters ({characters.length})</h3>
              <button onClick={() => setExpanded(false)}>Close</button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0', flexWrap: 'wrap' }}>
              {filterButtons}
              <input type="text" placeholder="Search name or team" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 180 }} />
            </div>
            <div style={{ overflow: 'auto', minHeight: 0 }}>
              <table className="rankings-table">
                <thead>
                  <tr>
                    {sortHeader('rank', 'Rank')}
                    {sortHeader('name', 'Character')}
                    <th>Team</th>
                    {STAT_KEYS.map((s) => sortHeader(s.key, s.label))}
                    {sortHeader('overall', 'Total')}
                    <th>Throws / Bats</th>
                    <th>Fielding move</th>
                    <th>Star Pitch</th>
                    <th>Star Swing</th>
                    {sortHeader('rank', 'Value')}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td>{c.rank}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {c.name}{c.is_captain && <span title="Team captain" style={{ marginLeft: 4, color: '#ffd400' }}>★</span>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.default_team || '—'}</td>
                      {STAT_KEYS.map((s) => <td key={s.key}><StatBar value={c[s.key]} /></td>)}
                      <td>{c.overall}</td>
                      <td>{c.throws} / {c.bats}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.fielding_ability || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.star_pitch || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{c.star_swing || '—'}</td>
                      <td>{dollarValue(c.cap_percent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}