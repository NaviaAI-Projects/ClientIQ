import React, { useState, useEffect } from 'react';
import api from '../api';

const RMPipelineSettings = () => {
  const [settings, setSettings] = useState({ capacity:100, expiry:30, reassign:"Yes — round-robin to next RM", max_reassign:3, optin_url:"https://clientiq.navia.in/optin/", token_expiry:7, remind:3 });
  const [saving, setSaving] = useState(false);

  // ── RM monthly revenue targets (per-RM, per-month) ──
  const [tgtMonth, setTgtMonth]   = useState('');
  const [tgtRows, setTgtRows]     = useState([]);
  const [tgtSaving, setTgtSaving] = useState(false);
  const [tgtSaved, setTgtSaved]   = useState(false);
  const [commonTgt, setCommonTgt] = useState('');

  // Set every RM's target to the common value (they can still be tweaked individually before saving).
  const applyCommon = () => {
    const v = commonTgt === '' ? '' : Number(commonTgt);
    setTgtRows(rows => rows.map(x => ({ ...x, target: v })));
  };

  const loadTargets = (m) => {
    api.get('/analytics/rm-targets', { params: m ? { month: m } : {} })
      .then(res => { setTgtMonth(res.data.month); setTgtRows(res.data.rows || []); })
      .catch(() => {});
  };
  useEffect(() => { loadTargets(); }, []);

  const saveTargets = async () => {
    if (!tgtMonth) return;
    setTgtSaving(true);
    try {
      await Promise.all(tgtRows.map(r => api.post('/analytics/rm-targets', {
        rm_id: r.rm_id, month_year: tgtMonth, target: Number(r.target) || 0,
      })));
      setTgtSaved(true); setTimeout(() => setTgtSaved(false), 2500);
    } catch (e) { alert(e.response?.data?.message || 'Could not save targets.'); }
    finally { setTgtSaving(false); }
  };

  return (
    <div>
      <div className="ph"><h2>RM &amp; pipeline settings</h2><p>Global configuration for RM operations, opt-in flow, and lead pipeline</p></div>
      <div className="tc2">
        <div className="panel">
          <div className="ptitle">⚙️ Round-robin &amp; capacity</div>
          <div className="fgrid fg1">
            <div className="fgrp"><label>Default RM capacity (clients)</label><input type="number" value={settings.capacity} onChange={e=>setSettings({...settings,capacity:e.target.value})} /></div>
            <div className="fgrp"><label>Lead expiry period (days)</label><input type="number" value={settings.expiry} onChange={e=>setSettings({...settings,expiry:e.target.value})} /></div>
            <div className="fgrp"><label>Re-assign on expiry</label>
              <select value={settings.reassign} onChange={e=>setSettings({...settings,reassign:e.target.value})}>
                <option>Yes — round-robin to next RM</option>
                <option>No — return to pool</option>
              </select>
            </div>
            <div className="fgrp"><label>Max reassign count before pool</label><input type="number" value={settings.max_reassign} onChange={e=>setSettings({...settings,max_reassign:e.target.value})} /></div>
          </div>
          <button className="btn bp" onClick={()=>{setSaving(true);setTimeout(()=>setSaving(false),1500);}}>💾 Save</button>
        </div>
        <div className="panel">
          <div className="ptitle">✉️ Opt-in link settings</div>
          <div className="fgrid fg1">
            <div className="fgrp"><label>Opt-in base URL</label><input type="url" value={settings.optin_url} onChange={e=>setSettings({...settings,optin_url:e.target.value})} /></div>
            <div className="fgrp"><label>Token expiry (days)</label><input type="number" value={settings.token_expiry} onChange={e=>setSettings({...settings,token_expiry:e.target.value})} /></div>
            <div className="fgrp"><label>Remind RM if no click after (days)</label><input type="number" value={settings.remind} onChange={e=>setSettings({...settings,remind:e.target.value})} /></div>
          </div>
          <button className="btn bp">💾 Save</button>
        </div>
      </div>

      {/* RM monthly revenue targets */}
      <div className="panel" style={{ marginTop:16 }}>
        {/* header — wraps instead of clipping on the right */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:14 }}>
          <div className="ptitle" style={{ marginBottom:0 }}>🎯 RM monthly revenue targets</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <label style={{ fontSize:12, color:'var(--tx3)', whiteSpace:'nowrap' }}>Month</label>
            <input type="month" value={tgtMonth} onChange={e=>{ setTgtMonth(e.target.value); loadTargets(e.target.value); }} style={{ width:160 }} />
            <button className="btn bp sm" onClick={saveTargets} disabled={tgtSaving} style={{ whiteSpace:'nowrap' }}>{tgtSaving?'Saving…':tgtSaved?'✅ Saved':'💾 Save targets'}</button>
          </div>
        </div>

        {/* common target toolbar */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', padding:'10px 12px', background:'var(--bg2)', border:'1px solid var(--br)', borderRadius:8, marginBottom:14 }}>
          <label style={{ fontSize:12, fontWeight:500, whiteSpace:'nowrap' }}>Common target (all RMs)</label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--tx3)', fontSize:13, pointerEvents:'none' }}>₹</span>
            <input type="number" min="0" step="1000" placeholder="e.g. 500000" value={commonTgt} style={{ width:180, paddingLeft:22 }}
              onChange={e=>setCommonTgt(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') applyCommon(); }} />
          </div>
          <button className="btn sm" onClick={applyCommon} disabled={commonTgt===''}>Apply to all</button>
          <span style={{ fontSize:11, color:'var(--tx3)' }}>Fills every RM below — then Save targets.</span>
        </div>

        {/* per-RM table */}
        <div className="tw"><table>
          <thead><tr><th>RM</th><th style={{ width:240 }}>Monthly revenue target</th></tr></thead>
          <tbody>
            {tgtRows.map((r,i)=>(
              <tr key={r.rm_id}>
                <td style={{ fontWeight:500 }}>{r.rm_name}</td>
                <td>
                  <div style={{ position:'relative', width:200 }}>
                    <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--tx3)', fontSize:13, pointerEvents:'none' }}>₹</span>
                    <input type="number" min="0" step="1000" placeholder="0" value={r.target ?? ''} style={{ width:'100%', paddingLeft:22 }}
                      onChange={e=>{ const v=e.target.value; setTgtRows(rows=>rows.map((x,j)=>j===i?{...x,target:v===''?'':Number(v)}:x)); }} />
                  </div>
                </td>
              </tr>
            ))}
            {tgtRows.length===0 && <tr><td colSpan={2} style={{ color:'var(--tx3)' }}>No RMs found.</td></tr>}
          </tbody>
        </table></div>
        <p style={{ fontSize:11, color:'var(--tx3)', marginTop:8 }}>Per-RM, per-month revenue target. Powers the Target% column on the supervisor’s RM Performance page — Target% = RM revenue over the selected range ÷ the sum of their monthly targets across that range. Editing {tgtMonth || 'the selected month'}.</p>
      </div>
    </div>
  );
};
export default RMPipelineSettings;