import './globals.css'
import Sidebar from '../components/Sidebar'

export const metadata = {
  title: 'Bruthus Burger — Marketing Dashboard',
  description: 'Painel de automação de marketing Instagram',
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="bg-[#0a0a0a] text-white antialiased">
        <Sidebar />
        <main className="ml-60 min-h-screen p-8">
          {children}
        </main>
      </body>
    </html>
  )
}
