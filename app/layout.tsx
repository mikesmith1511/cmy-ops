import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'CMY Operations Platform', description: 'Card My Yard Operations' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          /* Date picker icon - white, double size, fully visible on dark theme */
          input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(1) brightness(2);
            cursor: pointer;
            opacity: 1;
            width: 24px;
            height: 24px;
            padding: 2px;
          }
          input[type="date"]::-webkit-calendar-picker-indicator:hover {
            opacity: 0.8;
          }
          input[type="date"] {
            cursor: pointer;
            color-scheme: dark;
          }
        `}</style>
      </head>
      <body style={{ margin: 0, background: '#0f0f0f', color: '#e8e8e8', fontFamily: "'DM Sans', sans-serif", minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
