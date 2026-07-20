import React, { useEffect, useState } from 'react';
import api from '../api';
import { ClientLink } from '../components/ui';

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dLabel = (d) => { if (!d) return '—'; const dt = new Date(d); return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`; };
const scoreClass = (s) => (s == null ? 'ais l' : s >= 75 ? 'ais h' : s >= 60 ? 'ais m' : 'ais l');
const stateBadge = (s) => {
  const t = (s || '').toLowerCase();
  if (t === 'interested' || t === 'opted_in') return 'b-int';
  if (t === 'pending') return 'b-pend';
  if (t === 'assigned' || t === 'contacted') return 'b-blank';
  return 'b-blank';
};
const prettyState = (s) => {
  const map = { opted_in: 'Interested', pending: 'Pending approval', assigned: 'To contact', contacted: 'Contacted', interested: 'Interested' };
  return map[(s || '').toLowerCase()] || s;
};

const LeadPipeline = () => {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rmF, setRmF]     = useState('');
  const [stateF, setStateF] = useState('');

  useEffect(() => {
    api.get('/analytics/lead-pipeline')
      .then(res => setData(res.data))
      .catch(() => setError('Could not load lead pipeline.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="ph"><h2>Lead pipeline</h2><p>Loading…</p></div>;
  if (error)   return <div className="ph"><h2>Lead pipeline</h2><p style={{ color: 'var(--dc)' }}>{error}</p></div>;

  const { cards, rms, leads } = data;
  const filtered = leads.filter(l => {
    if (rmF && l.rm_name !== rmF) return false;
    if (stateF) {
      const st = prettyState(l.state);
      if (stateF === 'tocontact' && st !== 'To contact') return false;
      if (stateF === 'interested' && st !== 'Interested') return false;
      if (stateF === 'pending' && st !== 'Pending approval') return false;
    }
    return true;
  });

  return (
    <div>
      <div className="ph">
        <h2>Lead pipeline</h2>
        <p>All {cards.active} active leads across all RMs</p>
      </div>

      <div className="cards">
        <div className="card cp"><div className="clbl">Total active leads</div><div className="cval">{cards.active}</div></div>
        <div className="card ci"><div className="clbl">Interested (opt-in sent)</div><div className="cval">{cards.interested}</div></div>
        <div className="card cs"><div className="clbl">Pending approval</div><div className="cval">{cards.pending_approval}</div></div>
        <div className="card cd"><div className="clbl">Expiring this week</div><div className="cval">{cards.expiring}</div></div>
      </div>

      <div className="panel">
        <div className="phd" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="ptitle" style={{ marginBottom: 0 }}>📋 All leads</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ width: 110 }} value={rmF} onChange={e => setRmF(e.target.value)}>
              <option value="">All RMs</option>
              {rms.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select style={{ width: 150 }} value={stateF} onChange={e => setStateF(e.target.value)}>
              <option value="">All states</option>
              <option value="tocontact">To contact</option>
              <option value="interested">Interested</option>
              <option value="pending">Pending approval</option>
            </select>
            <button className="btn sm">⬇️ Export</button>
          </div>
        </div>
        <div className="tw"><table>
          <thead><tr><th>UCC</th><th>Name</th><th>Type</th><th>RM</th><th>Score</th><th>State</th><th>Opt-in</th><th>Assigned</th><th>Expires</th><th>Reassigns</th></tr></thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.ucc}>
                <td>{l.ucc}</td><td><ClientLink ucc={l.ucc} name={l.name} /></td>
                <td><span className="badge b-ri">{l.client_type}</span></td>
                <td>{l.rm_name}</td>
                <td><span className={scoreClass(l.lead_score)}>{l.lead_score == null ? '—' : l.lead_score}</span></td>
                <td><span className={`badge ${stateBadge(l.state)}`}>{prettyState(l.state)}</span></td>
                <td><span className={`badge ${l.optin === 'Clicked' ? 'b-act' : l.optin === 'Sent' ? 'b-pend' : 'b-blank'}`}>{l.optin}</span></td>
                <td>{dLabel(l.assigned_at)}</td>
                <td>{dLabel(l.expires_at)}</td>
                <td>{l.reassigns}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--tx3)' }}>No leads match.</td></tr>}
          </tbody>
        </table></div>
      </div>
    </div>
  );
};

export default LeadPipeline;