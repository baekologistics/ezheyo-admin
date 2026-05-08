import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'

import { testConnection } from './config/database'
import { errorHandler } from './middleware/errorHandler'

import customersRouter   from './routes/customers'
import shipmentsRouter   from './routes/shipments'
import codRouter         from './routes/cod'
import claimsRouter      from './routes/claims'
import settlementsRouter from './routes/settlements'

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
app.use('/api/shipments',   shipmentsRouter)
app.use('/api/cod',         codRouter)
app.use('/api/claims',      claimsRouter)
app.use('/api/settlements', settlementsRouter)

app.use(errorHandler)

async function main() {
  try {
    await testConnection()
  } catch {
    console.warn('⚠️  Database not connected — continuing without DB')
  }
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}

main()
