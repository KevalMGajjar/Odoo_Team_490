import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata = {
  title: 'Urban Furniture — Accounting',
  description: 'Double-entry accounting with perpetual inventory and multi-currency.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
