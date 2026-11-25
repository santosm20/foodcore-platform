
import { Router } from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'

import { readStore, releaseDirectory } from '../store.js'
import { requireCustomer } from '../middleware/customerAuth.js'

const router = Router()

// =====================================================
// CONSULTA DA ÚLTIMA VERSÃO PUBLICADA
// =====================================================

router.get('/releases/latest', async (_req, res) => {
  try {
    const db = await readStore()

    const latest = db.releases
      .filter(release => release.active)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]

    if (!latest) {
      return res.status(404).json({
        error: 'Nenhuma versão publicada.'
      })
    }

    return res.json({
      version: latest.version,
      notes: latest.notes,
      downloadUrl: `/api/releases/${latest.id}/download`,
      publishedAt: latest.createdAt
    })
  } catch (error) {
    console.error('[FOODCORE] Erro ao consultar versão:', error)

    return res.status(500).json({
      error: 'Não foi possível consultar a versão publicada.'
    })
  }
})

// =====================================================
// DOWNLOAD PROTEGIDO DO INSTALADOR
// =====================================================

router.get(
  '/releases/:id/download',
  requireCustomer,
  async (req, res) => {
    try {
      const { companyStatus, registrationStatus } = req.customer

      if (
        companyStatus !== 'active' ||
        registrationStatus !== 'active'
      ) {
        return res.status(403).json({
          error: 'O download está disponível somente para empresas aprovadas e com cadastro ativo.'
        })
      }

      const db = await readStore()

      const release = db.releases.find(
        item => item.id === req.params.id && item.active
      )

      if (!release) {
        return res.status(404).json({
          error: 'Versão não encontrada.'
        })
      }

      const file = path.join(
        releaseDirectory,
        path.basename(release.storageName)
      )

      try {
        await fs.access(file)
      } catch {
        return res.status(404).json({
          error: 'Arquivo não encontrado no servidor.'
        })
      }

      return res.download(file, release.originalName)
    } catch (error) {
      console.error('[FOODCORE] Erro no download:', error)

      return res.status(500).json({
        error: 'Não foi possível realizar o download.'
      })
    }
  }
)

export default router
