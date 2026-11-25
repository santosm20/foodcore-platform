
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl) {
  console.warn('[FOODCORE] SUPABASE_URL não configurada.')
}

if (!supabaseSecretKey) {
  console.warn('[FOODCORE] SUPABASE_SECRET_KEY não configurada.')
}

if (!supabasePublishableKey) {
  console.warn('[FOODCORE] SUPABASE_PUBLISHABLE_KEY não configurada.')
}

// Cliente administrativo: operações privilegiadas no servidor.
export const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  : null

// Cliente público: autenticação de clientes com e-mail e senha.
export const supabaseAuth = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  : null
