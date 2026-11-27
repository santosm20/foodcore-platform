
import { Router } from 'express'
import rateLimit from 'express-rate-limit'

import {
  supabase,
  supabaseAuth
} from '../supabase.js'

import { requireCustomer } from '../middleware/customerAuth.js'

const router = Router()

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const REGISTER_WINDOW_MS = 15 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000

const registerLimiter = rateLimit({
  windowMs: REGISTER_WINDOW_MS,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de cadastro. Tente novamente mais tarde.'
  }
})

const loginLimiter = rateLimit({
  windowMs: LOGIN_WINDOW_MS,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de login. Tente novamente mais tarde.'
  }
})

// =====================================================
// ESTADOS DO FLUXO COMERCIAL
// =====================================================

const REGISTRATION_STATUS = Object.freeze({
  PENDING_REVIEW: 'pending_review',
  AWAITING_CONTRACT: 'awaiting_contract',
  CONTRACT_APPROVED: 'contract_approved',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_UNDER_REVIEW: 'payment_under_review',
  ACTIVE: 'active',
  REJECTED: 'rejected'
})

// =====================================================
// NORMALIZAÇÃO
// =====================================================

function clean(value) {
  return typeof value === 'string'
    ? value.trim()
    : ''
}

function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeCnpj(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

// =====================================================
// VALIDAÇÃO DE CPF
// =====================================================

function isValidCpf(value) {
  const cpf = normalizeCpf(value)

  if (!/^\d{11}$/.test(cpf)) {
    return false
  }

  if (/^(\d)\1{10}$/.test(cpf)) {
    return false
  }

  let sum = 0

  for (let i = 0; i < 9; i += 1) {
    sum += Number(cpf[i]) * (10 - i)
  }

  let digit = (sum * 10) % 11

  if (digit === 10) {
    digit = 0
  }

  if (digit !== Number(cpf[9])) {
    return false
  }

  sum = 0

  for (let i = 0; i < 10; i += 1) {
    sum += Number(cpf[i]) * (11 - i)
  }

  digit = (sum * 10) % 11

  if (digit === 10) {
    digit = 0
  }

  return digit === Number(cpf[10])
}

// =====================================================
// VALIDAÇÃO DE CNPJ
// =====================================================

function cnpjCharacterValue(character) {
  if (/^\d$/.test(character)) {
    return Number(character)
  }

  return character.charCodeAt(0) - 48
}

function calculateCnpjDigit(base, weights) {
  const sum = base.reduce((total, character, index) => {
    return total + (
      cnpjCharacterValue(character) * weights[index]
    )
  }, 0)

  const remainder = sum % 11

  return remainder < 2
    ? 0
    : 11 - remainder
}

function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value)

  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) {
    return false
  }

  if (/^(\w)\1{13}$/.test(cnpj)) {
    return false
  }

  const firstWeights = [
    5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2
  ]

  const secondWeights = [
    6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2
  ]

  const base = cnpj.slice(0, 12).split('')

  const firstDigit = calculateCnpjDigit(
    base,
    firstWeights
  )

  if (firstDigit !== Number(cnpj[12])) {
    return false
  }

  const secondDigit = calculateCnpjDigit(
    [...base, String(firstDigit)],
    secondWeights
  )

  return secondDigit === Number(cnpj[13])
}

// =====================================================
// VALIDAÇÃO DE E-MAIL
// =====================================================

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// =====================================================
// SUPABASE
// =====================================================

function checkSupabase(res) {
  if (!supabase || !supabaseAuth) {
    res.status(503).json({
      error: 'Serviço de cadastro e autenticação indisponível.'
    })

    return false
  }

  return true
}

// =====================================================
// TRATAMENTO DE ERROS
// =====================================================

function logServerError(context, error) {
  console.error(
    `[FOODCORE] ${context}:`,
    error?.message || error
  )
}

function isDuplicateError(error) {
  const message = String(
    error?.message || ''
  ).toLowerCase()

  return (
    error?.code === '23505' ||
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('user already registered')
  )
}

// =====================================================
// COMPENSAÇÃO DE CADASTRO
// =====================================================

async function rollbackRegistration({
  authUserId,
  companyId
}) {
  if (!supabase) return

  if (authUserId) {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', authUserId)

    if (error) {
      logServerError(
        'Falha ao remover perfil durante rollback',
        error
      )
    }
  }

  if (companyId) {
    const { error } = await supabase
      .from('companies')
      .delete()
      .eq('id', companyId)

    if (error) {
      logServerError(
        'Falha ao remover empresa durante rollback',
        error
      )
    }
  }

  if (authUserId) {
    const { error } = await supabase.auth.admin.deleteUser(
      authUserId
    )

    if (error) {
      logServerError(
        'Falha ao remover usuário Auth durante rollback',
        error
      )
    }
  }
}

// =====================================================
// FLUXO COMERCIAL DO CLIENTE
// =====================================================

function getCustomerWorkflow(company) {
  const companyStatus = String(
    company?.status || ''
  ).toLowerCase()

  const registrationStatus = String(
    company?.registration_status ||
    REGISTRATION_STATUS.PENDING_REVIEW
  ).toLowerCase()

  // ---------------------------------------------------
  // EMPRESA SUSPENSA
  // ---------------------------------------------------

  if (
    companyStatus === 'suspended' ||
    registrationStatus === 'suspended'
  ) {
    return {
      status: 'suspended',
      message: 'Sua empresa está suspensa. Entre em contato com o suporte.',
      canAccessContract: false,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // CADASTRO REJEITADO
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.REJECTED
  ) {
    return {
      status: 'rejected',
      message: 'Seu cadastro não foi aprovado. Entre em contato com o suporte da FOODCORE.',
      canAccessContract: false,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // AGUARDANDO ANÁLISE CADASTRAL
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.PENDING_REVIEW
  ) {
    return {
      status: 'pending_review',
      message: 'Seu cadastro foi recebido e está aguardando análise da FOODCORE.',
      canAccessContract: false,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // LIBERADO PARA GERAR CONTRATO
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.AWAITING_CONTRACT
  ) {
    return {
      status: 'awaiting_contract',
      message: 'Seu cadastro foi aprovado. Agora você pode gerar e assinar seu contrato pelo gov.br.',
      canAccessContract: true,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // CONTRATO APROVADO, AGUARDANDO LINK
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.CONTRACT_APPROVED
  ) {
    return {
      status: 'contract_approved',
      message: 'Seu contrato foi aprovado. Aguarde a FOODCORE disponibilizar o link para pagamento.',
      canAccessContract: false,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // LINK DE PAGAMENTO LIBERADO
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.AWAITING_PAYMENT
  ) {
    return {
      status: 'awaiting_payment',
      message: 'Seu contrato foi aprovado e o link de pagamento está disponível. Realize o pagamento e envie o comprovante.',
      canAccessContract: false,
      canAccessPayment: true,
      canUploadReceipt: true,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // COMPROVANTE EM ANÁLISE
  // ---------------------------------------------------

  if (
    registrationStatus === REGISTRATION_STATUS.PAYMENT_UNDER_REVIEW
  ) {
    return {
      status: 'payment_under_review',
      message: 'Seu comprovante foi recebido e está aguardando confirmação administrativa.',
      canAccessContract: false,
      canAccessPayment: true,
      canUploadReceipt: false,
      canDownload: false
    }
  }

  // ---------------------------------------------------
  // EMPRESA ATIVA
  // ---------------------------------------------------

  if (
    companyStatus === 'active' &&
    registrationStatus === REGISTRATION_STATUS.ACTIVE
  ) {
    return {
      status: 'active',
      message: 'Pagamento confirmado. Sua licença está ativa e o download está liberado.',
      canAccessContract: false,
      canAccessPayment: false,
      canUploadReceipt: false,
      canDownload: true
    }
  }

  // ---------------------------------------------------
  // ESTADO DESCONHECIDO
  // ---------------------------------------------------

  return {
    status: 'pending_review',
    message: 'Seu cadastro está aguardando análise da FOODCORE.',
    canAccessContract: false,
    canAccessPayment: false,
    canUploadReceipt: false,
    canDownload: false
  }
}

// =====================================================
// SERIALIZAÇÃO DA EMPRESA
// =====================================================

function serializeCompany(company) {
  if (!company) return null

  const workflow = getCustomerWorkflow(company)

  return {
    id: company.id,
    legal_name: company.legal_name,
    trade_name: company.trade_name,
    cnpj: company.cnpj,
    status: company.status,
    registration_status:
      company.registration_status ||
      REGISTRATION_STATUS.PENDING_REVIEW,

    payment_link: workflow.canAccessPayment
      ? company.payment_link || null
      : null,

    created_at: company.created_at
  }
}

// =====================================================
// CONSULTA DA EMPRESA
// =====================================================

async function getCompanyById(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select(`
      id,
      legal_name,
      trade_name,
      cnpj,
      status,
      registration_status,
      payment_link,
      created_at
    `)
    .eq('id', companyId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

// Retorna somente os dados do pagamento mais recente da assinatura
// atual. O portal precisa do motivo quando o comprovante é rejeitado.
async function getLatestPaymentForCompany(companyId) {
  const {
    data: subscription,
    error: subscriptionError
  } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subscriptionError) throw subscriptionError
  if (!subscription) return null

  const {
    data: payment,
    error: paymentError
  } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      due_date,
      payment_method,
      status,
      rejection_reason,
      reviewed_at,
      created_at
    `)
    .eq('subscription_id', subscription.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (paymentError) throw paymentError
  return payment || null
}

// =====================================================
// CADASTRO DE EMPRESA E CLIENTE
// =====================================================

router.post(
  '/register',
  registerLimiter,
  async (req, res) => {
    if (!checkSupabase(res)) return

    let authUserId = null
    let companyId = null
    let registrationCompleted = false

    try {
      const body = req.body || {}

      const legalName = clean(body.legal_name)
      const tradeName = clean(body.trade_name)
      const cnpj = normalizeCnpj(body.cnpj)
      const stateRegistration = clean(body.state_registration)

      const email = normalizeEmail(body.email)
      const phone = clean(body.phone)

      const postalCode = clean(body.postal_code)
        .replace(/\D/g, '')

      const street = clean(body.street)
      const number = clean(body.number)
      const complement = clean(body.complement)
      const neighborhood = clean(body.neighborhood)
      const city = clean(body.city)
      const state = clean(body.state).toUpperCase()

      const representativeName = clean(
        body.representative_name
      )

      const representativeCpf = normalizeCpf(
        body.representative_cpf
      )

      const password = typeof body.password === 'string'
        ? body.password
        : ''

      // ---------------------------------------------
      // CAMPOS OBRIGATÓRIOS
      // ---------------------------------------------

      if (
        !legalName ||
        !cnpj ||
        !email ||
        !representativeName ||
        !representativeCpf ||
        !password
      ) {
        return res.status(400).json({
          error: 'Preencha todos os campos obrigatórios.'
        })
      }

      // ---------------------------------------------
      // LIMITES DOS CAMPOS
      // ---------------------------------------------

      const fields = [
        [legalName, 200],
        [tradeName, 200],
        [representativeName, 150],
        [email, 254],
        [password, 128],
        [phone, 30],
        [street, 200],
        [number, 30],
        [complement, 100],
        [neighborhood, 100],
        [city, 100],
        [stateRegistration, 30]
      ]

      const hasOversizedField = fields.some(
        ([value, maximum]) => value.length > maximum
      )

      if (hasOversizedField) {
        return res.status(400).json({
          error: 'Um ou mais campos ultrapassaram o tamanho permitido.'
        })
      }

      // ---------------------------------------------
      // VALIDAÇÕES
      // ---------------------------------------------

      if (!isValidEmail(email)) {
        return res.status(400).json({
          error: 'Informe um endereço de e-mail válido.'
        })
      }

      if (!isValidCnpj(cnpj)) {
        return res.status(400).json({
          error: 'CNPJ inválido.'
        })
      }

      if (!isValidCpf(representativeCpf)) {
        return res.status(400).json({
          error: 'CPF do representante inválido.'
        })
      }

      if (password.length < 8) {
        return res.status(400).json({
          error: 'A senha deve possuir pelo menos 8 caracteres.'
        })
      }

      if (state && !/^[A-Z]{2}$/.test(state)) {
        return res.status(400).json({
          error: 'Informe uma sigla de estado válida.'
        })
      }

      if (postalCode && postalCode.length !== 8) {
        return res.status(400).json({
          error: 'CEP inválido.'
        })
      }

      // ---------------------------------------------
      // VERIFICA DUPLICIDADE DE CNPJ
      // ---------------------------------------------

      const {
        data: existingCompany,
        error: searchError
      } = await supabase
        .from('companies')
        .select('id')
        .eq('cnpj', cnpj)
        .limit(1)
        .maybeSingle()

      if (searchError) {
        throw searchError
      }

      if (existingCompany) {
        return res.status(409).json({
          error: 'Este CNPJ já possui cadastro na FOODCORE.'
        })
      }

      // ---------------------------------------------
      // 1. CRIA USUÁRIO NO SUPABASE AUTH
      // ---------------------------------------------

      const {
        data: authData,
        error: authError
      } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: representativeName
        }
      })

      if (authError || !authData?.user) {
        if (isDuplicateError(authError)) {
          return res.status(409).json({
            error: 'Este e-mail já possui uma conta.'
          })
        }

        logServerError(
          'Erro ao criar usuário',
          authError
        )

        return res.status(400).json({
          error: 'Não foi possível criar a conta. Verifique os dados informados.'
        })
      }

      authUserId = authData.user.id

      // ---------------------------------------------
      // 2. CADASTRA EMPRESA
      // ---------------------------------------------

      const companyData = {
        legal_name: legalName,
        trade_name: tradeName || null,
        cnpj,
        state_registration: stateRegistration || null,
        email,
        phone: phone || null,
        postal_code: postalCode || null,
        street: street || null,
        number: number || null,
        complement: complement || null,
        neighborhood: neighborhood || null,
        city: city || null,
        state: state || null,
        representative_name: representativeName,
        representative_cpf: representativeCpf,

        status: 'pending',

        registration_status:
          REGISTRATION_STATUS.PENDING_REVIEW,

        payment_link: null
      }

      const {
        data: company,
        error: companyError
      } = await supabase
        .from('companies')
        .insert(companyData)
        .select(`
          id,
          legal_name,
          trade_name,
          cnpj,
          status,
          registration_status,
          payment_link,
          created_at
        `)
        .single()

      if (companyError || !company) {
        if (isDuplicateError(companyError)) {
          const duplicate = new Error(
            'Cadastro duplicado.'
          )

          duplicate.code = '23505'

          throw duplicate
        }

        throw companyError || new Error(
          'Falha ao cadastrar empresa.'
        )
      }

      companyId = company.id

      // ---------------------------------------------
      // 3. CRIA PERFIL DO CLIENTE
      // ---------------------------------------------

      const {
        error: profileError
      } = await supabase
        .from('profiles')
        .insert({
          id: authUserId,
          company_id: company.id,
          full_name: representativeName,
          email,
          role: 'customer'
        })

      if (profileError) {
        throw profileError
      }

      registrationCompleted = true

      // ---------------------------------------------
      // 4. RETORNO
      // ---------------------------------------------

      const workflow = getCustomerWorkflow(company)

      return res.status(201).json({
        success: true,
        message: 'Cadastro recebido com sucesso. Aguarde a análise da FOODCORE.',
        next_step: REGISTRATION_STATUS.PENDING_REVIEW,

        customer: {
          id: authUserId,
          full_name: representativeName,
          email
        },

        company: serializeCompany(company),

        workflow
      })
    } catch (error) {
      logServerError(
        'Falha no cadastro',
        error
      )

      if (!registrationCompleted) {
        await rollbackRegistration({
          authUserId,
          companyId
        })
      }

      if (isDuplicateError(error)) {
        return res.status(409).json({
          error: 'Já existe um cadastro com esses dados.'
        })
      }

      return res.status(500).json({
        error: 'O cadastro não pôde ser concluído. Tente novamente.'
      })
    }
  }
)

// =====================================================
// LOGIN DO CLIENTE
// =====================================================

router.post(
  '/login',
  loginLimiter,
  async (req, res) => {
    if (!checkSupabase(res)) return

    try {
      const email = normalizeEmail(
        req.body?.email
      )

      const password = typeof req.body?.password === 'string'
        ? req.body.password
        : ''

      if (!email || !password) {
        return res.status(400).json({
          error: 'Informe e-mail e senha.'
        })
      }

      if (!isValidEmail(email)) {
        return res.status(401).json({
          error: 'E-mail ou senha incorretos.'
        })
      }

      // ---------------------------------------------
      // AUTENTICAÇÃO
      // ---------------------------------------------

      const {
        data,
        error
      } = await supabaseAuth.auth.signInWithPassword({
        email,
        password
      })

      if (error || !data?.user || !data?.session) {
        return res.status(401).json({
          error: 'E-mail ou senha incorretos.'
        })
      }

      // ---------------------------------------------
      // CONSULTA PERFIL
      // ---------------------------------------------

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from('profiles')
        .select(`
          id,
          company_id,
          full_name,
          email,
          role
        `)
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileError) {
        throw profileError
      }

      if (
        !profile ||
        profile.role !== 'customer' ||
        !profile.company_id
      ) {
        return res.status(403).json({
          error: 'Esta conta não possui um perfil de cliente válido.'
        })
      }

      // ---------------------------------------------
      // CONSULTA EMPRESA
      // ---------------------------------------------

      const company = await getCompanyById(
        profile.company_id
      )

      if (!company) {
        return res.status(403).json({
          error: 'Empresa vinculada à conta não encontrada.'
        })
      }

      // ---------------------------------------------
      // RETORNO DA SESSÃO
      // ---------------------------------------------

      return res.json({
        success: true,
        message: 'Login realizado com sucesso.',

        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_in: data.session.expires_in,
          token_type: data.session.token_type
        },

        customer: {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
          role: profile.role
        },

        company: serializeCompany(company),

        workflow: getCustomerWorkflow(company)
      })
    } catch (error) {
      logServerError(
        'Erro no login do cliente',
        error
      )

      return res.status(500).json({
        error: 'Não foi possível realizar o login.'
      })
    }
  }
)

// =====================================================
// DADOS ATUALIZADOS DA CONTA AUTENTICADA
// =====================================================

router.get(
  '/me',
  requireCustomer,
  async (req, res) => {
    if (!supabase) {
      return res.status(503).json({
        error: 'Serviço temporariamente indisponível.'
      })
    }

    try {
      const companyId = (
        req.customer?.companyId ||
        req.customer?.company_id
      )

      if (!companyId) {
        return res.status(403).json({
          error: 'Empresa vinculada à conta não encontrada.'
        })
      }

      // Consulta o estado atual diretamente no banco.
      const company = await getCompanyById(companyId)

      if (!company) {
        return res.status(404).json({
          error: 'Empresa vinculada à conta não encontrada.'
        })
      }

      const [latestPayment] = await Promise.all([
        getLatestPaymentForCompany(companyId)
      ])

      const workflow = getCustomerWorkflow(company)

      return res.json({
        success: true,

        customer: {
          ...req.customer,
          latestPayment
        },

        company: serializeCompany(company),

        workflow,

        latestPayment
      })
    } catch (error) {
      logServerError(
        'Erro ao consultar conta',
        error
      )

      return res.status(500).json({
        error: 'Não foi possível consultar os dados da conta.'
      })
    }
  }
)

// =====================================================
// EXPORTAÇÃO
// =====================================================

export default router
