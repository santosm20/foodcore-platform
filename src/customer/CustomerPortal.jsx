
import React, { useEffect, useState } from 'react'

import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck,
  FileText,
  Headphones,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle
} from 'lucide-react'

import {
  clearCustomerSession,
  getCustomerProfile,
  getLatestRelease,
  uploadPaymentReceipt,
  downloadRelease
} from '../services/customerApi.js'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const STATUS_CONFIG = {
  pending_review: {
    title: 'Cadastro em análise',
    description: 'Nossa equipe está verificando os dados da sua empresa.',
    icon: Clock3,
    color: 'warning'
  },
  awaiting_payment: {
    title: 'Aguardando pagamento',
    description: 'Seu cadastro foi aprovado. Conclua o pagamento para liberar o acesso.',
    icon: CreditCard,
    color: 'info'
  },
  payment_under_review: {
    title: 'Pagamento em análise',
    description: 'Recebemos seu comprovante. Aguarde a confirmação administrativa.',
    icon: Clock3,
    color: 'warning'
  },
  active: {
    title: 'Conta ativa',
    description: 'Sua empresa está aprovada e possui acesso liberado.',
    icon: CheckCircle2,
    color: 'success'
  },
  rejected: {
    title: 'Cadastro não aprovado',
    description: 'Entre em contato com nossa equipe para entender a análise.',
    icon: XCircle,
    color: 'danger'
  }
}

// =====================================================
// COMPONENTES
// =====================================================

function PortalLayout({ children, customer, title }) {
  function handleLogout() {
    clearCustomerSession()
    window.location.href = '/login'
  }

  return (
    <main className="fc-portal">
      <header className="fc-portal-header">
        <a href="/minha-conta" className="fc-auth-brand">
          <span className="fc-auth-brand-icon">F</span>
          <span>FOODCORE</span>
        </a>

        <div className="fc-portal-header-right">
          <div className="fc-portal-user">
            <span className="fc-portal-avatar">
              {(customer?.fullName || 'C').charAt(0).toUpperCase()}
            </span>

            <span>
              {customer?.fullName || 'Área do cliente'}
            </span>
          </div>

          <button
            className="fc-portal-logout"
            onClick={handleLogout}
            title="Sair da conta"
          >
            <LogOut size={17} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      <div className="fc-portal-body">
        <div className="fc-portal-title">
          <span>ÁREA DO CLIENTE</span>
          <h1>{title}</h1>
          <p>Gerencie o acesso e acompanhe sua conta FOODCORE.</p>
        </div>

        {children}
      </div>

      <footer className="fc-portal-footer">
        FOODCORE BUSINESS TECHNOLOGY
      </footer>
    </main>
  )
}

function PortalMessage({ type = 'error', children }) {
  return (
    <div className={`fc-portal-message fc-message-${type}`}>
      {children}
    </div>
  )
}

function LoadingScreen() {
  return (
    <main className="fc-portal-loading">
      <div className="fc-loading-mark">F</div>
      <div className="fc-loading-spinner" />
      <p>Carregando sua conta FOODCORE...</p>
    </main>
  )
}

// =====================================================
// AUTENTICAÇÃO E CARREGAMENTO
// =====================================================

function useCustomerProfile() {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadProfile() {
    setLoading(true)
    setError('')

    try {
      const result = await getCustomerProfile()

      if (!result?.customer) {
        throw new Error('Não foi possível identificar sua conta.')
      }

      setCustomer(result.customer)
    } catch (err) {
      setError(err.message)

      if (
        err.message.toLowerCase().includes('token') ||
        err.message.toLowerCase().includes('sessão') ||
        err.message.toLowerCase().includes('autenticação')
      ) {
        clearCustomerSession()
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()
  }, [])

  return {
    customer,
    loading,
    error,
    reload: loadProfile
  }
}

// =====================================================
// MINHA CONTA
// =====================================================

export function CustomerDashboardPage() {
  const {
    customer,
    loading,
    error,
    reload
  } = useCustomerProfile()

  if (loading) return <LoadingScreen />

  if (!customer) {
    return (
      <main className="fc-portal">
        <div className="fc-portal-empty">
          <ShieldCheck size={34} />
          <h2>Não foi possível acessar sua conta</h2>
          <p>{error || 'Entre novamente para continuar.'}</p>
          <a href="/login" className="fc-auth-submit">
            Ir para o login <ArrowRight size={17} />
          </a>
        </div>
      </main>
    )
  }

  const status = STATUS_CONFIG[customer.registrationStatus] || {
    title: 'Status não identificado',
    description: 'Entre em contato com o suporte.',
    icon: Clock3,
    color: 'warning'
  }

  const StatusIcon = status.icon

  const companyName = customer.companyName || customer.fullName

  const canPay = [
    'awaiting_payment',
    'payment_under_review'
  ].includes(customer.registrationStatus)

  const isActive =
    customer.companyStatus === 'active' &&
    customer.registrationStatus === 'active'

  return (
    <PortalLayout customer={customer} title="Minha conta">
      <div className="fc-portal-grid">
        <section className="fc-portal-card fc-portal-status-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">SITUAÇÃO DA EMPRESA</span>
              <h2>Status do cadastro</h2>
            </div>

            <span className={`fc-status-icon ${status.color}`}>
              <StatusIcon size={23} />
            </span>
          </div>

          <div className={`fc-status-banner ${status.color}`}>
            <strong>{status.title}</strong>
            <p>{status.description}</p>
          </div>

          <div className="fc-status-progress">
            <div className={customer.registrationStatus !== 'rejected' ? 'complete' : ''}>
              <CheckCircle2 size={17} />
              <span>Cadastro recebido</span>
            </div>

            <div className={[
              'pending_review',
              'awaiting_payment',
              'payment_under_review',
              'active'
            ].includes(customer.registrationStatus) ? 'complete' : ''}>
              <CheckCircle2 size={17} />
              <span>Análise administrativa</span>
            </div>

            <div className={[
              'payment_under_review',
              'active'
            ].includes(customer.registrationStatus) ? 'complete' : ''}>
              <CheckCircle2 size={17} />
              <span>Pagamento</span>
            </div>

            <div className={isActive ? 'complete' : ''}>
              <ShieldCheck size={17} />
              <span>Licença liberada</span>
            </div>
          </div>
        </section>

        <section className="fc-portal-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">DADOS DE ACESSO</span>
              <h2>Informações da conta</h2>
            </div>

            <Building2 size={22} />
          </div>

          <div className="fc-account-details">
            <div>
              <span>Responsável</span>
              <strong>{customer.fullName || 'Não informado'}</strong>
            </div>

            <div>
              <span>E-mail</span>
              <strong>{customer.email || 'Não informado'}</strong>
            </div>

            <div>
              <span>Identificação da empresa</span>
              <strong>{customer.companyId || 'Não disponível'}</strong>
            </div>
          </div>
        </section>

        {error && (
          <PortalMessage type="warning">
            {error}
          </PortalMessage>
        )}

        <section className="fc-portal-card fc-portal-action-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">PRÓXIMA ETAPA</span>
              <h2>Pagamento e assinatura</h2>
            </div>

            <CreditCard size={23} />
          </div>

          <p>
            Acompanhe a etapa de pagamento e envie seu comprovante
            diretamente pela plataforma.
          </p>

          {canPay && (
            <a href="/pagamento" className="fc-portal-action">
              Acessar pagamento <ArrowRight size={17} />
            </a>
          )}

          {customer.registrationStatus === 'pending_review' && (
            <span className="fc-portal-muted">
              Disponível após a aprovação do cadastro.
            </span>
          )}

          {customer.registrationStatus === 'payment_under_review' && (
            <span className="fc-portal-muted">
              Seu comprovante está aguardando análise.
            </span>
          )}

          {isActive && (
            <a href="/download" className="fc-portal-action">
              Acessar downloads <ArrowDownToLine size={17} />
            </a>
          )}

          {customer.registrationStatus === 'rejected' && (
            <a
              href="https://wa.me/5511976977449"
              target="_blank"
              rel="noopener noreferrer"
              className="fc-portal-action"
            >
              Falar com suporte <Headphones size={17} />
            </a>
          )}
        </section>

        <section className="fc-portal-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">SUPORTE</span>
              <h2>Precisa de ajuda?</h2>
            </div>

            <Headphones size={23} />
          </div>

          <p>
            Nossa equipe pode ajudar com dúvidas sobre cadastro,
            pagamento e acesso ao sistema.
          </p>

          <a
            href="https://wa.me/5511976977449"
            target="_blank"
            rel="noopener noreferrer"
            className="fc-portal-text-link"
          >
            Falar com a FOODCORE <ArrowUpRight size={16} />
          </a>
        </section>

        <button
          className="fc-portal-refresh"
          onClick={reload}
        >
          <RefreshCw size={16} />
          Atualizar informações
        </button>
      </div>
    </PortalLayout>
  )
}

// =====================================================
// PAGAMENTO
// =====================================================

export function CustomerPaymentPage() {
  const {
    customer,
    loading,
    error
  } = useCustomerProfile()

  const [file, setFile] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState('')
  const [uploadError, setUploadError] = useState('')

  if (loading) return <LoadingScreen />

  if (!customer) {
    return (
      <main className="fc-portal-empty">
        <h2>Sessão não encontrada</h2>
        <p>{error}</p>
        <a href="/login" className="fc-auth-submit">
          Entrar novamente
        </a>
      </main>
    )
  }

  const status = customer.registrationStatus
  const paymentLink = customer.paymentLink

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')
    setUploadError('')

    if (!file) {
      setUploadError('Selecione o comprovante antes de continuar.')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('O arquivo ultrapassa o limite de 10 MB.')
      return
    }

    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png'
    ]

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Envie um arquivo PDF, JPG ou PNG.')
      return
    }

    setSending(true)

    try {
      const result = await uploadPaymentReceipt(file, paymentMethod)

      setMessage(
        result.message ||
        'Comprovante enviado com sucesso. Aguarde a análise.'
      )

      setFile(null)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalLayout customer={customer} title="Pagamento">
      <div className="fc-portal-narrow">
        <section className="fc-portal-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">ASSINATURA FOODCORE</span>
              <h2>Pagamento da assinatura</h2>
            </div>

            <CreditCard size={23} />
          </div>

          {status === 'pending_review' && (
            <PortalMessage type="warning">
              O pagamento será liberado após a aprovação do cadastro da sua empresa.
            </PortalMessage>
          )}

          {status === 'payment_under_review' && (
            <PortalMessage type="success">
              Seu comprovante já foi enviado e está em análise administrativa.
            </PortalMessage>
          )}

          {status === 'rejected' && (
            <PortalMessage type="error">
              Seu cadastro não está liberado para pagamento. Entre em contato com o suporte.
            </PortalMessage>
          )}

          {status === 'active' && (
            <PortalMessage type="success">
              Sua empresa está ativa. Caso precise enviar um comprovante de renovação, utilize o formulário abaixo.
            </PortalMessage>
          )}

          {paymentLink && (
            <div className="fc-payment-link-box">
              <span>LINK DE PAGAMENTO DISPONIBILIZADO PELA FOODCORE</span>

              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-auth-submit"
              >
                Abrir pagamento externo
                <ArrowUpRight size={17} />
              </a>
            </div>
          )}

          {['awaiting_payment', 'active'].includes(status) && (
            <form
              className="fc-payment-form"
              onSubmit={handleSubmit}
            >
              <div className="fc-form-divider">
                <span>Enviar comprovante</span>
              </div>

              <label className="fc-field">
                <span>Forma de pagamento</span>

                <select
                  value={paymentMethod}
                  onChange={event => setPaymentMethod(event.target.value)}
                  required
                >
                  <option value="pix">PIX</option>
                  <option value="bank_transfer">Transferência bancária</option>
                </select>
              </label>

              <label className="fc-upload-area">
                <UploadCloud size={28} />

                <strong>
                  {file ? file.name : 'Selecione seu comprovante'}
                </strong>

                <span>PDF, JPG ou PNG — máximo de 10 MB</span>

                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={event => setFile(event.target.files?.[0] || null)}
                />
              </label>

              {uploadError && (
                <PortalMessage type="error">
                  {uploadError}
                </PortalMessage>
              )}

              {message && (
                <PortalMessage type="success">
                  {message}
                </PortalMessage>
              )}

              <button
                type="submit"
                className="fc-auth-submit"
                disabled={sending}
              >
                {sending ? 'Enviando comprovante...' : 'Enviar comprovante'}
                {!sending && <ArrowRight size={17} />}
              </button>
            </form>
          )}

          <a href="/minha-conta" className="fc-portal-back">
            <ArrowLeft size={16} />
            Voltar para minha conta
          </a>
        </section>
      </div>
    </PortalLayout>
  )
}

// =====================================================
// DOWNLOAD
// =====================================================

export function CustomerDownloadPage() {
  const {
    customer,
    loading,
    error
  } = useCustomerProfile()

  const [release, setRelease] = useState(null)
  const [releaseError, setReleaseError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!customer) return

    if (
      customer.companyStatus !== 'active' ||
      customer.registrationStatus !== 'active'
    ) {
      return
    }

    getLatestRelease()
      .then(setRelease)
      .catch(err => setReleaseError(err.message))
  }, [customer])

  if (loading) return <LoadingScreen />

  if (!customer) {
    return (
      <main className="fc-portal-empty">
        <h2>Sessão não encontrada</h2>
        <p>{error}</p>
        <a href="/login" className="fc-auth-submit">
          Entrar novamente
        </a>
      </main>
    )
  }

  const authorized =
    customer.companyStatus === 'active' &&
    customer.registrationStatus === 'active'

  async function handleDownload() {
    if (!release?.downloadUrl) return

    setDownloading(true)
    setReleaseError('')

    try {
      await downloadRelease(release.downloadUrl)
    } catch (err) {
      setReleaseError(err.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PortalLayout customer={customer} title="Downloads">
      <div className="fc-portal-narrow">
        <section className="fc-portal-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">FOODCORE ERP</span>
              <h2>Instalador do sistema</h2>
            </div>

            <ArrowDownToLine size={23} />
          </div>

          {!authorized && (
            <PortalMessage type="warning">
              O instalador está disponível somente após a aprovação
              e ativação da sua empresa.
            </PortalMessage>
          )}

          {authorized && release && (
            <>
              <div className="fc-release-info">
                <div className="fc-release-icon">
                  <FileText size={27} />
                </div>

                <div>
                  <strong>FOODCORE ERP</strong>
                  <span>Versão {release.version}</span>
                </div>

                <span className="fc-release-badge">
                  Disponível
                </span>
              </div>

              {release.notes && (
                <div className="fc-release-notes">
                  <strong>Notas da versão</strong>
                  <p>{release.notes}</p>
                </div>
              )}

              <button
                className="fc-auth-submit"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? 'Preparando download...' : 'Baixar instalador'}
                {!downloading && <ArrowDownToLine size={18} />}
              </button>
            </>
          )}

          {authorized && !release && (
            <PortalMessage type="warning">
              {releaseError || 'Não há uma versão publicada no momento.'}
            </PortalMessage>
          )}

          {releaseError && release && (
            <PortalMessage type="error">
              {releaseError}
            </PortalMessage>
          )}

          <a href="/minha-conta" className="fc-portal-back">
            <ArrowLeft size={16} />
            Voltar para minha conta
          </a>
        </section>
      </div>
    </PortalLayout>
  )
}
