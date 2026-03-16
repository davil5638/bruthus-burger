'use client'
import { useState, useEffect } from 'react'
import { api } from '../../lib/api'
import Button from '../../components/Button'
import PageHeader from '../../components/PageHeader'
import { Toast } from '../../components/Toast'

const TIPOS = ['SMASH','COMBO','PROMOCAO','FAMILIA','BATATA','SOBREMESA']

export default function PostsPage() {
  const [imageUrl, setImageUrl]       = useState('')
  const [tipoCaptions, setTipoCaptions] = useState('SMASH')
  const [comHashtags, setComHashtags] = useState(true)
  const [comentarLink, setComentarLink] = useState(true)
  const [loading, setLoading]         = useState(false)
  const [resultado, setResultado]     = useState(null)
  const [posts, setPosts]             = useState([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [toast, setToast]             = useState(null)

  useEffect(() => { carregarPosts() }, [])

  async function carregarPosts() {
    setLoadingPosts(true)
    try {
      const data = await api.get('/posts?limite=6')
      setPosts(data.posts || [])
    } catch { /* sem posts ainda */ } finally { setLoadingPosts(false) }
  }

  async function publicar() {
    if (!imageUrl.trim()) { setToast({ message: 'Informe a URL da imagem!', type: 'error' }); return }
    setLoading(true); setResultado(null)
    try {
      const data = await api.post('/post', {
        imageUrl: imageUrl.trim(),
        tipoCaptions,
        incluirHashtags: comHashtags,
        comentarLink,
      })
      setResultado(data.resultado)
      setToast({ message: '🎉 Post publicado no Instagram!', type: 'success' })
      carregarPosts()
    } catch (e) {
      setToast({ message: e.message, type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      <PageHeader emoji="📸" title="Publicar Post" description="Publica automaticamente no Instagram com legenda gerada por IA + comentário fixado" />

      {/* Aviso importante */}
      <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-300">
        <strong>⚠️ Requisito:</strong> A imagem precisa estar em uma <strong>URL pública</strong> (Cloudinary, ImgBB, AWS S3, etc). A API do Instagram não aceita arquivos locais.
      </div>

      {/* Form */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-6 space-y-5">
        {/* URL da imagem */}
        <div>
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">
            URL da Imagem *
          </label>
          <input
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://res.cloudinary.com/seu-perfil/foto.jpg"
            className="w-full bg-[#1a1a1a] border border-[#333] rounded-xl px-4 py-3 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#f97316] transition-colors"
          />
        </div>

        {/* Tipo de legenda */}
        <div>
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider mb-2">
            Tipo de Legenda
          </label>
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map(t => (
              <button key={t} onClick={() => setTipoCaptions(t)}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                  tipoCaptions === t ? 'border-[#f97316] bg-[#f97316]/10 text-white' : 'border-[#222] text-[#666] hover:border-[#333] hover:text-white'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Opções */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-[#888] uppercase tracking-wider">Opções</label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div onClick={() => setComHashtags(!comHashtags)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${comHashtags ? 'bg-[#f97316]' : 'bg-[#333]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${comHashtags ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-[#aaa] group-hover:text-white transition-colors">Incluir hashtags</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer group">
            <div onClick={() => setComentarLink(!comentarLink)}
              className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${comentarLink ? 'bg-[#f97316]' : 'bg-[#333]'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${comentarLink ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
            <span className="text-sm text-[#aaa] group-hover:text-white transition-colors">Comentar link de pedido (fixado)</span>
          </label>
        </div>

        <Button onClick={publicar} loading={loading} size="lg" className="w-full">
          📸 Publicar no Instagram
        </Button>
      </div>

      {/* Resultado */}
      {resultado && (
        <div className="mt-4 rounded-xl border border-green-600/30 bg-green-600/10 p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">✅</span>
            <span className="font-bold text-green-300">Post publicado com sucesso!</span>
          </div>
          <div className="space-y-1 text-sm">
            <p className="text-[#888]">🆔 Post ID: <span className="text-white font-mono">{resultado.postId}</span></p>
            <p className="text-[#888]">🕐 Publicado em: <span className="text-white">{new Date(resultado.publicadoEm).toLocaleString('pt-BR')}</span></p>
          </div>
        </div>
      )}

      {/* Posts recentes */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[#888] uppercase tracking-wider">Posts Recentes</h2>
          <button onClick={carregarPosts} className="text-xs text-[#f97316] hover:underline">Atualizar</button>
        </div>

        {loadingPosts ? (
          <div className="text-center text-[#555] py-8 text-sm">Carregando posts…</div>
        ) : posts.length === 0 ? (
          <div className="rounded-xl border border-[#1e1e1e] bg-[#111] p-8 text-center">
            <p className="text-[#555] text-sm">Nenhum post publicado ainda</p>
            <p className="text-[#333] text-xs mt-1">Configure o META_ACCESS_TOKEN e publique seu primeiro post</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map(post => (
              <div key={post.id} className="flex items-center gap-4 p-4 rounded-xl border border-[#1e1e1e] bg-[#111] hover:border-[#2a2a2a] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#888]">📅 {new Date(post.timestamp).toLocaleString('pt-BR')}</p>
                  <p className="text-sm text-[#aaa] truncate mt-0.5">{post.caption?.substring(0, 80)}…</p>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-[#555]">
                  <span>❤️ {post.like_count || 0}</span>
                  <span>💬 {post.comments_count || 0}</span>
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer"
                      className="text-[#f97316] hover:underline">Ver →</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
