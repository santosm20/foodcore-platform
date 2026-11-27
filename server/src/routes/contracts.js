
import { Router } from 'express'
import multer from 'multer'

import { supabase } from '../supabase.js'
import { requireCustomer } from '../middleware/customerAuth.js'

import {
  generateContractPdf,
  uploadSignedContract,
  getContractFile
} from '../services/contractService.js'

const router = Router()

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const MONTHLY_PRICE = 149.90
const MAX_FILE_SIZE = 10 * 1024 * 1024

const REGISTRATION_STATUS = {
  AWAITING_CONTRACT: 'awaiting_contract'
}

const CONTRACT_STATUS = {
  AWAITING_SIGNATURE: 'awaiting_signature',
  AWAITING_APPROVAL: 'awaiting_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
}

const PENDING_CONTRACT_STATUSES = [
  CONTRACT_STATUS.AWAITING_SIGNATURE,
  CONTRACT_STATUS.AWAITING_APPROVAL
]

// =====================================================
// UPLOAD DO CONTRATO ASSINADO
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 5
  },

  fileFilter: (_req, file, callback) => {
    const isPdf =
      file.mimetype === 'application/pdf' &&
      /\.pdf$/i.test(file.originalname)

    if (!isPdf) {
      return callback(
        new Error('Envie um arquivo PDF válido.')
      )
    }

    callback(null, true)
  }
})

function uploadSignedFile(req, res, next) {
  upload.single('contract')(req, res, error => {
    if (!error) {
      return next()
    }

    if (error instanceof multer.MulterError) {
      const isTooLarge = error.code === 'LIMIT_FILE_SIZE'

      return res.status(isTooLarge ? 413 : 400).json({
        error: isTooLarge
          ? 'O arquivo ultrapassa o limite de 10 MB.'
          : 'Não foi possível receber o arquivo.'
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

function getCompanyId(req) {
  return req.customer?.companyId || null
}

function safeFilename(value) {
  return String(value || 'foodcore')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 100)
}

function setPrivatePdfHeaders(res, filename, file) {
  res.setHeader('Content-Type', 'application/pdf')

  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"`
  )

  res.setHeader('Content-Length', file.length)

  res.setHeader(
    'Cache-Control',
    'private, no-store, no-cache, must-revalidate'
  )

  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function isSignatureError(error) {
  const message = String(error?.message || '').toLowerCase()

  return [
    'assinatura digital',
    'assinatura',
    'asn.1',
    'criptográfico',
    'pdf inválido',
    'arquivo pdf',
    'arquivo não é um pdf'
  ].some(term => message.includes(term))
}

function logRouteError(context, error) {
  console.error(
    `[FOODCORE] ${context}:`,
    error?.message || error
  )
}

function companyCanManageContract(company) {
  return (
    company?.registration_status ===
    REGISTRATION_STATUS.AWAITING_CONTRACT
  )
}

function contractResponse(contract) {
  if (!contract) {
    return null
  }

  return {
    id: contract.id,
    contract_number: contract.contract_number,
    status: contract.status
  }
}

async function getAuthenticatedCompany(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function getPendingContract(companyId) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('company_id', companyId)
    .in('status', PENDING_CONTRACT_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

// Todas as rotas exigem autenticação de cliente.
router.use(requireCustomer)

// =====================================================
// GERAR CONTRATO
// POST /api/contracts/generate
// =====================================================

router.post('/generate', async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const companyId = getCompanyId(req)

    if (!companyId) {
      return res.status(401).json({
        error: 'Empresa não identificada na sessão.'
      })
    }

    // -------------------------------------------------
    // 1. Identificar empresa autenticada
    // -------------------------------------------------

    const company = await getAuthenticatedCompany(companyId)

    if (!company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.'
      })
    }

    // -------------------------------------------------
    // 2. Validar etapa do fluxo comercial
    // -------------------------------------------------

    if (!companyCanManageContract(company)) {
      return res.status(409).json({
        error: 'Sua empresa não está na etapa de geração do contrato.',
        registration_status: company.registration_status
      })
    }

    // -------------------------------------------------
    // 3. Verificar contrato pendente
    // -------------------------------------------------

    let contract = await getPendingContract(companyId)

    if (contract?.status === CONTRACT_STATUS.AWAITING_APPROVAL) {
      return res.status(409).json({
        error: 'Seu contrato já foi enviado e está aguardando análise administrativa.',
        contract: contractResponse(contract)
      })
    }

    // -------------------------------------------------
    // 4. Criar contrato quando necessário
    // -------------------------------------------------

    if (!contract) {
      const contractNumber = `FC-${Date.now()}`

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          company_id: companyId,
          contract_number: contractNumber,
          monthly_price: MONTHLY_PRICE,
          status: CONTRACT_STATUS.AWAITING_SIGNATURE
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      contract = data
    }

    // -------------------------------------------------
    // 5. Gerar PDF
    // -------------------------------------------------

    const pdf = await generateContractPdf(company, contract)

    if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
      throw new Error(
        'Não foi possível gerar o PDF do contrato.'
      )
    }

    const filename = safeFilename(contract.contract_number)

    setPrivatePdfHeaders(
      res,
      `contrato-foodcore-${filename}.pdf`,
      pdf
    )

    return res.status(200).send(pdf)

  } catch (error) {
    logRouteError('Erro ao gerar contrato', error)

    return res.status(500).json({
      error: 'Não foi possível gerar o contrato.'
    })
  }
})

// =====================================================
// ENVIAR CONTRATO ASSINADO
// POST /api/contracts/signed
// =====================================================

router.post('/signed', uploadSignedFile, async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const companyId = getCompanyId(req)

    if (!companyId) {
      return res.status(401).json({
        error: 'Empresa não identificada na sessão.'
      })
    }

    // -------------------------------------------------
    // 1. Validar arquivo recebido
    // -------------------------------------------------

    if (!req.file?.buffer) {
      return res.status(400).json({
        error: 'Selecione o contrato PDF assinado.'
      })
    }

    // -------------------------------------------------
    // 2. Identificar empresa autenticada
    // -------------------------------------------------

    const company = await getAuthenticatedCompany(companyId)

    if (!company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.'
      })
    }

    // -------------------------------------------------
    // 3. Validar etapa contratual
    // -------------------------------------------------

    if (!companyCanManageContract(company)) {
      return res.status(409).json({
        error: 'Sua empresa não está autorizada a enviar um contrato nesta etapa.',
        registration_status: company.registration_status
      })
    }

    // -------------------------------------------------
    // 4. Localizar contrato aguardando assinatura
    // -------------------------------------------------

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, contract_number, status')
      .eq('company_id', companyId)
      .eq('status', CONTRACT_STATUS.AWAITING_SIGNATURE)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!contract) {
      return res.status(404).json({
        error: 'Não existe contrato aguardando assinatura.'
      })
    }

    // -------------------------------------------------
    // 5. Validar assinatura e armazenar arquivo
    // -------------------------------------------------

    const result = await uploadSignedContract(
      companyId,
      contract.id,
      req.file
    )

    return res.status(200).json({
      success: true,
      message: 'Contrato recebido. Aguarde a validação administrativa da assinatura digital.',
      contract: result
    })

  } catch (error) {
    logRouteError('Erro no envio do contrato', error)

    if (isSignatureError(error)) {
      return res.status(400).json({
        error: error.message
      })
    }

    return res.status(500).json({
      error: 'Não foi possível enviar o contrato assinado.'
    })
  }
})

// =====================================================
// CONSULTAR CONTRATO ATUAL
// GET /api/contracts/current
// =====================================================

router.get('/current', async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const companyId = getCompanyId(req)

    if (!companyId) {
      return res.status(401).json({
        error: 'Empresa não identificada na sessão.'
      })
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        id,
        contract_number,
        monthly_price,
        status,
        signed_at,
        created_at,
        approved_at
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    return res.status(200).json({
      success: true,
      contract
    })

  } catch (error) {
    logRouteError('Erro ao consultar contrato', error)

    return res.status(500).json({
      error: 'Não foi possível consultar o contrato.'
    })
  }
})

// =====================================================
// BAIXAR CONTRATO ASSINADO
// GET /api/contracts/signed/download
// =====================================================

router.get('/signed/download', async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const companyId = getCompanyId(req)

    if (!companyId) {
      return res.status(401).json({
        error: 'Empresa não identificada na sessão.'
      })
    }

    // Busca somente arquivos vinculados à empresa autenticada.
    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        signed_file_path,
        contract_number
      `)
      .eq('company_id', companyId)
      .not('signed_file_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!contract?.signed_file_path) {
      return res.status(404).json({
        error: 'Contrato assinado não encontrado.'
      })
    }

    // O serviço acessa o bucket privado.
    const file = await getContractFile(
      contract.signed_file_path
    )

    if (!Buffer.isBuffer(file) || file.length === 0) {
      throw new Error(
        'Arquivo do contrato indisponível.'
      )
    }

    const filename = safeFilename(contract.contract_number)

    setPrivatePdfHeaders(
      res,
      `contrato-assinado-${filename}.pdf`,
      file
    )

    return res.status(200).send(file)

  } catch (error) {
    logRouteError('Erro ao baixar contrato', error)

    return res.status(500).json({
      error: 'Não foi possível baixar o contrato.'
    })
  }
})

// =====================================================
// EXPORTAÇÃO
// =====================================================

export default router
