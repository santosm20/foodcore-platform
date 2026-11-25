
// =====================================================
// FOODCORE — CUSTOMER API
// =====================================================

const API_URL = 'https://foodcore-api.onrender.com/api'
const API_ORIGIN = API_URL.replace(/\/api\/?$/, '')

const TOKEN_KEY = 'foodcore_customer_token'

// =====================================================
// SESSÃO E AUTENTICAÇÃO
// =====================================================

export function getCustomerToken() {
  return sessionStorage.getItem(TOKEN_KEY)
}

export function saveCustomerToken(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Token de autenticação inválido.')
  }

  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearCustomerSession() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function logoutCustomer() {
  clearCustomerSession()
  window.location.href = '/login'
}

// =====================================================
// UTILITÁRIOS
// =====================================================

function buildApiUrl(endpoint) {
  if (typeof endpoint !== 'string' || !endpoint.trim()) {
    throw new Error('Endpoint da API inválido.')
  }

  const normalizedEndpoint = endpoint.startsWith('/')
    ? endpoint
    : `/${endpoint}`

  return `${API_URL}${normalizedEndpoint}`
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      throw new Error('O servidor retornou uma resposta inválida.')
    }
  }

  if (contentType.includes('text/')) {
    return response.text()
  }

  return null
}

function getErrorMessage(data, status) {
  if (typeof data === 'string' && data.trim()) {
    return data
  }

  return (
    data?.error ||
    data?.message ||
    `Erro na comunicação com o servidor (${status}).`
  )
}

// =====================================================
// REQUISIÇÕES HTTP
// =====================================================

async function request(endpoint, options = {}) {
  const token = getCustomerToken()

  const isFormData = options.body instanceof FormData

  const headers = {
    Accept: 'application/json',
    ...options.headers
  }

  if (options.body && !isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response

  try {
    response = await fetch(buildApiUrl(endpoint), {
      ...options,
      headers
    })
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor FOODCORE. Verifique sua conexão.'
    )
  }

  const data = await parseResponse(response)

  if (!response.ok) {
    if (response.status === 401) {
      clearCustomerSession()
    }

    throw new Error(getErrorMessage(data, response.status))
  }

  return data
}

// =====================================================
// CADASTRO DE CLIENTE
// =====================================================

export async function registerCustomer(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados do cadastro são inválidos.')
  }

  return request('/customers/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

// =====================================================
// LOGIN
// =====================================================

export async function loginCustomer(email, password) {
  if (!email?.trim() || !password) {
    throw new Error('Informe seu e-mail e sua senha.')
  }

  const result = await request('/customers/login', {
    method: 'POST',
    body: JSON.stringify({
      email: email.trim(),
      password
    })
  })

  const accessToken = result?.session?.access_token

  if (!accessToken) {
    throw new Error(
      'O servidor não retornou um token de autenticação válido.'
    )
  }

  saveCustomerToken(accessToken)

  return result
}

// =====================================================
// PERFIL DO CLIENTE
// =====================================================

export async function getCustomerProfile() {
  if (!getCustomerToken()) {
    throw new Error('Sua sessão expirou. Entre novamente.')
  }

  return request('/customers/me')
}

// =====================================================
// PAGAMENTO E COMPROVANTE
// =====================================================

export async function uploadPaymentReceipt(file, paymentMethod) {
  if (!(file instanceof File)) {
    throw new Error('Selecione um comprovante válido.')
  }

  if (file.size <= 0) {
    throw new Error('O arquivo selecionado está vazio.')
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error('O comprovante ultrapassa o limite de 10 MB.')
  }

  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png'
  ]

  if (!allowedTypes.includes(file.type)) {
    throw new Error('Formato inválido. Envie PDF, JPG ou PNG.')
  }

  const allowedMethods = [
    'pix',
    'bank_transfer'
  ]

  if (!allowedMethods.includes(paymentMethod)) {
    throw new Error('Forma de pagamento inválida.')
  }

  const formData = new FormData()

  formData.append('receipt', file)
  formData.append('payment_method', paymentMethod)

  return request('/billing/receipt', {
    method: 'POST',
    body: formData
  })
}

// =====================================================
// VERSÃO MAIS RECENTE DO FOODCORE ERP
// =====================================================

export async function getLatestRelease() {
  return request('/releases/latest')
}

// =====================================================
// DOWNLOAD AUTENTICADO
// =====================================================

function resolveDownloadUrl(downloadUrl) {
  if (typeof downloadUrl !== 'string' || !downloadUrl.trim()) {
    throw new Error('Endereço de download inválido.')
  }

  let url

  try {
    if (/^https?:\/\//i.test(downloadUrl)) {
      url = new URL(downloadUrl)
    } else if (downloadUrl.startsWith('/api/')) {
      url = new URL(downloadUrl, API_ORIGIN)
    } else {
      const endpoint = downloadUrl.startsWith('/')
        ? downloadUrl
        : `/${downloadUrl}`

      url = new URL(endpoint, API_URL)
    }
  } catch {
    throw new Error('Não foi possível identificar o endereço de download.')
  }

  if (
    url.protocol !== 'https:' ||
    url.origin !== API_ORIGIN
  ) {
    throw new Error('Endereço de download não autorizado.')
  }

  return url.toString()
}

function getDownloadFilename(response) {
  const disposition = response.headers.get('content-disposition') || ''

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i)

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].replace(/["']/g, ''))
    } catch {
      // Continua para a tentativa convencional.
    }
  }

  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)

  return filenameMatch?.[1] || 'FOODCORE-Setup'
}

export async function downloadRelease(downloadUrl) {
  const token = getCustomerToken()

  if (!token) {
    throw new Error('Sua sessão expirou. Entre novamente.')
  }

  const url = resolveDownloadUrl(downloadUrl)

  let response

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/octet-stream'
      }
    })
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor para baixar o instalador.'
    )
  }

  if (!response.ok) {
    const data = await parseResponse(response)

    if (response.status === 401) {
      clearCustomerSession()
    }

    throw new Error(getErrorMessage(data, response.status))
  }

  const blob = await response.blob()

  if (!blob.size) {
    throw new Error('O arquivo disponibilizado está vazio.')
  }

  const filename = getDownloadFilename(response)
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}
