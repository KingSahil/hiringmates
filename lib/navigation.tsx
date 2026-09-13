'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

export type AppTab =
  | 'home'
  | 'hireme'
  | 'codemates'
  | 'mentorship'
  | 'assessment'
  | 'positions'
  | 'portal' | 'recruiter'

interface NavigationContextType {
  tab: AppTab
  setTab: (tab: AppTab) => void
  isAssessmentLocked: boolean
  lockAssessment: (onViolation?: (reason: string) => void) => void
  unlockAssessment: () => void
}

const NavigationContext = createContext<NavigationContextType>({
  tab: 'home',
  setTab: () => {},
  isAssessmentLocked: false,
  lockAssessment: () => {},
  unlockAssessment: () => {},
})

function getTabFromPath(): AppTab {
  if (typeof window === 'undefined') return 'home'
  const path = window.location.pathname.toLowerCase()
  if (path.includes('hireme')) return 'hireme'
  if (path.includes('codemates')) return 'codemates'
  if (path.includes('mentorship')) return 'mentorship'
  if (path.includes('assessment')) return 'assessment'
  if (path.includes('positions')) return 'positions'
  if (path.includes('portal')) return 'portal'
  if (path.includes('recruiter')) return 'recruiter'
  return 'home'
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<AppTab>('home')
  const [isAssessmentLocked, setIsAssessmentLocked] = useState(false)
  const violationHandlerRef = useRef<((reason: string) => void) | null>(null)
  const tabRef = useRef<AppTab>('home')
  tabRef.current = tab

  const lockAssessment = useCallback((onViolation?: (reason: string) => void) => {
    setIsAssessmentLocked(true)
    violationHandlerRef.current = onViolation || null
  }, [])

  const unlockAssessment = useCallback(() => {
    setIsAssessmentLocked(false)
    violationHandlerRef.current = null
  }, [])

  useEffect(() => {
    // Initial sync with current window path
    setTabState(getTabFromPath())

    const handlePopState = (e: PopStateEvent) => {
      if (isAssessmentLocked) {
        e.preventDefault()
        // Stay on current URL
        if (typeof window !== 'undefined') {
          const expectedPath = tabRef.current === 'home' ? '/' : `/${tabRef.current}`
          window.history.pushState(null, '', expectedPath)
        }
        if (violationHandlerRef.current) {
          violationHandlerRef.current('Assessment Invalidated: Browser back/forward navigation detected during active exam.')
        }
        return
      }
      setTabState(getTabFromPath())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isAssessmentLocked])

  useEffect(() => {
    if (!isAssessmentLocked) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Active proctored assessment in progress. Leaving or reloading will invalidate your test!'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isAssessmentLocked])

  const setTab = useCallback((newTab: AppTab) => {
    if (isAssessmentLocked && newTab !== tabRef.current) {
      // VIOLATION: Tried to navigate away while assessment was locked!
      if (violationHandlerRef.current) {
        violationHandlerRef.current(`Assessment Invalidated: Navigated away from active assessment to "${newTab}".`)
      }
      return
    }

    setTabState(newTab)
    if (typeof window !== 'undefined') {
      const newPath = newTab === 'home' ? '/' : `/${newTab}`
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath)
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [isAssessmentLocked])

  return (
    <NavigationContext.Provider value={{ tab, setTab, isAssessmentLocked, lockAssessment, unlockAssessment }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}
