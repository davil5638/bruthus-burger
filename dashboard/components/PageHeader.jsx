export default function PageHeader({ emoji, title, description, children }) {
  return (
    <div className="flex items-start justify-between mb-8 pb-6 border-b border-[#1e1e1e]">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#f97316]/10 border border-[#f97316]/20 flex items-center justify-center text-2xl">
          {emoji}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-sm text-[#666] mt-0.5">{description}</p>
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
