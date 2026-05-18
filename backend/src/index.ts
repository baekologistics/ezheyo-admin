import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

dotenv.config()

import { testConnection } from './config/database'
import { errorHandler } from './middleware/errorHandler'
import { authenticateToken, requireRole } from './middleware/auth'

import authRouter        from './routes/auth'
import logsRouter        from './routes/logs'
import customersRouter   from './routes/customers'
import ordersRouter      from './routes/orders'
import codRouter         from './routes/cod'
import claimsRouter      from './routes/claims'
import settlementsRouter from './routes/settlements'
import syncRouter        from './routes/sync'
import settingsRouter    from './routes/settings'
import requestsRouter    from './routes/requests'
import dashboardRouter   from './routes/dashboard'
import reportsRouter     from './routes/reports'

const app  = express()
const PORT = parseInt(process.env.PORT || '4000')

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }))
app.use(express.json())

// ── Public ────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})
app.use('/api/auth', authRouter)

// ── Protected (all roles) ─────────────────────────────────────────
app.use('/api/customers',  authenticateToken, customersRouter)
app.use('/api/orders',     authenticateToken, ordersRouter)
app.use('/api/cod',        authenticateToken, codRouter)
app.use('/api/claims',     authenticateToken, claimsRouter)
app.use('/api/sync',       authenticateToken, syncRouter)
app.use('/api/requests',   authenticateToken, requestsRouter)
app.use('/api/dashboard',  authenticateToken, dashboardRouter)
app.use('/api/logs',       logsRouter)   // internal auth per-route

// ── owner1 + owner2 only ──────────────────────────────────────────
app.use('/api/settlements',
  authenticateToken,
  requireRole(['owner1', 'owner2']),
  settlementsRouter
)
app.use('/api/reports',
  authenticateToken,
  requireRole(['owner1', 'owner2']),
  reportsRouter
)
app.use('/api/settings',
  authenticateToken,
  requireRole(['owner1', 'owner2']),
  settingsRouter
)

app.use(errorHandler)

async function main() {
  try {
    await testConnection()
  } catch {
    console.warn('⚠️  Database not connected — continuing without DB')
  }

  try {
    await import('./services/cronService')
  } catch (err) {
    console.warn('⚠️  Cron service failed to load:', (err as Error).message)
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}

main()
