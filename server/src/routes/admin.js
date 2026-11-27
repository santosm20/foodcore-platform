
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import crypto, { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { requireAdmin } from '../middleware/auth.js'
import {
  readStore,
  writeStore,
  releaseDirectory
} from '../store.js'
import { supabase } from '../supabase.js'
import { getContractFile } from '../services/contractService.js'

const router = Router()

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const MAX_UPLOAD_MB = Math.max(
  1,
  Number(process.env.MAX_UPLOAD_MB || 500)
)

const MONTHLY_PRICE = 149.90
const GRACE_DAYS = 5
const RECEIPT_BUCKET = 'foodcore-payment-receipts'
const BUSINESS_TIME_ZONE = 'America/Sao_Paulo'

const PAYMENT_SELECT = `
  id,
  subscription_id,
  amount,
  due_date,
  payment_date,
  payment_method,
  receipt_file_path,
  status,
  rejection_reason,
  reviewed_at,
  created_at
`

const SUBSCRIPTION_SELECT = `
  id,
  company_id,
  contract_id,
  monthly_price,
  billing_day,
  next_due_date,
  grace_days,
  status,
  created_at
`

const LICENSE_SELECT = `
  id,
  company_id,
  subscription_id,
  license_key,
  status,
  activated_at,
  expires_at
`

const COMPANY_SELECT = `
  id,
  legal_name,
  trade_name,
  cnpj,
  email,
  phone,
  representative_name,
  representative_cpf,
  city,
  state,
  status,
  registration_status,
  payment_link,
  created_at
`

// =====================================================
// STATUS COMERCIAIS
// =====================================================

const REGISTRATION = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  AWAITING_CONTRACT: 'awaiting_contract',
  CONTRACT_APPROVED: 'contract_approved',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_UNDER_REVIEW: 'payment_under_review',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
})

const CONTRACT_STATUS = Object.freeze({
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
})

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected'
})

// =====================================================
// UPLOAD DE VERSÕES
// =====================================================

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        await fs.mkdir(releaseDirectory, {
          recursive: true
        })

        callback(null, releaseDirectory)
      } catch (error) {
        callback(error)
      }
    },

    filename: (_req, _file, callback) => {
      callback(null, `${crypto.randomUUID()}.exe`)
    }
  }),

  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1
  },

  fileFilter: (_req, file, callback) => {
    const extension = path.extname(
      file.originalname
    ).toLowerCase()

    if (extension !== '.exe') {
      return callback(
        new Error('Envie somente arquivos .exe.')
      )
    }

    callback(null, true)
  }
})

// =====================================================
// UTILITÁRIOS GERAIS
// =====================================================

function databaseUnavailable(res) {
  return res.status(503).json({
    error: 'Banco de dados indisponível.'
  })
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || '')
  )
}

function logServerError(context, error) {
  console.error(
    `[FOODCORE] ${context}:`,
    error?.message || error
  )
}

function getMonthlyPrice(value) {
  const price = Number(value)

  if (!Number.isFinite(price) || price <= 0) {
    return MONTHLY_PRICE
  }

  return Number(price.toFixed(2))
}

function getSafeFilename(value) {
  return String(value || 'documento')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 100)
}

function getAdminEmail(req) {
  return req.admin?.email || null
}

function getDatePartsInTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  )

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day)
  }
}

function validatePaymentLink(value) {
  const link = String(value || '').trim()

  if (!link || link.length > 2048) {
    return null
  }

  try {
    const url = new URL(link)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function parseDateUTC(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error('Data inválida.')
  }

  const date = new Date(`${value}T00:00:00.000Z`)

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Data inválida.')
  }

  return date
}

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10)
}

function getDecision(req) {
  return String(
    req.body?.decision || ''
  ).trim().toLowerCase()
}

function getReason(req) {
  return String(
    req.body?.reason || ''
  ).trim()
}

function validateDecisionInput(decision, reason) {
  if (!['approve', 'reject'].includes(decision)) {
    return 'Decisão inválida. Utilize approve ou reject.'
  }

  if (decision === 'reject' && reason.length < 5) {
    return 'Informe uma justificativa com pelo menos 5 caracteres.'
  }

  if (reason.length > 2000) {
    return 'A justificativa ultrapassa 2.000 caracteres.'
  }

  return null
}

// =====================================================
// DATAS E COBRANÇAS
// =====================================================

function getBillingDateForMonth(
  year,
  monthZeroBased,
  billingDay
) {
  const lastDay = new Date(
    Date.UTC(year, monthZeroBased + 1, 0)
  ).getUTCDate()

  const day = Math.min(
    Number(billingDay),
    lastDay
  )

  return formatDateUTC(
    new Date(
      Date.UTC(year, monthZeroBased, day)
    )
  )
}

function getBillingDay(referenceDate) {
  return getDatePartsInTimeZone(referenceDate).day
}

function getBillingDate(referenceDate, billingDay) {
  const { year, month } = getDatePartsInTimeZone(
    referenceDate
  )

  return getBillingDateForMonth(
    year,
    month - 1,
    billingDay
  )
}

function addDaysToDate(dateString, days) {
  const date = parseDateUTC(dateString)

  date.setUTCDate(
    date.getUTCDate() + Number(days)
  )

  return formatDateUTC(date)
}

function getNextBillingDate(currentDueDate, billingDay) {
  const currentDate = parseDateUTC(currentDueDate)

  const nextMonth = new Date(
    Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth() + 1,
      1
    )
  )

  return getBillingDateForMonth(
    nextMonth.getUTCFullYear(),
    nextMonth.getUTCMonth(),
    billingDay
  )
}

function getExpirationTimestamp(dateString) {
  const date = parseDateUTC(dateString)

  const nextDayLocalAsUTC = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1
  )

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })

  let timestamp = nextDayLocalAsUTC

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = formatter.formatToParts(
      new Date(timestamp)
    )

    const values = Object.fromEntries(
      parts
        .filter(part => part.type !== 'literal')
        .map(part => [
          part.type,
          Number(part.value)
        ])
    )

    const representedAsUTC = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    )

    const offset = representedAsUTC - timestamp

    timestamp = nextDayLocalAsUTC - offset
  }

  return new Date(timestamp - 1).toISOString()
}

// =====================================================
// AUDITORIA ADMINISTRATIVA
// =====================================================

async function registerAdminLog({
  companyId,
  action,
  details = {},
  adminEmail
}) {
  if (!supabase) return false

  try {
    const { error } = await supabase
      .from('admin_logs')
      .insert({
        admin_id: null,
        company_id: companyId || null,
        action,
        details: {
          ...details,
          admin_email: adminEmail || null,
          timestamp: new Date().toISOString()
        }
      })

    if (error) {
      logServerError(
        'Falha ao registrar auditoria',
        error
      )

      return false
    }

    return true
  } catch (error) {
    logServerError(
      'Exceção ao registrar auditoria',
      error
    )

    return false
  }
}

// =====================================================
// ARQUIVOS
// =====================================================

async function removeUploadedFile(file) {
  if (!file?.path) return

  await fs.unlink(file.path).catch(() => {})
}

async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const digest = createHash('sha256')

    createReadStream(filePath)
      .on('data', chunk => digest.update(chunk))
      .on('error', reject)
      .on('end', () => {
        resolve(digest.digest('hex'))
      })
  })
}

async function validateExecutableFile(filePath) {
  const handle = await fs.open(filePath, 'r')

  try {
    const header = Buffer.alloc(4096)

    const { bytesRead } = await handle.read(
      header,
      0,
      header.length,
      0
    )

    if (
      bytesRead < 64 ||
      header[0] !== 0x4D ||
      header[1] !== 0x5A
    ) {
      return false
    }

    const peOffset = header.readUInt32LE(0x3C)

    if (
      peOffset < 64 ||
      peOffset + 4 > bytesRead
    ) {
      return false
    }

    return header
      .subarray(peOffset, peOffset + 4)
      .equals(
        Buffer.from([0x50, 0x45, 0x00, 0x00])
      )
  } finally {
    await handle.close()
  }
}

// =====================================================
// CONSULTAS DE CONTRATO E ASSINATURA
// =====================================================

async function getApprovedContract(companyId) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      id,
      company_id,
      contract_number,
      monthly_price,
      status,
      created_at,
      approved_at
    `)
    .eq('company_id', companyId)
    .eq('status', CONTRACT_STATUS.APPROVED)
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data
}

async function getSubscriptionForContract(contract) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('contract_id', contract.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data
}

async function createSubscriptionForContract(contract) {
  if (!contract?.id || !contract?.company_id) {
    throw new Error('Contrato inválido para criação da assinatura.')
  }

  if (contract.status !== CONTRACT_STATUS.APPROVED) {
    throw new Error(
      'Não é permitido criar assinatura para contrato não aprovado.'
    )
  }

  const existing = await getSubscriptionForContract(contract)

  if (existing) return existing

  const referenceDate = contract.created_at
    ? new Date(contract.created_at)
    : new Date()

  if (Number.isNaN(referenceDate.getTime())) {
    throw new Error('Data de criação do contrato inválida.')
  }

  const billingDay = getBillingDay(referenceDate)

  const nextDueDate = getBillingDate(
    referenceDate,
    billingDay
  )

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      company_id: contract.company_id,
      contract_id: contract.id,
      monthly_price: getMonthlyPrice(
        contract.monthly_price
      ),
      billing_day: billingDay,
      next_due_date: nextDueDate,
      grace_days: GRACE_DAYS,
      status: 'pending'
    })
    .select(SUBSCRIPTION_SELECT)
    .single()

  if (!error) return data

  // Recupera uma assinatura eventualmente criada
  // por uma operação concorrente.
  const retry = await getSubscriptionForContract(contract)

  if (retry) return retry

  throw error
}

// =====================================================
// COBRANÇAS
// =====================================================

async function findPaymentForSubscription(subscription) {
  const { data, error } = await supabase
    .from('payments')
    .select(PAYMENT_SELECT)
    .eq('subscription_id', subscription.id)
    .eq('due_date', subscription.next_due_date)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data
}

async function ensurePaymentForSubscription(subscription) {
  if (
    !subscription?.id ||
    !subscription?.next_due_date
  ) {
    throw new Error(
      'Assinatura sem identificador ou data de vencimento.'
    )
  }

  parseDateUTC(subscription.next_due_date)

  const existing = await findPaymentForSubscription(
    subscription
  )

  if (existing) return existing

  const { data, error } = await supabase
    .from('payments')
    .insert({
      subscription_id: subscription.id,
      amount: getMonthlyPrice(
        subscription.monthly_price
      ),
      due_date: subscription.next_due_date,
      status: PAYMENT_STATUS.PENDING
    })
    .select(PAYMENT_SELECT)
    .single()

  if (!error) return data

  const retry = await findPaymentForSubscription(
    subscription
  )

  if (retry) return retry

  throw error
}

// =====================================================
// DADOS COMPLETOS DOS PAGAMENTOS
// =====================================================

async function enrichPayments(payments) {
  if (!payments?.length) return []

  const subscriptionIds = [
    ...new Set(
      payments
        .map(payment => payment.subscription_id)
        .filter(Boolean)
    )
  ]

  if (!subscriptionIds.length) {
    return payments.map(payment => ({
      ...payment,
      subscription: null
    }))
  }

  const {
    data: subscriptions,
    error: subscriptionError
  } = await supabase
    .from('subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .in('id', subscriptionIds)

  if (subscriptionError) throw subscriptionError

  const companyIds = [
    ...new Set(
      (subscriptions || [])
        .map(item => item.company_id)
        .filter(Boolean)
    )
  ]

  const contractIds = [
    ...new Set(
      (subscriptions || [])
        .map(item => item.contract_id)
        .filter(Boolean)
    )
  ]

  const [
    companiesResult,
    contractsResult
  ] = await Promise.all([
    companyIds.length
      ? supabase
          .from('companies')
          .select(`
            id,
            legal_name,
            trade_name,
            cnpj,
            email,
            phone,
            representative_name
          `)
          .in('id', companyIds)
      : Promise.resolve({
          data: [],
          error: null
        }),

    contractIds.length
      ? supabase
          .from('contracts')
          .select(`
            id,
            contract_number,
            monthly_price,
            status,
            signed_at,
            approved_at
          `)
          .in('id', contractIds)
      : Promise.resolve({
          data: [],
          error: null
        })
  ])

  if (companiesResult.error) throw companiesResult.error
  if (contractsResult.error) throw contractsResult.error

  const subscriptionMap = new Map(
    (subscriptions || []).map(item => [
      item.id,
      item
    ])
  )

  const companyMap = new Map(
    (companiesResult.data || []).map(item => [
      item.id,
      item
    ])
  )

  const contractMap = new Map(
    (contractsResult.data || []).map(item => [
      item.id,
      item
    ])
  )

  return payments.map(payment => {
    const subscription = subscriptionMap.get(
      payment.subscription_id
    )

    if (!subscription) {
      return {
        ...payment,
        subscription: null
      }
    }

    return {
      ...payment,
      subscription: {
        ...subscription,
        company:
          companyMap.get(subscription.company_id) || null,
        contract:
          contractMap.get(subscription.contract_id) || null
      }
    }
  })
}

// =====================================================
// LOGIN ADMINISTRATIVO
// =====================================================

router.post('/login', async (req, res) => {
  try {
    const {
      email,
      password
    } = req.body || {}

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    const jwtSecret = process.env.JWT_SECRET

    if (
      !adminEmail ||
      !adminPassword ||
      !jwtSecret
    ) {
      return res.status(503).json({
        error: 'Credenciais administrativas não configuradas no servidor.'
      })
    }

    const submittedEmail = String(email || '')
      .trim()
      .toLowerCase()

    const submittedPassword = String(password || '')

    const validEmail =
      submittedEmail === adminEmail.trim().toLowerCase()

    const validPassword = adminPassword.startsWith('$2')
      ? await bcrypt.compare(
          submittedPassword,
          adminPassword
        )
      : submittedPassword === adminPassword

    if (!validEmail || !validPassword) {
      return res.status(401).json({
        error: 'E-mail ou senha incorretos.'
      })
    }

    const token = jwt.sign(
      {
        role: 'admin',
        email: adminEmail
      },
      jwtSecret,
      {
        expiresIn: '8h'
      }
    )

    return res.json({
      success: true,
      token,
      expiresIn: 28800
    })
  } catch (error) {
    logServerError('Erro no login administrativo', error)

    return res.status(500).json({
      error: 'Não foi possível realizar o login.'
    })
  }
})

// =====================================================
// CADASTROS - LISTAGEM
// =====================================================

router.get('/customers/pending', requireAdmin, async (_req, res) => {
  try {
    if (!supabase) return databaseUnavailable(res)

    const { data, error } = await supabase
      .from('companies')
      .select(COMPANY_SELECT)
      .in('registration_status', [
        REGISTRATION.PENDING_REVIEW,
        REGISTRATION.AWAITING_CONTRACT
      ])
      .order('created_at', { ascending: true })

    if (error) throw error

    return res.json({
      success: true,
      customers: data || []
    })
  } catch (error) {
    logServerError('Erro ao listar cadastros pendentes', error)

    return res.status(500).json({
      error: 'Não foi possível carregar os cadastros pendentes.'
    })
  }
})

// =====================================================
// CADASTROS - DECISÃO ADMINISTRATIVA
// =====================================================

router.patch(
  '/customers/:id/decision',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const companyId = req.params.id
      const decision = getDecision(req)
      const reason = getReason(req)

      if (!validUuid(companyId)) {
        return res.status(400).json({
          error: 'Identificador de empresa inválido.'
        })
      }

      const validationError = validateDecisionInput(
        decision,
        reason
      )

      if (validationError) {
        return res.status(400).json({
          error: validationError
        })
      }

      const {
        data: updatedCompany,
        error
      } = await supabase
        .from('companies')
        .update({
          registration_status: decision === 'approve'
            ? REGISTRATION.AWAITING_CONTRACT
            : REGISTRATION.REJECTED
        })
        .eq('id', companyId)
        .eq('registration_status', REGISTRATION.PENDING_REVIEW)
        .select(COMPANY_SELECT)
        .maybeSingle()

      if (error) throw error

      if (!updatedCompany) {
        return res.status(409).json({
          error: 'Este cadastro já foi analisado ou não está mais pendente.'
        })
      }

      await registerAdminLog({
        companyId,
        action: decision === 'approve'
          ? 'customer_registration_approved'
          : 'customer_registration_rejected',
        adminEmail: getAdminEmail(req),
        details: {
          decision,
          reason: decision === 'reject' ? reason : null
        }
      })

      return res.json({
        success: true,
        message: decision === 'approve'
          ? 'Cadastro aprovado. O cliente já pode gerar o contrato.'
          : 'Cadastro rejeitado.',
        company: updatedCompany
      })
    } catch (error) {
      logServerError('Erro na decisão do cadastro', error)

      return res.status(500).json({
        error: 'Não foi possível concluir a análise do cadastro.'
      })
    }
  }
)

// =====================================================
// CADASTROS - DETALHES
// =====================================================

router.get('/customers/:id', requireAdmin, async (req, res) => {
  try {
    if (!supabase) return databaseUnavailable(res)

    const companyId = req.params.id

    if (!validUuid(companyId)) {
      return res.status(400).json({
        error: 'Identificador de empresa inválido.'
      })
    }

    const { data: company, error } = await supabase
      .from('companies')
      .select(COMPANY_SELECT)
      .eq('id', companyId)
      .maybeSingle()

    if (error) throw error

    if (!company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.'
      })
    }

    const {
      data: subscriptions,
      error: subscriptionError
    } = await supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (subscriptionError) throw subscriptionError

    return res.json({
      success: true,
      company,
      subscriptions: subscriptions || []
    })
  } catch (error) {
    logServerError('Erro ao consultar empresa', error)

    return res.status(500).json({
      error: 'Não foi possível consultar a empresa.'
    })
  }
})

// =====================================================
// CADASTROS - LINK DE PAGAMENTO
// =====================================================

router.patch(
  '/customers/:id/payment-link',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const companyId = req.params.id

      if (!validUuid(companyId)) {
        return res.status(400).json({
          error: 'Identificador de empresa inválido.'
        })
      }

      const paymentLink = validatePaymentLink(
        req.body?.payment_link
      )

      if (!paymentLink) {
        return res.status(400).json({
          error: 'Informe um link HTTP ou HTTPS válido.'
        })
      }

      const { data: company, error: companyError } =
        await supabase
          .from('companies')
          .select(`
            id,
            legal_name,
            status,
            registration_status
          `)
          .eq('id', companyId)
          .maybeSingle()

      if (companyError) throw companyError

      if (!company) {
        return res.status(404).json({
          error: 'Empresa não encontrada.'
        })
      }

      if (
        company.registration_status !== REGISTRATION.CONTRACT_APPROVED &&
        company.registration_status !== REGISTRATION.AWAITING_PAYMENT
      ) {
        return res.status(409).json({
          error: 'O link de pagamento só pode ser liberado após a aprovação do contrato.'
        })
      }

      const approvedContract = await getApprovedContract(companyId)

      if (!approvedContract) {
        return res.status(409).json({
          error: 'Não existe contrato aprovado para esta empresa.'
        })
      }

      // A assinatura é criada ou recuperada somente
      // depois de existir contrato aprovado.
      const subscription = await createSubscriptionForContract(
        approvedContract
      )

      // A primeira cobrança nasce somente nesta etapa,
      // quando o administrador libera o link de pagamento.
      const payment = await ensurePaymentForSubscription(
        subscription
      )

      const {
        data: updatedCompany,
        error: updateError
      } = await supabase
        .from('companies')
        .update({
          payment_link: paymentLink,
          registration_status: REGISTRATION.AWAITING_PAYMENT
        })
        .eq('id', companyId)
        .in('registration_status', [
          REGISTRATION.CONTRACT_APPROVED,
          REGISTRATION.AWAITING_PAYMENT
        ])
        .select(`
          id,
          legal_name,
          registration_status,
          payment_link
        `)
        .maybeSingle()

      if (updateError) throw updateError

      if (!updatedCompany) {
        return res.status(409).json({
          error: 'O cadastro foi alterado durante a operação. Atualize a página.'
        })
      }

      await registerAdminLog({
        companyId,
        action: 'customer_payment_link_created',
        adminEmail: getAdminEmail(req),
        details: {
          contract_id: approvedContract.id,
          subscription_id: subscription.id,
          payment_id: payment.id,
          amount: payment.amount,
          due_date: payment.due_date
        }
      })

      return res.json({
        success: true,
        message: 'Link de pagamento liberado para o cliente.',
        company: updatedCompany,
        subscription,
        payment
      })
    } catch (error) {
      logServerError('Erro ao vincular link de pagamento', error)

      return res.status(500).json({
        error: 'Não foi possível vincular o link de pagamento.'
      })
    }
  }
)

// =====================================================
// CONTRATOS - LISTAGEM
// =====================================================

router.get('/contracts', requireAdmin, async (_req, res) => {
  try {
    if (!supabase) return databaseUnavailable(res)

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select(`
        id,
        company_id,
        contract_number,
        monthly_price,
        status,
        signed_at,
        created_at,
        approved_at
      `)
      .eq('status', CONTRACT_STATUS.AWAITING_APPROVAL)
      .order('signed_at', { ascending: false })

    if (error) throw error

    if (!contracts?.length) {
      return res.json({
        success: true,
        contracts: []
      })
    }

    const companyIds = [
      ...new Set(
        contracts
          .map(contract => contract.company_id)
          .filter(Boolean)
      )
    ]

    const { data: companies, error: companyError } =
      await supabase
        .from('companies')
        .select(`
          id,
          legal_name,
          trade_name,
          cnpj,
          email,
          phone,
          representative_name,
          representative_cpf,
          city,
          state
        `)
        .in('id', companyIds)

    if (companyError) throw companyError

    const companyMap = new Map(
      (companies || []).map(company => [
        company.id,
        company
      ])
    )

    return res.json({
      success: true,
      contracts: contracts.map(contract => ({
        ...contract,
        company: companyMap.get(contract.company_id) || null
      }))
    })
  } catch (error) {
    logServerError('Erro ao listar contratos', error)

    return res.status(500).json({
      error: 'Não foi possível carregar os contratos.'
    })
  }
})

// =====================================================
// CONTRATOS - DOWNLOAD ASSINADO
// =====================================================

router.get(
  '/contracts/:id/signed/download',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const contractId = req.params.id

      if (!validUuid(contractId)) {
        return res.status(400).json({
          error: 'Identificador de contrato inválido.'
        })
      }

      const { data: contract, error } = await supabase
        .from('contracts')
        .select(`
          id,
          contract_number,
          signed_file_path
        `)
        .eq('id', contractId)
        .maybeSingle()

      if (error) throw error

      if (!contract?.signed_file_path) {
        return res.status(404).json({
          error: 'Documento assinado não encontrado.'
        })
      }

      const file = await getContractFile(
        contract.signed_file_path
      )

      if (!Buffer.isBuffer(file)) {
        throw new Error('Arquivo do contrato inválido.')
      }

      const filename = getSafeFilename(
        `contrato-assinado-${contract.contract_number}.pdf`
      )

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`
      )
      res.setHeader('Content-Length', file.length)
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')

      return res.send(file)
    } catch (error) {
      logServerError('Erro ao baixar contrato', error)

      return res.status(500).json({
        error: 'Não foi possível baixar o contrato.'
      })
    }
  }
)

// =====================================================
// CONTRATOS - APROVAÇÃO E REJEIÇÃO
// =====================================================

router.patch(
  '/contracts/:id/decision',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const contractId = req.params.id
      const decision = getDecision(req)
      const reason = getReason(req)

      if (!validUuid(contractId)) {
        return res.status(400).json({
          error: 'Identificador de contrato inválido.'
        })
      }

      const validationError = validateDecisionInput(
        decision,
        reason
      )

      if (validationError) {
        return res.status(400).json({
          error: validationError
        })
      }

      // -------------------------------------------------
      // 1. LOCALIZA O CONTRATO
      // -------------------------------------------------

      const { data: currentContract, error: findError } =
        await supabase
          .from('contracts')
          .select(`
            id,
            company_id,
            contract_number,
            monthly_price,
            status,
            created_at,
            approved_at
          `)
          .eq('id', contractId)
          .maybeSingle()

      if (findError) throw findError

      if (!currentContract) {
        return res.status(404).json({
          error: 'Contrato não encontrado.'
        })
      }

      // -------------------------------------------------
      // 2. LOCALIZA A EMPRESA
      // -------------------------------------------------

      const { data: company, error: companyFindError } =
        await supabase
          .from('companies')
          .select(`
            id,
            registration_status
          `)
          .eq('id', currentContract.company_id)
          .maybeSingle()

      if (companyFindError) throw companyFindError

      if (!company) {
        return res.status(404).json({
          error: 'Empresa vinculada ao contrato não encontrada.'
        })
      }

      // -------------------------------------------------
      // 3. REJEIÇÃO DO CONTRATO
      // -------------------------------------------------

      if (decision === 'reject') {
        if (
          currentContract.status !== CONTRACT_STATUS.AWAITING_APPROVAL
        ) {
          return res.status(409).json({
            error: 'Este contrato não está aguardando análise.'
          })
        }

        if (
          company.registration_status !== REGISTRATION.AWAITING_CONTRACT
        ) {
          return res.status(409).json({
            error: 'A empresa não está na etapa de análise contratual.'
          })
        }

        const {
          data: rejectedContract,
          error: rejectError
        } = await supabase
          .from('contracts')
          .update({
            status: CONTRACT_STATUS.REJECTED
          })
          .eq('id', contractId)
          .eq('status', CONTRACT_STATUS.AWAITING_APPROVAL)
          .select(`
            id,
            company_id,
            contract_number,
            status
          `)
          .maybeSingle()

        if (rejectError) throw rejectError

        if (!rejectedContract) {
          return res.status(409).json({
            error: 'O contrato foi alterado por outra operação.'
          })
        }

        // O cliente poderá corrigir e enviar um novo contrato.
        // Não rejeitamos o cadastro inteiro.
        const {
          data: updatedCompany,
          error: companyUpdateError
        } = await supabase
          .from('companies')
          .update({
            registration_status: REGISTRATION.AWAITING_CONTRACT
          })
          .eq('id', company.id)
          .eq('registration_status', REGISTRATION.AWAITING_CONTRACT)
          .select('id, registration_status')
          .maybeSingle()

        if (companyUpdateError) throw companyUpdateError

        if (!updatedCompany) {
          throw new Error(
            'Contrato rejeitado, mas não foi possível confirmar o estado do cadastro.'
          )
        }

        await registerAdminLog({
          companyId: company.id,
          action: 'contract_rejected',
          adminEmail: getAdminEmail(req),
          details: {
            contract_id: contractId,
            contract_number: currentContract.contract_number,
            reason
          }
        })

        return res.json({
          success: true,
          message: 'Contrato rejeitado. O cliente poderá corrigir e enviar novamente.',
          contract: rejectedContract
        })
      }

      // -------------------------------------------------
      // 4. APROVAÇÃO DO CONTRATO
      // -------------------------------------------------

      let approvedContract = currentContract
      let newlyApproved = false

      if (
        currentContract.status === CONTRACT_STATUS.AWAITING_APPROVAL
      ) {
        if (
          company.registration_status !== REGISTRATION.AWAITING_CONTRACT
        ) {
          return res.status(409).json({
            error: 'A empresa não está na etapa de análise contratual.'
          })
        }

        const timestamp = new Date().toISOString()

        // IMPORTANTE:
        // Primeiro atualiza o contrato no banco.
        // A assinatura só será criada depois da confirmação.
        const {
          data: updatedContract,
          error: updateError
        } = await supabase
          .from('contracts')
          .update({
            status: CONTRACT_STATUS.APPROVED,
            approved_by: null,
            approved_at: timestamp
          })
          .eq('id', contractId)
          .eq('status', CONTRACT_STATUS.AWAITING_APPROVAL)
          .select(`
            id,
            company_id,
            contract_number,
            monthly_price,
            status,
            created_at,
            approved_at
          `)
          .maybeSingle()

        if (updateError) throw updateError

        if (!updatedContract) {
          // Outra operação pode ter aprovado o contrato.
          // Faz uma nova consulta para recuperar o estado real.
          const {
            data: refreshedContract,
            error: refreshError
          } = await supabase
            .from('contracts')
            .select(`
              id,
              company_id,
              contract_number,
              monthly_price,
              status,
              created_at,
              approved_at
            `)
            .eq('id', contractId)
            .maybeSingle()

          if (refreshError) throw refreshError

          if (
            !refreshedContract ||
            refreshedContract.status !== CONTRACT_STATUS.APPROVED
          ) {
            return res.status(409).json({
              error: 'O contrato foi alterado por outra operação. Atualize a lista.'
            })
          }

          approvedContract = refreshedContract
        } else {
          approvedContract = updatedContract
          newlyApproved = true
        }
      } else if (
        currentContract.status !== CONTRACT_STATUS.APPROVED
      ) {
        return res.status(409).json({
          error: 'Este contrato não pode ser aprovado no estado atual.'
        })
      }

      // -------------------------------------------------
      // 5. CRIA OU RECUPERA A ASSINATURA
      // -------------------------------------------------

      // Esta função também verifica se já existe assinatura.
      // Não cria pagamento nesta etapa.
      const subscription = await createSubscriptionForContract(
        approvedContract
      )

      // -------------------------------------------------
      // 6. ATUALIZA O ESTADO COMERCIAL DA EMPRESA
      // -------------------------------------------------

      if (
        company.registration_status === REGISTRATION.AWAITING_CONTRACT
      ) {
        const {
          data: updatedCompany,
          error: companyUpdateError
        } = await supabase
          .from('companies')
          .update({
            registration_status: REGISTRATION.CONTRACT_APPROVED
          })
          .eq('id', company.id)
          .eq('registration_status', REGISTRATION.AWAITING_CONTRACT)
          .select('id, registration_status')
          .maybeSingle()

        if (companyUpdateError) throw companyUpdateError

        if (!updatedCompany) {
          // Recuperação de uma operação concorrente.
          const {
            data: refreshedCompany,
            error: refreshCompanyError
          } = await supabase
            .from('companies')
            .select('id, registration_status')
            .eq('id', company.id)
            .maybeSingle()

          if (refreshCompanyError) throw refreshCompanyError

          if (
            !refreshedCompany ||
            ![
              REGISTRATION.CONTRACT_APPROVED,
              REGISTRATION.AWAITING_PAYMENT,
              REGISTRATION.ACTIVE
            ].includes(refreshedCompany.registration_status)
          ) {
            return res.status(409).json({
              error: 'O contrato foi aprovado, mas o estado comercial da empresa mudou. Verifique o cadastro.'
            })
          }
        }
      } else if (
        ![
          REGISTRATION.CONTRACT_APPROVED,
          REGISTRATION.AWAITING_PAYMENT,
          REGISTRATION.ACTIVE
        ].includes(company.registration_status)
      ) {
        return res.status(409).json({
          error: 'O contrato está aprovado, mas a empresa possui um estado comercial incompatível.'
        })
      }

      // -------------------------------------------------
      // 7. REGISTRA A OPERAÇÃO
      // -------------------------------------------------

      await registerAdminLog({
        companyId: company.id,
        action: newlyApproved
          ? 'contract_approved'
          : 'contract_approval_recovered',
        adminEmail: getAdminEmail(req),
        details: {
          contract_id: contractId,
          contract_number: approvedContract.contract_number,
          subscription_id: subscription.id,
          decision: 'approve'
        }
      })

      // -------------------------------------------------
      // 8. RESPOSTA
      // -------------------------------------------------

      return res.json({
        success: true,
        message: 'Contrato aprovado. Agora você pode liberar o link de pagamento.',
        contract: approvedContract,
        subscription
      })
    } catch (error) {
      logServerError('Erro na decisão do contrato', error)

      return res.status(500).json({
        error: 'Não foi possível concluir a decisão do contrato.'
      })
    }
  }
)

// =====================================================
// PAGAMENTOS - LISTAGEM
// =====================================================

router.get('/payments', requireAdmin, async (_req, res) => {
  try {
    if (!supabase) return databaseUnavailable(res)

    // Não cria cobranças automaticamente.
    // A primeira cobrança é criada na liberação do link.
    // As próximas são criadas após a confirmação do pagamento.

    const { data: payments, error } = await supabase
      .from('payments')
      .select(PAYMENT_SELECT)
      .in('status', [
        PAYMENT_STATUS.PENDING,
        PAYMENT_STATUS.UNDER_REVIEW
      ])
      .order('created_at', { ascending: true })

    if (error) throw error

    const enriched = await enrichPayments(
      payments || []
    )

    const visiblePayments = enriched.filter(payment => {
      const subscription = payment.subscription

      return (
        subscription?.contract?.status === CONTRACT_STATUS.APPROVED &&
        Boolean(subscription?.company)
      )
    })

    return res.json({
      success: true,
      payments: visiblePayments
    })
  } catch (error) {
    logServerError('Erro ao listar pagamentos', error)

    return res.status(500).json({
      error: 'Não foi possível carregar os pagamentos.'
    })
  }
})

// =====================================================
// PAGAMENTOS - HISTÓRICO
// =====================================================

router.get(
  '/payments/history',
  requireAdmin,
  async (_req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const { data: payments, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .in('status', [
          PAYMENT_STATUS.CONFIRMED,
          PAYMENT_STATUS.REJECTED
        ])
        .order('reviewed_at', {
          ascending: false
        })
        .limit(200)

      if (error) throw error

      const enriched = await enrichPayments(
        payments || []
      )

      return res.json({
        success: true,
        payments: enriched.filter(payment => (
          payment.subscription?.contract?.status === CONTRACT_STATUS.APPROVED
        ))
      })
    } catch (error) {
      logServerError('Erro ao listar histórico de pagamentos', error)

      return res.status(500).json({
        error: 'Não foi possível carregar o histórico de pagamentos.'
      })
    }
  }
)

// =====================================================
// PAGAMENTOS - DOWNLOAD DO COMPROVANTE
// =====================================================

router.get(
  '/payments/:id/receipt/download',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const paymentId = req.params.id

      if (!validUuid(paymentId)) {
        return res.status(400).json({
          error: 'Identificador de pagamento inválido.'
        })
      }

      const { data: payment, error } = await supabase
        .from('payments')
        .select(`
          id,
          receipt_file_path
        `)
        .eq('id', paymentId)
        .maybeSingle()

      if (error) throw error

      if (!payment?.receipt_file_path) {
        return res.status(404).json({
          error: 'Comprovante não encontrado.'
        })
      }

      const extension = path.extname(
        payment.receipt_file_path
      ).toLowerCase()

      const contentTypes = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png'
      }

      const contentType = contentTypes[extension]

      if (!contentType) {
        return res.status(415).json({
          error: 'Formato de comprovante não suportado.'
        })
      }

      const {
        data: file,
        error: downloadError
      } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .download(payment.receipt_file_path)

      if (downloadError) throw downloadError

      if (!file) {
        return res.status(404).json({
          error: 'Arquivo do comprovante não encontrado.'
        })
      }

      const buffer = Buffer.from(
        await file.arrayBuffer()
      )

      res.setHeader('Content-Type', contentType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="comprovante-${payment.id}${extension}"`
      )
      res.setHeader('Content-Length', buffer.length)
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')

      return res.send(buffer)
    } catch (error) {
      logServerError('Erro ao baixar comprovante', error)

      return res.status(500).json({
        error: 'Não foi possível baixar o comprovante.'
      })
    }
  }
)

// =====================================================
// PAGAMENTOS - APROVAÇÃO E REJEIÇÃO
// =====================================================

router.patch(
  '/payments/:id/decision',
  requireAdmin,
  async (req, res) => {
    try {
      if (!supabase) return databaseUnavailable(res)

      const paymentId = req.params.id
      const decision = getDecision(req)
      const reason = getReason(req)

      if (!validUuid(paymentId)) {
        return res.status(400).json({
          error: 'Identificador de pagamento inválido.'
        })
      }

      const validationError = validateDecisionInput(
        decision,
        reason
      )

      if (validationError) {
        return res.status(400).json({
          error: validationError
        })
      }

      // -------------------------------------------------
      // 1. BUSCA PAGAMENTO
      // -------------------------------------------------

      const { data: payment, error: paymentError } =
        await supabase
          .from('payments')
          .select(`
            id,
            subscription_id,
            amount,
            due_date,
            receipt_file_path,
            status
          `)
          .eq('id', paymentId)
          .maybeSingle()

      if (paymentError) throw paymentError

      if (!payment) {
        return res.status(404).json({
          error: 'Pagamento não encontrado.'
        })
      }

      if (payment.status !== PAYMENT_STATUS.UNDER_REVIEW) {
        return res.status(409).json({
          error: 'Este pagamento não possui comprovante aguardando análise.'
        })
      }

      if (!payment.receipt_file_path) {
        return res.status(409).json({
          error: 'Não existe comprovante anexado a este pagamento.'
        })
      }

      // -------------------------------------------------
      // 2. BUSCA ASSINATURA
      // -------------------------------------------------

      const {
        data: subscription,
        error: subscriptionError
      } = await supabase
        .from('subscriptions')
        .select(SUBSCRIPTION_SELECT)
        .eq('id', payment.subscription_id)
        .maybeSingle()

      if (subscriptionError) throw subscriptionError

      if (!subscription) {
        return res.status(404).json({
          error: 'Assinatura vinculada ao pagamento não encontrada.'
        })
      }

      // -------------------------------------------------
      // 3. VALIDA CONTRATO APROVADO
      // -------------------------------------------------

      if (!subscription.contract_id) {
        return res.status(409).json({
          error: 'Esta assinatura não está vinculada a um contrato.'
        })
      }

      const { data: contract, error: contractError } =
        await supabase
          .from('contracts')
          .select(`
            id,
            company_id,
            status
          `)
          .eq('id', subscription.contract_id)
          .maybeSingle()

      if (contractError) throw contractError

      if (
        !contract ||
        contract.status !== CONTRACT_STATUS.APPROVED ||
        contract.company_id !== subscription.company_id
      ) {
        return res.status(409).json({
          error: 'O contrato vinculado não está aprovado.'
        })
      }

      // -------------------------------------------------
      // 4. BUSCA EMPRESA
      // -------------------------------------------------

      const { data: company, error: companyError } =
        await supabase
          .from('companies')
          .select(`
            id,
            status,
            registration_status
          `)
          .eq('id', subscription.company_id)
          .maybeSingle()

      if (companyError) throw companyError

      if (!company) {
        return res.status(404).json({
          error: 'Empresa vinculada à assinatura não encontrada.'
        })
      }

      const timestamp = new Date().toISOString()

      // -------------------------------------------------
      // 5. REJEIÇÃO DO PAGAMENTO
      // -------------------------------------------------

      if (decision === 'reject') {
        const {
          data: rejectedPayment,
          error: rejectError
        } = await supabase
          .from('payments')
          .update({
            status: PAYMENT_STATUS.REJECTED,
            rejection_reason: reason,
            reviewed_by: null,
            reviewed_at: timestamp
          })
          .eq('id', paymentId)
          .eq('status', PAYMENT_STATUS.UNDER_REVIEW)
          .select(PAYMENT_SELECT)
          .maybeSingle()

        if (rejectError) throw rejectError

        if (!rejectedPayment) {
          return res.status(409).json({
            error: 'O pagamento já foi analisado.'
          })
        }

        // Apenas cadastros iniciais retornam para
        // aguardando pagamento. Renovações não são rebaixadas.
        if (
          company.registration_status === REGISTRATION.PAYMENT_UNDER_REVIEW
        ) {
          const { error: updateCompanyError } = await supabase
            .from('companies')
            .update({
              registration_status: REGISTRATION.AWAITING_PAYMENT
            })
            .eq('id', company.id)
            .eq('registration_status', REGISTRATION.PAYMENT_UNDER_REVIEW)

          if (updateCompanyError) throw updateCompanyError
        }

        await registerAdminLog({
          companyId: company.id,
          action: 'payment_rejected',
          adminEmail: getAdminEmail(req),
          details: {
            payment_id: payment.id,
            subscription_id: subscription.id,
            amount: payment.amount,
            reason
          }
        })

        return res.json({
          success: true,
          message: 'Pagamento rejeitado. O cliente poderá enviar outro comprovante.',
          payment: rejectedPayment
        })
      }

      // -------------------------------------------------
      // 6. VALIDA DADOS DA ASSINATURA
      // -------------------------------------------------

      if (!payment.due_date) {
        return res.status(409).json({
          error: 'O pagamento não possui data de vencimento.'
        })
      }

      parseDateUTC(payment.due_date)

      const billingDay = Number(
        subscription.billing_day
      )

      if (
        !Number.isInteger(billingDay) ||
        billingDay < 1 ||
        billingDay > 31
      ) {
        return res.status(409).json({
          error: 'Dia de cobrança da assinatura inválido.'
        })
      }

      const graceDays = Number(
        subscription.grace_days ?? GRACE_DAYS
      )

      if (
        !Number.isInteger(graceDays) ||
        graceDays < 0 ||
        graceDays > 30
      ) {
        return res.status(409).json({
          error: 'Prazo de tolerância inválido.'
        })
      }

      const nextDueDate = getNextBillingDate(
        payment.due_date,
        billingDay
      )

      const expirationDate = addDaysToDate(
        nextDueDate,
        graceDays
      )

      const expiresAt = getExpirationTimestamp(
        expirationDate
      )

      // -------------------------------------------------
      // 7. BUSCA LICENÇA EXISTENTE
      // -------------------------------------------------

      const {
        data: existingLicenses,
        error: licenseFindError
      } = await supabase
        .from('licenses')
        .select(LICENSE_SELECT)
        .eq('subscription_id', subscription.id)
        .neq('status', 'cancelled')
        .order('activated_at', { ascending: true })
        .limit(1)

      if (licenseFindError) throw licenseFindError

      const existingLicense =
        existingLicenses?.[0] || null

      // -------------------------------------------------
      // 8. CONFIRMA PAGAMENTO
      // -------------------------------------------------

      const {
        data: confirmedPayment,
        error: confirmError
      } = await supabase
        .from('payments')
        .update({
          status: PAYMENT_STATUS.CONFIRMED,
          payment_date: timestamp,
          reviewed_by: null,
          reviewed_at: timestamp,
          rejection_reason: null
        })
        .eq('id', paymentId)
        .eq('status', PAYMENT_STATUS.UNDER_REVIEW)
        .select(PAYMENT_SELECT)
        .maybeSingle()

      if (confirmError) throw confirmError

      if (!confirmedPayment) {
        return res.status(409).json({
          error: 'O pagamento foi alterado por outra operação.'
        })
      }

      // -------------------------------------------------
      // 9. ATIVA ASSINATURA
      // -------------------------------------------------

      const {
        data: updatedSubscription,
        error: updateSubscriptionError
      } = await supabase
        .from('subscriptions')
        .update({
          status: 'active',
          next_due_date: nextDueDate
        })
        .eq('id', subscription.id)
        .select(SUBSCRIPTION_SELECT)
        .single()

      if (updateSubscriptionError) {
        throw updateSubscriptionError
      }

      // -------------------------------------------------
      // 10. ATIVA EMPRESA
      // -------------------------------------------------

      const { error: updateCompanyError } = await supabase
        .from('companies')
        .update({
          status: 'active',
          registration_status: REGISTRATION.ACTIVE
        })
        .eq('id', company.id)

      if (updateCompanyError) {
        throw updateCompanyError
      }

      // -------------------------------------------------
      // 11. CRIA OU ATUALIZA LICENÇA
      // -------------------------------------------------

      let license

      if (existingLicense) {
        const {
          data: updatedLicense,
          error: licenseUpdateError
        } = await supabase
          .from('licenses')
          .update({
            status: 'active',
            expires_at: expiresAt
          })
          .eq('id', existingLicense.id)
          .select(LICENSE_SELECT)
          .single()

        if (licenseUpdateError) {
          throw licenseUpdateError
        }

        license = updatedLicense
      } else {
        const {
          data: newLicense,
          error: licenseInsertError
        } = await supabase
          .from('licenses')
          .insert({
            company_id: subscription.company_id,
            subscription_id: subscription.id,
            status: 'active',
            activated_at: timestamp,
            expires_at: expiresAt
          })
          .select(LICENSE_SELECT)
          .single()

        if (licenseInsertError) {
          const {
            data: retryLicenses,
            error: retryError
          } = await supabase
            .from('licenses')
            .select(LICENSE_SELECT)
            .eq('subscription_id', subscription.id)
            .neq('status', 'cancelled')
            .limit(1)

          if (retryError) throw retryError

          if (!retryLicenses?.length) {
            throw licenseInsertError
          }

          license = retryLicenses[0]
        } else {
          license = newLicense
        }
      }

      // -------------------------------------------------
      // 12. GERA PRÓXIMA COBRANÇA
      // -------------------------------------------------

      const nextPayment = await ensurePaymentForSubscription({
        ...updatedSubscription,
        next_due_date: nextDueDate
      })

      // -------------------------------------------------
      // 13. AUDITORIA
      // -------------------------------------------------

      await registerAdminLog({
        companyId: company.id,
        action: 'payment_confirmed',
        adminEmail: getAdminEmail(req),
        details: {
          payment_id: payment.id,
          subscription_id: subscription.id,
          license_id: license.id,
          amount: payment.amount,
          next_due_date: nextDueDate,
          next_payment_id: nextPayment.id,
          expires_at: expiresAt
        }
      })

      // -------------------------------------------------
      // 14. RESPOSTA
      // -------------------------------------------------

      return res.json({
        success: true,
        message: 'Pagamento confirmado. Empresa e licença ativadas.',
        payment: confirmedPayment,
        subscription: updatedSubscription,
        nextPayment: {
          id: nextPayment.id,
          amount: nextPayment.amount,
          due_date: nextPayment.due_date,
          status: nextPayment.status
        },
        license: {
          id: license.id,
          license_key: license.license_key,
          status: license.status,
          activated_at: license.activated_at,
          expires_at: license.expires_at
        }
      })
    } catch (error) {
      logServerError(
        'Erro ao processar decisão do pagamento',
        error
      )

      return res.status(500).json({
        error: 'Não foi possível concluir a análise do pagamento.'
      })
    }
  }
)

// =====================================================
// DISTRIBUIÇÃO - LISTAGEM DE VERSÕES
// =====================================================

router.get('/releases', requireAdmin, async (_req, res) => {
  try {
    const db = await readStore()

    const releases = [
      ...(db.releases || [])
    ]
      .sort((a, b) => (
        new Date(b.createdAt).getTime() -
        new Date(a.createdAt).getTime()
      ))
      .map(({ storageName, ...release }) => release)

    return res.json({
      success: true,
      releases
    })
  } catch (error) {
    logServerError('Erro ao listar versões', error)

    return res.status(500).json({
      error: 'Não foi possível carregar as versões.'
    })
  }
})

// =====================================================
// DISTRIBUIÇÃO - PUBLICAÇÃO DE VERSÕES
// =====================================================

router.post(
  '/releases',
  requireAdmin,
  upload.single('installer'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Arquivo .exe obrigatório.'
        })
      }

      const version = String(
        req.body?.version || ''
      ).trim()

      if (
        !/^\d+\.\d+\.\d+([+-][\w.-]+)?$/.test(version)
      ) {
        await removeUploadedFile(req.file)

        return res.status(400).json({
          error: 'Use versão semântica, por exemplo 1.0.0.'
        })
      }

      const isValidExecutable = await validateExecutableFile(
        req.file.path
      )

      if (!isValidExecutable) {
        await removeUploadedFile(req.file)

        return res.status(400).json({
          error: 'O arquivo enviado não parece ser um executável Windows válido.'
        })
      }

      const db = await readStore()

      db.releases = Array.isArray(db.releases)
        ? db.releases
        : []

      const versionExists = db.releases.some(
        release => release.version === version
      )

      if (versionExists) {
        await removeUploadedFile(req.file)

        return res.status(409).json({
          error: 'Esta versão já foi publicada.'
        })
      }

      const sha256 = await calculateFileHash(
        req.file.path
      )

      const release = {
        id: crypto.randomUUID(),
        version,
        sha256,
        notes: String(
          req.body?.notes || ''
        ).slice(0, 5000),
        originalName: getSafeFilename(
          req.file.originalname
        ),
        storageName: req.file.filename,
        sizeBytes: req.file.size,
        createdAt: new Date().toISOString(),
        active: true
      }

      db.releases.push(release)

      await writeStore(db)

      const {
        storageName,
        ...publicRelease
      } = release

      return res.status(201).json({
        success: true,
        release: publicRelease
      })
    } catch (error) {
      await removeUploadedFile(req.file)

      logServerError('Erro ao publicar versão', error)

      return res.status(500).json({
        error: 'Não foi possível publicar a versão.'
      })
    }
  }
)

// =====================================================
// TRATAMENTO DE ERROS DO MULTER
// =====================================================

router.use((error, _req, res, next) => {
  if (!error) return next()

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `O arquivo ultrapassa o limite de ${MAX_UPLOAD_MB} MB.`
      })
    }

    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Envie somente um arquivo por vez.'
      })
    }

    return res.status(400).json({
      error: 'Não foi possível processar o arquivo enviado.'
    })
  }

  if (error.message === 'Envie somente arquivos .exe.') {
    return res.status(400).json({
      error: error.message
    })
  }

  return next(error)
})

// =====================================================
// EXPORTAÇÃO
// =====================================================

export default router
