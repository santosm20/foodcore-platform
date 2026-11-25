
import { Router } from 'express'
import crypto from 'node:crypto'

import { supabase } from '../supabase.js'
import { requireAdmin } from '../middleware/auth.js'

const router = Router()

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const OFFLINE_GRACE_HOURS = 72

const ALLOWED_SUBSCRIPTION_STATUSES = [
  'active',
  'past_due'
]

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
}

function databaseUnavailable(res) {
  return res.status(503).json({
    valid: false,
    error: 'Banco de dados indisponível.'
  })
}

function validateCredentials(licenseKey, machineId) {
  return (
    typeof licenseKey === 'string' &&
    licenseKey.trim().length >= 10 &&
    licenseKey.trim().length <= 256 &&
    typeof machineId === 'string' &&
    machineId.trim().length >= 8 &&
    machineId.trim().length <= 512
  )
}

function normalizeDeviceName(value) {
  if (typeof value !== 'string') {
    return null
  }

  const name = value
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, '')
    .slice(0, 120)

  return name || null
}

function isLicenseExpired(expiresAt) {
  if (!expiresAt || typeof expiresAt !== 'string') {
    return true
  }

  const expiration = new Date(expiresAt)

  return (
    Number.isNaN(expiration.getTime()) ||
    expiration.getTime() <= Date.now()
  )
}

function licenseResponse(expiresAt) {
  return {
    valid: true,
    expiresAt,
    offlineGraceHours: OFFLINE_GRACE_HOURS
  }
}

function logError(context, error) {
  console.error(
    `[FOODCORE] ${context}:`,
    error?.message || error
  )
}

// =====================================================
// LOCALIZAR LICENÇA
// =====================================================

async function findLicense(licenseKey) {
  const { data, error } = await supabase
    .from('licenses')
    .select(`
      id,
      company_id,
      subscription_id,
      license_key,
      status,
      activated_at,
      expires_at
    `)
    .eq('license_key', licenseKey)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

// =====================================================
// VALIDAR SITUAÇÃO DA LICENÇA E ASSINATURA
// =====================================================

async function validateLicenseStatus(license) {
  if (!license) {
    return {
      valid: false,
      error: 'Licença não encontrada.'
    }
  }

  if (license.status !== 'active') {
    return {
      valid: false,
      error: 'Licença suspensa ou inativa.'
    }
  }

  if (isLicenseExpired(license.expires_at)) {
    return {
      valid: false,
      error: 'Licença expirada.'
    }
  }

  if (!license.subscription_id) {
    return {
      valid: false,
      error: 'Licença sem assinatura vinculada.'
    }
  }

  const {
    data: subscription,
    error
  } = await supabase
    .from('subscriptions')
    .select(`
      id,
      company_id,
      status,
      next_due_date,
      grace_days
    `)
    .eq('id', license.subscription_id)
    .eq('company_id', license.company_id)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!subscription) {
    return {
      valid: false,
      error: 'Assinatura vinculada à licença não encontrada.'
    }
  }

  if (!ALLOWED_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    return {
      valid: false,
      error: 'Assinatura suspensa ou inativa.'
    }
  }

  return {
    valid: true,
    subscription
  }
}

// =====================================================
// LOCALIZAR DISPOSITIVO
// =====================================================

async function findDevice(licenseId, fingerprint) {
  const { data, error } = await supabase
    .from('devices')
    .select(`
      id,
      license_id,
      device_fingerprint,
      device_name,
      status
    `)
    .eq('license_id', licenseId)
    .eq('device_fingerprint', fingerprint)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

// =====================================================
// ATIVAÇÃO DA LICENÇA
// POST /api/licenses/activate
// =====================================================

router.post('/activate', async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const {
      licenseKey,
      machineId,
      deviceName
    } = req.body || {}

    if (!validateCredentials(licenseKey, machineId)) {
      return res.status(400).json({
        valid: false,
        error: 'licenseKey e machineId são obrigatórios e devem ser válidos.'
      })
    }

    const normalizedKey = licenseKey.trim()
    const normalizedMachineId = machineId.trim()

    const deviceFingerprint = hash(normalizedMachineId)
    const normalizedDeviceName = normalizeDeviceName(deviceName)

    // -------------------------------------------------
    // LOCALIZAR LICENÇA
    // -------------------------------------------------

    const license = await findLicense(normalizedKey)

    const licenseStatus = await validateLicenseStatus(license)

    if (!licenseStatus.valid) {
      return res.status(403).json({
        valid: false,
        error: licenseStatus.error
      })
    }

    // -------------------------------------------------
    // VERIFICAR SE O DISPOSITIVO JÁ ESTÁ CADASTRADO
    // -------------------------------------------------

    const existingDevice = await findDevice(
      license.id,
      deviceFingerprint
    )

    if (existingDevice && existingDevice.status !== 'active') {
      return res.status(403).json({
        valid: false,
        error: 'Este computador está bloqueado ou revogado para esta licença.'
      })
    }

    // -------------------------------------------------
    // VERIFICAR OUTRO COMPUTADOR ATIVO
    // -------------------------------------------------

    const {
      data: activeDevices,
      error: devicesError
    } = await supabase
      .from('devices')
      .select('id, device_fingerprint')
      .eq('license_id', license.id)
      .eq('status', 'active')
      .limit(2)

    if (devicesError) {
      throw devicesError
    }

    const otherActiveDevice = activeDevices?.find(
      device => device.device_fingerprint !== deviceFingerprint
    )

    if (otherActiveDevice) {
      return res.status(409).json({
        valid: false,
        error: 'Esta licença já está vinculada a outro computador.'
      })
    }

    // -------------------------------------------------
    // CADASTRAR NOVO DISPOSITIVO
    // -------------------------------------------------

    if (!existingDevice) {
      const { error: insertError } = await supabase
        .from('devices')
        .insert({
          license_id: license.id,
          device_fingerprint: deviceFingerprint,
          device_name: normalizedDeviceName,
          status: 'active'
        })

      if (insertError) {
        // Uma segunda requisição pode ter cadastrado
        // o mesmo dispositivo simultaneamente.
        const deviceAfterInsert = await findDevice(
          license.id,
          deviceFingerprint
        )

        if (!deviceAfterInsert || deviceAfterInsert.status !== 'active') {
          logError('Erro ao vincular dispositivo', insertError)

          return res.status(409).json({
            valid: false,
            error: 'Não foi possível vincular este computador. Verifique se a licença já está em uso.'
          })
        }
      }
    }

    // -------------------------------------------------
    // REGISTRAR PRIMEIRA ATIVAÇÃO
    // -------------------------------------------------

    if (!license.activated_at) {
      const { error: activationError } = await supabase
        .from('licenses')
        .update({
          activated_at: new Date().toISOString()
        })
        .eq('id', license.id)
        .is('activated_at', null)

      if (activationError) {
        throw activationError
      }
    }

    return res.status(200).json(
      licenseResponse(license.expires_at)
    )

  } catch (error) {
    logError('Erro ao ativar licença', error)

    return res.status(500).json({
      valid: false,
      error: 'Não foi possível ativar a licença.'
    })
  }
})

// =====================================================
// VALIDAR LICENÇA
// POST /api/licenses/validate
// =====================================================

router.post('/validate', async (req, res) => {
  try {
    if (!supabase) {
      return databaseUnavailable(res)
    }

    const {
      licenseKey,
      machineId
    } = req.body || {}

    if (!validateCredentials(licenseKey, machineId)) {
      return res.status(400).json({
        valid: false,
        error: 'licenseKey e machineId são obrigatórios e devem ser válidos.'
      })
    }

    const normalizedKey = licenseKey.trim()
    const normalizedMachineId = machineId.trim()

    const deviceFingerprint = hash(normalizedMachineId)

    // -------------------------------------------------
    // LOCALIZAR LICENÇA
    // -------------------------------------------------

    const license = await findLicense(normalizedKey)

    const licenseStatus = await validateLicenseStatus(license)

    if (!licenseStatus.valid) {
      return res.status(403).json({
        valid: false,
        error: licenseStatus.error
      })
    }

    // -------------------------------------------------
    // VALIDAR DISPOSITIVO
    // -------------------------------------------------

    const device = await findDevice(
      license.id,
      deviceFingerprint
    )

    if (!device || device.status !== 'active') {
      return res.status(403).json({
        valid: false,
        error: 'Este computador não está autorizado para utilizar a licença.'
      })
    }

    return res.status(200).json(
      licenseResponse(license.expires_at)
    )

  } catch (error) {
    logError('Erro ao validar licença', error)

    return res.status(500).json({
      valid: false,
      error: 'Não foi possível validar a licença.'
    })
  }
})

// =====================================================
// CRIAÇÃO MANUAL DE LICENÇAS DESATIVADA
// POST /api/licenses/admin
// =====================================================

router.post('/admin', requireAdmin, (_req, res) => {
  return res.status(410).json({
    error: 'A emissão manual de licenças foi desativada.',
    message: 'As licenças são emitidas pelo fluxo de aprovação de pagamentos da FOODCORE.'
  })
})

// =====================================================
// EXPORTAÇÃO
// =====================================================

export default router
