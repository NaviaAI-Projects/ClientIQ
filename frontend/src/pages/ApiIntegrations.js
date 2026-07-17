import React, { useState } from 'react';

const ApiIntegrations = () => {
  const [saving, setSaving] = useState({});

  const save = (k) => {
    setSaving({...saving,[k]:true});
    setTimeout(()=>setSaving(s=>({...s,[k]:false})),1500);
  };

  return (
    <div>
      <div className="ph"><h2>API integrations</h2><p>Vendor-agnostic — configure endpoint + key for your chosen provider</p></div>
      <div className="alert a-i">🔒 Mobile numbers and email addresses are NEVER stored in this system. They are fetched at runtime via the APIs below, used for the interaction, and discarded immediately.</div>
      <div className="tc2">
        <div className="panel">
          <div className="ptitle">📞 Click-to-call</div>
          <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"10px"}}>Compatible with Exotel, Ozonetel, MCUBE, or any REST provider</p>
          <div className="fgrid fg1">
            <div className="fgrp"><label>API endpoint URL</label><input type="url" placeholder="https://api.provider.com/v1/calls" /></div>
            <div className="fgrp"><label>API key</label><input type="password" placeholder="sk-…" /></div>
            <div className="fgrp"><label>Caller ID (1600 series)</label><input placeholder="1600XXXXXXX" /></div>
            <div className="fgrp"><label>Mobile fetch API endpoint</label><input type="url" placeholder="https://api.navia.in/client/mobile/{ucc}" /></div>
          </div>
          <div className="brow"><button className="btn bp" onClick={()=>save("ctc")}>{saving.ctc?"Saving…":"💾 Save"}</button><button className="btn">🔌 Test</button></div>
        </div>
        <div className="panel">
          <div className="ptitle">💬 WhatsApp Business API</div>
          <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"10px"}}>Compatible with Gupshup, Kaleyra, Interakt, or any WABA BSP</p>
          <div className="fgrid fg1">
            <div className="fgrp"><label>BSP API endpoint</label><input type="url" placeholder="https://api.gupshup.io/sm/api/v1/msg" /></div>
            <div className="fgrp"><label>API key / bearer token</label><input type="password" placeholder="…" /></div>
            <div className="fgrp"><label>Sender WhatsApp number</label><input placeholder="+91XXXXXXXXXX" /></div>
            <div className="fgrp"><label>Template namespace</label><input placeholder="navia_crm_msgs" /></div>
          </div>
          <div className="brow"><button className="btn bp" onClick={()=>save("wa")}>{saving.wa?"Saving…":"💾 Save"}</button><button className="btn">🔌 Test</button></div>
        </div>
        <div className="panel">
          <div className="ptitle">✉️ Email &amp; mobile fetch API</div>
          <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"10px"}}>Fetches client email and mobile at runtime. Not stored.</p>
          <div className="fgrid fg1">
            <div className="fgrp"><label>Email fetch API endpoint</label><input type="url" placeholder="https://api.navia.in/client/email/{ucc}" /></div>
            <div className="fgrp"><label>API key</label><input type="password" placeholder="…" /></div>
            <div className="fgrp"><label>Common lead email sender</label><input type="email" placeholder="leads@navia.in" /></div>
            <div className="fgrp"><label>SMTP host (for sending)</label><input placeholder="smtp.navia.in" /></div>
          </div>
          <div className="brow"><button className="btn bp" onClick={()=>save("email")}>{saving.email?"Saving…":"💾 Save"}</button><button className="btn">🔌 Test</button></div>
        </div>
        <div className="panel">
          <div className="ptitle">🤖 Claude AI (Anthropic)</div>
          <p style={{fontSize:"12px",color:"var(--tx2)",marginBottom:"10px"}}>Powers AI scoring, Client 360 analysis, daily digests, churn alerts, cross-sell recommendations</p>
          <div className="fgrid fg1">
            <div className="fgrp"><label>Anthropic API key</label><input type="password" placeholder="sk-ant-…" /></div>
            <div className="fgrp"><label>Model</label><select><option>claude-sonnet-4-6</option><option>claude-opus-4-6</option></select></div>
            <div className="fgrp"><label>Daily digest send time</label><input type="time" defaultValue="07:30" /></div>
          </div>
          <div className="brow"><button className="btn bp" onClick={()=>save("ai")}>{saving.ai?"Saving…":"💾 Save"}</button><button className="btn">🔌 Test</button></div>
        </div>
      </div>
    </div>
  );
};
export default ApiIntegrations;