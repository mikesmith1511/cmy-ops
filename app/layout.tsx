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
          /* Fix native date picker calendar icon visibility on dark theme */
          input[type="date"]::-webkit-calendar-picker-indicator {
            filter: invert(0.8);
            cursor: pointer;
            opacity: 0.7;
          }
          input[type="date"]::-webkit-calendar-picker-indicator:hover {
            opacity: 1;
          }
          /* Make the entire date input clickable to open the picker */
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
