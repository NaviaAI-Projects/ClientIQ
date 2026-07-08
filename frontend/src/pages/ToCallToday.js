import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const FMT = v => {
  if (!v || v === 0) return '₹0';
  if (v >= 100000) return '₹' + (v/100000).toFixed(1) + 'L';
  if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
  return '₹' + v;
};

const ToCallToday = () => {
  const [leads, setLeads]                     = useState([]);
  const [calling, setCalling]                 = useState(null);
  const [selectedLead, setSelectedLead]       = useState(null);
  const [briefing, setBriefing]               = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { loadLeads(); }, []);

  const loadLeads = async () => {
    try {
      const res = await api.get('/leads/my');
      const data = res.data || [];
      setLeads(data);
      if (data.length > 0) selectLead(data[0]);
    } catch (err) { console.error(err); }
  };

  const selectLead = async (lead) => {
    setSelectedLead(lead);
    setBriefing(null);
    setBriefingLoading(true);
    try {
      const res = await api.get(`/ai/talking-points/${lead.ucc}`);
      setBriefing(res.data);
    } catch (err) {
      setBriefing({
        ucc:            lead.ucc,
        client_name:    lead.client_name,
        talking_points: null,
        error:          err.response?.data?.message || 'Could not generate AI briefing.'
      });
    } finally {
      setBriefingLoading(false);
    }
  };

  const handleCall = async (lead) => {
    setCalling(lead.ucc);
    try {
      await api.post('/calls/click-to-call', { ucc: lead.ucc });
      alert(`✅ Call initiated to ${lead.client_name}. Your phone will ring first, then the client.`);
    } catch (err) {
      alert(`❌ Call failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setCalling(null);
    }
  };

  const getPriority = score => {
    if (score >= 70) return { label: 'High',   ais: 'h', cls: 'b-dor',  dot: '#C8313B' };
    if (score >= 50) return { label: 'Medium', ais: 'm', cls: 'b-pend', dot: '#D98A0E' };
    return               { label: 'Low',    ais: 'l', cls: 'b-act',  dot: '#08905C' };
  };

  const parseSections = (text) => {
    if (!text) return [];
    const defs = [
      { key: 'opening',     label: 'Opening Line',       icon: '👋', borderColor: 'var(--ic)',  bg: 'var(--ibg)' },
      { key: 'talking',     label: 'Key Talking Points', icon: '💬', borderColor: 'var(--sc)',  bg: 'var(--sbg)' },
      { key: 'opportunity', label: 'Opportunity',         icon: '🎯', borderColor: 'var(--wc)',  bg: 'var(--wbg)' },
      { key: 'watch',       label: 'Watch Out',           icon: '⚠️', borderColor: 'var(--dc)',  bg: 'var(--dbg)' },
    ];
    const map = {};
    let current = null;
    text.split('\n').filter(l => l.trim()).forEach(line => {
      const clean = line.replace(/\*\*/g, '').trim();
      if      (/^1\.|OPENING/i.test(clean))     { current = 'opening';     map[current] = []; }
      else if (/^2\.|KEY TALK/i.test(clean))    { current = 'talking';     map[current] = []; }
      else if (/^3\.|OPPORTUN/i.test(clean))    { current = 'opportunity'; map[current] = []; }
      else if (/^4\.|WATCH/i.test(clean))       { current = 'watch';       map[current] = []; }
      else if (current && clean && !clean.match(/^[1-4]\./)) { map[current].push(clean); }
    });
    const sections = [];
    defs.forEach(d => {
      if (map[d.key]?.length > 0) sections.push({ ...d, content: map[d.key].join('\n') });
    });
    if (sections.length === 0 && text.trim()) {
      sections.push({ key: 'raw', label: 'AI Briefing', icon: '🤖', borderColor: 'var(--ic)', bg: 'var(--ibg)', content: text });
    }
    return sections;
  };

  return (
    <div>
      <div className="ph">
        <h2>To Call Today</h2>
        <p>Select a client to view their AI briefing before dialling</p>
      </div>

      {leads.length === 0 ? (
        <div className="panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--tx3)' }}>
          No leads assigned — contact your supervisor
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', alignItems: 'start' }}>

          {/* LEFT — Lead list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {leads.map(lead => {
              const priority  = getPriority(lead.lead_score);
              const isActive  = selectedLead?.ucc === lead.ucc;
              const isCalling = calling === lead.ucc;
              return (
                <div
                  key={lead.id}
                  onClick={() => !isCalling && selectLead(lead)}
                  style={{
                    background:   isActive ? 'var(--ibg)' : 'var(--bg)',
                    border:       `1px solid ${isActive ? 'var(--brand-border)' : 'var(--br)'}`,
                    borderLeft:   `4px solid ${isActive ? 'var(--ic)' : 'var(--br2)'}`,
                    borderRadius: 'var(--r2)',
                    padding:      '12px 14px',
                    cursor:       'pointer',
                    transition:   'all 120ms ease',
                    boxShadow:    isActive ? 'var(--shadow-sm)' : 'var(--shadow-xs)',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg)'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lead.client_name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--tx3)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        {lead.ucc}
                      </div>
                    </div>
                    <span className={`ais ${priority.ais}`} style={{ marginLeft: '8px', flexShrink: 0 }}>
                      {parseFloat(lead.lead_score || 0).toFixed(0)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`badge ${priority.cls}`} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: priority.dot, display: 'inline-block' }} />
                      {priority.label} priority
                    </span>
                    <button
                      className="btn bp sm"
                      disabled={isCalling}
                      onClick={e => { e.stopPropagation(); handleCall(lead); }}
                    >
                      {isCalling ? '⏳' : '📞'} {isCalling ? 'Calling...' : 'Call Now'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* RIGHT — AI Briefing */}
          <div>
            {briefingLoading ? (
              <div className="panel" style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>🤖</div>
                <div style={{ color: 'var(--tx2)', fontSize: '14px', fontWeight: '600' }}>Generating AI briefing...</div>
                <div style={{ color: 'var(--tx3)', fontSize: '12px', marginTop: '6px' }}>Analysing trading history, balance and risk signals</div>
              </div>
            ) : briefing ? (
              <>
                {/* Client header card */}
                <div style={{
                  background: 'var(--bg)', border: '1px solid var(--br)',
                  borderRadius: 'var(--r3)', marginBottom: '10px',
                  overflow: 'hidden', boxShadow: 'var(--shadow-xs)',
                }}>
                  {/* Top info */}
                  <div style={{ padding: '16px 20px', background: 'var(--ibg)', borderBottom: '1px solid var(--br)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--ic)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '5px' }}>
                        🤖 AI Call Briefing
                      </div>
                      <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--tx)', letterSpacing: '-0.3px' }}>
                        {briefing.client_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--tx2)', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                        {briefing.ucc}
                      </div>
                    </div>
                    {briefing.lead_score && (
                      <div style={{ background: 'var(--ic)', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#fff', lineHeight: 1 }}>
                          {parseFloat(briefing.lead_score).toFixed(0)}
                        </div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>Lead score</div>
                      </div>
                    )}
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--br)' }}>
                    {[
                      { label: 'Balance',    value: briefing.balance > 0 ? FMT(briefing.balance) : '—',                                                      sub: 'Opening ledger',                                                       subColor: 'var(--tx3)',  valColor: 'var(--tx)' },
                      { label: 'Last trade', value: briefing.last_trade_days != null ? (briefing.last_trade_days === 0 ? 'Today' : `${briefing.last_trade_days}d ago`) : '—', sub: briefing.last_trade_days > 14 ? 'Dormant risk' : 'Recently active', subColor: briefing.last_trade_days > 14 ? 'var(--dc)' : 'var(--sc)', valColor: briefing.last_trade_days > 30 ? 'var(--dc)' : 'var(--tx)' },
                      { label: 'Churn risk', value: briefing.churn_risk >= 70 ? 'High' : briefing.churn_risk >= 50 ? 'Medium' : briefing.churn_risk > 0 ? 'Low' : '—',       sub: briefing.churn_risk > 0 ? `Score: ${briefing.churn_risk}` : '—',   subColor: 'var(--tx3)',  valColor: briefing.churn_risk >= 70 ? 'var(--dc)' : briefing.churn_risk >= 50 ? 'var(--wc)' : 'var(--sc)' },
                    ].map((s, i) => (
                      <div key={i} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--br)' : 'none' }}>
                        <div style={{ fontSize: '10px', color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', fontWeight: '600' }}>{s.label}</div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: s.valColor }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: s.subColor, marginTop: '2px' }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* Call button */}
                  <div style={{ padding: '12px 16px', background: 'var(--bg2)' }}>
                    <button
                      onClick={() => handleCall(selectedLead)}
                      disabled={calling === briefing.ucc}
                      style={{
                        width: '100%', padding: '11px',
                        background: calling === briefing.ucc ? 'var(--tx3)' : 'var(--accent)',
                        color: 'white', border: 'none', borderRadius: 'var(--r)',
                        fontSize: '14px', fontWeight: '600',
                        cursor: calling === briefing.ucc ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      {calling === briefing.ucc ? '⏳ Calling...' : `📞 Call ${briefing.client_name?.split(' ')[0]} Now`}
                    </button>
                  </div>
                </div>

                {/* Error state */}
                {briefing.error && (
                  <div className="alert a-d">{briefing.error}</div>
                )}

                {/* Talking point sections */}
                {!briefing.error && parseSections(briefing.talking_points).map((section, i) => (
                  <div key={i} style={{
                    background:   section.bg,
                    borderRadius: 'var(--r2)',
                    padding:      '14px 16px',
                    marginBottom: '10px',
                    border:       `1px solid transparent`,
                    borderLeft:   `4px solid ${section.borderColor}`,
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: section.borderColor, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '7px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {section.icon} {section.label}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--tx)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {section.content}
                    </div>
                  </div>
                ))}

                {/* Navigate to Client 360 */}
                <button
                  className="btn sm"
                  style={{ width: '100%', marginTop: '4px' }}
                  onClick={() => navigate('/client-360', { state: { ucc: briefing.ucc } })}
                >
                  View Full Client 360 →
                </button>
              </>
            ) : (
              <div className="panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx3)' }}>
                <div style={{ fontSize: '28px', marginBottom: '12px' }}>👈</div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--tx2)' }}>Select a client to view AI briefing</div>
                <div style={{ fontSize: '12px', marginTop: '6px' }}>AI will analyse their trading history and suggest talking points</div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default ToCallToday;