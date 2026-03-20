'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://bruthus-burger.onrender.com'

export default function MidiasPage() {
  const [fotos, setFotos]           = useState([])
  const [status, setStatus]         = useState(null)
  const [sincronizando, setSinc]    = useState(false)
  const [carregando, setCarreg]     = useState(true)
  const [toast, setToast]           = useState(null)
  const [fotoAmpliada, setAmpliada] = useState(null)
  const [enviando, setEnviando]     = useState(false)
  const [progresso, setProgresso]   = useState(null)
  const [arrastando, setArrastando] = useState(false)
  const inputRef                    = useRef(null)

  const mostrarToast = (msg, tipo = 'success') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 4000)
  }

  const carregarFotos = useCallback(async () => {
    try {
      const data = await api.get('/midia/fotos')
      setFotos(data.fotos || [])
    } catch (e) {
      mostrarToast('Erro ao carregar fotos: ' + e.message, 'error')
    }
  }, [])

  const carregarStatus = useCallback(async () => {
    try {
      const data = await api.get('/midia/status')
      setStatus(data)
    } catch (e) {
      setStatus({ configurado: false, erro: e.message })
    } finally {
      setCarreg(false)
    }
  }, [])

  useEffect(() => {
    carregarStatus()
    carregarFotos()
  }, [carregarStatus, carregarFotos])

  async function sincronizar() {
    setSinc(true)
    try {
      const data = await api.post('/midia/sincronizar', {})
      const msg = data.novosEnviados > 0
        ? `${data.novosEnviados} foto(s) nova(s) sincronizada(s)!`
        : `Nenhuma foto nova. Todas as ${data.totalNaPasta} fotos já estavam sincronizadas.`
      mostrarToast(msg, data.novosEnviados > 0 ? 'success' : 'info')
      await carregarFotos()
      await carregarStatus()
    } catch (e) {
      mostrarToast('Erro ao sincronizar: ' + e.message, 'error')
    } finally {
      setSinc(false)
    }
  }

  async function enviarFotos(arquivos) {
    if (!arquivos || arquivos.length === 0) return
    setEnviando(true)
    setProgresso(`Enviando ${arquivos.length} foto(s)...`)
    try {
      const form = new FormData()
      Array.from(arquivos).forEach(f => form.append('fotos', f))

      const token = localStorage.getItem('auth_token') || ''
      const r = await fetch(`${API_BASE}/midia/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.erro || 'Erro no upload')

      const msg = data.enviados > 0
        ? `${data.enviados} foto(s) enviada(s) e sincronizadas com sucesso!`
        : 'Nenhuma foto foi enviada.'
      mostrarToast(msg, data.enviados > 0 ? 'success' : 'error')
      await carregarFotos()
      await carregarStatus()
    } catch (e) {
      mostrarToast('Erro ao enviar: ' + e.message, 'error')
    } finally {
      setEnviando(false)
      setProgresso(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setArrastando(false)
    const arquivos = e.dataTransfer?.files
    if (arquivos?.length) enviarFotos(arquivos)
  }

  async function baixarFoto(foto) {
    try {
      const r = await fetch(foto.url)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = foto.nome || 'foto.jpg'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // fallback: abre em nova aba
      window.open(foto.url, '_blank')
    }
  }

  const formatarData = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Mídias"
        subtitle="Envie fotos direto do celular ou computador — vão para o Drive e Cloudinary"
        icon="🖼️"
      />

      {/* ─── Status ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard
          label="Status"
          valor={carregando ? '...' : status?.configurado ? 'Configurado' : 'Não configurado'}
          cor={status?.configurado ? 'text-green-400' : 'text-red-400'}
          icon={status?.configurado ? '✅' : '⚠️'}
        />
        <StatusCard label="No Drive"      valor={status?.totalNaPasta ?? '—'}               cor="text-blue-400"   icon="📁" />
        <StatusCard label="Sincronizadas" valor={status?.totalSincronizados ?? fotos.length} cor="text-orange-400" icon="☁️" />
        <StatusCard label="Última Sync"   valor={formatarData(status?.ultimaSync)}           cor="text-[#888]"     icon="🕐" small />
      </div>

      {/* ─── Aviso de configuração ─── */}
      {!carregando && !status?.configurado && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300 space-y-2">
          <p className="font-semibold">⚠️ Integração não configurada</p>
          <p>Adicione as variáveis de ambiente no Render para ativar:</p>
          <div className="bg-[#0a0a0a] rounded-lg p-3 font-mono text-xs space-y-1 text-[#ccc]">
            <p><span className="text-orange-400">GOOGLE_SERVICE_ACCOUNT_JSON</span>=<span className="text-green-400">{'{"type":"service_account",...}'}</span></p>
            <p><span className="text-orange-400">GOOGLE_DRIVE_FOLDER_ID</span>=<span className="text-green-400">1aBcDeFgHiJkLmNoP...</span></p>
          </div>
        </div>
      )}

      {/* ─── Upload + Sincronizar ─── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Botão upload */}
        <label
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm cursor-pointer transition-all
            ${status?.configurado && !enviando
              ? 'bg-orange-500 hover:bg-orange-600 text-white'
              : 'bg-[#1e1e1e] text-[#555] cursor-not-allowed'}`}
        >
          {enviando ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {progresso || 'Enviando...'}
            </>
          ) : (
            <>📤 Enviar fotos</>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            disabled={!status?.configurado || enviando}
            onChange={e => enviarFotos(e.target.files)}
          />
        </label>

        {/* Botão sincronizar */}
        <button
          onClick={sincronizar}
          disabled={sincronizando || !status?.configurado}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-orange-500/40 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
        >
          {sincronizando ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>🔄 Sincronizar Drive</>
          )}
        </button>

        <p className="text-xs text-[#444] hidden md:block">
          Envie fotos direto daqui — elas vão pro Drive e Cloudinary automaticamente
        </p>
      </div>

      {/* ─── Área de arrastar ─── */}
      {status?.configurado && (
        <div
          onDragOver={e => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={onDrop}
          onClick={() => !enviando && inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
            ${arrastando
              ? 'border-orange-500 bg-orange-500/10'
              : 'border-[#2a2a2a] hover:border-orange-500/40 hover:bg-[#111]'}`}
        >
          <div className="text-3xl mb-2">{enviando ? '⏳' : '📁'}</div>
          <p className="text-sm text-[#666]">
            {enviando
              ? progresso
              : 'Arraste fotos aqui, ou clique para selecionar'}
          </p>
          <p className="text-xs text-[#444] mt-1">JPG, PNG, WEBP — até 20 MB por foto</p>
        </div>
      )}

      {/* ─── Galeria ─── */}
      {fotos.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold text-[#888] mb-3 uppercase tracking-wider">
            {fotos.length} foto{fotos.length !== 1 ? 's' : ''} sincronizada{fotos.length !== 1 ? 's' : ''}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {fotos.map((foto) => (
              <div
                key={foto.id}
                className="group relative aspect-square bg-[#111] rounded-xl overflow-hidden border border-[#1e1e1e] cursor-pointer hover:border-orange-500/50 transition-all"
                onClick={() => setAmpliada(foto)}
              >
                <img
                  src={foto.urlThumb}
                  alt={foto.nome}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-2">
                    <p className="text-white text-[10px] font-medium truncate">{foto.nome}</p>
                    <p className="text-[#aaa] text-[9px]">{formatarData(foto.syncEm)}</p>
                  </div>
                </div>
                {/* Botão baixar direto no card */}
                <button
                  onClick={e => { e.stopPropagation(); baixarFoto(foto) }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/70 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-orange-500"
                  title="Baixar foto"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : !carregando && (
        <div className="text-center py-16 text-[#444]">
          <div className="text-5xl mb-3">🖼️</div>
          <p className="text-sm">Nenhuma foto ainda.</p>
          <p className="text-xs mt-1">Envie fotos acima ou sincronize com o Google Drive.</p>
        </div>
      )}

      {/* ─── Instruções ─── */}
      <Instrucoes />

      {/* ─── Modal foto ampliada ─── */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setAmpliada(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-[#111] rounded-2xl overflow-hidden border border-[#2a2a2a]"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={fotoAmpliada.url}
              alt={fotoAmpliada.nome}
              className="w-full max-h-[70vh] object-contain"
            />
            <div className="p-4 flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-white font-medium text-sm truncate">{fotoAmpliada.nome}</p>
                <p className="text-[#555] text-xs">Sincronizado em: {new Date(fotoAmpliada.syncEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}</p>
              </div>
              <button
                onClick={() => baixarFoto(fotoAmpliada)}
                className="shrink-0 flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-all"
              >
                ⬇️ Baixar
              </button>
            </div>
            <button
              onClick={() => setAmpliada(null)}
              className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center bg-black/60 rounded-full text-white hover:bg-black/80 text-sm"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.msg} type={toast.tipo} onClose={() => setToast(null)} />}
    </div>
  )
}

function StatusCard({ label, valor, cor, icon, small }) {
  return (
    <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-[#555] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`font-bold ${small ? 'text-sm' : 'text-2xl'} ${cor}`}>{valor}</p>
    </div>
  )
}

function Instrucoes() {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="border border-[#1e1e1e] rounded-xl overflow-hidden">
      <button
        onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between p-4 text-sm text-[#666] hover:text-white hover:bg-[#111] transition-all"
      >
        <span>📋 Como usar as Mídias</span>
        <span>{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div className="bg-[#0d0d0d] border-t border-[#1e1e1e] p-5 text-sm text-[#999] space-y-4">
          <Passo n={1} titulo="Enviar do celular">
            Clique em <strong className="text-white">Enviar fotos</strong> — no celular isso abre a câmera ou galeria. A foto vai direto para o Drive e Cloudinary.
          </Passo>
          <Passo n={2} titulo="Enviar do computador">
            Clique em <strong className="text-white">Enviar fotos</strong> ou arraste arquivos para a área pontilhada. Múltiplos arquivos são suportados.
          </Passo>
          <Passo n={3} titulo="Sincronizar fotos já no Drive">
            Se você adicionou fotos direto no Google Drive pelo celular, clique em <strong className="text-white">Sincronizar Drive</strong> para trazer para cá.
          </Passo>
          <Passo n={4} titulo="Baixar fotos">
            Clique em qualquer foto para ampliar, depois clique em <strong className="text-white">⬇️ Baixar</strong>. Ou passe o mouse sobre a foto e clique na seta.
          </Passo>
          <Passo n={5} titulo="Fotos nas stories automáticas">
            Todas as fotos enviadas aqui ficam disponíveis automaticamente para as stories automáticas da Bruthus Burger.
          </Passo>
        </div>
      )}
    </div>
  )
}

function Passo({ n, titulo, children }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</div>
      <div>
        <p className="text-white font-medium text-sm mb-0.5">{titulo}</p>
        <p className="text-[#777] text-xs leading-relaxed">{children}</p>
      </div>
    </div>
  )
}
