'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/',           label: 'Dashboard',    icon: '📊' },
  { href: '/posts',      label: 'Publicar Post', icon: '📸' },
  { href: '/legendas',   label: 'Legendas',     icon: '✍️'  },
  { href: '/promocoes',  label: 'Promoções',    icon: '🎉' },
  { href: '/reels',      label: 'Reels',        icon: '🎬' },
  { href: '/hashtags',   label: 'Hashtags',     icon: '#'  },
  { href: '/anuncios',   label: 'Anúncios',     icon: '📣' },
  { href: '/agendador',  label: 'Agendador',    icon: '📅' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 w-60 h-screen bg-[#111] border-r border-[#1e1e1e] flex flex-col z-40">
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
  )
}
