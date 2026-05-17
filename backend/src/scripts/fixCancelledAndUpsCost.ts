/**
 * fixCancelledAndUpsCost.ts
 *
 * profit은 GENERATED ALWAYS AS (GREATEST(customer_charge - ups_cost, 0)) STORED
 * → ups_cost만 업데이트하면 profit이 자동 재계산됨
 *
 * Step 1: Cancelled (customer_charge = 0) → ups_cost = 0  (profit 자동 0)
 * Step 2: 2025-07-29+ non-cancelled      → ups_cost × 1.15 (profit 자동 재계산)
 */
import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import { pool } from '../config/database'

async function main() {

  // ── Step 1: Fix cancelled orders ─────────────────────────
  console.log('=== Step 1: Cancelled orders → ups_cost = 0 ===')

  const b1 = await pool.query(`
    SELECT COUNT(*) as cnt,
           ROUND(AVG(ups_cost),4) as avg_ups,
           ROUND(AVG(profit),4)   as avg_profit
    FROM orders WHERE customer_charge = 0`)
  const rb1 = b1.rows[0] as Record<string,string>
  console.log(`Before: count=${rb1.cnt}  avg_ups=${rb1.avg_ups}  avg_profit=${rb1.avg_profit}`)

  const r1 = await pool.query(`
    UPDATE orders SET ups_cost = 0
    WHERE customer_charge = 0`)
  console.log(`Updated: ${r1.rowCount} cancelled orders → ups_cost=0`)

  const a1 = await pool.query(`
    SELECT COUNT(*) as total,
           COUNT(*) FILTER (WHERE ups_cost = 0)  as ups_zero,
           COUNT(*) FILTER (WHERE profit   = 0)  as profit_zero
    FROM orders WHERE customer_charge = 0`)
  const ra1 = a1.rows[0] as Record<string,string>
  console.log(`After:  total=${ra1.total}  ups_zero=${ra1.ups_zero}  profit_zero=${ra1.profit_zero}`)

  // ── Step 2: 15% UPS markup (2025-07-29+, non-cancelled) ──
  console.log('\n=== Step 2: 15% UPS markup (date >= 2025-07-29, customer_charge > 0) ===')

  const b2 = await pool.query(`
    SELECT COUNT(*) as cnt,
           ROUND(AVG(ups_cost),2)        as avg_ups,
           ROUND(AVG(customer_charge),2) as avg_charge,
           ROUND(AVG(profit),2)          as avg_profit
    FROM orders
    WHERE date >= '2025-07-29' AND customer_charge > 0`)
  const rb2 = b2.rows[0] as Record<string,string>
  console.log(`Before: count=${rb2.cnt}  avg_ups=${rb2.avg_ups}  avg_charge=${rb2.avg_charge}  avg_profit=${rb2.avg_profit}`)

  const r2 = await pool.query(`
    UPDATE orders
    SET ups_cost = ROUND(ups_cost * 1.15, 2)
    WHERE date >= '2025-07-29'
      AND customer_charge > 0`)
  console.log(`Updated: ${r2.rowCount} orders with ×1.15 ups_cost`)

  const a2 = await pool.query(`
    SELECT COUNT(*) as cnt,
           ROUND(AVG(ups_cost),2)        as avg_ups,
           ROUND(AVG(customer_charge),2) as avg_charge,
           ROUND(AVG(profit),2)          as avg_profit
    FROM orders
    WHERE date >= '2025-07-29' AND customer_charge > 0`)
  const ra2 = a2.rows[0] as Record<string,string>
  console.log(`After:  count=${ra2.cnt}  avg_ups=${ra2.avg_ups}  avg_charge=${ra2.avg_charge}  avg_profit=${ra2.avg_profit}`)

  // ── Step 3: Verification ──────────────────────────────────
  console.log('\n=== Step 3: Verification ===')

  const v1 = await pool.query(`
    SELECT COUNT(*) as cancelled,
           ROUND(AVG(ups_cost),4) as avg_ups,
           ROUND(AVG(profit),4)   as avg_profit
    FROM orders WHERE customer_charge = 0`)
  const rv1 = v1.rows[0] as Record<string,string>
  console.log(`\nCancelled: ${rv1.cancelled}  avg_ups=${rv1.avg_ups}  avg_profit=${rv1.avg_profit}`)

  const v2 = await pool.query(`
    SELECT date::text,
           COUNT(*) as cnt,
           ROUND(AVG(ups_cost),2)        as avg_cost,
           ROUND(AVG(customer_charge),2) as avg_charge,
           ROUND(AVG(profit),2)          as avg_profit
    FROM orders
    WHERE date IN ('2025-07-28','2025-07-29')
      AND customer_charge > 0
    GROUP BY date ORDER BY date`)
  console.log('\n07-28 vs 07-29 (non-cancelled):')
  for (const row of v2.rows as Array<Record<string,string>>) {
    console.log(`  ${row.date}: cnt=${row.cnt}  avg_cost=${row.avg_cost}  avg_charge=${row.avg_charge}  avg_profit=${row.avg_profit}`)
  }

  const v3 = await pool.query(`
    SELECT date::text, COUNT(*) as cnt,
           ROUND(AVG(ups_cost),2) as avg_ups,
           ROUND(AVG(profit),2)   as avg_profit
    FROM orders
    WHERE date >= '2025-07-29' AND customer_charge > 0
    GROUP BY date ORDER BY date LIMIT 10`)
  console.log('\nFirst 10 days from 2025-07-29 (non-cancelled):')
  for (const row of v3.rows as Array<Record<string,string>>) {
    console.log(`  ${row.date}: cnt=${row.cnt}  avg_ups=${row.avg_ups}  avg_profit=${row.avg_profit}`)
  }

  console.log('\n✓ Done')
}

main().catch(e => console.error('ERROR:', e.message)).finally(() => pool.end())
