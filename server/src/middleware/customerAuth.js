import { supabase } from '../supabase.js'

const CUSTOMER_PROFILE_SELECT = `
  id,
  company_id,
  full_name,
  email,
  role
`

const CUSTOMER_COMPANY_SELECT = `
  id,
  status,
  registration_status,
  payment_link
`

const PAYMENT_ACCESS_STATUSES = new Set([
  'awaiting_payment',
  'payment_under_review'
])

function normalizeStatus(value, fallback) {
  return String(value || fallback).trim().toLowerCase()
}

function unauthorized(res, status, error) {
  return res.status(status).json({ error })
}

/**
 * Valida a sessão Supabase e carrega o estado atual da empresa.
 *
 * O acesso ao portal não depende da situação da assinatura/licença:
 * clientes com cobrança rejeitada precisam continuar entrando para
 * consultar o motivo e enviar um novo comprovante.
 */
export async function requireCustomer(req, res, next) {
  if (!supabase) {
    return unauthorized(
      res,
      503,
      'Serviço de autenticação indisponível.'
    )
  }

  const authorization = req.headers.authorization || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return unauthorized(res, 401, 'Autenticação necessária.')
  }

  try {
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return unauthorized(res, 401, 'Sessão inválida ou expirada.')
    }

    const {
      data: profile,
      error: profileError
    } = await supabase
      .from('profiles')
      .select(CUSTOMER_PROFILE_SELECT)
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) throw profileError

    if (
      !profile ||
      profile.role !== 'customer' ||
      !profile.company_id
    ) {
      return unauthorized(
        res,
        403,
        'Esta conta não possui acesso ao portal do cliente.'
      )
    }

    const {
      data: company,
      error: companyError
    } = await supabase
      .from('companies')
      .select(CUSTOMER_COMPANY_SELECT)
      .eq('id', profile.company_id)
      .maybeSingle()

    if (companyError) throw companyError

    if (!company) {
      return unauthorized(
        res,
        403,
        'Empresa vinculada não encontrada.'
      )
    }

    const registrationStatus = normalizeStatus(
      company.registration_status,
      'pending_review'
    )

    const companyStatus = normalizeStatus(
      company.status,
      'pending'
    )

    req.customer = {
      id: profile.id,
      companyId: company.id,
      fullName: profile.full_name,
      email: profile.email,
      role: profile.role,
      companyStatus,
      registrationStatus,
      paymentLink: PAYMENT_ACCESS_STATUSES.has(registrationStatus)
        ? company.payment_link || null
        : null
    }

    return next()
  } catch (error) {
    console.error(
      '[FOODCORE] Erro na autenticação do cliente:',
      error?.message || error
    )

    return res.status(500).json({
      error: 'Não foi possível validar sua sessão.'
    })
  }
}
