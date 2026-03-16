'use client'
import { useState } from 'react'

export default function ResultBox({ content, label = 'Resultado', mono = false }) {
  const [copied, setCopied] = useState(false)

  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  async function copy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!content) return null

  return (
    <div className="mt-4 rounded-xl border border-[#2a2a2a] bg-[#111] overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#222] bg-[#161616]">
        <span className="text-xs font-semibold text-[#888] uppercase tracking-wider">{label}</span>
        <button
          onClick={copy}
          className="text-xs px-2.5 py-1 rounded-md bg-[#222] hover:bg-[#f97316] text-[#aaa] hover:text-white transition-all"
        >
          {copied ? '✅ Copiado!' : '📋 Copiar'}
        </button>
      </div>
      <pre className={`p-4 text-sm text-gray-300 whitespace-pre-wrap leading-relaxed overflow-x-auto ${mono ? 'font-mono' : 'font-sans'}`}>
        {text}
      </pre>
    </div>
  )
}
