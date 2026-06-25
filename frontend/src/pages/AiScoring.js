import React, { useState, useEffect } from 'react';
import api from '../api';

const AiScoring = () => {
  const [weights, setWeights] = useState([
    { signal: 'Options premium turnover', desc: 'High options TO on zero-brk plan — clearing revenue uplift on conversion', driver: '40% of rev', key: 'options_to_weight', weight: 35 },
    { signal: 'Client float (ledger balance)', desc: 'High avg opening balance — float income deployed in short-term FDs', driver: '20% of rev', key: 'float_weight', weight: 20 },
    { signal: 'Equity brokerage potential', desc: 'Active equity cash trading on zero plan — brokerage uplift opportunity', driver: '30% of rev', key: 'equity_weight', weight: 20 },
    { signal: 'MTF eligibility', desc: 'Active F&O with high net funding potential — MTF interest income', driver: '10% of rev', key: 'mtf_weight', weight: 10 },
    { signal: 'NRI status', desc: 'NRI clients: remittance + higher brokerage potential', driver: 'Bonus', key: 'nri_weight', weight: 8 },
    { signal: 'Expiry-week dormancy', desc: 'Options trader who missed 2+ consecutive expiry weeks', driver: 'Retention', key: 'dormancy_weight', weight: 7 },
    { signal: 'Client TO vs Navia segment trend', desc: 'Client options volume growing slower than Navia segment average', driver: 'Drift', key: 'segment_trend_weight', weight: 5 },
    { signal: 'RM interaction count', desc: 'Low RM interaction relative to peer clients = engagement gap and higher churn probability', driver: 'Engagement', key: 'interaction_weight', weight: 5 }
  ]);
  const [pipeline, setPipeline] = useState({ rm_capacity_limit: 100, lead_expiry_window: 30, lead_score_threshold: 60, auto_assign_batch: 20 });
  const [loading, setLoading] = useState(true);
  const [rescoring, setRescoring] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [wRes, pRes] = await Promise.all([
          api.get('/admin-settings/ai-weights'),
          api.get('/rm/settings')
        ]);
        const w = wRes.data.data || {};
        setWeights(prev => prev.map(item => ({
          ...item,
          weight: w[item.key] !== undefined ? w[item.key] : item.weight
        })));
        if (pRes.data) {
          setPipeline({
            rm_capacity_limit: pRes.data.rm_capacity_limit || 100,
            lead_expiry_window: pRes.data.lead_expiry_window || 30,
            lead_score_threshold: pRes.data.lead_score_threshold || 60,
            auto_assign_batch: pRes.data.auto_assign_batch || 20
          });
        }
      } catch (err) {
        console.error('Failed to load AI settings', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleWeightChange = (index, value) => {
    const updated = [...weights];
    updated[index].weight = value;
    setWeights(updated);
  };

  const saveWeights = async () => {
    try {
      const payload = {};
      weights.forEach(item => { payload[item.key] = item.weight; });
      await api.put('/admin-settings', payload);
      setSaveMsg('Weights saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg('Failed to save weights');
    }
  };

  const rescoreClients = async () => {
    setRescoring(true);
    try {
      const res = await api.post('/ai/rescore');
      setSaveMsg(res.data.message + ' — ' + res.data.processed + ' clients processed');
      setTimeout(() => setSaveMsg(''), 5000);
    } catch (err) {
      setSaveMsg(err.response?.data?.message || 'AI scoring failed');
    } finally {
      setRescoring(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading settings...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
        AI Scoring Weights
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Lead scoring calibrated to Navia revenue model
      </p>

      {saveMsg && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginTop: '12px', marginBottom: '4px', fontSize: '13px',
          background: saveMsg.includes('failed') || saveMsg.includes('Failed') ? '#fcebeb' : '#eaf3de',
          color: saveMsg.includes('failed') || saveMsg.includes('Failed') ? '#a32d2d' : '#3b6d11'
        }}>
          {saveMsg}
        </div>
      )}

      <div style={{
        background: '#e8f3ff', padding: '12px', borderRadius: '8px',
        color: '#185fa5', fontSize: '13px', marginTop: '16px', marginBottom: '16px'
      }}>
        Navia revenue model: 40% options clearing, 30% equity brokerage, 20% float, 10% MTF.
      </div>

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '15px' }}>Lead score signal weights</h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '10px' }}>Signal</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Description</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Revenue Driver</th>
              <th style={{ textAlign: 'left', padding: '10px' }}>Weight (%)</th>
            </tr>
          </thead>
          <tbody>
            {weights.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #f1f1f1' }}>
                <td style={{ padding: '10px', fontWeight: '600' }}>{item.signal}</td>
                <td style={{ padding: '10px' }}>{item.desc}</td>
                <td style={{ padding: '10px' }}>{item.driver}</td>
                <td style={{ padding: '10px' }}>
                  <input
                    type="number"
                    value={item.weight}
                    onChange={(e) => handleWeightChange(index, e.target.value)}
                    style={{ padding: '6px', width: '80px', border: '1px solid #ddd', borderRadius: '5px' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '16px' }}>
          <button onClick={saveWeights} style={{ padding: '8px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', marginRight: '8px', cursor: 'pointer' }}>
            Save Weights
          </button>
          <button onClick={rescoreClients} disabled={rescoring} style={{ padding: '8px 14px', background: 'white', color: '#223872', border: '1px solid #223872', borderRadius: '5px', cursor: rescoring ? 'not-allowed' : 'pointer', opacity: rescoring ? 0.7 : 1 }}>
            {rescoring ? 'Rescoring...' : 'Rescore all clients now'}
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '10px', padding: '20px', border: '0.5px solid rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '15px', marginBottom: '15px' }}>Lead Pipeline Settings</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '14px' }}>
          <div>
            <label>RM Capacity Limit</label><br />
            <input type="number" value={pipeline.rm_capacity_limit}
              onChange={e => setPipeline({ ...pipeline, rm_capacity_limit: e.target.value })}
              style={{ padding: '8px', width: '100%' }} />
          </div>
          <div>
            <label>Lead Expiry Days</label><br />
            <input type="number" value={pipeline.lead_expiry_window}
              onChange={e => setPipeline({ ...pipeline, lead_expiry_window: e.target.value })}
              style={{ padding: '8px', width: '100%' }} />
          </div>
          <div>
            <label>Min Score Threshold</label><br />
            <input type="number" value={pipeline.lead_score_threshold}
              onChange={e => setPipeline({ ...pipeline, lead_score_threshold: e.target.value })}
              style={{ padding: '8px', width: '100%' }} />
          </div>
          <div>
            <label>Auto-Assign Batch Size</label><br />
            <input type="number" value={pipeline.auto_assign_batch}
              onChange={e => setPipeline({ ...pipeline, auto_assign_batch: e.target.value })}
              style={{ padding: '8px', width: '100%' }} />
          </div>
        </div>

        <button
          onClick={async () => {
            try {
              await api.post('/rm/settings', {
                rm_capacity_limit: Number(pipeline.rm_capacity_limit),
                lead_expiry_window: Number(pipeline.lead_expiry_window),
                lead_score_threshold: Number(pipeline.lead_score_threshold)
              });
              setSaveMsg('Pipeline settings saved');
              setTimeout(() => setSaveMsg(''), 3000);
            } catch (err) {
              setSaveMsg('Failed to save pipeline settings');
            }
          }}
          style={{ marginTop: '16px', padding: '8px 14px', background: '#223872', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default AiScoring;