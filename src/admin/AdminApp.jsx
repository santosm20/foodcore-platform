import React, { useEffect, useState } from 'react'
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  FileArchive,
  FileCheck,
  KeyRound,
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
  CreditCard
} from 'lucide-react'

import './admin.css'

const API = import.meta.env.VITE_API_URL || 'https://foodcore-api.onrender.com/api'

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  })
}

function formatDate(value) {
  if (!value) return '-'

  return new Date(`${value}`.length === 10 ? `${value}T12:00:00` : value)
    .toLocaleString('pt-BR')
}

export default function AdminApp() {
  const [token, setToken] = useState(
    sessionStorage.getItem('foodcore_admin_token') || ''
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('1.0.0')
  const [notes, setNotes] = useState('')

  const [releases, setReleases] = useState([])
  const [contracts, setContracts] = useState([])
  const [payments, setPayments] = useState([])

  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  const [busy, setBusy] = useState(false)
  const [loadingContracts, setLoadingContracts] = useState(false)
  const [loadingPayments, setLoadingPayments] = useState(false)

  const [selectedContract, setSelectedContract] = useState(null)
  const [selectedPayment, setSelectedPayment] = useState(null)

  const [rejectionReason, setRejectionReason] = useState('')
  const [paymentRejectionReason, setPaymentRejectionReason] = useState('')

  function showMessage(text, type = 'success') {
    setMessage(text)
    setMessageType(type)
  }

  function logout() {
    sessionStorage.removeItem('foodcore_admin_token')

    setToken('')
    setReleases([])
    setContracts([])
    setPayments([])
    setSelectedContract(null)
    setSelectedPayment(null)
  }

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {})
      }
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 401 && token) {
        logout()
      }

      throw new Error(
        data.error || 'Não foi possível concluir a solicitação.'
      )
    }

    return data
  }

  async function downloadFile(path, filename, errorMessage) {
    const response = await fetch(`${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
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

    window.URL.revokeObjectURL(url)
  }

  async function loadReleases() {
    try {
      const data = await request('/admin/releases')
      setReleases(data.releases || [])
    } catch (error) {
      showMessage(error.message, 'error')
    }
  }

  async function loadContracts() {
    setLoadingContracts(true)

    try {
      const data = await request('/admin/contracts')
      setContracts(data.contracts || [])
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setLoadingContracts(false)
    }
  }

  async function loadPayments() {
    setLoadingPayments(true)

    try {
      const data = await request('/admin/payments')
      setPayments(data.payments || [])
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setLoadingPayments(false)
    }
  }

  async function loadDashboard() {
    await Promise.all([
      loadReleases(),
      loadContracts(),
      loadPayments()
    ])
  }

  useEffect(() => {
    if (token) {
      loadDashboard()
    }
  }, [token])

  async function login(event) {
    event.preventDefault()

    setBusy(true)
    setMessage('')

    try {
      const data = await request('/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password
        })
      })

      sessionStorage.setItem('foodcore_admin_token', data.token)
      setToken(data.token)
      setPassword('')
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function upload(event) {
    event.preventDefault()

    if (!file) {
      return showMessage(
        'Selecione o instalador .exe primeiro.',
        'error'
      )
    }

    const form = new FormData()

    form.append('installer', file)
    form.append('version', version)
    form.append('notes', notes)

    setBusy(true)
    setMessage('')

    try {
      const data = await request('/admin/releases', {
        method: 'POST',
        body: form
      })

      showMessage(
        `Versão ${data.release.version} publicada com sucesso.`
      )

      setFile(null)
      event.target.reset()

      await loadReleases()
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function downloadContract(contract) {
    setBusy(true)
    setMessage('')

    try {
      await downloadFile(
        `/admin/contracts/${contract.id}/signed/download`,
        `contrato-assinado-${contract.contract_number}.pdf`,
        'Falha ao baixar o contrato.'
      )

      showMessage('Download do contrato iniciado.')
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function decideContract(decision) {
    if (!selectedContract) return

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
      return showMessage(
        'Informe uma justificativa com pelo menos 5 caracteres.',
        'error'
      )
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

      showMessage(data.message)

      setSelectedContract(null)
      setRejectionReason('')

      await Promise.all([
        loadContracts(),
        loadPayments()
      ])
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function downloadPaymentReceipt(payment) {
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
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function decidePayment(decision) {
    if (!selectedPayment) return

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
      return showMessage(
        'Informe uma justificativa com pelo menos 5 caracteres.',
        'error'
      )
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

      showMessage(data.message)

      setSelectedPayment(null)
      setPaymentRejectionReason('')

      await loadPayments()
    } catch (error) {
      showMessage(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }

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
              Acesse para gerenciar contratos,
              pagamentos, licenças e distribuição do ERP.
            </p>

            <form onSubmit={login}>
              <label>E-mail administrativo</label>

              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                required
                placeholder="admin@foodcore.com.br"
              />

              <label>Senha</label>

              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
                placeholder="Sua senha"
              />

              <button disabled={busy}>
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
              Gerencie contratos, pagamentos, clientes
              e atualizações do FOODCORE ERP.
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

        <section className="admin-stats">

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

        {/* CONTRATOS */}

        <section className="admin-panel contract-section">

          <div className="admin-panel-title">
            <div>
              <h2>Gestão de contratos</h2>
              <p>
                Analise os documentos enviados pelos clientes.
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
                        {contract.company?.trade_name ||
                          contract.company?.legal_name ||
                          'Empresa não identificada'}
                      </h3>

                      <span>
                        {contract.company?.legal_name}
                      </span>

                      <small>
                        Contrato {contract.contract_number}
                      </small>
                    </div>
                  </div>

                  <div className="contract-card-meta">
                    <span>
                      {contract.company?.cnpj || 'CNPJ não informado'}
                    </span>

                    <span>
                      {contract.signed_at
                        ? formatDate(contract.signed_at)
                        : 'Data não informada'}
                    </span>

                    <b>{formatCurrency(contract.monthly_price)}/mês</b>
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
                        {payment.company?.trade_name ||
                          payment.company?.legal_name ||
                          'Empresa não identificada'}
                      </h3>

                      <span>
                        {payment.company?.legal_name || '-'}
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
                onChange={event =>
                  setFile(event.target.files?.[0] || null)
                }
                required
              />

              <small>
                Limite padrão de 500 MB.
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

              <button disabled={busy}>
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
            >
              <RefreshCw size={15} />
              Atualizar
            </button>
          </div>

          {releases.length === 0 ? (
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

      {/* MODAL DE CONTRATO */}

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

                <h2>Contrato {selectedContract.contract_number}</h2>
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
                  <div>
                    <small>Razão social</small>
                    <b>{selectedContract.company?.legal_name || '-'}</b>
                  </div>

                  <div>
                    <small>Nome fantasia</small>
                    <b>{selectedContract.company?.trade_name || '-'}</b>
                  </div>

                  <div>
                    <small>CNPJ</small>
                    <b>{selectedContract.company?.cnpj || '-'}</b>
                  </div>

                  <div>
                    <small>E-mail</small>
                    <b>{selectedContract.company?.email || '-'}</b>
                  </div>

                  <div>
                    <small>Telefone</small>
                    <b>{selectedContract.company?.phone || '-'}</b>
                  </div>

                  <div>
                    <small>Representante</small>
                    <b>{selectedContract.company?.representative_name || '-'}</b>
                  </div>

                  <div>
                    <small>CPF do representante</small>
                    <b>{selectedContract.company?.representative_cpf || '-'}</b>
                  </div>

                  <div>
                    <small>Localização</small>
                    <b>
                      {[selectedContract.company?.city, selectedContract.company?.state]
                        .filter(Boolean)
                        .join(' / ') || '-'}
                    </b>
                  </div>
                </div>
              </div>

              <div className="contract-detail-block">
                <h3>
                  <FileCheck size={17} />
                  Dados do contrato
                </h3>

                <div className="contract-detail-grid">
                  <div>
                    <small>Valor mensal</small>
                    <b>{formatCurrency(selectedContract.monthly_price)}</b>
                  </div>

                  <div>
                    <small>Recebido em</small>
                    <b>{formatDate(selectedContract.signed_at)}</b>
                  </div>

                  <div>
                    <small>Status</small>
                    <b className="contract-pending">
                      Aguardando análise
                    </b>
                  </div>
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

      {/* MODAL DE PAGAMENTO */}

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
                  <div>
                    <small>Empresa</small>
                    <b>
                      {selectedPayment.company?.trade_name ||
                        selectedPayment.company?.legal_name ||
                        '-'}
                    </b>
                  </div>

                  <div>
                    <small>Razão social</small>
                    <b>{selectedPayment.company?.legal_name || '-'}</b>
                  </div>

                  <div>
                    <small>CNPJ</small>
                    <b>{selectedPayment.company?.cnpj || '-'}</b>
                  </div>

                  <div>
                    <small>E-mail</small>
                    <b>{selectedPayment.company?.email || '-'}</b>
                  </div>
                </div>
              </div>

              <div className="contract-detail-block">
                <h3>
                  <CreditCard size={17} />
                  Dados do pagamento
                </h3>

                <div className="contract-detail-grid">
                  <div>
                    <small>Valor</small>
                    <b>{formatCurrency(selectedPayment.amount)}</b>
                  </div>

                  <div>
                    <small>Vencimento</small>
                    <b>{formatDate(selectedPayment.due_date)}</b>
                  </div>

                  <div>
                    <small>Forma de pagamento</small>
                    <b>
                      {selectedPayment.payment_method === 'pix'
                        ? 'PIX'
                        : 'Transferência bancária'}
                    </b>
                  </div>

                  <div>
                    <small>Data de envio</small>
                    <b>{formatDate(selectedPayment.created_at)}</b>
                  </div>

                  <div>
                    <small>Status</small>
                    <b className="contract-pending">
                      {selectedPayment.status === 'under_review'
                        ? 'Em análise'
                        : 'Pendente'}
                    </b>
                  </div>
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
                  onChange={event => setPaymentRejectionReason(event.target.value)}
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