import jwt from 'jsonwebtoken'
export function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' })
  try { const payload = jwt.verify(token, process.env.JWT_SECRET); if (payload.role !== 'admin') throw new Error('role'); req.admin = payload; next() }
  catch { return res.status(401).json({ error: 'Sessão inválida ou expirada.' }) }
}
