'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'

export type AppTab = 'home' | 'hireme' | 'codemates' | 'mentorship' | 'assessment' | 'recruiter'

const PROTECTED_TABS: AppTab[] = ['hireme', 'codemates', 'mentorship', 'assessment']

interface NavigationContextType {
  tab: AppTab
  setTab: (tab: AppTab) => void
  registerNavigationGuard: (guard: ((targetTab: AppTab) => boolean) | null) => void
}

const NavigationContext = createContext<NavigationContextType>({
  tab: 'home',
  setTab: () => {},
  registerNavigationGuard: () => {},
})

function getTabFromPath(): AppTab {
  if (typeof window === 'undefined') return 'home'
  const path = window.location.pathname.toLowerCase()
  if (path.includes('hireme')) return 'hireme'
  if (path.includes('codemates')) return 'codemates'
  if (path.includes('mentorship')) return 'mentorship'
  if (path.includes('assessment')) return 'assessment'
  if (path.includes('recruiter')) return 'recruiter'
  return 'home'
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const { isAuthorized, loading } = useAuth()
  const [tab, setTabState] = useState<AppTab>('home')
  const guardRef = React.useRef<((targetTab: AppTab) => boolean) | null>(null)

  const registerNavigationGuard = useCallback((guard: ((targetTab: AppTab) => boolean) | null) => {
    guardRef.current = guard
  }, [])

  // Sync with current window path on mount and when auth resolves
  useEffect(() => {
    const currentFromPath = getTabFromPath()
    if (!loading && !isAuthorized && PROTECTED_TABS.includes(currentFromPath)) {
      setTabState('home')
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/')
      }
    } else {
      setTabState(currentFromPath)
    }
  }, [loading, isAuthorized])

  // If user becomes unauthenticated (e.g. sign out or expired session) while on a protected tab, reset to home
  useEffect(() => {
    if (!loading && !isAuthorized && PROTECTED_TABS.includes(tab)) {
      setTabState('home')
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.history.replaceState(null, '', '/')
      }
    }
  }, [loading, isAuthorized, tab])

  useEffect(() => {
    const handlePopState = () => {
      let nextTab = getTabFromPath()
      if (!loading && !isAuthorized && PROTECTED_TABS.includes(nextTab)) {
        nextTab = 'home'
        if (typeof window !== 'undefined' && window.location.pathname !== '/') {
          window.history.replaceState(null, '', '/')
        }
      }
      if (guardRef.current) {
        const allowed = guardRef.current(nextTab)
        if (!allowed) {
          // Re-push current path to stop back/forward navigation
          const currentPath = tab === 'home' ? '/' : `/${tab}`
          window.history.pushState(null, '', currentPath)
          return
        }
      }
      setTabState(nextTab)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [tab, loading, isAuthorized])

  const setTab = useCallback((newTab: AppTab) => {
    if (!loading && !isAuthorized && PROTECTED_TABS.includes(newTab)) {
      newTab = 'home'
    }

    if (guardRef.current) {
      const allowed = guardRef.current(newTab)
      if (!allowed) {
        return
      }
    }

    setTabState(newTab)
    if (typeof window !== 'undefined') {
      const newPath = newTab === 'home' ? '/' : `/${newTab}`
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath)
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [loading, isAuthorized])

  return (
    <NavigationContext.Provider value={{ tab, setTab, registerNavigationGuard }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}
