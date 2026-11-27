import React, { useCallback, useEffect, useState } from 'react'

import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
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
  downloadRelease,
  getCurrentContract,
  generateCustomerContract,
  uploadSignedCustomerContract
} from '../services/customerApi.js'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

const PAYMENT_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png'
]

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

const CONTRACT_STATUS_LABELS = {
  awaiting_signature: 'aguardando assinatura',
  awaiting_approval: 'em análise administrativa',
  approved: 'aprovado',
  rejected: 'rejeitado'
}

const SUPPORT_URL = 'https://wa.me/5511976977449'

// =====================================================
// COMPONENTES COMPARTILHADOS
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
            <span>{customer?.fullName || 'Área do cliente'}</span>
          </div>

          <button
            type="button"
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
    <div className={`fc-portal-message fc-message-${type}`} role="status">
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

function SessionError({ error, title = 'Sessão não encontrada' }) {
  return (
    <main className="fc-portal">
      <div className="fc-portal-empty">
        <ShieldCheck size={34} />
        <h2>{title}</h2>
        <p>{error || 'Entre novamente para continuar.'}</p>
        <a href="/login" className="fc-auth-submit">
          Entrar novamente <ArrowRight size={17} />
        </a>
      </div>
    </main>
  )
}

function validatePdf(file, label) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error(`Selecione ${label} em PDF.`)
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('O arquivo ultrapassa o limite de 10 MB.')
  }

  if (
    file.type !== 'application/pdf' ||
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    throw new Error('Envie um arquivo PDF válido.')
  }
}

function validatePaymentReceipt(file) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error('Selecione um comprovante válido.')
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('O comprovante ultrapassa o limite de 10 MB.')
  }

  if (!PAYMENT_FILE_TYPES.includes(file.type)) {
    throw new Error('Envie um comprovante em PDF, JPG ou PNG.')
  }
}

// =====================================================
// PERFIL DO CLIENTE
// =====================================================

function useCustomerProfile() {
  const [customer, setCustomer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const result = await getCustomerProfile()

      if (!result?.customer) {
        throw new Error('Não foi possível identificar sua conta.')
      }

      setCustomer(result.customer)
      return result.customer
    } catch (err) {
      const message = err?.message || 'Não foi possível carregar sua conta.'
      setError(message)
      setCustomer(null)

      const normalized = message.toLowerCase()
      if (
        normalized.includes('token') ||
        normalized.includes('sessão') ||
        normalized.includes('autenticação')
      ) {
        clearCustomerSession()
      }

      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return { customer, loading, error, reload: loadProfile }
}

// =====================================================
// MINHA CONTA
// =====================================================

export function CustomerDashboardPage() {
  const { customer, loading, error, reload } = useCustomerProfile()

  if (loading) return <LoadingScreen />
  if (!customer) return <SessionError error={error} title="Não foi possível acessar sua conta" />

  const status = STATUS_CONFIG[customer.registrationStatus] || {
    title: 'Status não identificado',
    description: 'Entre em contato com o suporte.',
    icon: Clock3,
    color: 'warning'
  }

  const StatusIcon = status.icon
  const isActive =
    customer.companyStatus === 'active' &&
    customer.registrationStatus === 'active'

  const progress = [
    {
      label: 'Cadastro recebido',
      complete: customer.registrationStatus !== 'rejected'
    },
    {
      label: 'Análise administrativa',
      complete: [
        'awaiting_payment',
        'payment_under_review',
        'active'
      ].includes(customer.registrationStatus)
    },
    {
      label: 'Pagamento',
      complete: customer.registrationStatus === 'active'
    },
    {
      label: 'Licença liberada',
      complete: isActive
    }
  ]

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
            {progress.map(item => (
              <div key={item.label} className={item.complete ? 'complete' : ''}>
                <CheckCircle2 size={17} />
                <span>{item.label}</span>
              </div>
            ))}
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

        {error && <PortalMessage type="warning">{error}</PortalMessage>}

        <section className="fc-portal-card fc-portal-action-card">
          <div className="fc-portal-card-heading">
            <div>
              <span className="fc-portal-label">PRÓXIMA ETAPA</span>
              <h2>Pagamento e assinatura</h2>
            </div>
            <CreditCard size={23} />
          </div>

          <p>
            Acompanhe a etapa de pagamento e envie seus documentos
            diretamente pela plataforma.
          </p>

          {[
            'pending_review',
            'awaiting_payment',
            'payment_under_review'
          ].includes(customer.registrationStatus) && (
            <a href="/pagamento" className="fc-portal-action">
              Acessar pagamento <ArrowRight size={17} />
            </a>
          )}

          {customer.registrationStatus === 'pending_review' && (
            <span className="fc-portal-muted">
              O pagamento será disponibilizado após a aprovação do cadastro.
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
              href={SUPPORT_URL}
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
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="fc-portal-text-link"
          >
            Falar com a FOODCORE <ArrowUpRight size={16} />
          </a>
        </section>

        <button
          type="button"
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
// PAGAMENTO E CONTRATO
// =====================================================

export function CustomerPaymentPage() {
  const { customer, loading, error } = useCustomerProfile()

  const [receiptFile, setReceiptFile] = useState(null)
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [sendingReceipt, setSendingReceipt] = useState(false)
  const [receiptMessage, setReceiptMessage] = useState('')
  const [receiptError, setReceiptError] = useState('')

  const [contract, setContract] = useState(null)
  const [contractFile, setContractFile] = useState(null)
  const [contractLoading, setContractLoading] = useState(true)
  const [contractBusy, setContractBusy] = useState(false)
  const [contractMessage, setContractMessage] = useState('')
  const [contractError, setContractError] = useState('')

  const refreshContract = useCallback(async () => {
    setContractLoading(true)
    setContractError('')

    try {
      const result = await getCurrentContract()
      setContract(result?.contract || null)
      return result?.contract || null
    } catch (err) {
      setContractError(err?.message || 'Não foi possível consultar o contrato.')
      return null
    } finally {
      setContractLoading(false)
    }
  }, [])

  useEffect(() => {
    if (customer) refreshContract()
  }, [customer, refreshContract])

  async function handleGenerateContract() {
    setContractBusy(true)
    setContractError('')
    setContractMessage('')

    try {
      const result = await generateCustomerContract()
      setContractMessage(
        result?.message ||
        'Contrato baixado. Assine digitalmente e envie o PDF assinado abaixo.'
      )

      // Atualiza o status após a criação do contrato.
      const current = await refreshContract()

      if (!current) {
        setContractError(
          'O PDF foi gerado, mas não conseguimos atualizar a situação do contrato. Atualize a página.'
        )
      }
    } catch (err) {
      setContractError(err?.message || 'Não foi possível gerar o contrato.')
      await refreshContract()
    } finally {
      setContractBusy(false)
    }
  }

  async function handleContractUpload(event) {
    event.preventDefault()
    setContractError('')
    setContractMessage('')

    try {
      validatePdf(contractFile, 'o contrato assinado')
    } catch (err) {
      setContractError(err.message)
      return
    }

    setContractBusy(true)

    try {
      const result = await uploadSignedCustomerContract(contractFile)
      setContractMessage(
        result?.message || 'Contrato enviado para análise administrativa.'
      )
      setContractFile(null)

      // O backend deve alterar o status para awaiting_approval.
      await refreshContract()
    } catch (err) {
      setContractError(err?.message || 'Não foi possível enviar o contrato.')
    } finally {
      setContractBusy(false)
    }
  }

  async function handleReceiptSubmit(event) {
    event.preventDefault()
    setReceiptMessage('')
    setReceiptError('')

    try {
      validatePaymentReceipt(receiptFile)
    } catch (err) {
      setReceiptError(err.message)
      return
    }

    setSendingReceipt(true)

    try {
      const result = await uploadPaymentReceipt(receiptFile, paymentMethod)
      setReceiptMessage(
        result?.message || 'Comprovante enviado. Aguarde a análise administrativa.'
      )
      setReceiptFile(null)
    } catch (err) {
      setReceiptError(err?.message || 'Não foi possível enviar o comprovante.')
    } finally {
      setSendingReceipt(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (!customer) return <SessionError error={error} />

  const status = customer.registrationStatus
  const paymentLink = customer.paymentLink
  const contractStatus = contract?.status
  const canManageContract = status === 'awaiting_contract'
  const contractApproved = contractStatus === 'approved'

  // O cliente só pode gerar/enviar contrato durante a etapa contratual.
  const canGenerateContract =
    canManageContract &&
    (!contract || ['rejected', 'awaiting_signature'].includes(contractStatus))

  const canUploadContract =
    canManageContract && contractStatus === 'awaiting_signature'

  // Pagamento e comprovante só aparecem após a aprovação do contrato.
  const canAccessPayment =
    contractApproved &&
    ['awaiting_payment', 'payment_under_review', 'active'].includes(status)

  const canSubmitReceipt =
    contractApproved && ['awaiting_payment', 'active'].includes(status)

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

          <div className="fc-form-divider">
            <span>Contrato de prestação de serviços</span>
          </div>

          <p>
            Gere o contrato da sua empresa, assine digitalmente e envie
            o mesmo arquivo em PDF para análise.
          </p>

          {contractLoading && (
            <PortalMessage type="warning">
              Consultando situação do contrato...
            </PortalMessage>
          )}

          {!contractLoading && contract && (
            <PortalMessage
              type={
                contractStatus === 'approved'
                  ? 'success'
                  : contractStatus === 'rejected'
                    ? 'error'
                    : 'warning'
              }
            >
              Contrato {contract.contract_number || ''}:{' '}
              {CONTRACT_STATUS_LABELS[contractStatus] || contractStatus}
            </PortalMessage>
          )}

          {!contractLoading && !contract && !contractError && (
            <PortalMessage type="warning">
              Nenhum contrato foi gerado. Gere o contrato para iniciar a assinatura.
            </PortalMessage>
          )}

          {contractError && (
            <PortalMessage type="error">{contractError}</PortalMessage>
          )}

          {contractMessage && (
            <PortalMessage type="success">{contractMessage}</PortalMessage>
          )}

          {canGenerateContract && (
            <button
              type="button"
              className="fc-auth-submit"
              onClick={handleGenerateContract}
              disabled={contractBusy || contractLoading}
            >
              {contractBusy
                ? 'Preparando contrato...'
                : contractStatus === 'rejected'
                  ? 'Gerar novo contrato'
                  : 'Gerar e baixar contrato'}
              {!contractBusy && <FileText size={17} />}
            </button>
          )}

          {canUploadContract && (
            <form className="fc-payment-form" onSubmit={handleContractUpload}>
              <div className="fc-form-divider">
                <span>Enviar contrato assinado</span>
              </div>

              <label className="fc-upload-area">
                <UploadCloud size={28} />
                <strong>
                  {contractFile?.name || 'Selecionar contrato assinado'}
                </strong>
                <span>Somente PDF — máximo de 10 MB</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={event => {
                    setContractFile(event.target.files?.[0] || null)
                    setContractError('')
                  }}
                />
              </label>

              <button
                type="submit"
                className="fc-auth-submit"
                disabled={contractBusy || !contractFile}
              >
                {contractBusy ? 'Enviando contrato...' : 'Enviar contrato assinado'}
                {!contractBusy && <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {contractStatus === 'awaiting_approval' && (
            <PortalMessage type="success">
              Recebemos seu contrato. Ele está aguardando análise administrativa.
            </PortalMessage>
          )}

          {contractStatus === 'approved' && (
            <PortalMessage type="success">
              Seu contrato foi aprovado.
            </PortalMessage>
          )}

          {status === 'pending_review' && (
            <PortalMessage type="warning">
              O pagamento será liberado após a aprovação do cadastro da sua empresa.
            </PortalMessage>
          )}

          {!contractApproved && !['awaiting_contract', 'pending_review', 'rejected'].includes(status) && (
            <PortalMessage type="warning">
              A etapa de pagamento ficará disponível somente depois que o contrato for enviado e aprovado pela equipe FOODCORE.
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
              Sua empresa está ativa. Caso precise enviar um comprovante de renovação,
              utilize o formulário abaixo.
            </PortalMessage>
          )}

          {canAccessPayment && paymentLink && (
            <div className="fc-payment-link-box">
              <span>LINK DE PAGAMENTO DISPONIBILIZADO PELA FOODCORE</span>
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="fc-auth-submit"
              >
                Abrir pagamento externo <ArrowUpRight size={17} />
              </a>
            </div>
          )}

          {canSubmitReceipt && (
            <form className="fc-payment-form" onSubmit={handleReceiptSubmit}>
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
                  {receiptFile?.name || 'Selecione seu comprovante'}
                </strong>
                <span>PDF, JPG ou PNG — máximo de 10 MB</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={event => {
                    setReceiptFile(event.target.files?.[0] || null)
                    setReceiptError('')
                  }}
                />
              </label>

              {receiptError && (
                <PortalMessage type="error">{receiptError}</PortalMessage>
              )}

              {receiptMessage && (
                <PortalMessage type="success">{receiptMessage}</PortalMessage>
              )}

              <button
                type="submit"
                className="fc-auth-submit"
                disabled={sendingReceipt || !receiptFile}
              >
                {sendingReceipt ? 'Enviando comprovante...' : 'Enviar comprovante'}
                {!sendingReceipt && <ArrowRight size={17} />}
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
// DOWNLOAD DO INSTALADOR
// =====================================================

export function CustomerDownloadPage() {
  const { customer, loading, error } = useCustomerProfile()

  const [release, setRelease] = useState(null)
  const [releaseError, setReleaseError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const authorized =
    customer?.companyStatus === 'active' &&
    customer?.registrationStatus === 'active'

  useEffect(() => {
    let cancelled = false

    if (!authorized) {
      setRelease(null)
      return undefined
    }

    getLatestRelease()
      .then(result => {
        if (!cancelled) {
          // A API pode retornar o objeto diretamente ou encapsulado.
          setRelease(result?.release || result)
          setReleaseError('')
        }
      })
      .catch(err => {
        if (!cancelled) {
          setReleaseError(err?.message || 'Não foi possível consultar a versão.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [authorized])

  async function handleDownload() {
    if (!release?.downloadUrl) {
      setReleaseError('O endereço do instalador não está disponível.')
      return
    }

    setDownloading(true)
    setReleaseError('')

    try {
      await downloadRelease(release.downloadUrl)
    } catch (err) {
      setReleaseError(err?.message || 'Não foi possível baixar o instalador.')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) return <LoadingScreen />
  if (!customer) return <SessionError error={error} />

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
              O instalador estará disponível após a aprovação do cadastro
              e a confirmação do pagamento.
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
                  <span>Versão {release.version || 'mais recente'}</span>
                </div>
                <span className="fc-release-badge">Disponível</span>
              </div>

              {release.notes && (
                <div className="fc-release-notes">
                  <strong>Notas da versão</strong>
                  <p>{release.notes}</p>
                </div>
              )}

              <button
                type="button"
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

          <a href="/minha-conta" className="fc-portal-back">
            <ArrowLeft size={16} />
            Voltar para minha conta
          </a>
        </section>
      </div>
    </PortalLayout>
  )
}
