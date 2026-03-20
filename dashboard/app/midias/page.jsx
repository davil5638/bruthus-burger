'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

export default function MidiasPage() {
  const [fotos, setFotos]           = useState([])
  const [status, setStatus]         = useState(null)
  const [sincronizando, setSinc]    = useState(false)
  const [carregando, setCarreg]     = useState(true)
  const [toast, setToast]           = useState(null)
  const [fotoAmpliada, setAmpliada] = useState(null)

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

  const formatarData = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' })
  }

  const formatarBytes = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Mídias"
        subtitle="Fotos sincronizadas do Google Drive para o Cloudinary"
        icon="🖼️"
      />

      {/* ─── Status da integração ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard
          label="Status"
          valor={carregando ? '...' : status?.configurado ? 'Configurado' : 'Não configurado'}
          cor={status?.configurado ? 'text-green-400' : 'text-red-400'}
          icon={status?.configurado ? '✅' : '⚠️'}
        />
        <StatusCard
          label="No Drive"
          valor={status?.totalNaPasta ?? '—'}
          cor="text-blue-400"
          icon="📁"
        />
        <StatusCard
          label="Sincronizadas"
          valor={status?.totalSincronizados ?? fotos.length}
          cor="text-orange-400"
          icon="☁️"
        />
        <StatusCard
          label="Última Sync"
          valor={formatarData(status?.ultimaSync)}
          cor="text-[#888]"
          icon="🕐"
          small
        />
      </div>

      {/* ─── Aviso de configuração ─── */}
      {!carregando && !status?.configurado && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-sm text-yellow-300 space-y-2">
          <p className="font-semibold">⚠️ Integração não configurada</p>
          <p>Adicione as seguintes variáveis de ambiente no Render para ativar a sincronização:</p>
          <div className="bg-[#0a0a0a] rounded-lg p-3 font-mono text-xs space-y-1 text-[#ccc]">
            <p><span className="text-orange-400">GOOGLE_SERVICE_ACCOUNT_JSON</span>=<span className="text-green-400">{'{"type":"service_account",...}'}</span></p>
            <p><span className="text-orange-400">GOOGLE_DRIVE_FOLDER_ID</span>=<span className="text-green-400">1aBcDeFgHiJkLmNoP...</span></p>
          </div>
          <p className="text-yellow-400/70 text-xs">Veja as instruções completas de configuração abaixo.</p>
        </div>
      )}

      {/* ─── Botão de sincronização ─── */}
      <div className="flex items-center gap-4">
        <button
          onClick={sincronizar}
          disabled={sincronizando || !status?.configurado}
          className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all text-sm"
        >
          {sincronizando ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              🔄 Sincronizar agora
            </>
          )}
        </button>
        <p className="text-xs text-[#555]">
          Busca fotos novas no Google Drive e envia para o Cloudinary automaticamente
        </p>
      </div>

      {/* ─── Galeria de fotos ─── */}
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
              </div>
            ))}
          </div>
        </div>
      ) : !carregando && (
        <div className="text-center py-16 text-[#444]">
          <div className="text-5xl mb-3">🖼️</div>
          <p className="text-sm">Nenhuma foto sincronizada ainda.</p>
          <p className="text-xs mt-1">Adicione fotos na sua pasta do Google Drive e clique em Sincronizar.</p>
        </div>
      )}

      {/* ─── Instruções de configuração ─── */}
      <Instrucoes />

      {/* ─── Modal de foto ampliada ─── */}
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
            <div className="p-4 space-y-1">
              <p className="text-white font-medium text-sm">{fotoAmpliada.nome}</p>
              <p className="text-[#555] text-xs font-mono">{fotoAmpliada.publicId}</p>
              <p className="text-[#555] text-xs">Sincronizado em: {formatarData(fotoAmpliada.syncEm)}</p>
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
        <span>📋 Como configurar a integração com Google Drive</span>
        <span>{aberto ? '▲' : '▼'}</span>
      </button>
      {aberto && (
        <div className="bg-[#0d0d0d] border-t border-[#1e1e1e] p-5 text-sm text-[#999] space-y-4">
          <Passo n={1} titulo="Criar projeto no Google Cloud">
            Acesse <span className="text-orange-400">console.cloud.google.com</span> → Novo Projeto → ative a <strong className="text-white">Google Drive API</strong>.
          </Passo>
          <Passo n={2} titulo="Criar Service Account">
            IAM &amp; Admin → Service Accounts → Criar → baixe o <strong className="text-white">JSON de chave</strong>.
          </Passo>
          <Passo n={3} titulo="Adicionar no Render">
            Copie <strong className="text-white">todo o conteúdo</strong> do JSON e cole na variável <code className="text-orange-400 bg-[#111] px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code>.
          </Passo>
          <Passo n={4} titulo="Pegar o ID da pasta do Drive">
            Abra sua pasta no Drive → olhe a URL: <code className="text-[#ccc] bg-[#111] px-1 rounded text-xs">drive.google.com/drive/folders/<span className="text-orange-400">ESTE_É_O_ID</span></code><br/>
            Adicione como <code className="text-orange-400 bg-[#111] px-1 rounded">GOOGLE_DRIVE_FOLDER_ID</code> no Render.
          </Passo>
          <Passo n={5} titulo="Compartilhar a pasta">
            No Drive, clique com botão direito na pasta → Compartilhar → cole o <strong className="text-white">e-mail da Service Account</strong> (termina em <code className="text-[#aaa]">@...gserviceaccount.com</code>) → permissão de <strong className="text-white">Leitor</strong>.
          </Passo>
          <Passo n={6} titulo="Pronto!">
            Tire fotos no celular, salve na pasta do Drive, e clique em <strong className="text-white">Sincronizar agora</strong>. As fotos vão para o Cloudinary e ficam disponíveis nas stories automáticas.
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
