
import 'dotenv/config'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

import adminRoutes from './routes/admin.js'
import customerRoutes from './routes/customers.js'
import contractRoutes from './routes/contracts.js'
import publicRoutes from './routes/public.js'
import billingRoutes from './routes/billing.js'
import licenseRoutes from './routes/licenses.js'

import { supabase } from './supabase.js'

// ==========================================
// CONFIGURAÇÃO DA APLICAÇÃO
// ==========================================

const app = express()
const port = Number(process.env.PORT || 3333)

app.set('trust proxy', 1)
app.disable('x-powered-by')

// ==========================================
// CONFIGURAÇÃO CORS
// ==========================================

function normalizeOrigin(value) {
  try {
    return new URL(value.trim()).origin
  } catch {
    return null
  }
}

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://foodcore-platform.santosmicael638.workers.dev'
]

const environmentOrigins = (process.env.WEB_ORIGIN || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean)

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...environmentOrigins
])

app.use(
  cors({
    origin(origin, callback) {
      // Permite requisições sem Origin, como chamadas diretas
      // por ferramentas de servidor e terminal.
      if (!origin) {
        return callback(null, true)
      }

      const normalizedOrigin = normalizeOrigin(origin)

      if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true)
      }

      console.warn(
        '[FOODCORE CORS] Origem bloqueada:',
        origin
      )

      return callback(new Error('Origem não autorizada pelo CORS.'))
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ],

    optionsSuccessStatus: 204
  })
)

// ==========================================
// SEGURANÇA HTTP
// ==========================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
)

// ==========================================
// PROCESSAMENTO DE REQUISIÇÕES
// ==========================================

app.use(
  express.json({
    limit: '1mb'
  })
)

// ==========================================
// LIMITAÇÃO DE TENTATIVAS ADMINISTRATIVAS
// ==========================================

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de login. Tente novamente mais tarde.'
  }
})

app.use('/api/admin/login', adminLoginLimiter)

// ==========================================
// ROTAS DE SAÚDE DA API
// ==========================================

app.get('/api/health', (_req, res) => {
  return res.json({
    status: 'ok',
    service: 'FOODCORE API'
  })
})

app.get('/api/health/database', async (_req, res) => {
  if (!supabase) {
    return res.status(503).json({
      status: 'error',
      message: 'Database not configured'
    })
  }

  try {
    const { error } = await supabase
      .from('companies')
      .select('id')
      .limit(1)

    if (error) {
      console.error(
        '[FOODCORE] Supabase health check failed:',
        error.message
      )

      return res.status(503).json({
        status: 'error',
        message: 'Database connection failed'
      })
    }

    return res.json({
      status: 'ok',
      database: 'connected'
    })
  } catch (error) {
    console.error(
      '[FOODCORE] Supabase connection error:',
      error.message
    )

    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed'
    })
  }
})

// ==========================================
// ROTAS PRINCIPAIS
// ==========================================

app.use('/api/admin', adminRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/contracts', contractRoutes)
app.use('/api', publicRoutes)
app.use('/api/billing', billingRoutes)
app.use('/api/licenses', licenseRoutes)

// ==========================================
// ROTA PARA ENDEREÇOS NÃO ENCONTRADOS
// ==========================================

app.use((req, res) => {
  return res.status(404).json({
    error: 'Rota não encontrada.'
  })
})

// ==========================================
// TRATAMENTO GLOBAL DE ERROS
// ==========================================

app.use((err, _req, res, _next) => {
  console.error('[FOODCORE API ERROR]', err)

  const statusCode = Number(err.status) || 500

  return res.status(statusCode).json({
    error: statusCode >= 500
      ? 'Erro interno do servidor.'
      : err.message || 'Erro na requisição.'
  })
})

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================

app.listen(port, '0.0.0.0', () => {
  console.log('================================')
  console.log('FOODCORE API')
  console.log(`Porta: ${port}`)
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`)
  console.log('Origens autorizadas:')

  for (const origin of allowedOrigins) {
    console.log(`- ${origin}`)
  }

  console.log('Servidor iniciado com sucesso.')
  console.log('================================')
})
