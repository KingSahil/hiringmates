import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Inter } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { SettingsModal } from '@/components/SettingsModal'
import { NavigationProvider } from '@/lib/navigation'
import { ThemeProvider } from '@/lib/theme'
import { AuthProvider } from '@/lib/auth'

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HiringMates · Prove your craft. Build with your crew.',
  description: 'High-signal developer assessments and live multiplayer coding arcade with Realtime collaboration.',
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#fffaf0',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${bebas.variable} ${inter.variable} bg-[#fffaf0] text-[#171717] dark:bg-[#0c0d11] dark:text-[#f4f4f7]`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('theme');
                  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#fffaf0] text-[#171717] antialiased dark:bg-[#0c0d11] dark:text-[#f4f4f7]">
        <ThemeProvider>
          <AuthProvider>
            <NavigationProvider>
              <Navbar />
              <SettingsModal />
              {children}
            </NavigationProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
