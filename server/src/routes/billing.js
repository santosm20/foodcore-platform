
import { Router } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'

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

// 'suspended' é permitido somente para localizar a cobrança no portal
// e receber um novo comprovante após rejeição. A validação da licença
// continua recusando assinaturas suspensas.
const ALLOWED_SUBSCRIPTION_STATUSES = [
  'pending',
  'active',
  'past_due',
  'suspended'
]

// =====================================================
// VALIDAÇÃO DO ARQUIVO
// =====================================================

function validateFileSignature(buffer, mimetype) {
  if (!Buffer.isBuffer(buffer)) {
    return false
  }

  if (mimetype === 'application/pdf') {
    return buffer.subarray(0, 5).toString() === '%PDF-'
  }

  if (mimetype === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    )
  }

  if (mimetype === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([
          0x89, 0x50, 0x4e, 0x47,
          0x0d, 0x0a, 0x1a, 0x0a
        ])
      )
    )
  }

  return false
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

function handleReceiptUpload(req, res, next) {
  receiptUpload.single('receipt')(req, res, error => {
    if (!error) {
      return next()
    }

    if (error instanceof multer.MulterError) {
      const isTooLarge = error.code === 'LIMIT_FILE_SIZE'

      return res.status(isTooLarge ? 413 : 400).json({
        error: isTooLarge
          ? 'O comprovante ultrapassa o limite de 10 MB.'
          : 'Não foi possível receber o comprovante.'
      })
    }

    return res.status(400).json({
      error: error.message || 'Arquivo inválido.'
    })
  })
}

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function databaseUnavailable(res) {
  return res.status(503).json({
    error: 'Banco de dados indisponível.'
  })
}

function getCustomerCompanyId(req) {
  return req.customer?.companyId || null
}

function validPaymentMethod(method) {
  return ['pix', 'bank_transfer'].includes(method)
}

function getFileExtension(mimetype) {
  return ALLOWED_RECEIPT_TYPES[mimetype] || null
}

function createHttpError(message, statusCode = 500) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

async function removeStorageFile(filePath) {
  if (!supabase || !filePath) {
    return
  }

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

/**
 * Restaura a cobrança caso a atualização do cadastro
 * da empresa falhe depois do registro do comprovante.
 */
async function rollbackPayment(paymentId, existingPayment) {
  if (!paymentId) {
    return
  }

  if (existingPayment) {
    const { error } = await supabase
      .from('payments')
      .update({
        amount: existingPayment.amount,
        payment_method: existingPayment.payment_method,
        receipt_file_path: existingPayment.receipt_file_path,
        status: existingPayment.status,
        rejection_reason: existingPayment.rejection_reason,
        reviewed_by: existingPayment.reviewed_by,
        reviewed_at: existingPayment.reviewed_at,
        payment_date: existingPayment.payment_date
      })
      .eq('id', paymentId)
      .eq('status', 'under_review')

    if (error) {
      console.error(
        '[FOODCORE] Erro ao restaurar cobrança:',
        error.message
      )
    }

    return
  }

  const { error } = await supabase
    .from('payments')
    .delete()
    .eq('id', paymentId)
    .eq('status', 'under_review')

  if (error) {
    console.error(
      '[FOODCORE] Erro ao remover cobrança não confirmada:',
      error.message
    )
  }
}

// =====================================================
// ENVIO DE COMPROVANTE
// POST /api/billing/receipt
// =====================================================

router.post(
  '/receipt',
  requireCustomer,
  handleReceiptUpload,
  async (req, res) => {
    let uploadedFilePath = null
    let paymentId = null
    let paymentSaved = false
    let existingPayment = null

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

      const registrationStatus = req.customer.registrationStatus
      const companyStatus = req.customer.companyStatus

      // -------------------------------------------------
      // VALIDAR ETAPA DO CADASTRO
      // -------------------------------------------------

      if (companyStatus === 'suspended') {
        return res.status(403).json({
          error: 'Sua empresa está suspensa. Entre em contato com o suporte.'
        })
      }

      if (
        !['awaiting_payment', 'active'].includes(registrationStatus)
      ) {
        return res.status(409).json({
          error: 'Sua empresa não possui uma cobrança disponível para envio de comprovante.'
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

      if (!validateFileSignature(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
          error: 'O conteúdo do arquivo não corresponde ao formato informado.'
        })
      }

      // -------------------------------------------------
      // LOCALIZAR ASSINATURA
      // -------------------------------------------------

      const {
        data: subscription,
        error: subscriptionError
      } = await supabase
        .from('subscriptions')
        .select(`
          id,
          company_id,
          monthly_price,
          next_due_date,
          status
        `)
        .eq('company_id', companyId)
        .in('status', ALLOWED_SUBSCRIPTION_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (subscriptionError) {
        throw subscriptionError
      }

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

      const amount = Number(subscription.monthly_price)

      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(409).json({
          error: 'O valor da assinatura está inválido. Entre em contato com o suporte.'
        })
      }

      // -------------------------------------------------
      // LOCALIZAR COBRANÇA EXISTENTE
      // -------------------------------------------------

      const {
        data: foundPayment,
        error: paymentFindError
      } = await supabase
        .from('payments')
        .select(`
          id,
          subscription_id,
          amount,
          due_date,
          payment_method,
          receipt_file_path,
          status,
          rejection_reason,
          reviewed_by,
          reviewed_at,
          payment_date
        `)
        .eq('subscription_id', subscription.id)
        .eq('due_date', subscription.next_due_date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (paymentFindError) {
        throw paymentFindError
      }

      existingPayment = foundPayment

      // -------------------------------------------------
      // VERIFICAR SITUAÇÃO DA COBRANÇA
      // -------------------------------------------------

      if (existingPayment) {
        if (existingPayment.status === 'confirmed') {
          return res.status(409).json({
            error: 'Este vencimento já foi pago.'
          })
        }

        if (existingPayment.status === 'under_review') {
          return res.status(409).json({
            error: 'Seu comprovante já está em análise administrativa.'
          })
        }

        if (
          existingPayment.status === 'pending' &&
          existingPayment.receipt_file_path
        ) {
          return res.status(409).json({
            error: 'Já existe um comprovante enviado para esta cobrança.'
          })
        }

        if (!['pending', 'rejected'].includes(existingPayment.status)) {
          return res.status(409).json({
            error: 'Esta cobrança não permite o envio de comprovantes.'
          })
        }
      }

      // -------------------------------------------------
      // ENVIAR ARQUIVO AO STORAGE
      // -------------------------------------------------

      paymentId = existingPayment?.id || crypto.randomUUID()

      uploadedFilePath = [
        companyId,
        subscription.id,
        `${crypto.randomUUID()}.${extension}`
      ].join('/')

      const {
        error: storageError
      } = await supabase.storage
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

      if (storageError) {
        throw storageError
      }

      // -------------------------------------------------
      // REGISTRAR COMPROVANTE
      // -------------------------------------------------

      let payment

      if (existingPayment) {
        const {
          data,
          error: updateError
        } = await supabase
          .from('payments')
          .update({
            amount,
            payment_method: paymentMethod,
            receipt_file_path: uploadedFilePath,
            status: 'under_review',
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
            payment_date: null
          })
          .eq('id', existingPayment.id)
          .in('status', ['pending', 'rejected'])
          .select(`
            id,
            subscription_id,
            amount,
            due_date,
            payment_method,
            status,
            created_at
          `)
          .maybeSingle()

        if (updateError) {
          throw updateError
        }

        if (!data) {
          throw createHttpError(
            'A cobrança foi alterada por outra operação. Atualize a página e tente novamente.',
            409
          )
        }

        payment = data
      } else {
        const {
          data,
          error: insertError
        } = await supabase
          .from('payments')
          .insert({
            id: paymentId,
            subscription_id: subscription.id,
            amount,
            due_date: subscription.next_due_date,
            payment_method: paymentMethod,
            receipt_file_path: uploadedFilePath,
            status: 'under_review'
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

        if (insertError) {
          throw insertError
        }

        payment = data
      }

      paymentSaved = true

      // -------------------------------------------------
      // ATUALIZAR CADASTRO PARA ANÁLISE
      // -------------------------------------------------

      if (registrationStatus === 'awaiting_payment') {
        const {
          data: updatedCompany,
          error: companyUpdateError
        } = await supabase
          .from('companies')
          .update({
            registration_status: 'payment_under_review'
          })
          .eq('id', companyId)
          .eq('registration_status', 'awaiting_payment')
          .select('id')
          .maybeSingle()

        if (companyUpdateError) {
          throw companyUpdateError
        }

        if (!updatedCompany) {
          throw createHttpError(
            'O cadastro foi alterado durante o envio. Atualize a página e tente novamente.',
            409
          )
        }
      }

      // O arquivo e a cobrança foram registrados com sucesso.
      uploadedFilePath = null

      return res.status(201).json({
        success: true,
        message: 'Comprovante enviado. Aguarde a análise administrativa.',
        payment
      })

    } catch (error) {
      // -------------------------------------------------
      // REVERSÃO EM CASO DE FALHA
      // -------------------------------------------------

      if (paymentSaved) {
        await rollbackPayment(paymentId, existingPayment)
      }

      if (uploadedFilePath) {
        await removeStorageFile(uploadedFilePath)
      }

      console.error(
        '[FOODCORE] Erro ao enviar comprovante:',
        error?.message || error
      )

      return res.status(error.statusCode || 500).json({
        error: error.statusCode
          ? error.message
          : 'Não foi possível registrar o comprovante.'
      })
    }
  }
)

// =====================================================
// CHECKOUT PAGBANK LEGADO
// POST /api/billing/checkout
// =====================================================

router.post('/checkout', (_req, res) => {
  return res.status(410).json({
    error: 'Checkout automático indisponível.',
    message: 'A FOODCORE utiliza pagamento via PIX ou transferência, com aprovação administrativa.'
  })
})

// =====================================================
// WEBHOOK PAGBANK LEGADO
// POST /api/billing/webhook
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
      error?.message || error
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
