'use client'

import { Zap, LogOut, Sun, Moon, Settings } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useNavigation, AppTab } from '@/lib/navigation'
import { useTheme } from '@/lib/theme'

export function Navbar() {
  const { user, isAuthorized, signInWithGithub, signOut, setIsSettingsOpen } = useAuth()
  const { setTab } = useNavigation()
  const { theme, toggleTheme } = useTheme()

  const navigateTo = (target: AppTab, e?: React.MouseEvent) => {
    if (e) {
      if (e.metaKey || e.ctrlKey) return
      e.preventDefault()
    }
    setTab(target)
  }

  const userDisplayName =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Developer'

  return (
    <header className="sticky top-0 z-40 w-full border-b-2 border-[#171717] bg-[#fffaf0]/95 backdrop-blur-xs transition-colors dark:border-[#2e323b] dark:bg-[#0c0d11]/95">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-6">
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
        </div>

        {/* Right Navigation / Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle */}
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

          {isAuthorized ? (
            <div className="flex items-center gap-2">
              {/* Settings Button on Top of Navbar */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#171717] bg-white px-3 py-1.5 text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-[#ffe37e] hover:-translate-y-0.5 active:translate-y-0 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]"
                title="Account Settings & Link Secondary Accounts"
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>

              {/* User Identity Pill */}
              <div className="flex items-center gap-1.5 rounded-xl border-2 border-[#171717] bg-white px-2.5 py-1.5 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-[#171717] bg-[#ffd84d] text-[9px] font-black text-[#171717]">
                  {userDisplayName.slice(0, 1).toUpperCase()}
                </div>
                <span className="hidden max-w-[120px] truncate text-xs font-bold sm:inline">
                  {userDisplayName}
                </span>
              </div>

              {/* Sign Out Button */}
              <button
                onClick={signOut}
                className="flex cursor-pointer items-center gap-1 rounded-xl border-2 border-[#171717] bg-[#fffaf0] px-2.5 py-1.5 text-xs font-black uppercase text-[#171717] shadow-[1px_1px_0_#171717] transition hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[1px_1px_0_#000000] dark:hover:bg-rose-950/40"
                title="Sign Out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
          ) : (
            /* Unauthenticated: Sign in with GitHub button directly in navbar */
            <button
              onClick={signInWithGithub}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-[#171717] bg-[#24292f] px-3.5 py-1.5 text-xs font-black uppercase text-white shadow-hard-sm transition hover:bg-[#1b1f23] hover:-translate-y-0.5 active:translate-y-0 dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]"
            >
              <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>Sign in with GitHub</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
