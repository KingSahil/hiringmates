'use client'

import { useEffect, useState } from 'react'
import { Zap, LogIn, LogOut, Sun, Moon } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useNavigation, AppTab } from '@/lib/navigation'
import { useTheme } from '@/lib/theme'

let cachedEmail: string | null | undefined = undefined

export function Navbar() {
  const { setTab } = useNavigation()
  const { theme, toggleTheme } = useTheme()
  const [userEmail, setUserEmail] = useState<string | null>(cachedEmail ?? null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    if (cachedEmail === undefined) {
      supabase.auth.getSession().then(({ data }: any) => {
        const email = data.session?.user?.email ?? null
        cachedEmail = email
        setUserEmail(email)
      })
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      const email = session?.user?.email ?? null
      cachedEmail = email
      setUserEmail(email)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    cachedEmail = null
    setUserEmail(null)
  }

  const navigateTo = (target: AppTab, e?: React.MouseEvent) => {
    if (e) {
      if (e.metaKey || e.ctrlKey) return
      e.preventDefault()
    }
    setTab(target)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-[#171717] bg-[#fffaf0]/95 backdrop-blur-xs transition-colors dark:border-[#2e323b] dark:bg-[#0c0d11]/95">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <a
          href="/"
          onClick={(e) => navigateTo('home', e)}
          className="flex cursor-pointer items-center gap-2.5 transition-transform active:scale-95"
          title="HiringMates Home"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ffd84d] shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]">
            <Zap className="h-4 w-4 fill-current text-[#171717]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              HIRING<span className="text-[#6d73ff]">MATES</span>
            </span>
            <span className="rounded border border-[#171717] bg-[#39d5c8] px-1.5 py-0.2 text-[9px] font-black uppercase text-[#171717] dark:border-[#000000]">
              PRO
            </span>
          </div>
        </a>

        {/* Right Auth / Status + Theme Toggle (Clean, uncluttered, no duplicate pills) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#171717] bg-white text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-[#ffd84d] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#ffd84d] dark:shadow-[2px_2px_0_#000000] dark:hover:bg-[#222630]"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 fill-[#ffd84d]" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>

          {userEmail ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#171717] bg-white px-2.5 py-1 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#171717] bg-[#ffd84d] text-[9px] font-black text-[#171717]">
                  {userEmail.slice(0, 1).toUpperCase()}
                </div>
                <span className="hidden max-w-[130px] truncate text-xs font-bold sm:inline">
                  {userEmail}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="flex cursor-pointer items-center gap-1 rounded-xl border-2 border-[#171717] bg-[#fffaf0] px-2.5 py-1 text-xs font-black uppercase text-[#171717] shadow-[1px_1px_0_#171717] transition hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[1px_1px_0_#000000] dark:hover:bg-rose-950/40"
                title="Sign Out"
              >
                <LogOut className="h-3 w-3" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          ) : (
            <a
              href="/auth"
              onClick={(e) => navigateTo('auth', e)}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#171717] bg-[#6d73ff] px-3.5 py-1.5 text-xs font-black uppercase text-white shadow-hard-sm transition hover:bg-[#585fe6] dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
