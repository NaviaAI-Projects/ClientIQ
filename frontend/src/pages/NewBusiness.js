import React from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const NewBusiness = () => {
  const MONTHS = ['Apr\'25','May\'25','Jun\'25','Jul\'25','Aug\'25','Sep\'25','Oct\'25','Nov\'25','Dec\'25','Jan\'26','Feb\'26','Mar\'26','Apr\'26'];

  const clientsData = MONTHS.map((m, i) => ({
    month: m,
    eq_cash:     [null,null,null,null,2201,2364,2470,2280,2385,2370,2354,2160,2201][i],
    eq_options:  [null,null,null,null,3270,3478,3536,3498,3595,3600,3719,3621,3585][i],
    eq_futures:  [null,null,null,null,146,147,144,152,161,148,134,129,136][i],
    comm_futures:[null,null,null,null,298,345,362,324,339,354,290,311,321][i],
    comm_options:[null,null,null,null,622,668,726,705,717,739,727,731,722][i],
  }));

  const volData = MONTHS.map((m, i) => ({
    month: m,
    eq_options:   [null,null,null,null,50.9,50.9,63.3,56.7,47.9,60.4,64.0,79.9,58.9][i],
    comm_options: [null,null,null,null,38.8,38.7,44.2,35.0,29.4,32.7,21.5,31.4,22.8][i],
  }));

  const newAcctData = MONTHS.map((m, i) => ({
    month: m,
    opened:  [1369,1151,963,1065,963,1207,1095,1299,1167,1046,1072,1202,859][i],
    trading: [1023,1141,1147,1051,889,1079,1110,973,934,840,914,840,924][i],
  }));

  const ledgerData = MONTHS.map((m, i) => ({
    month: m,
    balance: [28077409,18974294,12664293,14221151,18602042,15200827,25142191,19166068,17473276,16453057,21796154,19719519,25895723][i],
  }));

  return (
    <div>
      <div className="ph">
        <h2>New Business</h2>
        <p style={{ fontSize: '13px', color: '#555', marginTop: '3px' }}>New client acquisition, activation and revenue ramp</p>
      </div>

      <div className="tc2" style={{ marginBottom: '14px' }}>
        {/* ch-nb-clients: Stacked bar by segment */}
        <div className="panel">
          <div className="ptitle">Active Clients by Segment</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={clientsData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="eq_cash"     name="Eq Cash"      stackId="s" fill="#185fa5" />
              <Bar dataKey="eq_options"  name="Eq Options"   stackId="s" fill="#9FE1CB" />
              <Bar dataKey="eq_futures"  name="Eq Futures"   stackId="s" fill="#FAC775" />
              <Bar dataKey="comm_futures"name="Comm Futures"  stackId="s" fill="#AFA9EC" />
              <Bar dataKey="comm_options"name="Comm Options"  stackId="s" fill="#f0c0a0" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ch-nb-vol: Dual line volume */}
        <div className="panel">
          <div className="ptitle">Options Volume (₹Cr avg/day)</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={volData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="eq_options"   name="Eq Options (₹Cr avg/day)"
                stroke="#185fa5" fill="rgba(24,95,165,0.08)" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="comm_options" name="Commodity F&O (₹Cr avg/day)"
                stroke="#9FE1CB" fill="rgba(28,158,117,0.08)" strokeWidth={1.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="tc2">
        {/* ch-nb-newacct: New accounts opened vs trading */}
        <div className="panel">
          <div className="ptitle">New Accounts Opened vs Trading</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={newAcctData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="opened"  name="New accounts opened"  fill="#185fa5" />
              <Bar dataKey="trading" name="New clients trading"   fill="#9FE1CB" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ch-nb-ledger: New client ledger balance */}
        <div className="panel">
          <div className="ptitle">New Client Ledger Balance (₹)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ledgerData} margin={{ top: 8, right: 4, bottom: 8, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/100000).toFixed(1) + 'L'} />
              <Tooltip formatter={v => ['₹' + (v/100000).toFixed(1) + 'L']} />
              <Bar dataKey="balance" name="New client ledger balance (₹)" fill="#FAC775" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default NewBusiness;