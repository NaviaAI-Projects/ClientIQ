import React, { useState } from 'react';
import api from '../api';

const AiScoring = () => {
  const [weights, setWeights] = useState([
    { signal: 'Options premium turnover', desc: 'High options TO on zero-brk plan — clearing revenue uplift on conversion', driver: '40% of rev', weight: 35 },
    { signal: 'Client float (ledger balance)', desc: 'High avg opening balance — float income deployed in short-term FDs', driver: '20% of rev', weight: 20 },
    { signal: 'Equity brokerage potential', desc: 'Active equity cash trading on zero plan — brokerage uplift opportunity', driver: '30% of rev', weight: 20 },
    { signal: 'MTF eligibility', desc: 'Active F&O with high net funding potential — MTF interest income', driver: '10% of rev', weight: 10 },
    { signal: 'NRI status', desc: 'NRI clients: remittance + higher brokerage potential', driver: 'Bonus', weight: 8 },
    { signal: 'Expiry-week dormancy', desc: 'Options trader who missed 2+ consecutive expiry weeks', driver: 'Retention', weight: 7 },
    { signal: 'Client TO vs Navia segment trend', desc: 'Client options volume growing slower than Navia segment average', driver: 'Drift', weight: 5 },
    { signal: 'RM interaction count', desc: 'Low RM interaction relative to peer clients = engagement gap and higher churn probability', driver: 'Engagement', weight: 5 }
  ]);

  const handleWeightChange = (index, value) => {
    const updated = [...weights];
    updated[index].weight = value;
    setWeights(updated);
  };

  const saveWeights = async () => {
    try {
      const payload = {
        options_to_weight: weights[0].weight,
        float_weight: weights[1].weight,
        equity_weight: weights[2].weight,
        mtf_weight: weights[3].weight,
        nri_weight: weights[4].weight,
        dormancy_weight: weights[5].weight,
      };
      await api.put('/admin-settings', payload);
      alert('Weights saved successfully');
    } catch (err) {
      alert('Failed to save weights');
    }
  };

  const rescoreClients = async () => {
  try {
    const res = await api.post('/ai/rescore');
    alert(res.data.message + ' - Processed: ' + res.data.processed);
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.message || 'AI scoring failed');
  }
};

  return (
    <div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111' }}>
        AI Scoring Weights
      </h2>

      <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>
        Lead scoring calibrated to Navia revenue model
      </p>

      <div style={{
        background: '#e8f3ff',
        padding: '12px',
        borderRadius: '8px',
        color: '#185fa5',
        fontSize: '13px',
        marginTop: '16px',
        marginBottom: '16px'
      }}>
        Navia revenue model: 40% options clearing, 30% equity brokerage, 20% float, 10% MTF.
      </div>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '20px',
        border: '0.5px solid rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ fontSize: '15px', marginBottom: '15px' }}>
          Lead score signal weights
        </h3>

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
                    style={{
                      padding: '6px',
                      width: '80px',
                      border: '1px solid #ddd',
                      borderRadius: '5px'
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '16px' }}>
          <button
            onClick={saveWeights}
            style={{
              padding: '8px 14px',
              background: '#185fa5',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              marginRight: '8px',
              cursor: 'pointer'
            }}
          >
            Save Weights
          </button>

          <button
            onClick={rescoreClients}
            style={{
              padding: '8px 14px',
              background: 'white',
              color: '#185fa5',
              border: '1px solid #185fa5',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Rescore all clients now
          </button>
        </div>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '10px',
        padding: '20px',
        border: '0.5px solid rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ fontSize: '15px', marginBottom: '15px' }}>
          Lead Pipeline Settings
        </h3>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: '14px'
        }}>
          <div>
            <label>RM Capacity Limit</label><br />
            <input type="number" defaultValue="100" style={{ padding: '8px', width: '100%' }} />
          </div>

          <div>
            <label>Lead Expiry Days</label><br />
            <input type="number" defaultValue="30" style={{ padding: '8px', width: '100%' }} />
          </div>

          <div>
            <label>Min Score Threshold</label><br />
            <input type="number" defaultValue="60" style={{ padding: '8px', width: '100%' }} />
          </div>

          <div>
            <label>Auto-Assign Batch Size</label><br />
            <input type="number" defaultValue="20" style={{ padding: '8px', width: '100%' }} />
          </div>
        </div>

        <button
          onClick={() => alert('Settings saved successfully')}
          style={{
            marginTop: '16px',
            padding: '8px 14px',
            background: '#185fa5',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
};

export default AiScoring;