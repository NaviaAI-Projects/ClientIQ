import React from 'react';

const UnmapRequests = () => (
  <div>
    <div className="ph">
      <h2>Unmap Requests</h2>
      <p>RM-requested and AI-suggested unmaps pending supervisor decision</p>
    </div>
    <div className="alert a-w">
      Approved unmaps free RM capacity slots. Revenue attribution stops from the unmap date.
    </div>
    <div className="panel">
      <div className="tw"><table>
        <thead><tr>
          <th>Client</th><th>Current RM</th><th>Reason</th><th>Action</th>
        </tr></thead>
        <tbody>
          <tr>
            <td>Raj Kumar — 100001</td>
            <td>Banu</td>
            <td>RM reassignment required</td>
            <td style={{ display: 'flex', gap: '6px' }}>
              <button className="btn bp sm">Approve Unmap</button>
              <button className="btn bd sm">Reject</button>
            </td>
          </tr>
        </tbody>
      </table></div>
    </div>
  </div>
);

export default UnmapRequests;