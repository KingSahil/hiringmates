'use client'

import { useEffect } from 'react'
import { useNavigation, AppTab } from '@/lib/navigation'
import { LandingContent } from '@/components/views/LandingContent'
import { HireMeContent } from '@/components/views/HireMeContent'
import { CodeMatesContent } from '@/components/views/CodeMatesContent'
import { AuthContent } from '@/components/views/AuthContent'

interface AppShellProps {
  initialTab?: AppTab
}

export function AppShell({ initialTab }: AppShellProps) {
  const { tab, setTab } = useNavigation()

  useEffect(() => {
    if (initialTab && tab !== initialTab) {
      // Sync initial route if directly requested via specific URL
      const currentPath = window.location.pathname.toLowerCase()
      if (
        (initialTab === 'hireme' && currentPath.includes('hireme')) ||
        (initialTab === 'codemates' && currentPath.includes('codemates')) ||
        (initialTab === 'auth' && currentPath.includes('auth')) ||
        (initialTab === 'home' && currentPath === '/')
      ) {
        setTab(initialTab)
      }
    }
  }, [initialTab, setTab, tab])

  return (
    <main className="w-full">
      {tab === 'home' && <LandingContent />}
      {tab === 'hireme' && <HireMeContent />}
      {tab === 'codemates' && <CodeMatesContent />}
      {tab === 'auth' && <AuthContent />}
    </main>
  )
}
