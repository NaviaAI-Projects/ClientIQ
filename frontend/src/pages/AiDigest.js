import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const AiDigest = () => {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/ai/digest').then(r => setDigest(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

  const defaultBrief = `<p style="margin-bottom:10px"><strong>Revenue pace:</strong> At ${digest?.revenue_pct||79}% of month target. Focus on your top clients to close the gap.</p>
<p style="margin-bottom:10px"><strong>Urgent — lead expiry:</strong> Check your To Call Today list for leads expiring this week. Uncontacted leads auto-reassign after expiry.</p>
<p style="margin-bottom:10px"><strong>Opportunity:</strong> ${digest?.cross_sell_count||1} high-value client(s) on zero-brokerage plan with significant options TO — MTF pitch recommended.</p>
<p style="margin-bottom:10px"><strong>Retention alert:</strong> ${digest?.churn_alerts||0} mapped client(s) at high churn risk. Peak brokerage was significant — reach out this week.</p>
<p><strong>Cross-sell:</strong> Check clients with large holdings — they may qualify for AIF/PMS products, opening a new revenue stream.</p>`;

  return (
    <div>
      <div className="ph"><h2>AI daily digest</h2><p>Personalised intelligence · {today}</p></div>

      <div className="panel" style={{borderLeft:'3px solid var(--ic)'}}>
        <div className="ptitle">🤖 Today's brief from Claude</div>
        {loading ? (
          <div style={{color:'var(--tx3)',fontSize:'13px'}}>Generating your personalised digest...</div>
        ) : (
          <div style={{fontSize:'13px',lineHeight:'1.8'}} dangerouslySetInnerHTML={{
            __html: digest?.summary || defaultBrief
          }} />
        )}
      </div>

      <div className="cards">
        <div className="card cd"><div className="clbl">Leads expiring this week</div><div className="cval">{digest?.expiring_leads||0}</div></div>
        <div className="card cd"><div className="clbl">Churn risk alerts</div><div className="cval">{digest?.churn_alerts||0}</div></div>
        <div className="card cs"><div className="clbl">Cross-sell signals</div><div className="cval">{digest?.cross_sell_count||0}</div></div>
        <div className="card cw"><div className="clbl">Working days to EOM</div><div className="cval">{digest?.working_days_left||0}</div></div>
      </div>

      {digest?.alerts && digest.alerts.length > 0 && (
        <div className="panel">
          <div className="ptitle">⚡ Priority actions today</div>
          {digest.alerts.map((a,i) => (
            <div key={i} className={`alert ${a.type==='urgent'?'a-d':a.type==='opportunity'?'a-s':'a-w'}`} style={{marginBottom:'8px'}}>
              <span>{a.type==='urgent'?'🚨':a.type==='opportunity'?'✅':'⚠️'}</span>
              <div>
                <div style={{fontWeight:'600',fontSize:'12px',marginBottom:'2px'}}>{a.title}</div>
                <div style={{fontSize:'12.5px'}}>{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="ptitle">📞 Quick links</div>
        <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
          <button className="btn bp" onClick={() => navigate('/to-call-today')}>📞 To Call Today</button>
          <button className="btn" onClick={() => navigate('/assigned-leads')}>⭐ My Leads</button>
          <button className="btn" onClick={() => navigate('/dormant-clients')}>😴 Dormant Clients</button>
          <button className="btn" onClick={() => navigate('/cross-sell')}>🔀 Cross-sell</button>
        </div>
      </div>
    </div>
  );
};
export default AiDigest;
