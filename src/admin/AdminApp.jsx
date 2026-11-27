
import React, { useCallback, useEffect, useState } from 'react'

import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  FileCheck,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Building2,
  Download,
  Check,
  X,
  Eye,
  AlertCircle,
  Receipt,
  CreditCard,
  Users,
  Link2,
  Copy,
  UserRound,
  MapPin,
  CalendarDays
} from 'lucide-react'

import './admin.css'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const API = 'https://foodcore-api.onrender.com/api'

const REGISTRATION_STATUS = {
  PENDING_REVIEW: 'pending_review',
  AWAITING_CONTRACT: 'awaiting_contract',
  CONTRACT_APPROVED: 'contract_approved',
  AWAITING_PAYMENT: 'awaiting_payment',
  PAYMENT_UNDER_REVIEW: 'payment_under_review',
  ACTIVE: 'active',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
}

const PAYMENT_LINK_ALLOWED_STATUSES = [
  REGISTRATION_STATUS.CONTRACT_APPROVED,
  REGISTRATION_STATUS.AWAITING_PAYMENT
]

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatDate(value) {
  if (!value) return '-'

  const date = new Date(
    String(value).length === 10 ? `${value}T12:00:00` : value
  )

  if (Number.isNaN(date.getTime())) return '-'

  return date.toLocaleString('pt-BR')
}

function formatCpf(value) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length !== 11) return value || '-'

  return digits.replace(
    /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
    '$1.$2.$3-$4'
  )
}

function formatCnpj(value) {
  const raw = String(value || '').toUpperCase()
  const digits = raw.replace(/\D/g, '')

  if (digits.length === 14) {
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      '$1.$2.$3/$4-$5'
    )
  }

  return raw || '-'
}

function getCompanyName(company) {
  return (
    company?.trade_name ||
    company?.legal_name ||
    'Empresa não identificada'
  )
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback
}

function getRegistrationStatusLabel(status) {
  const labels = {
    pending_review: 'Aguardando análise cadastral',
    awaiting_contract: 'Aguardando contrato assinado',
    contract_approved: 'Contrato aprovado',
    awaiting_payment: 'Aguardando pagamento',
    payment_under_review: 'Pagamento em análise',
    active: 'Ativo',
    rejected: 'Rejeitado',
    suspended: 'Suspenso'
  }

  return labels[status] || status || 'Não informado'
}

function canReleasePaymentLink(company) {
  return PAYMENT_LINK_ALLOWED_STATUSES.includes(
    company?.registration_status
  )
}

function DetailItem({ label, value }) {
  return (
    <div>
      <small>{label}</small>
      <b>{value || '-'}</b>
    </div>
  )
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function AdminApp() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem('foodcore_admin_token') || ''
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('1.0.0')
  const [notes, setNotes] = useState('')

  const [releases, setReleases] = useState([])
  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])

  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  const [busy, setBusy] = useState(false)

  const [loadingReleases, setLoadingReleases] = useState(false)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)

  const [selectedContract, setSelectedContract] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(null)
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const [customerSubscriptions, setCustomerSubscriptions] = useState([])
  const [customerPaymentLink, setCustomerPaymentLink] = useState('')

  const [loadingCustomerDetails, setLoadingCustomerDetails] = useState(false)

  const [rejectionReason, setRejectionReason] = useState('')
  const [paymentRejectionReason, setPaymentRejectionReason] = useState('')
  const [customerRejectionReason, setCustomerRejectionReason] = useState('')

  // =====================================================
  // MENSAGENS
  // =====================================================

  const showMessage = useCallback((text, type = 'success') => {
    setMessage(text)
    setMessageType(type)
  }, [])

  // =====================================================
  // AUTENTICAÇÃO E REQUISIÇÕES
  // =====================================================

  const logout = useCallback(() => {
    sessionStorage.removeItem('foodcore_admin_token')

    setToken('')
    setReleases([])
    setContracts([])
    setPayments([])
    setCustomers([])

    setSelectedContract(null)
    setSelectedPayment(null)
    setSelectedCustomer(null)

    setCustomerSubscriptions([])
    setCustomerPaymentLink('')

    setMessage('')
  }, [])

  const request = useCallback(async (path, options = {}) => {
    const currentToken = sessionStorage.getItem('foodcore_admin_token') || token

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(currentToken
          ? { Authorization: `Bearer ${currentToken}` }
          : {})
      }
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 401 && currentToken) {
        logout()
      }

      throw new Error(
        data.error || 'Não foi possível concluir a solicitação.'
      )
    }

    return data
  }, [token, logout])

  async function downloadFile(path, filename, errorMessage) {
    const currentToken = sessionStorage.getItem('foodcore_admin_token') || token

    const response = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${currentToken}`
      }
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))

      if (response.status === 401) {
        logout()
      }

      throw new Error(data.error || errorMessage)
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = filename

    document.body.appendChild(link)
    link.click()
    link.remove()

    window.setTimeout(() => {
      window.URL.revokeObjectURL(url)
    }, 1000)
  }

  // =====================================================
  // CARREGAMENTO DOS DADOS
  // =====================================================

  async function loadReleases() {
    setLoadingReleases(true)

    try {
      const data = await request('/admin/releases')
      setReleases(Array.isArray(data.releases) ? data.releases : [])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Erro ao carregar versões.'),
        'error'
      )
    } finally {
      setLoadingReleases(false)
    }
  }

  async function loadContracts() {
    setLoadingContracts(true)

    try {
      const data = await request('/admin/contracts')
      setContracts(Array.isArray(data.contracts) ? data.contracts : [])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Erro ao carregar contratos.'),
        'error'
      )
    } finally {
      setLoadingContracts(false)
    }
  }

  async function loadPayments() {
    setLoadingPayments(true)

    try {
      const data = await request('/admin/payments')
      setPayments(Array.isArray(data.payments) ? data.payments : [])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Erro ao carregar pagamentos.'),
        'error'
      )
    } finally {
      setLoadingPayments(false)
    }
  }

  async function loadCustomers() {
    setLoadingCustomers(true)

    try {
      const data = await request('/admin/customers/pending')
      setCustomers(Array.isArray(data.customers) ? data.customers : [])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Erro ao carregar cadastros.'),
        'error'
      )
    } finally {
      setLoadingCustomers(false)
    }
  }

  async function loadDashboard() {
    await Promise.all([
      loadReleases(),
      loadContracts(),
      loadPayments(),
      loadCustomers()
    ])
  }

  useEffect(() => {
    if (token) {
      loadDashboard()
    }
  }, [token])

  // =====================================================
  // LOGIN
  // =====================================================

  async function login(event) {
    event.preventDefault()

    if (busy) return

    setBusy(true)
    setMessage('')

    try {
      const data = await request('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      })

      if (!data.token) {
        throw new Error('O servidor não retornou um token de acesso.')
      }

      sessionStorage.setItem('foodcore_admin_token', data.token)

      setToken(data.token)
      setPassword('')
      showMessage('Acesso administrativo autorizado.')
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Não foi possível realizar o login.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  // =====================================================
  // CADASTROS DE CLIENTES
  // =====================================================

  async function openCustomer(customer) {
    setSelectedCustomer(customer)
    setCustomerPaymentLink(customer.payment_link || '')
    setCustomerSubscriptions([])
    setCustomerRejectionReason('')
    setLoadingCustomerDetails(true)
    setMessage('')

    try {
      const data = await request(`/admin/customers/${customer.id}`)

      const company = data.company || customer

      setSelectedCustomer(company)
      setCustomerPaymentLink(company.payment_link || '')
      setCustomerSubscriptions(
        Array.isArray(data.subscriptions) ? data.subscriptions : []
      )
    } catch (error) {
      showMessage(
        getErrorMessage(
          error,
          'Não foi possível carregar os dados da empresa.'
        ),
        'error'
      )
    } finally {
      setLoadingCustomerDetails(false)
    }
  }

  function closeCustomer() {
    if (busy) return

    setSelectedCustomer(null)
    setCustomerSubscriptions([])
    setCustomerPaymentLink('')
    setCustomerRejectionReason('')
  }

  async function decideCustomer(decision) {
    if (!selectedCustomer || busy) return

    if (
      decision === 'approve' &&
      !window.confirm(
        'Confirma a aprovação do cadastro? A empresa será liberada para a etapa de geração e assinatura do contrato.'
      )
    ) {
      return
    }

    if (
      decision === 'reject' &&
      customerRejectionReason.trim().length < 5
    ) {
      showMessage(
        'Informe uma justificativa com pelo menos 5 caracteres.',
        'error'
      )
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const data = await request(
        `/admin/customers/${selectedCustomer.id}/decision`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            decision,
            reason: decision === 'reject'
              ? customerRejectionReason.trim()
              : ''
          })
        }
      )

      showMessage(
        data.message ||
        (decision === 'approve'
          ? 'Cadastro aprovado. A empresa poderá seguir para a etapa contratual.'
          : 'Cadastro rejeitado.')
      )

      setSelectedCustomer(null)
      setCustomerSubscriptions([])
      setCustomerPaymentLink('')
      setCustomerRejectionReason('')

      await Promise.all([
        loadCustomers(),
        loadContracts()
      ])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Não foi possível processar o cadastro.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function saveCustomerPaymentLink(event) {
    event.preventDefault()

    if (!selectedCustomer || busy) return

    if (!canReleasePaymentLink(selectedCustomer)) {
      showMessage(
        'O link de pagamento só pode ser liberado depois da aprovação do contrato assinado.',
        'error'
      )
      return
    }

    const paymentLink = customerPaymentLink.trim()

    if (!paymentLink) {
      showMessage('Informe o link de pagamento.', 'error')
      return
    }

    if (paymentLink.length > 2048) {
      showMessage(
        'O link ultrapassa o limite de 2.048 caracteres.',
        'error'
      )
      return
    }

    try {
      const parsedUrl = new URL(paymentLink)

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Protocolo inválido.')
      }
    } catch {
      showMessage(
        'Informe um endereço válido iniciado por http:// ou https://.',
        'error'
      )
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const data = await request(
        `/admin/customers/${selectedCustomer.id}/payment-link`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            payment_link: paymentLink
          })
        }
      )

      showMessage(
        data.message || 'Link de pagamento vinculado com sucesso.'
      )

      const refreshed = await request(
        `/admin/customers/${selectedCustomer.id}`
      )

      const company = refreshed.company || {
        ...selectedCustomer,
        payment_link: paymentLink
      }

      setSelectedCustomer(company)
      setCustomerPaymentLink(company.payment_link || paymentLink)

      setCustomerSubscriptions(
        Array.isArray(refreshed.subscriptions)
          ? refreshed.subscriptions
          : []
      )

      await Promise.all([
        loadCustomers(),
        loadPayments()
      ])
    } catch (error) {
      showMessage(
        getErrorMessage(
          error,
          'Não foi possível vincular o link de pagamento.'
        ),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function copyPaymentLink() {
    if (!customerPaymentLink) return

    try {
      await navigator.clipboard.writeText(customerPaymentLink)
      showMessage('Link copiado para a área de transferência.')
    } catch {
      showMessage(
        'Não foi possível copiar automaticamente. Selecione e copie o link.',
        'error'
      )
    }
  }

  // =====================================================
  // PUBLICAÇÃO DE VERSÕES
  // =====================================================

  async function upload(event) {
    event.preventDefault()

    if (busy) return

    if (!file) {
      showMessage('Selecione o instalador .exe primeiro.', 'error')
      return
    }

    if (!version.trim()) {
      showMessage('Informe a versão do instalador.', 'error')
      return
    }

    const form = new FormData()

    form.append('installer', file)
    form.append('version', version.trim())
    form.append('notes', notes.trim())

    setBusy(true)
    setMessage('')

    try {
      const data = await request('/admin/releases', {
        method: 'POST',
        body: form
      })

      showMessage(
        `Versão ${data.release?.version || version} publicada com sucesso.`
      )

      setFile(null)
      setVersion('1.0.0')
      setNotes('')

      event.target.reset()

      await loadReleases()
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Não foi possível publicar a versão.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  // =====================================================
  // CONTRATOS
  // =====================================================

  async function downloadContract(contract) {
    if (busy) return

    setBusy(true)
    setMessage('')

    try {
      await downloadFile(
        `/admin/contracts/${contract.id}/signed/download`,
        `contrato-assinado-${contract.contract_number || contract.id}.pdf`,
        'Falha ao baixar o contrato.'
      )

      showMessage('Download do contrato iniciado.')
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Falha ao baixar o contrato.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function decideContract(decision) {
    if (!selectedContract || busy) return

    if (
      decision === 'approve' &&
      !window.confirm(
        'Confirma a aprovação? Você já verificou a assinatura digital no VALIDAR do ITI?'
      )
    ) {
      return
    }

    if (
      decision === 'reject' &&
      rejectionReason.trim().length < 5
    ) {
      showMessage(
        'Informe uma justificativa com pelo menos 5 caracteres.',
        'error'
      )
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const data = await request(
        `/admin/contracts/${selectedContract.id}/decision`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            decision,
            reason: decision === 'reject'
              ? rejectionReason.trim()
              : ''
          })
        }
      )

      showMessage(
        data.message ||
        (decision === 'approve'
          ? 'Contrato aprovado. A empresa poderá receber o link de pagamento.'
          : 'Contrato rejeitado. O cliente poderá enviar uma versão corrigida.')
      )

      setSelectedContract(null)
      setRejectionReason('')

      await Promise.all([
        loadContracts(),
        loadPayments(),
        loadCustomers()
      ])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Não foi possível processar o contrato.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  // =====================================================
  // PAGAMENTOS
  // =====================================================

  async function downloadPaymentReceipt(payment) {
    if (busy) return

    setBusy(true)
    setMessage('')

    try {
      await downloadFile(
        `/admin/payments/${payment.id}/receipt/download`,
        `comprovante-pagamento-${payment.id}`,
        'Falha ao baixar o comprovante.'
      )

      showMessage('Download do comprovante iniciado.')
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Falha ao baixar o comprovante.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  async function decidePayment(decision) {
    if (!selectedPayment || busy) return

    if (
      decision === 'approve' &&
      !window.confirm(
        'Confirma que o pagamento foi recebido e que o comprovante foi conferido? A licença do cliente será ativada ou renovada.'
      )
    ) {
      return
    }

    if (
      decision === 'reject' &&
      paymentRejectionReason.trim().length < 5
    ) {
      showMessage(
        'Informe uma justificativa com pelo menos 5 caracteres.',
        'error'
      )
      return
    }

    setBusy(true)
    setMessage('')

    try {
      const data = await request(
        `/admin/payments/${selectedPayment.id}/decision`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            decision,
            reason: decision === 'reject'
              ? paymentRejectionReason.trim()
              : ''
          })
        }
      )

      showMessage(
        data.message ||
        (decision === 'approve'
          ? 'Pagamento aprovado.'
          : 'Pagamento rejeitado.')
      )

      setSelectedPayment(null)
      setPaymentRejectionReason('')

      await Promise.all([
        loadPayments(),
        loadCustomers()
      ])
    } catch (error) {
      showMessage(
        getErrorMessage(error, 'Não foi possível processar o pagamento.'),
        'error'
      )
    } finally {
      setBusy(false)
    }
  }

  // =====================================================
  // LOGIN
  // =====================================================

  if (!token) {
    return (
      <main className="admin-shell">
        <div className="admin-login">
          <a className="admin-back" href="/">
            <ArrowLeft size={16} />
            Voltar ao site
          </a>

          <div className="admin-brand">
            <span>F</span>
            <div>
              <b>FOODCORE</b>
              <small>ADMIN CONSOLE</small>
            </div>
          </div>

          <div className="admin-login-card">
            <div className="admin-icon">
              <ShieldCheck />
            </div>

            <h1>Painel administrativo</h1>

            <p>
              Acesse para gerenciar cadastros, contratos,
              pagamentos, licenças e distribuição do ERP.
            </p>

            <form onSubmit={login}>
              <label>E-mail administrativo</label>

              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="username"
                required
                placeholder="admin@foodcore.com.br"
              />

              <label>Senha</label>

              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                placeholder="Sua senha"
              />

              <button type="submit" disabled={busy}>
                {busy ? 'Entrando...' : 'Entrar no painel'}
              </button>
            </form>

            {message && (
              <div className="admin-message error">
                {message}
              </div>
            )}

            <small className="admin-hint">
              Acesso configurado no servidor por variáveis de ambiente.
            </small>
          </div>
        </div>
      </main>
    )
  }

  // =====================================================
  // PAINEL ADMINISTRATIVO
  // =====================================================

  return (
    <main className="admin-shell">
      <header className="admin-top">
        <a className="admin-brand" href="/">
          <span>F</span>
          <div>
            <b>FOODCORE</b>
            <small>ADMIN CONSOLE</small>
          </div>
        </a>

        <div className="admin-top-right">
          <span>
            <i />
            API conectada
          </span>

          <button onClick={logout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </header>

      <div className="admin-content">
        <div className="admin-heading">
          <div>
            <div className="admin-kicker">
              CENTRAL DE CONTROLE
            </div>

            <h1>Painel administrativo</h1>

            <p>
              Gerencie cadastros, contratos, pagamentos e atualizações
              do FOODCORE ERP.
            </p>
          </div>

          <div className="admin-secure">
            <ShieldCheck />
            Ambiente protegido
          </div>
        </div>

        {message && (
          <div className={`admin-message ${messageType === 'error' ? 'error' : ''}`}>
            {messageType === 'error'
              ? <AlertCircle size={17} />
              : <CheckCircle2 size={17} />
            }
            {message}
          </div>
        )}

        {/* INDICADORES */}

        <section className="admin-stats">
          <article>
            <span><Users /></span>
            <small>CADASTROS EM ANDAMENTO</small>
            <b>{customers.length}</b>
          </article>

          <article>
            <span><FileCheck /></span>
            <small>CONTRATOS PENDENTES</small>
            <b>{contracts.length}</b>
          </article>

          <article>
            <span><Receipt /></span>
            <small>PAGAMENTOS PENDENTES</small>
            <b>{payments.length}</b>
          </article>

          <article>
            <span><FileArchive /></span>
            <small>VERSÕES PUBLICADAS</small>
            <b>{releases.length}</b>
          </article>
        </section>

        {/* CADASTROS DE CLIENTES */}

        <section className="admin-panel customer-section">
          <div className="admin-panel-title">
            <div>
              <h2>Cadastros em andamento</h2>
              <p>
                Acompanhe os cadastros recém-recebidos e as empresas aguardando
                o envio do contrato assinado. O pagamento só poderá ser
                disponibilizado após a aprovação do contrato.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadCustomers}
              disabled={loadingCustomers}
            >
              <RefreshCw
                size={15}
                className={loadingCustomers ? 'admin-spin' : ''}
              />
              Atualizar
            </button>
          </div>

          {loadingCustomers ? (
            <div className="empty-state">
              Carregando cadastros...
            </div>
          ) : customers.length === 0 ? (
            <div className="empty-state">
              <Users size={30} />
              <p>Nenhum cadastro ou contrato aguardando ação do cliente.</p>
            </div>
          ) : (
            <div className="contract-list">
              {customers.map(customer => (
                <article className="contract-card" key={customer.id}>
                  <div className="contract-card-main">
                    <div className="contract-company-icon">
                      <Building2 size={21} />
                    </div>

                    <div className="contract-company-info">
                      <h3>{getCompanyName(customer)}</h3>

                      <span>{customer.legal_name || '-'}</span>

                      <small>
                        CNPJ: {formatCnpj(customer.cnpj)}
                      </small>
                    </div>
                  </div>

                  <div className="contract-card-meta">
                    <span>
                      {customer.email || 'E-mail não informado'}
                    </span>

                    <span>
                      Cadastro: {formatDate(customer.created_at)}
                    </span>

                    <b className="contract-pending">
                      {getRegistrationStatusLabel(customer.registration_status)}
                    </b>
                  </div>

                  <button
                    className="contract-view-button"
                    onClick={() => openCustomer(customer)}
                  >
                    <Eye size={15} />
                    {customer.registration_status === REGISTRATION_STATUS.PENDING_REVIEW
                      ? 'Analisar cadastro'
                      : 'Acompanhar contrato'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* CONTRATOS */}

        <section className="admin-panel contract-section">
          <div className="admin-panel-title">
            <div>
              <h2>Gestão de contratos</h2>
              <p>
                Confira os documentos assinados e valide a assinatura
                digital antes de liberar o pagamento.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadContracts}
              disabled={loadingContracts}
            >
              <RefreshCw
                size={15}
                className={loadingContracts ? 'admin-spin' : ''}
              />
              Atualizar
            </button>
          </div>

          {loadingContracts ? (
            <div className="empty-state">
              Carregando contratos...
            </div>
          ) : contracts.length === 0 ? (
            <div className="empty-state">
              <FileCheck size={30} />
              <p>Nenhum contrato aguardando análise.</p>
            </div>
          ) : (
            <div className="contract-list">
              {contracts.map(contract => (
                <article className="contract-card" key={contract.id}>
                  <div className="contract-card-main">
                    <div className="contract-company-icon">
                      <Building2 size={21} />
                    </div>

                    <div className="contract-company-info">
                      <h3>
                        {getCompanyName(contract.company)}
                      </h3>

                      <span>
                        {contract.company?.legal_name || '-'}
                      </span>

                      <small>
                        Contrato {contract.contract_number}
                      </small>
                    </div>
                  </div>

                  <div className="contract-card-meta">
                    <span>
                      {formatCnpj(contract.company?.cnpj)}
                    </span>

                    <span>
                      {contract.signed_at
                        ? formatDate(contract.signed_at)
                        : 'Data não informada'}
                    </span>

                    <b>
                      {formatCurrency(contract.monthly_price)}/mês
                    </b>
                  </div>

                  <button
                    className="contract-view-button"
                    onClick={() => {
                      setSelectedContract(contract)
                      setRejectionReason('')
                    }}
                  >
                    <Eye size={15} />
                    Analisar contrato
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* PAGAMENTOS */}

        <section className="admin-panel payment-section">
          <div className="admin-panel-title">
            <div>
              <h2>Gestão de pagamentos</h2>
              <p>
                Confira os comprovantes e aprove ou rejeite os pagamentos.
                A aprovação ativa ou renova a licença do cliente.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadPayments}
              disabled={loadingPayments}
            >
              <RefreshCw
                size={15}
                className={loadingPayments ? 'admin-spin' : ''}
              />
              Atualizar
            </button>
          </div>

          {loadingPayments ? (
            <div className="empty-state">
              Carregando pagamentos...
            </div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <CreditCard size={30} />
              <p>Nenhum pagamento aguardando análise.</p>
            </div>
          ) : (
            <div className="contract-list">
              {payments.map(payment => (
                <article className="contract-card" key={payment.id}>
                  <div className="contract-card-main">
                    <div className="contract-company-icon">
                      <Receipt size={21} />
                    </div>

                    <div className="contract-company-info">
                      <h3>
                        {getCompanyName(payment.subscription?.company)}
                      </h3>

                      <span>
                        {payment.subscription?.company?.legal_name || '-'}
                      </span>

                      <small>
                        Vencimento: {formatDate(payment.due_date)}
                      </small>
                    </div>
                  </div>

                  <div className="contract-card-meta">
                    <span>
                      {payment.payment_method === 'pix'
                        ? 'PIX'
                        : 'Transferência bancária'}
                    </span>

                    <span>
                      Enviado: {formatDate(payment.created_at)}
                    </span>

                    <b>{formatCurrency(payment.amount)}</b>
                  </div>

                  <button
                    className="contract-view-button"
                    onClick={() => {
                      setSelectedPayment(payment)
                      setPaymentRejectionReason('')
                    }}
                  >
                    <Eye size={15} />
                    Analisar pagamento
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* DISTRIBUIÇÃO DO ERP */}

        <div className="admin-columns">
          <section className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <h2>Enviar novo instalador</h2>
                <p>
                  O arquivo será armazenado no servidor
                  e disponibilizado pela API.
                </p>
              </div>

              <CloudUpload />
            </div>

            <form className="release-form" onSubmit={upload}>
              <label>Arquivo executável (.exe)</label>

              <input
                type="file"
                accept=".exe,application/vnd.microsoft.portable-executable"
                onChange={event => {
                  setFile(event.target.files?.[0] || null)
                }}
                required
              />

              <small>
                Limite configurado no servidor.
                Envie apenas instaladores assinados e validados.
              </small>

              <label>Versão</label>

              <input
                value={version}
                onChange={event => setVersion(event.target.value)}
                placeholder="1.0.0"
                required
              />

              <label>Notas da versão</label>

              <textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Correções, melhorias e novidades..."
                rows="4"
              />

              <button type="submit" disabled={busy}>
                {busy ? 'Enviando...' : 'Publicar versão'}
              </button>
            </form>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-title">
              <div>
                <h2>Fluxo de distribuição</h2>
                <p>
                  Como o cliente recebe as atualizações.
                </p>
              </div>

              <RefreshCw />
            </div>

            <ol className="admin-steps">
              <li>
                <b>Publicação</b>
                <span>
                  Você envia o .exe e informa a versão.
                </span>
              </li>

              <li>
                <b>Disponibilização</b>
                <span>
                  A API registra o arquivo e gera o endpoint de download.
                </span>
              </li>

              <li>
                <b>Atualização</b>
                <span>
                  O aplicativo Windows consulta a versão e oferece atualização.
                </span>
              </li>

              <li>
                <b>Licença</b>
                <span>
                  O ERP valida a licença vinculada ao computador no servidor.
                </span>
              </li>
            </ol>
          </section>
        </div>

        {/* HISTÓRICO DE VERSÕES */}

        <section className="admin-panel release-history">
          <div className="admin-panel-title">
            <div>
              <h2>Versões publicadas</h2>
              <p>
                Histórico dos instaladores disponíveis.
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadReleases}
              disabled={loadingReleases}
            >
              <RefreshCw
                size={15}
                className={loadingReleases ? 'admin-spin' : ''}
              />
              Atualizar
            </button>
          </div>

          {loadingReleases ? (
            <div className="empty-state">
              Carregando versões...
            </div>
          ) : releases.length === 0 ? (
            <div className="empty-state">
              Nenhum instalador publicado ainda.
            </div>
          ) : (
            <div className="release-table">
              <div className="release-row release-head">
                <span>VERSÃO</span>
                <span>ARQUIVO</span>
                <span>PUBLICAÇÃO</span>
                <span>DOWNLOAD</span>
              </div>

              {releases.map(release => (
                <div className="release-row" key={release.id}>
                  <b>{release.version}</b>

                  <span>{release.originalName}</span>

                  <span>{formatDate(release.createdAt)}</span>

                  <a
                    href={`${API}/releases/${release.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Baixar
                  </a>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="admin-footer">
          FOODCORE BUSINESS TECHNOLOGY
          <span>•</span>
          Painel restrito
        </footer>
      </div>

      {/* =====================================================
          MODAL DE CADASTRO
      ===================================================== */}

      {selectedCustomer && (
        <div
          className="contract-modal-overlay"
          onClick={event => {
            if (
              event.target === event.currentTarget &&
              !busy
            ) {
              closeCustomer()
            }
          }}
        >
          <section className="contract-modal">
            <div className="contract-modal-header">
              <div>
                <div className="admin-kicker">
                  ANÁLISE CADASTRAL
                </div>

                <h2>{getCompanyName(selectedCustomer)}</h2>
              </div>

              <button
                className="modal-close"
                onClick={closeCustomer}
                disabled={busy}
              >
                <X size={19} />
              </button>
            </div>

            <div className="contract-modal-body">
              {loadingCustomerDetails ? (
                <div className="empty-state">
                  Carregando dados da empresa...
                </div>
              ) : (
                <>
                  <div className="contract-detail-block">
                    <h3>
                      <Building2 size={17} />
                      Dados da empresa
                    </h3>

                    <div className="contract-detail-grid">
                      <DetailItem
                        label="Razão social"
                        value={selectedCustomer.legal_name}
                      />

                      <DetailItem
                        label="Nome fantasia"
                        value={selectedCustomer.trade_name}
                      />

                      <DetailItem
                        label="CNPJ"
                        value={formatCnpj(selectedCustomer.cnpj)}
                      />

                      <DetailItem
                        label="Inscrição estadual"
                        value={selectedCustomer.state_registration}
                      />

                      <DetailItem
                        label="E-mail empresarial"
                        value={selectedCustomer.email}
                      />

                      <DetailItem
                        label="Telefone"
                        value={selectedCustomer.phone}
                      />
                    </div>
                  </div>

                  <div className="contract-detail-block">
                    <h3>
                      <UserRound size={17} />
                      Responsável legal
                    </h3>

                    <div className="contract-detail-grid">
                      <DetailItem
                        label="Nome do representante"
                        value={selectedCustomer.representative_name}
                      />

                      <DetailItem
                        label="CPF do representante"
                        value={formatCpf(selectedCustomer.representative_cpf)}
                      />
                    </div>
                  </div>

                  <div className="contract-detail-block">
                    <h3>
                      <MapPin size={17} />
                      Endereço
                    </h3>

                    <div className="contract-detail-grid">
                      <DetailItem
                        label="CEP"
                        value={selectedCustomer.postal_code}
                      />

                      <DetailItem
                        label="Logradouro"
                        value={selectedCustomer.street}
                      />

                      <DetailItem
                        label="Número"
                        value={selectedCustomer.number}
                      />

                      <DetailItem
                        label="Complemento"
                        value={selectedCustomer.complement}
                      />

                      <DetailItem
                        label="Bairro"
                        value={selectedCustomer.neighborhood}
                      />

                      <DetailItem
                        label="Cidade"
                        value={selectedCustomer.city}
                      />

                      <DetailItem
                        label="Estado"
                        value={selectedCustomer.state}
                      />
                    </div>
                  </div>

                  <div className="contract-detail-block">
                    <h3>
                      <CalendarDays size={17} />
                      Situação do cadastro
                    </h3>

                    <div className="contract-detail-grid">
                      <DetailItem
                        label="Data de cadastro"
                        value={formatDate(selectedCustomer.created_at)}
                      />

                      <DetailItem
                        label="Status cadastral"
                        value={getRegistrationStatusLabel(
                          selectedCustomer.registration_status
                        )}
                      />

                      <DetailItem
                        label="Status operacional"
                        value={selectedCustomer.status || '-'}
                      />
                    </div>
                  </div>

                  {customerSubscriptions.length > 0 && (
                    <div className="contract-detail-block">
                      <h3>
                        <CreditCard size={17} />
                        Assinaturas vinculadas
                      </h3>

                      <div className="contract-detail-grid">
                        {customerSubscriptions.map(subscription => (
                          <React.Fragment key={subscription.id}>
                            <DetailItem
                              label="Valor mensal"
                              value={formatCurrency(subscription.monthly_price)}
                            />

                            <DetailItem
                              label="Próximo vencimento"
                              value={formatDate(subscription.next_due_date)}
                            />

                            <DetailItem
                              label="Situação da assinatura"
                              value={subscription.status}
                            />
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="contract-validation-notice">
                    <ShieldCheck size={19} />

                    <div>
                      <b>Conferência dos dados</b>
                      <p>
                        Confira os dados cadastrais e a identificação
                        da empresa antes de liberar a etapa contratual.
                        O CPF do representante é exibido somente
                        nesta área administrativa.
                      </p>
                    </div>
                  </div>

                  {/* ETAPA CADASTRAL */}

                  {selectedCustomer.registration_status ===
                    REGISTRATION_STATUS.PENDING_REVIEW && (
                    <div className="contract-detail-block">
                      <h3>
                        <ShieldCheck size={17} />
                        Decisão cadastral
                      </h3>

                      <p>
                        Após conferir os dados, aprove o cadastro para
                        permitir que o cliente gere e assine o contrato.
                        Esta ação não cria cobrança nem ativa a licença.
                      </p>

                      <div className="contract-rejection">
                        <label htmlFor="customer-rejection-reason">
                          Justificativa (obrigatória para rejeição)
                        </label>

                        <textarea
                          id="customer-rejection-reason"
                          value={customerRejectionReason}
                          onChange={event =>
                            setCustomerRejectionReason(event.target.value)
                          }
                          rows="3"
                          maxLength={2000}
                          placeholder="Descreva o motivo da rejeição..."
                        />
                      </div>

                      <div className="contract-modal-actions">
                        <button
                          type="button"
                          className="contract-reject-button"
                          onClick={() => decideCustomer('reject')}
                          disabled={busy}
                        >
                          <X size={16} />
                          Rejeitar cadastro
                        </button>

                        <button
                          type="button"
                          className="contract-approve-button"
                          onClick={() => decideCustomer('approve')}
                          disabled={busy}
                        >
                          <Check size={16} />
                          {busy ? 'Processando...' : 'Aprovar cadastro'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ETAPA DE PAGAMENTO */}

                  {canReleasePaymentLink(selectedCustomer) && (
                    <div className="contract-detail-block">
                      <h3>
                        <Link2 size={17} />
                        Link externo de pagamento
                      </h3>

                      <p>
                        O contrato assinado já foi aprovado. Agora você
                        pode informar o link da primeira cobrança, que
                        será disponibilizado ao cliente no portal FOODCORE.
                      </p>

                      <form
                        className="release-form"
                        onSubmit={saveCustomerPaymentLink}
                      >
                        <label htmlFor="customer-payment-link">
                          Link de pagamento
                        </label>

                        <input
                          id="customer-payment-link"
                          type="url"
                          value={customerPaymentLink}
                          onChange={event =>
                            setCustomerPaymentLink(event.target.value)
                          }
                          maxLength={2048}
                          placeholder="https://..."
                          required
                        />

                        <small>
                          Aceita endereços HTTP e HTTPS. O pagamento
                          é realizado externamente à plataforma.
                        </small>

                        <button
                          type="submit"
                          disabled={busy || loadingCustomerDetails}
                        >
                          {busy
                            ? 'Vinculando...'
                            : 'Vincular link e gerar cobrança'}
                        </button>
                      </form>

                      {selectedCustomer.payment_link && (
                        <div className="contract-validation-notice">
                          <CheckCircle2 size={19} />

                          <div>
                            <b>Link já vinculado</b>

                            <p>
                              O cliente já pode acessar o link de pagamento
                              pelo portal FOODCORE.
                            </p>

                            <a
                              href={selectedCustomer.payment_link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir link de pagamento
                            </a>

                            <button
                              type="button"
                              className="refresh-button"
                              onClick={copyPaymentLink}
                            >
                              <Copy size={15} />
                              Copiar link
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SITUAÇÕES EM QUE NÃO SE DEVE LIBERAR PAGAMENTO */}

                  {!canReleasePaymentLink(selectedCustomer) &&
                    selectedCustomer.registration_status !==
                      REGISTRATION_STATUS.PENDING_REVIEW && (
                    <div className="contract-validation-notice">
                      <ShieldCheck size={19} />

                      <div>
                        <b>
                          {selectedCustomer.registration_status ===
                            REGISTRATION_STATUS.AWAITING_CONTRACT
                            ? 'Aguardando contrato assinado'
                            : selectedCustomer.registration_status ===
                                REGISTRATION_STATUS.PAYMENT_UNDER_REVIEW
                              ? 'Pagamento em análise'
                              : selectedCustomer.registration_status ===
                                  REGISTRATION_STATUS.ACTIVE
                                ? 'Empresa ativa'
                                : 'Etapa atual do cadastro'}
                        </b>

                        <p>
                          {selectedCustomer.registration_status ===
                            REGISTRATION_STATUS.AWAITING_CONTRACT
                            ? 'O cliente precisa gerar o contrato, assinar pelo gov.br e enviar o PDF para análise. O link de pagamento ainda não pode ser liberado.'
                            : selectedCustomer.registration_status ===
                                REGISTRATION_STATUS.PAYMENT_UNDER_REVIEW
                              ? 'O comprovante está aguardando conferência administrativa.'
                              : selectedCustomer.registration_status ===
                                  REGISTRATION_STATUS.ACTIVE
                                ? 'A empresa já possui uma assinatura ativa. Não é necessário liberar a primeira cobrança novamente.'
                                : 'O link de pagamento não está disponível nesta etapa do processo.'}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="contract-modal-actions">
              <button
                className="contract-reject-button"
                onClick={closeCustomer}
                disabled={busy}
              >
                <X size={16} />
                Fechar
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================
          MODAL DE CONTRATO
      ===================================================== */}

      {selectedContract && (
        <div
          className="contract-modal-overlay"
          onClick={event => {
            if (event.target === event.currentTarget && !busy) {
              setSelectedContract(null)
            }
          }}
        >
          <section className="contract-modal">
            <div className="contract-modal-header">
              <div>
                <div className="admin-kicker">
                  ANÁLISE DOCUMENTAL
                </div>

                <h2>
                  Contrato {selectedContract.contract_number}
                </h2>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelectedContract(null)}
                disabled={busy}
              >
                <X size={19} />
              </button>
            </div>

            <div className="contract-modal-body">
              <div className="contract-detail-block">
                <h3>
                  <Building2 size={17} />
                  Dados da empresa
                </h3>

                <div className="contract-detail-grid">
                  <DetailItem
                    label="Razão social"
                    value={selectedContract.company?.legal_name}
                  />

                  <DetailItem
                    label="Nome fantasia"
                    value={selectedContract.company?.trade_name}
                  />

                  <DetailItem
                    label="CNPJ"
                    value={formatCnpj(selectedContract.company?.cnpj)}
                  />

                  <DetailItem
                    label="E-mail"
                    value={selectedContract.company?.email}
                  />

                  <DetailItem
                    label="Telefone"
                    value={selectedContract.company?.phone}
                  />

                  <DetailItem
                    label="Representante"
                    value={selectedContract.company?.representative_name}
                  />

                  <DetailItem
                    label="CPF do representante"
                    value={formatCpf(
                      selectedContract.company?.representative_cpf
                    )}
                  />

                  <DetailItem
                    label="Localização"
                    value={[
                      selectedContract.company?.city,
                      selectedContract.company?.state
                    ].filter(Boolean).join(' / ')}
                  />
                </div>
              </div>

              <div className="contract-detail-block">
                <h3>
                  <FileCheck size={17} />
                  Dados do contrato
                </h3>

                <div className="contract-detail-grid">
                  <DetailItem
                    label="Valor mensal"
                    value={formatCurrency(selectedContract.monthly_price)}
                  />

                  <DetailItem
                    label="Recebido em"
                    value={formatDate(selectedContract.signed_at)}
                  />

                  <DetailItem
                    label="Status"
                    value="Aguardando análise"
                  />
                </div>
              </div>

              <div className="contract-validation-notice">
                <ShieldCheck size={19} />

                <div>
                  <b>Validação obrigatória da assinatura</b>
                  <p>
                    Baixe o documento e confira a assinatura digital
                    no serviço VALIDAR do ITI antes de aprovar.
                    O sistema não realiza validação criptográfica automática.
                  </p>
                </div>
              </div>

              <button
                className="contract-download-button"
                onClick={() => downloadContract(selectedContract)}
                disabled={busy}
              >
                <Download size={17} />
                Baixar contrato assinado
              </button>

              <div className="contract-rejection">
                <label htmlFor="rejection-reason">
                  Justificativa (obrigatória para rejeição)
                </label>

                <textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={event => setRejectionReason(event.target.value)}
                  rows="3"
                  maxLength={2000}
                  placeholder="Descreva o motivo da rejeição..."
                />
              </div>
            </div>

            <div className="contract-modal-actions">
              <button
                className="contract-reject-button"
                onClick={() => decideContract('reject')}
                disabled={busy}
              >
                <X size={16} />
                Rejeitar contrato
              </button>

              <button
                className="contract-approve-button"
                onClick={() => decideContract('approve')}
                disabled={busy}
              >
                <Check size={16} />
                {busy ? 'Processando...' : 'Aprovar contrato'}
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =====================================================
          MODAL DE PAGAMENTO
      ===================================================== */}

      {selectedPayment && (
        <div
          className="contract-modal-overlay"
          onClick={event => {
            if (event.target === event.currentTarget && !busy) {
              setSelectedPayment(null)
            }
          }}
        >
          <section className="contract-modal">
            <div className="contract-modal-header">
              <div>
                <div className="admin-kicker">
                  CONFERÊNCIA FINANCEIRA
                </div>

                <h2>Análise de pagamento</h2>
              </div>

              <button
                className="modal-close"
                onClick={() => setSelectedPayment(null)}
                disabled={busy}
              >
                <X size={19} />
              </button>
            </div>

            <div className="contract-modal-body">
              <div className="contract-detail-block">
                <h3>
                  <Building2 size={17} />
                  Dados da empresa
                </h3>

                <div className="contract-detail-grid">
                  <DetailItem
                    label="Empresa"
                    value={getCompanyName(
                      selectedPayment.subscription?.company
                    )}
                  />

                  <DetailItem
                    label="Razão social"
                    value={selectedPayment.subscription?.company?.legal_name}
                  />

                  <DetailItem
                    label="CNPJ"
                    value={formatCnpj(
                      selectedPayment.subscription?.company?.cnpj
                    )}
                  />

                  <DetailItem
                    label="E-mail"
                    value={selectedPayment.subscription?.company?.email}
                  />
                </div>
              </div>

              <div className="contract-detail-block">
                <h3>
                  <CreditCard size={17} />
                  Dados do pagamento
                </h3>

                <div className="contract-detail-grid">
                  <DetailItem
                    label="Valor"
                    value={formatCurrency(selectedPayment.amount)}
                  />

                  <DetailItem
                    label="Vencimento"
                    value={formatDate(selectedPayment.due_date)}
                  />

                  <DetailItem
                    label="Forma de pagamento"
                    value={
                      selectedPayment.payment_method === 'pix'
                        ? 'PIX'
                        : 'Transferência bancária'
                    }
                  />

                  <DetailItem
                    label="Data de envio"
                    value={formatDate(selectedPayment.created_at)}
                  />

                  <DetailItem
                    label="Status"
                    value={
                      selectedPayment.status === 'under_review'
                        ? 'Em análise'
                        : 'Pendente'
                    }
                  />
                </div>
              </div>

              <button
                className="contract-download-button"
                onClick={() => downloadPaymentReceipt(selectedPayment)}
                disabled={busy}
              >
                <Download size={17} />
                Baixar comprovante
              </button>

              <div className="contract-validation-notice">
                <ShieldCheck size={19} />

                <div>
                  <b>Conferência obrigatória</b>
                  <p>
                    Verifique se o valor foi efetivamente recebido
                    na conta da FOODCORE antes de confirmar o pagamento.
                    A aprovação ativa ou renova a licença do cliente.
                  </p>
                </div>
              </div>

              <div className="contract-rejection">
                <label htmlFor="payment-rejection-reason">
                  Justificativa (obrigatória para rejeição)
                </label>

                <textarea
                  id="payment-rejection-reason"
                  value={paymentRejectionReason}
                  onChange={event =>
                    setPaymentRejectionReason(event.target.value)
                  }
                  rows="3"
                  maxLength={2000}
                  placeholder="Descreva o motivo da rejeição..."
                />
              </div>
            </div>

            <div className="contract-modal-actions">
              <button
                className="contract-reject-button"
                onClick={() => decidePayment('reject')}
                disabled={busy}
              >
                <X size={16} />
                Rejeitar pagamento
              </button>

              <button
                className="contract-approve-button"
                onClick={() => decidePayment('approve')}
                disabled={busy}
              >
                <Check size={16} />
                {busy ? 'Processando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
 