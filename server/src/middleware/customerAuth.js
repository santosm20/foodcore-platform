
import { supabase } from '../supabase.js'

/**
 * Protege as rotas dos clientes.
 *
 * Recebe o access_token emitido pelo Supabase Auth,
 * valida a sessão e carrega o perfil da empresa.
 */
export async function requireCustomer(req, res, next) {
  if (!supabase) {
    return res.status(503).json({
      error: 'Serviço de autenticação indisponível.'
    })
  }

  const authorization = req.headers.authorization || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return res.status(401).json({
      error: 'Autenticação necessária.'
    })
  }

  try {
    // Valida o token diretamente com o Supabase Auth.
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({
        error: 'Sessão inválida ou expirada.'
      })
    }

    // Busca o perfil vinculado ao usuário autenticado.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_id, full_name, email, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return res.status(403).json({
        error: 'Perfil de cliente não encontrado.'
      })
    }

    if (profile.role !== 'customer' || !profile.company_id) {
      return res.status(403).json({
        error: 'Esta conta não possui acesso ao portal do cliente.'
      })
    }

    // Confirma que a empresa vinculada ainda existe.
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, status')
      .eq('id', profile.company_id)
      .single()

    if (companyError || !company) {
      return res.status(403).json({
        error: 'Empresa vinculada não encontrada.'
      })
    }

    // Disponibiliza os dados nas próximas rotas.
    req.customer = {
      id: profile.id,
      companyId: profile.company_id,
      fullName: profile.full_name,
      email: profile.email,
      role: profile.role,
      companyStatus: company.status
    }

    return next()
  } catch (error) {
    console.error(
      '[FOODCORE] Erro na autenticação do cliente:',
      error.message
    )

    return res.status(500).json({
      error: 'Não foi possível validar sua sessão.'
    })
  }
}
