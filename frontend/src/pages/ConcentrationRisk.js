import React from 'react';

const ConcentrationRisk = () => (
  <div>
    <h2>Concentration Risk</h2>
    <p style={{ color: '#666' }}>Revenue and client concentration monitoring</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Risk Type</th>
            <th>Observation</th>
            <th>Risk Level</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Client Revenue</td>
            <td>Revenue depends on limited client base</td>
            <td>Medium</td>
          </tr>
          <tr>
            <td>RM Mapping</td>
            <td>Most clients mapped to one RM</td>
            <td>Low</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const styles = {
  card: { background: '#fff', padding: 20, borderRadius: 10, marginTop: 20 },
  table: { width: '100%', borderCollapse: 'collapse' }
};

export default ConcentrationRisk;