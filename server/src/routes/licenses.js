import { Router } from 'express'
import crypto from 'node:crypto'
import { readStore, writeStore } from '../store.js'
import { requireAdmin } from '../middleware/auth.js'
const router = Router()
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex')
router.post('/activate', async (req, res) => {
  const { licenseKey, machineId, appVersion } = req.body || {}
  if (!licenseKey || !machineId) return res.status(400).json({ error: 'licenseKey e machineId são obrigatórios.' })
  const db = await readStore(); const license = db.licenses.find(x => x.keyHash === hash(licenseKey))
  if (!license || license.status !== 'active' || new Date(license.expiresAt) < new Date()) return res.status(403).json({ valid: false, error: 'Licença inválida, suspensa ou expirada.' })
  const device = hash(machineId)
  if (license.deviceHash && license.deviceHash !== device) return res.status(409).json({ valid: false, error: 'Esta licença já está vinculada a outro computador.' })
  license.deviceHash = device; license.lastSeenAt = new Date().toISOString(); license.lastAppVersion = appVersion || null
  await writeStore(db)
  res.json({ valid: true, expiresAt: license.expiresAt, offlineGraceHours: 72 })
})
router.post('/validate', async (req, res) => {
  const { licenseKey, machineId } = req.body || {}
  if (!licenseKey || !machineId) return res.status(400).json({ valid: false })
  const db = await readStore(); const license = db.licenses.find(x => x.keyHash === hash(licenseKey))
  const valid = Boolean(license && license.status === 'active' && license.deviceHash === hash(machineId) && new Date(license.expiresAt) >= new Date())
  if (valid) { license.lastSeenAt = new Date().toISOString(); await writeStore(db) }
  res.json({ valid, expiresAt: valid ? license.expiresAt : null, offlineGraceHours: 72 })
})
router.post('/admin', requireAdmin, async (req, res) => {
  const { customerName, customerEmail, expiresAt } = req.body || {}
  if (!customerName || !customerEmail || !expiresAt || new Date(expiresAt) <= new Date()) return res.status(400).json({ error: 'Dados do cliente e vencimento futuro são obrigatórios.' })
  const key = `FC-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  const db = await readStore(); const license = { id: crypto.randomUUID(), keyHash: hash(key), customerName, customerEmail, expiresAt: new Date(expiresAt).toISOString(), status: 'active', deviceHash: null, createdAt: new Date().toISOString() }
  db.licenses.push(license); await writeStore(db)
  res.status(201).json({ license: { ...license, key } })
})
export default router
