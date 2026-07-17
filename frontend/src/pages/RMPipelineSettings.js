import React, { useState } from 'react';

const RMPipelineSettings = () => {
  const [settings, setSettings] = useState({ capacity:100, expiry:30, reassign:"Yes — round-robin to next RM", max_reassign:3, optin_url:"https://clientiq.navia.in/optin/", token_expiry:7, remind:3 });
  const [saving, setSaving] = useState(false);

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
    </div>
  );
};
export default RMPipelineSettings;