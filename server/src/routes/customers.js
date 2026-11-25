
import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  supabase,
  supabaseAuth
} from '../supabase.js'
import { requireCustomer } from '../middleware/customerAuth.js'

const router = Router()

// Limita tentativas de cadastro e login.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de cadastro. Tente novamente mais tarde.'
  }
})

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: 'Muitas tentativas de login. Tente novamente mais tarde.'
  }
})

// Normaliza textos.
function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

// Normaliza e-mail.
function normalizeEmail(value) {
  return clean(value).toLowerCase()
}

// CPF: mantém somente números.
function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '')
}

// CNPJ: permite números e letras.
function normalizeCnpj(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

// Valida CPF.
function isValidCpf(value) {
  const cpf = normalizeCpf(value)

  if (!/^\d{11}$/.test(cpf)) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0

  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i)
  }

  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0

  if (digit !== Number(cpf[9])) return false

  sum = 0

  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i)
  }

  digit = (sum * 10) % 11
  if (digit === 10) digit = 0

  return digit === Number(cpf[10])
}

// Converte os caracteres do CNPJ alfanumérico
// para os valores utilizados no cálculo dos dígitos.
function cnpjCharacterValue(character) {
  if (/[0-9]/.test(character)) {
    return Number(character)
  }

  return character.charCodeAt(0) - 48
}

// Calcula um dígito verificador de CNPJ.
function calculateCnpjDigit(base, weights) {
  const sum = base.reduce((total, character, index) => {
    return total + (
      cnpjCharacterValue(character) * weights[index]
    )
  }, 0)

  const remainder = sum % 11

  return remainder < 2 ? 0 : 11 - remainder
}

// Valida CNPJ numérico e alfanumérico.
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

  const base = cnpj.slice(0, 12)

  const firstDigit = calculateCnpjDigit(
    base.split(''),
    firstWeights
  )

  if (firstDigit !== Number(cnpj[12])) {
    return false
  }

  const secondDigit = calculateCnpjDigit(
    [...base.split(''), String(firstDigit)],
    secondWeights
  )

  return secondDigit === Number(cnpj[13])
}

// Validação básica de e-mail.
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Verifica se o Supabase está configurado.
function checkSupabase(res) {
  if (!supabase || !supabaseAuth) {
    res.status(503).json({
      error: 'Serviço de cadastro e autenticação indisponível.'
    })

    return false
  }

  return true
}

// Converte erros de duplicidade em respostas amigáveis.
function isDuplicateError(error) {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.code === '23505' ||
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('user already registered')
  )
}

// ==========================================
// CADASTRO DE EMPRESA E CLIENTE
// ==========================================

router.post('/register', registerLimiter, async (req, res) => {
  if (!checkSupabase(res)) return

  let authUserId = null
  let companyId = null

  try {
    const body = req.body || {}

    const legalName = clean(body.legal_name)
    const tradeName = clean(body.trade_name)
    const cnpj = normalizeCnpj(body.cnpj)
    const stateRegistration = clean(body.state_registration)
    const email = normalizeEmail(body.email)
    const phone = clean(body.phone)
    const postalCode = clean(body.postal_code).replace(/\D/g, '')
    const street = clean(body.street)
    const number = clean(body.number)
    const complement = clean(body.complement)
    const neighborhood = clean(body.neighborhood)
    const city = clean(body.city)
    const state = clean(body.state).toUpperCase()
    const representativeName = clean(body.representative_name)
    const representativeCpf = normalizeCpf(body.representative_cpf)
    const password = typeof body.password === 'string'
      ? body.password
      : ''

    // Campos obrigatórios.
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

    // Limites de tamanho.
    if (
      legalName.length > 200 ||
      tradeName.length > 200 ||
      representativeName.length > 150 ||
      email.length > 254 ||
      password.length > 128
    ) {
      return res.status(400).json({
        error: 'Um ou mais campos ultrapassaram o tamanho permitido.'
      })
    }

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

    // Verifica se o CNPJ já está cadastrado.
    const { data: existingCompany, error: searchError } = await supabase
      .from('companies')
      .select('id')
      .eq('cnpj', cnpj)
      .maybeSingle()

    if (searchError) {
      console.error(
        '[FOODCORE] Erro ao consultar CNPJ:',
        searchError.message
      )

      return res.status(500).json({
        error: 'Não foi possível verificar o CNPJ.'
      })
    }

    if (existingCompany) {
      return res.status(409).json({
        error: 'Este CNPJ já possui cadastro na FOODCORE.'
      })
    }

    // 1. Cria a conta no Supabase Auth.
    // email_confirm: true permite login sem confirmação por e-mail.
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

      console.error(
        '[FOODCORE] Erro ao criar usuário:',
        authError?.message
      )

      return res.status(400).json({
        error: 'Não foi possível criar a conta. Verifique os dados informados.'
      })
    }

    authUserId = authData.user.id

    // 2. Cria a empresa.
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
      status: 'pending'
    }

    const {
      data: company,
      error: companyError
    } = await supabase
      .from('companies')
      .insert(companyData)
      .select('id, legal_name, trade_name, cnpj, status')
      .single()

    if (companyError || !company) {
      throw Object.assign(
        new Error('Não foi possível registrar a empresa.'),
        { original: companyError }
      )
    }

    companyId = company.id

    // 3. Cria o perfil e vincula à empresa.
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
      throw Object.assign(
        new Error('Não foi possível criar o perfil do cliente.'),
        { original: profileError }
      )
    }

    // Cadastro concluído.
    return res.status(201).json({
      success: true,
      message: 'Cadastro realizado com sucesso. Você já pode entrar na sua conta.',
      customer: {
        id: authUserId,
        full_name: representativeName,
        email
      },
      company
    })

  } catch (error) {
    console.error(
      '[FOODCORE] Falha no cadastro:',
      error.message,
      error.original?.message || ''
    )

    // Compensação: remove os registros criados caso alguma
    // etapa posterior falhe.
    if (companyId) {
      const { error: rollbackCompanyError } = await supabase
        .from('companies')
        .delete()
        .eq('id', companyId)

      if (rollbackCompanyError) {
        console.error(
          '[FOODCORE] Falha ao desfazer cadastro da empresa:',
          rollbackCompanyError.message
        )
      }
    }

    if (authUserId) {
      const { error: rollbackUserError } = await supabase.auth.admin.deleteUser(
        authUserId
      )

      if (rollbackUserError) {
        console.error(
          '[FOODCORE] Falha ao desfazer usuário Auth:',
          rollbackUserError.message
        )
      }
    }

    if (error.original?.code === '23505') {
      return res.status(409).json({
        error: 'Já existe um cadastro com esses dados.'
      })
    }

    return res.status(500).json({
      error: 'O cadastro não pôde ser concluído. Tente novamente.'
    })
  }
})

// ==========================================
// LOGIN DO CLIENTE
// ==========================================

router.post('/login', loginLimiter, async (req, res) => {
  if (!checkSupabase(res)) return

  try {
    const email = normalizeEmail(req.body?.email)
    const password = typeof req.body?.password === 'string'
      ? req.body.password
      : ''

    if (!email || !password) {
      return res.status(400).json({
        error: 'Informe e-mail e senha.'
      })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'E-mail ou senha inválidos.'
      })
    }

    // Autentica com a chave publicável.
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

    // Busca o perfil do cliente.
    const {
      data: profile,
      error: profileError
    } = await supabase
      .from('profiles')
      .select('id, company_id, full_name, email, role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile || profile.role !== 'customer' || !profile.company_id) {
      return res.status(403).json({
        error: 'Esta conta não possui um perfil de cliente válido.'
      })
    }

    // Busca a situação da empresa.
    const {
      data: company,
      error: companyError
    } = await supabase
      .from('companies')
      .select('id, legal_name, trade_name, status')
      .eq('id', profile.company_id)
      .single()

    if (companyError || !company) {
      return res.status(403).json({
        error: 'Empresa vinculada à conta não encontrada.'
      })
    }

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
      company
    })

  } catch (error) {
    console.error(
      '[FOODCORE] Erro no login do cliente:',
      error.message
    )

    return res.status(500).json({
      error: 'Não foi possível realizar o login.'
    })
  }
})

// ==========================================
// DADOS DA CONTA AUTENTICADA
// ==========================================

router.get('/me', requireCustomer, async (req, res) => {
  return res.json({
    success: true,
    customer: req.customer
  })
})

export default router
