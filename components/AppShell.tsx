'use client'

import { useEffect } from 'react'
import { useNavigation, AppTab } from '@/lib/navigation'
import { useAuth } from '@/lib/auth'
import { LandingContent } from '@/components/views/LandingContent'
import { AuthorizedHome } from '@/components/views/AuthorizedHome'
import { HireMeContent } from '@/components/views/HireMeContent'
import { CodeMatesContent } from '@/components/views/CodeMatesContent'
import { MentorshipMeetContent } from '@/components/views/MentorshipMeetContent'
import { AssessmentContent } from '@/components/views/AssessmentContent'

interface AppShellProps {
  initialTab?: AppTab
}

export function AppShell({ initialTab }: AppShellProps) {
  const { tab, setTab } = useNavigation()
  const { isAuthorized, loading } = useAuth()

  useEffect(() => {
    if (initialTab && tab !== initialTab) {
      const currentPath = window.location.pathname.toLowerCase()
      if (
        (initialTab === 'hireme' && currentPath.includes('hireme')) ||
        (initialTab === 'codemates' && currentPath.includes('codemates')) ||
        (initialTab === 'mentorship' && currentPath.includes('mentorship')) ||
        (initialTab === 'assessment' && currentPath.includes('assessment')) ||
        (initialTab === 'home' && currentPath === '/')
      ) {
        setTab(initialTab)
      }
    }
  }, [initialTab, setTab, tab])

  const currentTab = initialTab && tab === 'home' ? initialTab : tab

  return (
    <main className="w-full">
      {currentTab === 'home' && (
        isAuthorized ? <AuthorizedHome /> : <LandingContent />
      )}
      {currentTab === 'hireme' && <HireMeContent />}
      {currentTab === 'codemates' && <CodeMatesContent />}
      {currentTab === 'mentorship' && <MentorshipMeetContent />}
      {currentTab === 'assessment' && <AssessmentContent />}
    </main>
  )
}
