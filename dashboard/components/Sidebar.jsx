'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const nav = [
  { href: '/',           label: 'Dashboard',    icon: '📊' },
  { href: '/posts',      label: 'Publicar Post', icon: '📸' },
  { href: '/legendas',   label: 'Legendas',     icon: '✍️'  },
  { href: '/promocoes',  label: 'Promoções',    icon: '🎉' },
  { href: '/reels',      label: 'Reels',        icon: '🎬' },
  { href: '/hashtags',   label: 'Hashtags',     icon: '#'  },
  { href: '/anuncios',   label: 'Anúncios',     icon: '📣' },
  { href: '/agendador',  label: 'Agendador',    icon: '📅' },
  { href: '/stories',    label: 'Stories',      icon: '📱' },
  { href: '/financeiro', label: 'Financeiro',   icon: '💰' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)

  const activeItem = nav.find(n => n.href === pathname)

  return (
    <>
      {/* ─── Desktop sidebar (md+) ─── */}
      <aside className="hidden md:flex fixed left-0 top-0 w-60 h-screen bg-[#111] border-r border-[#1e1e1e] flex-col z-40">
        {/* Logo */}
        <div className="p-5 border-b border-[#1e1e1e]">
          <div className="flex items-center gap-2">
            <span className="text-3xl">🍔</span>
            <div>
              <div className="font-bold text-white text-sm leading-tight">Bruthus Burger</div>
              <div className="text-[10px] text-[#f97316] font-medium tracking-widest uppercase">Marketing Auto</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-[#f97316] text-white shadow-lg shadow-orange-900/30'
                    : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
                }`}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                {item.label}
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#1e1e1e]">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1a1a1a] rounded-lg">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-[#666]">Backend conectado</span>
          </div>
          <p className="text-center text-[10px] text-[#333] mt-2">v1.0.0</p>
        </div>
      </aside>

      {/* ─── Mobile top header ─── */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#111] border-b border-[#1e1e1e] px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍔</span>
          <div>
            <div className="font-bold text-white text-xs leading-tight">Bruthus Burger</div>
            <div className="text-[9px] text-[#f97316] font-medium tracking-wider uppercase">
              {activeItem ? `${activeItem.icon} ${activeItem.label}` : '📊 Dashboard'}
            </div>
          </div>
        </div>
        <button
          onClick={() => setMenuAberto(v => !v)}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] shrink-0"
          aria-label="Menu"
        >
          <span className={`w-5 h-0.5 bg-white rounded transition-all duration-200 origin-center ${menuAberto ? 'rotate-45 translate-y-2' : ''}`} />
          <span className={`w-5 h-0.5 bg-white rounded transition-all duration-200 ${menuAberto ? 'opacity-0 scale-x-0' : ''}`} />
          <span className={`w-5 h-0.5 bg-white rounded transition-all duration-200 origin-center ${menuAberto ? '-rotate-45 -translate-y-2' : ''}`} />
        </button>
      </header>

      {/* ─── Mobile menu backdrop ─── */}
      {menuAberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70"
          onClick={() => setMenuAberto(false)}
        />
      )}

      {/* ─── Mobile menu dropdown ─── */}
      <div className={`md:hidden fixed top-14 left-0 right-0 z-40 bg-[#111] border-b border-[#1e1e1e] transition-all duration-200 overflow-hidden ${
        menuAberto ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
      }`}>
        <nav className="p-3 grid grid-cols-2 gap-1.5">
          {nav.map(item => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuAberto(false)}
                className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-[#f97316] text-white shadow-lg shadow-orange-900/30'
                    : 'text-[#888] bg-[#1a1a1a] hover:text-white hover:bg-[#222]'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs leading-tight">{item.label}</span>
                {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
