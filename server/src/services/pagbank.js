/**
 * Adaptador inicial PagBank.
 * Recorrência da API PagBank exige conta PJ aprovada/onboarding. O Checkout Recorrente
 * documentado atualmente aceita cartão; Pix deve ser tratado como cobrança avulsa.
 * Ajuste o payload conforme produto/conta liberados e valide webhooks antes de ativar licença.
 */
export async function createCheckout({ plan, customer, method = 'card', recurring = false }) {
  const token = process.env.PAGBANK_ACCESS_TOKEN
  if (!token) throw Object.assign(new Error('PagBank ainda não configurado. Defina PAGBANK_ACCESS_TOKEN no servidor.'), { status: 503 })
  if (recurring && method !== 'card') throw Object.assign(new Error('No Checkout Recorrente PagBank, a recorrência está disponível atualmente apenas para cartão. Pix pode ser usado como cobrança avulsa.'), { status: 400 })
  const base = process.env.PAGBANK_API_BASE_URL || 'https://sandbox.api.pagseguro.com'
  const endpoint = process.env.PAGBANK_CHECKOUT_PATH || '/checkouts'
  const payload = {
    reference_id: `FOODCORE-${plan.id}-${Date.now()}`,
    customer,
    items: [{ reference_id: plan.id, name: plan.name, quantity: 1, unit_amount: plan.amountCents }],
    redirect_url: process.env.PAGBANK_REDIRECT_URL || 'https://foodcore.com.br/checkout/retorno',
    notification_urls: [process.env.PAGBANK_NOTIFICATION_URL].filter(Boolean),
    payment_methods: method === 'pix' ? [{ type: 'PIX' }] : [{ type: 'CREDIT_CARD' }],
    ...(recurring ? { recurrence_plan: { name: plan.name, interval: plan.interval || 'MONTHLY', billing_cycles: plan.billingCycles || 0 } } : {})
  }
  const response = await fetch(new URL(endpoint, base), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-idempotency-key': payload.reference_id },
    body: JSON.stringify(payload)
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(result.message || `PagBank respondeu HTTP ${response.status}.`), { status: 502, provider: result })
  return result
}
