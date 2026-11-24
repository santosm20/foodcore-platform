import React, { useEffect, useState } from 'react'
import { Activity, ArrowLeft, CheckCircle2, CloudUpload, FileArchive, KeyRound, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import './admin.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3333/api'

export default function AdminApp() {
  const [token, setToken] = useState(sessionStorage.getItem('foodcore_admin_token') || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [file, setFile] = useState(null)
  const [version, setVersion] = useState('1.0.0')
  const [notes, setNotes] = useState('')
  const [releases, setReleases] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function request(path, options = {}) {
    const response = await fetch(`${API}${path}`, { ...options, headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.')
    return data
  }
  async function loadReleases() {
    try { const data = await request('/admin/releases'); setReleases(data.releases || []) }
    catch (error) { setMessage(error.message) }
  }
  useEffect(() => { if (token) loadReleases() }, [token])

  async function login(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    try { const data = await request('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }); sessionStorage.setItem('foodcore_admin_token', data.token); setToken(data.token) }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function upload(event) {
    event.preventDefault()
    if (!file) return setMessage('Selecione o instalador .exe primeiro.')
    const form = new FormData(); form.append('installer', file); form.append('version', version); form.append('notes', notes)
    setBusy(true); setMessage('')
    try { const data = await request('/admin/releases', { method: 'POST', body: form }); setMessage(`Versão ${data.release.version} publicada com sucesso.`); setFile(null); event.target.reset(); await loadReleases() }
    catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  function logout() { sessionStorage.removeItem('foodcore_admin_token'); setToken(''); setReleases([]) }

  if (!token) return <main className="admin-shell"><div className="admin-login"><a className="admin-back" href="/"><ArrowLeft size={16}/> Voltar ao site</a><div className="admin-brand"><span>F</span><div><b>FOODCORE</b><small>ADMIN CONSOLE</small></div></div><div className="admin-login-card"><div className="admin-icon"><ShieldCheck/></div><h1>Painel administrativo</h1><p>Acesse para gerenciar versões e distribuição do ERP.</p><form onSubmit={login}><label>E-mail administrativo</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="admin@foodcore.com.br"/><label>Senha</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Sua senha"/><button disabled={busy}>{busy?'Entrando...':'Entrar no painel'}</button></form>{message&&<div className="admin-message error">{message}</div>}<small className="admin-hint">Acesso configurado no servidor por variáveis de ambiente.</small></div></div></main>

  return <main className="admin-shell"><header className="admin-top"><a className="admin-brand" href="/"><span>F</span><div><b>FOODCORE</b><small>ADMIN CONSOLE</small></div></a><div className="admin-top-right"><span><i/> API conectada</span><button onClick={logout}><LogOut size={16}/> Sair</button></div></header><div className="admin-content"><div className="admin-heading"><div><div className="admin-kicker">CENTRAL DE CONTROLE</div><h1>Distribuição do ERP</h1><p>Publique instaladores e controle qual versão fica disponível para download.</p></div><div className="admin-secure"><ShieldCheck/> Ambiente protegido</div></div>{message&&<div className="admin-message"><CheckCircle2 size={17}/>{message}</div>}<section className="admin-stats"><article><span><FileArchive/></span><small>VERSÕES PUBLICADAS</small><b>{releases.length}</b></article><article><span><Activity/></span><small>PRODUTO</small><b>FOODCORE ERP</b></article><article><span><KeyRound/></span><small>MODELO DE LICENÇA</small><b>Por computador</b></article></section><div className="admin-columns"><section className="admin-panel"><div className="admin-panel-title"><div><h2>Enviar novo instalador</h2><p>O arquivo será armazenado no servidor e disponibilizado pela API.</p></div><CloudUpload/></div><form className="release-form" onSubmit={upload}><label>Arquivo executável (.exe)</label><input type="file" accept=".exe,application/vnd.microsoft.portable-executable" onChange={e=>setFile(e.target.files?.[0]||null)} required/><small>Limite padrão de 500 MB. Envie apenas instaladores assinados e validados.</small><label>Versão</label><input value={version} onChange={e=>setVersion(e.target.value)} placeholder="1.0.0" required/><label>Notas da versão</label><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Correções, melhorias e novidades..." rows="4"/><button disabled={busy}>{busy?'Enviando...':'Publicar versão'}</button></form></section><section className="admin-panel"><div className="admin-panel-title"><div><h2>Fluxo de distribuição</h2><p>Como o cliente recebe as atualizações.</p></div><RefreshCw/></div><ol className="admin-steps"><li><b>Publicação</b><span>Você envia o .exe e informa a versão.</span></li><li><b>Disponibilização</b><span>A API registra o arquivo e gera o endpoint de download.</span></li><li><b>Atualização</b><span>O aplicativo Windows consulta a versão e oferece atualização.</span></li><li><b>Licença</b><span>O ERP valida a licença vinculada ao computador no servidor.</span></li></ol></section></div><section className="admin-panel release-history"><div className="admin-panel-title"><div><h2>Versões publicadas</h2><p>Histórico dos instaladores disponíveis.</p></div><button className="refresh-button" onClick={loadReleases}><RefreshCw size={15}/> Atualizar</button></div>{releases.length===0?<div className="empty-state">Nenhum instalador publicado ainda.</div>:<div className="release-table"><div className="release-row release-head"><span>VERSÃO</span><span>ARQUIVO</span><span>PUBLICAÇÃO</span><span>DOWNLOAD</span></div>{releases.map(r=><div className="release-row" key={r.id}><b>{r.version}</b><span>{r.originalName}</span><span>{new Date(r.createdAt).toLocaleString('pt-BR')}</span><a href={`${API}/releases/${r.id}/download`} target="_blank" rel="noreferrer">Baixar</a></div>)}</div>}</section><footer className="admin-footer">FOODCORE BUSINESS TECHNOLOGY <span>•</span> Painel restrito</footer></div></main>
}
