'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const navGroups = [
  {
    label: null,
    items: [
      { href: '/', label: 'Início', icon: '⊞' },
    ]
  },
  {
    label: 'Conteúdo',
    items: [
      { href: '/legendas',  label: 'Legendas',    icon: '✍️' },
      { href: '/stories',   label: 'Stories',     icon: '📱' },
      { href: '/mensagens', label: 'Transmissão', icon: '💬' },
    ]
  },
  {
    label: 'Anúncios',
    items: [
      { href: '/anuncios',           label: 'Anúncios',      icon: '📣' },
      { href: '/anuncios/relatorio', label: 'Relatório Ads', icon: '📊' },
    ]
  },
  {
    label: 'Gestão',
    items: [
      { href: '/agendador',  label: 'Agendador',  icon: '📅' },
      { href: '/financeiro', label: 'Financeiro', icon: '💰' },
    ]
  },
]

const allNav = navGroups.flatMap(g => g.items)

export default function Sidebar() {
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)

  const activeItem = allNav.find(n => n.href === pathname)

  return (
    <>
      {/* ─── Desktop sidebar ─── */}
      <aside
        className="hidden md:flex fixed left-0 top-0 w-64 h-screen flex-col z-40"
        style={{ background: 'linear-gradient(180deg, #090909 0%, #070707 100%)', borderRight: '1px solid #141414' }}
      >
        {/* Logo */}
        <div className="px-5 py-6" style={{ borderBottom: '1px solid #111' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', boxShadow: '0 8px 24px rgba(249,115,22,0.25)' }}
            >
              <span className="text-lg">🍔</span>
            </div>
            <div>
              <p className="font-bold text-white text-sm leading-tight tracking-tight">Bruthus Burger</p>
              <p className="text-[9px] font-bold tracking-[0.18em] uppercase mt-0.5" style={{ color: '#f97316' }}>Marketing OS</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 overflow-y-auto space-y-6">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-2 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: '#222' }}>
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        active ? 'text-white' : 'text-[#444] hover:text-white'
                      }`}
                      style={active ? {
                        background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.08))',
                        border: '1px solid rgba(249,115,22,0.2)',
                        boxShadow: '0 0 20px rgba(249,115,22,0.08)',
                      } : {
                        border: '1px solid transparent',
                      }}
                    >
                      <span className={`text-base w-5 text-center transition-transform duration-200 ${!active ? 'group-hover:scale-110' : ''}`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 tracking-tight">{item.label}</span>
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f97316' }} />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4" style={{ borderTop: '1px solid #111' }}>
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #141414' }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} />
            <span className="text-[11px] flex-1" style={{ color: '#333' }}>Sistema online</span>
            <span className="text-[10px] font-mono" style={{ color: '#222' }}>v2.0</span>
          </div>
        </div>
      </aside>

      {/* ─── Mobile header ─── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 px-4 h-14 flex items-center justify-between"
        style={{ background: 'rgba(7,7,7,0.95)', borderBottom: '1px solid #141414', backdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}
          >
            <span className="text-sm">🍔</span>
          </div>
          <div>
            <p className="font-bold text-white text-xs leading-tight">Bruthus Burger</p>
            <p className="text-[9px] font-semibold tracking-wider uppercase" style={{ color: '#f97316' }}>
              {activeItem ? `${activeItem.icon} ${activeItem.label}` : '⊞ Início'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setMenuAberto(v => !v)}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1a1a1a' }}
          aria-label="Menu"
        >
          <span className={`w-4 h-0.5 rounded-full bg-white transition-all duration-200 origin-center ${menuAberto ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <span className={`w-4 h-0.5 rounded-full bg-white transition-all duration-200 ${menuAberto ? 'opacity-0 scale-x-0' : ''}`} />
          <span className={`w-4 h-0.5 rounded-full bg-white transition-all duration-200 origin-center ${menuAberto ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </button>
      </header>

      {/* ─── Mobile backdrop ─── */}
      {menuAberto && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/85"
          style={{ backdropFilter: 'blur(4px)' }}
          onClick={() => setMenuAberto(false)}
        />
      )}

      {/* ─── Mobile menu ─── */}
      <div
        className={`md:hidden fixed top-14 left-0 right-0 z-40 transition-all duration-300 overflow-hidden ${
          menuAberto ? 'max-h-[85vh] opacity-100' : 'max-h-0 opacity-0'
        }`}
        style={{ background: '#080808', borderBottom: '1px solid #141414' }}
      >
        <nav className="p-4 space-y-5 overflow-y-auto max-h-[calc(85vh-1px)]">
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-2 mb-2 text-[9px] font-bold uppercase tracking-[0.22em]" style={{ color: '#222' }}>
                  {group.label}
                </p>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                {group.items.map(item => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuAberto(false)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-2xl text-sm font-medium transition-all duration-200 ${
                        active ? 'text-white' : 'text-[#555]'
                      }`}
                      style={active ? {
                        background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.08))',
                        border: '1px solid rgba(249,115,22,0.25)',
                      } : {
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid #161616',
                      }}
                    >
                      <span className="text-lg shrink-0">{item.icon}</span>
                      <span className="text-xs leading-tight">{item.label}</span>
                      {active && <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#f97316' }} />}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}
