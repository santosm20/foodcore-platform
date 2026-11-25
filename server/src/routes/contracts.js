
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const isPdf =
      file.mimetype === 'application/pdf' &&
      file.originalname.toLowerCase().endsWith('.pdf')

    if (!isPdf) {
      return callback(new Error('Envie um arquivo PDF válido.'))
    }

    callback(null, true)
  }
})

// Trata erros de upload antes de chegar às rotas.
function uploadSignedFile(req, res, next) {
  upload.single('contract')(req, res, error => {
    if (!error) {
      return next()
    }

    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400

      return res.status(status).json({
        error: status === 413
          ? 'O arquivo ultrapassa o limite de 10 MB.'
          : 'Não foi possível receber o arquivo.'
      })
    }

    return res.status(400).json({
      error: error.message || 'Arquivo inválido.'
    })
  })
}

router.use(requireCustomer)

// Gera ou recupera o contrato aguardando assinatura.
router.post('/generate', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: 'Banco de dados indisponível.'
      })
    }

    const companyId = req.customer.companyId

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (companyError || !company) {
      return res.status(404).json({
        error: 'Empresa não encontrada.'
      })
    }

    const { data: existingContract, error: contractError } = await supabase
      .from('contracts')
      .select('*')
      .eq('company_id', companyId)
      .in('status', ['awaiting_signature', 'awaiting_approval'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (contractError) {
      throw contractError
    }

    if (existingContract?.status === 'awaiting_approval') {
      return res.status(409).json({
        error: 'Seu contrato já foi enviado e está aguardando análise.'
      })
    }

    let contract = existingContract

    if (!contract) {
      const contractNumber = `FC-${Date.now()}`

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          company_id: companyId,
          contract_number: contractNumber,
          monthly_price: 149.90,
          status: 'awaiting_signature'
        })
        .select('*')
        .single()

      if (error) throw error

      contract = data
    }

    const pdf = await generateContractPdf(company, contract)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contrato-foodcore-${contract.contract_number}.pdf"`
    )

    return res.send(pdf)

  } catch (error) {
    console.error('[FOODCORE] Erro ao gerar contrato:', error.message)

    return res.status(500).json({
      error: 'Não foi possível gerar o contrato.'
    })
  }
})

// Recebe o contrato assinado digitalmente.
router.post('/signed', uploadSignedFile, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        error: 'Banco de dados indisponível.'
      })
    }

    const companyId = req.customer.companyId

    if (!req.file) {
      return res.status(400).json({
        error: 'Selecione o contrato PDF assinado.'
      })
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, contract_number, status')
      .eq('company_id', companyId)
      .eq('status', 'awaiting_signature')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!contract) {
      return res.status(404).json({
        error: 'Não existe contrato aguardando assinatura.'
      })
    }

    const result = await uploadSignedContract(
      companyId,
      contract.id,
      req.file
    )

    return res.status(200).json({
      success: true,
      message: 'Documento recebido. Aguarde a validação administrativa da assinatura digital.',
      contract: result
    })

  } catch (error) {
    console.error('[FOODCORE] Erro no envio do contrato:', error.message)

    if (
      error.message.includes('Assinatura digital') ||
      error.message.includes('assinatura') ||
      error.message.includes('ASN.1') ||
      error.message.includes('criptográfico') ||
      error.message.includes('PDF')
    ) {
      return res.status(400).json({
        error: error.message
      })
    }

    return res.status(500).json({
      error: 'Não foi possível enviar o contrato assinado.'
    })
  }
})

// Consulta o contrato mais recente da empresa.
router.get('/current', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select(
        'id, contract_number, monthly_price, status, signed_at, created_at'
      )
      .eq('company_id', req.customer.companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    return res.json({
      success: true,
      contract: data
    })

  } catch (error) {
    console.error('[FOODCORE] Erro ao consultar contrato:', error.message)

    return res.status(500).json({
      error: 'Não foi possível consultar o contrato.'
    })
  }
})

// Baixa a cópia assinada da própria empresa.
router.get('/signed/download', async (req, res) => {
  try {
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('signed_file_path, contract_number')
      .eq('company_id', req.customer.companyId)
      .not('signed_file_path', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (!contract?.signed_file_path) {
      return res.status(404).json({
        error: 'Contrato assinado não encontrado.'
      })
    }

    const file = await getContractFile(contract.signed_file_path)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="contrato-assinado-${contract.contract_number}.pdf"`
    )

    return res.send(file)

  } catch (error) {
    console.error('[FOODCORE] Erro ao baixar contrato:', error.message)

    return res.status(500).json({
      error: 'Não foi possível baixar o contrato.'
    })
  }
})

export default router
