import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import adminRoutes from './routes/admin.js'
import publicRoutes from './routes/public.js'
import billingRoutes from './routes/billing.js'
import licenseRoutes from './routes/licenses.js'

const app = express()
app.set('trust proxy', 1)
const port = Number(process.env.PORT || 3333)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
app.disable('x-powered-by')
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim()), methods: ['GET','POST'], allowedHeaders: ['Content-Type','Authorization'] }))
app.use(express.json({ limit: '1mb' }))
app.use('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false }))
app.get('/api/health', (_req,res)=>res.json({status:'ok',service:'FOODCORE API'}))
app.use('/api/admin', adminRoutes)
app.use('/api', publicRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/licenses', licenseRoutes)
app.use((err, _req, res, _next) => { console.error(err); res.status(err.status || 400).json({ error: err.message || 'Erro interno.' }) })
app.listen(port, '0.0.0.0', () => {
  console.log(`FOODCORE API executando na porta ${port}`)
})
