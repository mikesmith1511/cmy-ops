import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'CMY Operations Platform', description: 'Card My Yard Operations' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, background: '#0f0f0f', color: '#e8e8e8', fontFamily: "'DM Sans', sans-serif", minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
