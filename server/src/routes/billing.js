import { Router } from 'express'
import crypto from 'node:crypto'
import { createCheckout } from '../services/pagbank.js'
import { readStore, writeStore } from '../store.js'
const router = Router()
const plans = {
  starter: { id: 'starter', name: 'FOODCORE Essencial', amountCents: 9900, interval: 'MONTHLY', billingCycles: 0 },
  pro: { id: 'pro', name: 'FOODCORE Profissional', amountCents: 14900, interval: 'MONTHLY', billingCycles: 0 }
}
router.post('/checkout', async (req, res) => {
  try {
    const { planId, method, recurring = false, customer } = req.body || {}
    const plan = plans[planId]
    if (!plan) return res.status(400).json({ error: 'Plano inválido. Configure os planos em server/src/routes/billing.js.' })
    if (!['pix', 'card'].includes(method)) return res.status(400).json({ error: 'Método deve ser pix ou card.' })
    if (!customer?.name || !customer?.email) return res.status(400).json({ error: 'Informe nome e e-mail do cliente.' })
    const checkout = await createCheckout({ plan, customer, method, recurring: Boolean(recurring) })
    res.status(201).json({ checkout })
  } catch (error) { res.status(error.status || 500).json({ error: error.message }) }
})
router.post('/webhook', async (req, res) => {
  // TODO: validar autenticidade/origem conforme mecanismo oficial habilitado na conta PagBank.
  // Não conceder/renovar licença até validar evento e consultar o pagamento no PagBank.
  const event = req.body || {}
  const db = await readStore()
  db.billingEvents.push({ id: crypto.randomUUID(), receivedAt: new Date().toISOString(), eventType: event?.type || event?.event || 'unknown', reference: event?.reference_id || null, processed: false })
  await writeStore(db)
  res.status(202).json({ received: true, processed: false })
})
export default router
