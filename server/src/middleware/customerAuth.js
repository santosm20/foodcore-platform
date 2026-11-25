
  import { supabase } from '../supabase.js'

  /**
   * Protege as rotas dos clientes.
   *
   * Valida o access_token pelo Supabase Auth,
   * carrega o perfil e consulta os dados atuais
   * da empresa vinculada.
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
      // =================================================
      // 1. VALIDA SESSÃO NO SUPABASE AUTH
      // =================================================

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser(token)

      if (authError || !user) {
        return res.status(401).json({
          error: 'Sessão inválida ou expirada.'
        })
      }

      // =================================================
      // 2. CONSULTA PERFIL DO CLIENTE
      // =================================================

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from('profiles')
        .select('id, company_id, full_name, email, role')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError || !profile) {
        return res.status(403).json({
          error: 'Perfil de cliente não encontrado.'
        })
      }

      if (
        profile.role !== 'customer' ||
        !profile.company_id
      ) {
        return res.status(403).json({
          error: 'Esta conta não possui acesso ao portal do cliente.'
        })
      }

      // =================================================
      // 3. CONSULTA ESTADO ATUAL DA EMPRESA
      // =================================================

      const {
        data: company,
        error: companyError
      } = await supabase
        .from('companies')
        .select(`
          id,
          status,
          registration_status,
          payment_link
        `)
        .eq('id', profile.company_id)
        .maybeSingle()

      if (companyError || !company) {
        console.error(
          '[FOODCORE] Erro ao consultar empresa:',
          companyError?.message
        )

        return res.status(403).json({
          error: 'Empresa vinculada não encontrada.'
        })
      }

      // =================================================
      // 4. DISPONIBILIZA DADOS PARA AS ROTAS
      // =================================================

      const registrationStatus = (
        company.registration_status || 'pending_review'
      ).toLowerCase()

      const companyStatus = (
        company.status || 'pending'
      ).toLowerCase()

      req.customer = {
        id: profile.id,
        companyId: company.id,
        fullName: profile.full_name,
        email: profile.email,
        role: profile.role,

        companyStatus,
        registrationStatus,

        // O link só fica disponível nas etapas de pagamento.
        paymentLink: [
          'awaiting_payment',
          'payment_under_review'
        ].includes(registrationStatus)
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
