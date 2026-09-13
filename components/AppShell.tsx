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
import { RecruiterPortal } from '@/components/views/RecruiterPortal'

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

  // Sync initial tab with current URL route
  useEffect(() => {
    if (initialTab && tab !== initialTab) {
      const currentPath = window.location.pathname.toLowerCase()
      if (
        (initialTab === 'hireme' && currentPath.includes('hireme')) ||
        (initialTab === 'codemates' && currentPath.includes('codemates')) ||
        (initialTab === 'mentorship' && currentPath.includes('mentorship')) ||
        (initialTab === 'assessment' && currentPath.includes('assessment')) ||
        (initialTab === 'recruiter' && currentPath.includes('recruiter')) ||
        (initialTab === 'home' && currentPath === '/')
      ) {
        if (!loading && !isAuthorized && initialTab !== 'home' && initialTab !== 'recruiter') {
          setTab('home')
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', '/')
          }
        } else {
          setTab(initialTab)
        }
      }
    }
  }, [initialTab, setTab, tab, loading, isAuthorized])

  // If unauthorized and sitting on any protected tab, automatically reset to home
  useEffect(() => {
    if (!loading && !isAuthorized && tab !== 'home' && tab !== 'recruiter') {
      setTab('home')
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/')
      }
    }
  }, [loading, isAuthorized, tab, setTab])

  const currentTab = initialTab && tab === 'home' ? initialTab : tab
  const isProtectedTab =
    currentTab === 'hireme' ||
    currentTab === 'codemates' ||
    currentTab === 'mentorship' ||
    currentTab === 'assessment'

  // While auth session is resolving, show branded loader if attempting to access protected content
  if (loading && isProtectedTab) {
    return (
      <main className="flex min-h-[calc(100vh-65px)] items-center justify-center bg-[#fffaf0] dark:bg-[#0c0d11]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-3 border-[#171717] bg-[#ffd84d] shadow-[3px_3px_0_#171717] animate-pulse dark:border-[#2e323b] dark:shadow-[3px_3px_0_#000000]">
            <img src="/brand-logo.png" alt="HiringMates" className="h-6 w-6 object-contain" />
          </div>
          <p className="font-mono text-xs font-black uppercase tracking-wider text-[#171717] dark:text-[#f4f4f7]">
            Verifying credentials...
          </p>
        </div>
      </main>
    )
  }

  // If not logged in and not accessing recruiter portal, strictly render the Landing page
  if (!isAuthorized && currentTab !== 'recruiter') {
    return (
      <main className="w-full">
        <LandingContent />
      </main>
    )
  }

  return (
    <main className="w-full">
      {currentTab === 'home' && <AuthorizedHome />}
      {currentTab === 'hireme' && <HireMeContent />}
      {currentTab === 'codemates' && <CodeMatesContent />}
      {currentTab === 'mentorship' && <MentorshipMeetContent />}
      {currentTab === 'assessment' && <AssessmentContent />}
      {currentTab === 'recruiter' && <RecruiterPortal />}
    </main>
  )
}
