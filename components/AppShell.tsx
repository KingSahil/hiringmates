'use client'

import { useEffect, useRef } from 'react'
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
  const autoCheckRef = useRef(false)

  // First sign-in for an account that has never been registered: start the
  // profiling pipeline and drop the candidate straight into the assessment.
  //
  // Fires at most once per mount. The endpoint is idempotent, so even a
  // duplicate call (refresh, second tab) returns "existing" and starts nothing.
  useEffect(() => {
    if (loading || !isAuthorized || autoCheckRef.current) return
    autoCheckRef.current = true

    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/auto', { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()
        // Only interrupt someone sitting on the landing page. If they have
        // already navigated elsewhere, leave them there — the assessment view
        // adopts the running session whenever they open it.
        if (data?.status === 'new' && tab === 'home') {
          setTab('assessment')
        }
      } catch {
        // Auto-start is best effort; the manual start control still works.
      }
    })()
  }, [loading, isAuthorized, tab, setTab])

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
