'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

export type AppTab = 'home' | 'hireme' | 'codemates'

interface NavigationContextType {
  tab: AppTab
  setTab: (tab: AppTab) => void
}

const NavigationContext = createContext<NavigationContextType>({
  tab: 'home',
  setTab: () => {},
})

function getTabFromPath(): AppTab {
  if (typeof window === 'undefined') return 'home'
  const path = window.location.pathname.toLowerCase()
  if (path.includes('hireme')) return 'hireme'
  if (path.includes('codemates')) return 'codemates'
  return 'home'
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<AppTab>('home')

  useEffect(() => {
    // Initial sync with current window path
    setTabState(getTabFromPath())

    const handlePopState = () => {
      setTabState(getTabFromPath())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const setTab = useCallback((newTab: AppTab) => {
    setTabState(newTab)
    if (typeof window !== 'undefined') {
      const newPath = newTab === 'home' ? '/' : `/${newTab}`
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, '', newPath)
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [])

  return (
    <NavigationContext.Provider value={{ tab, setTab }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}
