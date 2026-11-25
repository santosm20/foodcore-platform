
import React, { useState } from 'react'

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound
} from 'lucide-react'

import {
  loginCustomer,
  registerCustomer
} from '../services/customerApi.js'

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const REGISTRATION_EMAIL_KEY = 'foodcore_registration_email'

// =====================================================
// LAYOUT DE AUTENTICAÇÃO
// =====================================================

function AuthLayout({ children, subtitle }) {
  return (
    <main className="fc-auth-page">
      <div className="fc-auth-glow" />

      <header className="fc-auth-header">
        <a href="/" className="fc-auth-brand">
          <span className="fc-auth-brand-icon">F</span>
          <span>FOODCORE</span>
        </a>

        <a href="/" className="fc-auth-back">
          <ArrowLeft size={16} />
          Voltar ao site
        </a>
      </header>

      <section className="fc-auth-content">
        <div className="fc-auth-heading">
          <span className="fc-auth-eyebrow">
            GESTÃO INTELIGENTE
          </span>

          <h1>{subtitle}</h1>

          <p>
            Tecnologia, controle e eficiência para o seu negócio.
          </p>
        </div>

        {children}
      </section>

      <footer className="fc-auth-footer">
        FOODCORE © {new Date().getFullYear()} — Todos os direitos reservados.
      </footer>
    </main>
  )
}

// =====================================================
// CAMPO DE FORMULÁRIO
// =====================================================

function FormField({
  label,
  name,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  autoComplete,
  maxLength,
  minLength,
  inputMode,
  autoCapitalize
}) {
  const [visible, setVisible] = useState(false)

  const isPassword = type === 'password'

  const inputType = isPassword && visible
    ? 'text'
    : type

  return (
    <label className="fc-field">
      <span>{label}</span>

      <div className="fc-input-wrap">
        <input
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          maxLength={maxLength}
          minLength={minLength}
          inputMode={inputMode}
          autoCapitalize={autoCapitalize}
        />

        {isPassword && (
          <button
            type="button"
            className="fc-password-toggle"
            onClick={() => setVisible(current => !current)}
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {visible
              ? <EyeOff size={17} />
              : <Eye size={17} />
            }
          </button>
        )}
      </div>
    </label>
  )
}

// =====================================================
// FORMATAÇÃO DE DOCUMENTOS
// =====================================================

function onlyDigits(value) {
  return value.replace(/\D/g, '')
}

function formatCpf(value) {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

function formatCnpj(value) {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14)

  // CNPJ alfanumérico: mantém os caracteres sem aplicar
  // a máscara numérica tradicional.
  if (/[A-Z]/.test(normalized)) {
    return normalized
  }

  return normalized
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

// =====================================================
// ESTADO INICIAL DO CADASTRO
// =====================================================

const INITIAL_FORM = {
  legal_name: '',
  trade_name: '',
  cnpj: '',
  state_registration: '',
  email: '',
  phone: '',
  postal_code: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  representative_name: '',
  representative_cpf: '',
  password: '',
  confirmPassword: ''
}

// =====================================================
// NORMALIZAÇÃO DO CADASTRO
// =====================================================

function normalizeRegistrationPayload(form) {
  const {
    confirmPassword,
    password,
    ...fields
  } = form

  const normalizedFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' ? value.trim() : value
    ])
  )

  return {
    ...normalizedFields,

    email: normalizedFields.email.toLowerCase(),

    cnpj: normalizedFields.cnpj.replace(/[^A-Z0-9]/gi, '').toUpperCase(),

    representative_cpf: onlyDigits(
      normalizedFields.representative_cpf
    ),

    postal_code: onlyDigits(
      normalizedFields.postal_code
    ),

    state: normalizedFields.state.toUpperCase(),

    password
  }
}

// =====================================================
// VALIDAÇÃO DO CADASTRO
// =====================================================

function validateRegistration(form) {
  if (!form.legal_name.trim()) {
    return 'Informe a razão social da empresa.'
  }

  if (form.legal_name.trim().length > 200) {
    return 'A razão social deve ter no máximo 200 caracteres.'
  }

  if (form.trade_name.trim().length > 200) {
    return 'O nome fantasia deve ter no máximo 200 caracteres.'
  }

  if (!form.cnpj.trim()) {
    return 'Informe o CNPJ da empresa.'
  }

  const cnpj = form.cnpj.replace(/[^A-Z0-9]/gi, '')

  if (cnpj.length !== 14) {
    return 'O CNPJ deve conter 14 caracteres.'
  }

  if (!form.email.trim()) {
    return 'Informe o e-mail de acesso.'
  }

  if (form.email.trim().length > 254) {
    return 'O e-mail deve ter no máximo 254 caracteres.'
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  if (!emailRegex.test(form.email.trim())) {
    return 'Informe um endereço de e-mail válido.'
  }

  if (!form.representative_name.trim()) {
    return 'Informe o nome do responsável pela empresa.'
  }

  if (form.representative_name.trim().length > 150) {
    return 'O nome do responsável deve ter no máximo 150 caracteres.'
  }

  if (onlyDigits(form.representative_cpf).length !== 11) {
    return 'O CPF do responsável deve conter 11 números.'
  }

  if (form.state && form.state.trim().length !== 2) {
    return 'Informe uma UF válida com duas letras.'
  }

  if (
    form.postal_code &&
    onlyDigits(form.postal_code).length !== 8
  ) {
    return 'O CEP deve conter 8 números.'
  }

  if (form.password.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.'
  }

  if (form.password.length > 128) {
    return 'A senha deve ter no máximo 128 caracteres.'
  }

  if (form.password !== form.confirmPassword) {
    return 'As senhas não coincidem.'
  }

  return null
}

// =====================================================
// CADASTRO DE CLIENTE
// =====================================================

export function CustomerRegisterPage() {
  const [form, setForm] = useState(INITIAL_FORM)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function updateField(event) {
    const { name, value } = event.target

    let normalizedValue = value

    switch (name) {
      case 'cnpj':
        normalizedValue = formatCnpj(value)
        break

      case 'representative_cpf':
        normalizedValue = formatCpf(value)
        break

      case 'state':
        normalizedValue = value
          .replace(/[^a-z]/gi, '')
          .toUpperCase()
          .slice(0, 2)
        break

      case 'postal_code':
        normalizedValue = onlyDigits(value).slice(0, 8)
        break

      default:
        break
    }

    setForm(current => ({
      ...current,
      [name]: normalizedValue
    }))

    if (error) {
      setError('')
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (loading) return

    setError('')

    const validationError = validateRegistration(form)

    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    try {
      const payload = normalizeRegistrationPayload(form)

      const result = await registerCustomer(payload)

      const registrationEmail =
        result?.customer?.email ||
        payload.email

      sessionStorage.setItem(
        REGISTRATION_EMAIL_KEY,
        registrationEmail
      )

      window.location.href = '/aguardando-aprovacao'
    } catch (err) {
      setError(
        err.message ||
        'Não foi possível enviar seu cadastro. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout subtitle="Cadastre sua empresa">
      <form
        className="fc-auth-card"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="fc-auth-card-title">
          <Building2 size={21} />

          <div>
            <h2>Dados da empresa</h2>
            <p>Informe os dados para solicitar seu acesso.</p>
          </div>
        </div>

        <div className="fc-form-grid">
          <FormField
            label="Razão social"
            name="legal_name"
            value={form.legal_name}
            onChange={updateField}
            placeholder="Nome registrado da empresa"
            maxLength={200}
            autoComplete="organization"
            required
          />

          <FormField
            label="Nome fantasia"
            name="trade_name"
            value={form.trade_name}
            onChange={updateField}
            placeholder="Nome comercial"
            maxLength={200}
            autoComplete="organization"
          />

          <FormField
            label="CNPJ"
            name="cnpj"
            value={form.cnpj}
            onChange={updateField}
            placeholder="00.000.000/0000-00"
            maxLength={18}
            autoCapitalize="characters"
            required
          />

          <FormField
            label="Inscrição estadual"
            name="state_registration"
            value={form.state_registration}
            onChange={updateField}
            placeholder="Inscrição estadual"
          />

          <FormField
            label="E-mail de acesso"
            name="email"
            type="email"
            value={form.email}
            onChange={updateField}
            placeholder="empresa@email.com"
            autoComplete="email"
            maxLength={254}
            required
          />

          <FormField
            label="Telefone"
            name="phone"
            value={form.phone}
            onChange={updateField}
            placeholder="(11) 99999-9999"
            autoComplete="tel"
          />
        </div>

        <div className="fc-form-divider">
          <span>Endereço da empresa</span>
        </div>

        <div className="fc-form-grid">
          <FormField
            label="CEP"
            name="postal_code"
            value={form.postal_code}
            onChange={updateField}
            placeholder="00000000"
            maxLength={8}
            inputMode="numeric"
            autoComplete="postal-code"
          />

          <FormField
            label="Estado (UF)"
            name="state"
            value={form.state}
            onChange={updateField}
            placeholder="SP"
            maxLength={2}
            autoComplete="address-level1"
          />

          <FormField
            label="Cidade"
            name="city"
            value={form.city}
            onChange={updateField}
            placeholder="Sua cidade"
            autoComplete="address-level2"
          />

          <FormField
            label="Bairro"
            name="neighborhood"
            value={form.neighborhood}
            onChange={updateField}
            placeholder="Bairro"
          />

          <FormField
            label="Rua / Avenida"
            name="street"
            value={form.street}
            onChange={updateField}
            placeholder="Logradouro"
            autoComplete="street-address"
          />

          <FormField
            label="Número"
            name="number"
            value={form.number}
            onChange={updateField}
            placeholder="Número"
          />

          <FormField
            label="Complemento"
            name="complement"
            value={form.complement}
            onChange={updateField}
            placeholder="Sala, loja, referência..."
          />
        </div>

        <div className="fc-form-divider">
          <span>Responsável pela empresa</span>
        </div>

        <div className="fc-form-grid">
          <FormField
            label="Nome completo"
            name="representative_name"
            value={form.representative_name}
            onChange={updateField}
            placeholder="Nome do responsável"
            maxLength={150}
            autoComplete="name"
            required
          />

          <FormField
            label="CPF do responsável"
            name="representative_cpf"
            value={form.representative_cpf}
            onChange={updateField}
            placeholder="000.000.000-00"
            maxLength={14}
            inputMode="numeric"
            required
          />
        </div>

        <div className="fc-form-divider">
          <span>Criação de acesso</span>
        </div>

        <div className="fc-form-grid">
          <FormField
            label="Senha"
            name="password"
            type="password"
            value={form.password}
            onChange={updateField}
            placeholder="Mínimo de 8 caracteres"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />

          <FormField
            label="Confirmar senha"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={updateField}
            placeholder="Repita sua senha"
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </div>

        {error && (
          <div
            className="fc-auth-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        <div className="fc-auth-security">
          <ShieldCheck size={18} />

          <span>
            Seus dados são enviados de forma segura para análise cadastral.
            O CPF do responsável não é exibido no portal do cliente.
          </span>
        </div>

        <button
          type="submit"
          className="fc-auth-submit"
          disabled={loading}
        >
          {loading ? 'Enviando cadastro...' : 'Solicitar cadastro'}

          {!loading && <ArrowRight size={18} />}
        </button>

        <p className="fc-auth-switch">
          Já possui uma conta? <a href="/login">Entrar</a>
        </p>
      </form>
    </AuthLayout>
  )
}

// =====================================================
// LOGIN DO CLIENTE
// =====================================================

export function CustomerLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (loading) return

    setError('')

    if (!email.trim() || !password) {
      setError('Informe seu e-mail e sua senha.')
      return
    }

    setLoading(true)

    try {
      await loginCustomer(
        email.trim().toLowerCase(),
        password
      )

      window.location.href = '/minha-conta'
    } catch (err) {
      setError(
        err.message ||
        'Não foi possível entrar. Verifique suas credenciais.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout subtitle="Acesse sua conta">
      <form
        className="fc-auth-card fc-login-card"
        onSubmit={handleSubmit}
      >
        <div className="fc-auth-card-title">
          <LockKeyhole size={21} />

          <div>
            <h2>Área do cliente</h2>
            <p>Entre para acompanhar sua empresa.</p>
          </div>
        </div>

        <FormField
          label="E-mail"
          name="email"
          type="email"
          value={email}
          onChange={event => {
            setEmail(event.target.value)
            setError('')
          }}
          placeholder="seu@email.com"
          autoComplete="email"
          required
        />

        <FormField
          label="Senha"
          name="password"
          type="password"
          value={password}
          onChange={event => {
            setPassword(event.target.value)
            setError('')
          }}
          placeholder="Digite sua senha"
          autoComplete="current-password"
          required
        />

        {error && (
          <div
            className="fc-auth-error"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="fc-auth-submit"
          disabled={loading}
        >
          {loading ? 'Entrando...' : 'Entrar na plataforma'}

          {!loading && <ArrowRight size={18} />}
        </button>

        <p className="fc-auth-switch">
          Ainda não possui cadastro? <a href="/cadastro">Criar conta</a>
        </p>
      </form>
    </AuthLayout>
  )
}

// =====================================================
// CONFIRMAÇÃO DE CADASTRO
// =====================================================

export function RegistrationPendingPage() {
  const email = sessionStorage.getItem(REGISTRATION_EMAIL_KEY)

  return (
    <AuthLayout subtitle="Cadastro recebido">
      <div className="fc-auth-card fc-pending-card">
        <div className="fc-pending-icon">
          <CheckCircle2 size={34} />
        </div>

        <h2>Solicitação enviada com sucesso!</h2>

        <p>
          Recebemos os dados da sua empresa. Nossa equipe fará
          a análise cadastral antes de liberar a etapa de pagamento.
        </p>

        {email && (
          <div className="fc-pending-email">
            <Mail size={17} />
            {email}
          </div>
        )}

        <div className="fc-pending-steps">
          <div className="fc-pending-step is-complete">
            <CheckCircle2 size={18} />
            Cadastro recebido
          </div>

          <div className="fc-pending-step">
            <UserRound size={18} />
            Análise administrativa
          </div>

          <div className="fc-pending-step">
            <LockKeyhole size={18} />
            Liberação do pagamento
          </div>
        </div>

        <a href="/login" className="fc-auth-submit">
          Ir para o login <ArrowRight size={18} />
        </a>
      </div>
    </AuthLayout>
  )
}
