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
import { PortalContent } from '@/components/views/PortalContent'
import { PositionsContent } from '@/components/views/PositionsContent'
import { portalRoleFor, portalRoleForUser } from '@/lib/portal'

interface AppShellProps {
  initialTab?: AppTab
}

export function AppShell({ initialTab }: AppShellProps) {
  const { tab, setTab } = useNavigation()
  const { isAuthorized, loading, user } = useAuth()
  const autoCheckRef = useRef(false)
  const wasAuthorizedRef = useRef<boolean | null>(null)

  // Redirect to unauthorized home page whenever ANY account logs out anytime
  useEffect(() => {
    if (loading) return
    if (wasAuthorizedRef.current === null) {
      wasAuthorizedRef.current = isAuthorized
      return
    }
    if (wasAuthorizedRef.current && !isAuthorized) {
      wasAuthorizedRef.current = false
      setTab('home')
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.replace('/')
      }
    }
    wasAuthorizedRef.current = isAuthorized
  }, [isAuthorized, loading, setTab])

  // Mentors and companies accounts should ALWAYS redirect to their respective dashboards (portal).
  // They should never land on or be redirected to the student home page.
  const portalRole = portalRoleForUser(user) || portalRoleFor(user?.email)
  useEffect(() => {
    if (loading || !isAuthorized || !portalRole) return
    if (tab === 'home') {
      setTab('portal')
    }
  }, [loading, isAuthorized, portalRole, tab, setTab])

  // First sign-in for an account that has never been registered: start the
  // profiling pipeline and drop the candidate straight into the assessment.
  //
  // Fires at most once per mount. The endpoint is idempotent, so even a
  // duplicate call (refresh, second tab) returns "existing" and starts nothing.
  useEffect(() => {
    if (loading || !isAuthorized || autoCheckRef.current || portalRole) return
    autoCheckRef.current = true

    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/auto', { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()

        // If cache already exists for this GitHub account (30-day TTL) or candidate is already profiled,
        // NEVER redirect to assessment! They stay on home.
        if (data?.hasCache || data?.status === 'cached' || data?.status === 'portal_member') {
          return
        }

        // Only redirect to assessment if this is a brand-new candidate session freshly started
        if (data?.status === 'new' && tab === 'home') {
          setTab('assessment')
        }
      } catch {
        // Auto-start is best effort; the manual start control still works.
      }
    })()
  }, [loading, isAuthorized, portalRole, tab, setTab])

  useEffect(() => {
    if (initialTab && tab !== initialTab) {
      const currentPath = window.location.pathname.toLowerCase()
      if (
        (initialTab === 'hireme' && currentPath.includes('hireme')) ||
        (initialTab === 'codemates' && currentPath.includes('codemates')) ||
        (initialTab === 'mentorship' && currentPath.includes('mentorship')) ||
        (initialTab === 'assessment' && currentPath.includes('assessment')) ||
        (initialTab === 'recruiter' && currentPath.includes('recruiter')) ||
        (initialTab === 'positions' && currentPath.includes('positions')) ||
        (initialTab === 'portal' && currentPath.includes('portal')) ||
        (initialTab === 'home' && currentPath === '/')
      ) {
        setTab(initialTab)
      }
    }
  }, [initialTab, setTab, tab])

  const isRootPath = typeof window !== 'undefined' && window.location.pathname === '/'
  const currentTab = isRootPath
    ? (portalRole ? 'portal' : 'home')
    : (initialTab && tab === 'home' ? (portalRole ? 'portal' : initialTab) : tab)

  return (
    <main className="w-full">
      {currentTab === 'home' && (
        isAuthorized ? <AuthorizedHome /> : <LandingContent />
      )}
      {currentTab === 'hireme' && <HireMeContent />}
      {currentTab === 'codemates' && <CodeMatesContent />}
      {currentTab === 'mentorship' && <MentorshipMeetContent />}
      {currentTab === 'assessment' && <AssessmentContent />}
      {currentTab === 'recruiter' && <RecruiterPortal />}
      {currentTab === 'positions' && <PositionsContent />}
      {currentTab === 'portal' && <PortalContent />}
    </main>
  )
}
