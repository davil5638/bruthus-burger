'use client'
import { useEffect } from 'react'

export function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: 'bg-green-600 border-green-500',
    error:   'bg-red-700 border-red-600',
    info:    'bg-blue-700 border-blue-600',
  }

  const icons = { success: '✅', error: '❌', info: 'ℹ️' }

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl text-white max-w-sm animate-slide-up ${colors[type]}`}>
      <span className="text-lg mt-0.5">{icons[type]}</span>
      <p className="text-sm flex-1 leading-snug">{message}</p>
      <button onClick={onClose} className="text-white/60 hover:text-white ml-2 text-lg leading-none">×</button>
    </div>
  )
}

export function useToast(setToast) {
  return {
    success: (msg) => setToast({ message: msg, type: 'success' }),
    error:   (msg) => setToast({ message: msg, type: 'error' }),
    info:    (msg) => setToast({ message: msg, type: 'info' }),
    clear:   ()    => setToast(null),
  }
}
