'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  isAuthorized: boolean
  isSettingsOpen: boolean
  setIsSettingsOpen: (open: boolean) => void
  signInWithGithub: () => Promise<void>
  signInWithLinkedIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  isAuthorized: false,
  isSettingsOpen: false,
  setIsSettingsOpen: () => {},
  signInWithGithub: async () => {},
  signInWithLinkedIn: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    // Get initial session
    supabase.auth.getSession().then(({ data }: any) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    // Listen to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  const signInWithGithub = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const signInWithLinkedIn = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isAuthorized: !!user,
        isSettingsOpen,
        setIsSettingsOpen,
        signInWithGithub,
        signInWithLinkedIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
