import styles from './dashboard.module.css'

const METRICS = [
  { label: 'Total Revenue', value: '$124,380', sub: '+12% this month', subColor: '#10B981' },
  { label: 'Total Profit', value: '$44,620', sub: '+8% this month', subColor: '#10B981' },
  { label: 'COD Outstanding', value: '$2,140', sub: '5 customers', subColor: '#F59E0B' },
  { label: 'Active Customers', value: '38', sub: 'of 47 total', subColor: '#6B7280' },
]

const ACTIVITY = [
  { type: 'Label', desc: '1Z999AA10123456784', customer: 'Jung Kim',   service: 'Ground',       amount: '$18.40',   time: '2m ago' },
  { type: 'COD',   desc: 'Payment received',   customer: 'Sarah Park', service: 'Manual',       amount: '+$320.00', time: '1h ago' },
  { type: 'Label', desc: '1Z888BB20234567895', customer: 'Mike Lee',   service: 'Next Day Air', amount: '$42.10',   time: '2h ago' },
  { type: 'Label', desc: '1Z777CC30345678906', customer: 'Helen Cho',  service: 'Ground',       amount: '$15.80',   time: '3h ago' },
  { type: 'COD',   desc: 'Notice sent',        customer: 'Brian Nam',  service: 'Auto',         amount: '$180.00',  time: '5h ago' },
]

export default function DashboardPage() {
  return (
    <div className={styles.page}>

      <div className={styles.metrics}>
        {METRICS.map(m => (
          <div key={m.label} className={styles.card}>
            <div className={styles.cardLabel}>{m.label}</div>
            <div className={styles.cardValue}>{m.value}</div>
            <div className={styles.cardSub} style={{ color: m.subColor }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Profit Distribution <span>— this month</span></div>
        <div className={styles.splitRow}>
          {[
            { label: 'Owner (30%)',    value: '$13,386', color: '#FD4C1D', pct: 30 },
            { label: 'Sales (10%)',    value: '$4,462',  color: '#F59E0B', pct: 10 },
            { label: 'Overhead (60%)', value: '$26,772', color: '#10B981', pct: 60 },
          ].map(s => (
            <div key={s.label} className={styles.splitItem}>
              <div className={styles.splitHeader}>
                <span>{s.label}</span>
                <span className={styles.splitValue}>{s.value}</span>
              </div>
              <div className={styles.barBg}>
                <div className={styles.barFill} style={{ width: `${s.pct}%`, background: s.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Recent Activity</div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th><th>Tracking / Note</th><th>Customer</th>
                <th>Service</th><th>Amount</th><th>Time</th>
              </tr>
            </thead>
            <tbody>
              {ACTIVITY.map((a, i) => (
                <tr key={i}>
                  <td>
                    <span className={`${styles.badge} ${a.type === 'COD' ? styles.badgeCod : styles.badgeLabel}`}>
                      {a.type}
                    </span>
                  </td>
                  <td className={styles.mono}>{a.desc}</td>
                  <td>{a.customer}</td>
                  <td>{a.service}</td>
                  <td className={a.amount.startsWith('+') ? styles.positive : ''}>{a.amount}</td>
                  <td className={styles.muted}>{a.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
