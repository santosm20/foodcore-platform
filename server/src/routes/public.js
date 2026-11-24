import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readStore, releaseDirectory } from '../store.js'
const router = Router()
router.get('/releases/latest', async (_req, res) => {
  const db = await readStore(); const latest = db.releases.filter(r => r.active).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0]
  if (!latest) return res.status(404).json({ error: 'Nenhuma versão publicada.' })
  res.json({ version: latest.version, notes: latest.notes, downloadUrl: `/api/releases/${latest.id}/download`, publishedAt: latest.createdAt })
})
router.get('/releases/:id/download', async (req, res) => {
  const db = await readStore(); const release = db.releases.find(r => r.id === req.params.id && r.active)
  if (!release) return res.status(404).json({ error: 'Versão não encontrada.' })
  const file = path.join(releaseDirectory, path.basename(release.storageName))
  try { await fs.access(file); res.download(file, release.originalName) } catch { res.status(404).json({ error: 'Arquivo não encontrado no servidor.' }) }
})
export default router
