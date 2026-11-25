
import { Router } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'

import { createCheckout } from '../services/pagbank.js'
import { readStore, writeStore } from '../store.js'
import { supabase } from '../supabase.js'
import { requireCustomer } from '../middleware/customerAuth.js'

const router = Router()

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const RECEIPT_BUCKET = 'foodcore-payment-receipts'
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024

const ALLOWED_RECEIPT_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png'
}

// =====================================================
// PLANOS LEGADOS - PAGBANK
// =====================================================

const plans = {
  starter: {
    id: 'starter',
    name: 'FOODCORE Essencial',
    amountCents: 9900,
    interval: 'MONTHLY',
    billingCycles: 0
  },

  pro: {
    id: 'pro',
    name: 'FOODCORE Profissional',
    amountCents: 14900,
    interval: 'MONTHLY',
    billingCycles: 0
  }
}

// =====================================================
// UPLOAD DE COMPROVANTES
// =====================================================

const receiptUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_RECEIPT_SIZE,
    files: 1
  },

  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_RECEIPT_TYPES[file.mimetype]) {
      return callback(
        new Error('Formato inválido. Envie PDF, JPG ou PNG.')
      )
    }

    callback(null, true)
  }
})

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function databaseUnavailable(res) {
  return res.status(503).json({
    error: 'Banco de dados indisponível.'
  })
}

function getFileExtension(mimetype) {
  return ALLOWED_RECEIPT_TYPES[mimetype] || null
}

function getCustomerCompanyId(req) {
  return req.customer?.companyId || null
}

function validPaymentMethod(method) {
  return ['pix', 'bank_transfer'].includes(method)
}

async function removeStorageFile(filePath) {
  if (!supabase || !filePath) return

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .remove([filePath])

  if (error) {
    console.error(
      '[FOODCORE] Erro ao remover comprovante:',
      error.message
    )
  }
}

// =====================================================
// ENVIO DE COMPROVANTE DE PAGAMENTO
// =====================================================

// POST /api/billing/receipt
//
// FormData:
// - receipt: arquivo PDF, JPG ou PNG
// - payment_method: pix ou bank_transfer

router.post(
  '/receipt',
  requireCustomer,
  receiptUpload.single('receipt'),
  async (req, res) => {
    let uploadedFilePath = null

    try {
      if (!supabase) {
        return databaseUnavailable(res)
      }

      const companyId = getCustomerCompanyId(req)

      if (!companyId) {
        return res.status(401).json({
          error: 'Empresa não identificada na sessão.'
        })
      }

      if (!req.file) {
        return res.status(400).json({
          error: 'Envie o comprovante de pagamento.'
        })
      }

      const paymentMethod = String(
        req.body?.payment_method || ''
      ).trim().toLowerCase()

      if (!validPaymentMethod(paymentMethod)) {
        return res.status(400).json({
          error: 'Método inválido. Utilize pix ou bank_transfer.'
        })
      }

      const extension = getFileExtension(req.file.mimetype)

      if (!extension) {
        return res.status(400).json({
          error: 'Formato de comprovante não permitido.'
        })
      }

      // -----------------------------------------------
      // LOCALIZA A ASSINATURA DA EMPRESA
      // -----------------------------------------------

      const { data: subscriptions, error: subscriptionError } =
        await supabase
          .from('subscriptions')
          .select(`
            id,
            company_id,
            monthly_price,
            next_due_date,
            status
          `)
          .eq('company_id', companyId)
          .in('status', ['pending', 'active', 'past_due'])
          .order('created_at', { ascending: false })
          .limit(1)

      if (subscriptionError) throw subscriptionError

      const subscription = subscriptions?.[0]

      if (!subscription) {
        return res.status(404).json({
          error: 'Nenhuma assinatura disponível para pagamento.'
        })
      }

      if (!subscription.next_due_date) {
        return res.status(409).json({
          error: 'A assinatura ainda não possui data de vencimento.'
        })
      }

      // -----------------------------------------------
      // EVITA DUPLICIDADE DE PAGAMENTO
      // -----------------------------------------------

      const { data: existingPayments, error: paymentFindError } =
        await supabase
          .from('payments')
          .select('id, status')
          .eq('subscription_id', subscription.id)
          .eq('due_date', subscription.next_due_date)
          .in('status', ['pending', 'under_review', 'confirmed'])
          .limit(1)

      if (paymentFindError) throw paymentFindError

      if (existingPayments?.length) {
        return res.status(409).json({
          error: 'Já existe um pagamento registrado para este vencimento.',
          payment_status: existingPayments[0].status
        })
      }

      // -----------------------------------------------
      // ENVIA ARQUIVO PARA O SUPABASE STORAGE
      // -----------------------------------------------

      const paymentId = crypto.randomUUID()

      uploadedFilePath = [
        companyId,
        subscription.id,
        `${paymentId}.${extension}`
      ].join('/')

      const { error: storageError } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .upload(
          uploadedFilePath,
          req.file.buffer,
          {
            contentType: req.file.mimetype,
            cacheControl: '3600',
            upsert: false
          }
        )

      if (storageError) throw storageError

      // -----------------------------------------------
      // REGISTRA PAGAMENTO NO BANCO
      // -----------------------------------------------

      const { data: payment, error: insertError } = await supabase
        .from('payments')
        .insert({
          id: paymentId,
          subscription_id: subscription.id,
          amount: subscription.monthly_price,
          due_date: subscription.next_due_date,
          payment_method: paymentMethod,
          receipt_file_path: uploadedFilePath,
          status: 'pending'
        })
        .select(`
          id,
          subscription_id,
          amount,
          due_date,
          payment_method,
          status,
          created_at
        `)
        .single()

      if (insertError) throw insertError

      uploadedFilePath = null

      return res.status(201).json({
        success: true,
        message: 'Comprovante enviado. Aguarde a análise administrativa.',
        payment
      })

    } catch (error) {
      if (uploadedFilePath) {
        await removeStorageFile(uploadedFilePath)
      }

      console.error(
        '[FOODCORE] Erro ao enviar comprovante:',
        error.message
      )

      return res.status(500).json({
        error: 'Não foi possível registrar o comprovante.'
      })
    }
  }
)

// =====================================================
// CHECKOUT PAGBANK - COMPATIBILIDADE LEGADA
// =====================================================

router.post('/checkout', async (req, res) => {
  try {
    const {
      planId,
      method,
      recurring = false,
      customer
    } = req.body || {}

    const plan = plans[planId]

    if (!plan) {
      return res.status(400).json({
        error: 'Plano inválido.'
      })
    }

    if (!['pix', 'card'].includes(method)) {
      return res.status(400).json({
        error: 'Método deve ser pix ou card.'
      })
    }

    if (!customer?.name || !customer?.email) {
      return res.status(400).json({
        error: 'Informe nome e e-mail do cliente.'
      })
    }

    const checkout = await createCheckout({
      plan,
      customer,
      method,
      recurring: Boolean(recurring)
    })

    return res.status(201).json({
      checkout
    })

  } catch (error) {
    console.error(
      '[FOODCORE] Erro ao criar checkout PagBank:',
      error.message
    )

    return res.status(error.status || 500).json({
      error: error.message || 'Não foi possível criar o checkout.'
    })
  }
})

// =====================================================
// WEBHOOK PAGBANK - REGISTRO NÃO PROCESSADO
// =====================================================

router.post('/webhook', async (req, res) => {
  try {
    const event = req.body || {}

    const db = await readStore()

    if (!Array.isArray(db.billingEvents)) {
      db.billingEvents = []
    }

    db.billingEvents.push({
      id: crypto.randomUUID(),
      receivedAt: new Date().toISOString(),
      eventType: event.type || event.event || 'unknown',
      reference: event.reference_id || null,
      processed: false
    })

    await writeStore(db)

    return res.status(202).json({
      received: true,
      processed: false
    })

  } catch (error) {
    console.error(
      '[FOODCORE] Erro ao registrar webhook PagBank:',
      error.message
    )

    return res.status(500).json({
      error: 'Não foi possível registrar o evento.'
    })
  }
})

// =====================================================
// EXPORTAÇÃO
// =====================================================

export default router
