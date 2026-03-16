'use client'

export default function Button({ children, onClick, loading, disabled, variant = 'primary', size = 'md', className = '' }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed'

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
    xl: 'px-8 py-4 text-lg',
  }

  const variants = {
    primary:   'bg-[#f97316] hover:bg-[#ea580c] text-white shadow-lg shadow-orange-900/20 hover:shadow-orange-900/40',
    secondary: 'bg-[#1e1e1e] hover:bg-[#2a2a2a] text-white border border-[#333]',
    ghost:     'bg-transparent hover:bg-[#1a1a1a] text-[#aaa] hover:text-white border border-[#333]',
    danger:    'bg-red-600 hover:bg-red-700 text-white',
    success:   'bg-green-600 hover:bg-green-700 text-white',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
