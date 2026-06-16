import React from 'react';

const MarketShare = () => (
  <div>
    <h2>Market Share</h2>
    <p style={{ color: '#666' }}>Segment-wise market share analysis</p>

    <div style={styles.card}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Segment</th>
            <th>Clients</th>
            <th>Share %</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Equity</td>
            <td>1</td>
            <td>100%</td>
          </tr>
          <tr>
            <td>F&O</td>
            <td>1</td>
            <td>100%</td>
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

export default MarketShare;