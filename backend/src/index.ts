import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

import { testConnection } from './config/database'
import { errorHandler } from './middleware/errorHandler'

import customersRouter   from './routes/customers'
import ordersRouter      from './routes/orders'
import codRouter         from './routes/cod'
import claimsRouter      from './routes/claims'
import settlementsRouter from './routes/settlements'
import syncRouter        from './routes/sync'
import settingsRouter    from './routes/settings'
import requestsRouter   from './routes/requests'

dotenv.config()

const app = express()
const PORT = parseInt(process.env.PORT || '4000')

app.use(helmet())
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }))
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/customers',   customersRouter)
app.use('/api/orders',      ordersRouter)
app.use('/api/cod',         codRouter)
app.use('/api/claims',      claimsRouter)
app.use('/api/settlements', settlementsRouter)
app.use('/api/sync',        syncRouter)
app.use('/api/settings',    settingsRouter)
app.use('/api/requests',    requestsRouter)

app.use(errorHandler)

async function main() {
  try {
    await testConnection()
  } catch {
    console.warn('⚠️  Database not connected — continuing without DB')
  }

  // Start cron jobs after DB connection
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
