import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import crypto, { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { requireAdmin } from '../middleware/auth.js'
import { readStore, writeStore, releaseDirectory } from '../store.js'

const router = Router()
const maxMb = Number(process.env.MAX_UPLOAD_MB || 500)
const upload = multer({
  storage: multer.diskStorage({ destination: async (_req, _file, cb) => { try { await fs.mkdir(releaseDirectory, { recursive: true }); cb(null, releaseDirectory) } catch (e) { cb(e) } }, filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}.exe`) }),
  limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => path.extname(file.originalname).toLowerCase() === '.exe' ? cb(null, true) : cb(new Error('Envie somente arquivos .exe.'))
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || !adminPassword || !process.env.JWT_SECRET) return res.status(503).json({ error: 'Credenciais administrativas não configuradas no servidor.' })
  const validEmail = String(email || '').toLowerCase() === adminEmail.toLowerCase()
  const validPassword = adminPassword.startsWith('$2') ? await bcrypt.compare(String(password || ''), adminPassword) : String(password || '') === adminPassword
  if (!validEmail || !validPassword) return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
  const token = jwt.sign({ role: 'admin', email: adminEmail }, process.env.JWT_SECRET, { expiresIn: '8h' })
  res.json({ token, expiresIn: 28800 })
})

router.get('/releases', requireAdmin, async (_req, res) => {
  const db = await readStore()
  res.json({ releases: db.releases.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ storageName, ...r }) => r) })
})
router.post('/releases', requireAdmin, upload.single('installer'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo .exe obrigatório.' })
  const version = String(req.body.version || '').trim()
  if (!/^\d+\.\d+\.\d+([+-][\w.-]+)?$/.test(version)) { await fs.unlink(req.file.path).catch(()=>{}); return res.status(400).json({ error: 'Use versão semântica, por exemplo 1.0.0.' }) }
  const db = await readStore()
  if (db.releases.some(r => r.version === version)) { await fs.unlink(req.file.path).catch(()=>{}); return res.status(409).json({ error: 'Esta versão já foi publicada.' }) }
  const sha256 = await new Promise((resolve, reject) => { const digest = createHash('sha256'); createReadStream(req.file.path).on('data', chunk => digest.update(chunk)).on('error', reject).on('end', () => resolve(digest.digest('hex'))) })
  const release = { id: crypto.randomUUID(), version, sha256, notes: String(req.body.notes || '').slice(0, 5000), originalName: req.file.originalname, storageName: req.file.filename, sizeBytes: req.file.size, createdAt: new Date().toISOString(), active: true }
  db.releases.push(release); await writeStore(db)
  const { storageName, ...publicRelease } = release
  res.status(201).json({ release: publicRelease })
})
export default router
