'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { getAuthRedirectUrl } from '@/lib/auth-redirect'

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

  const hadUserRef = React.useRef<boolean>(false)

  const redirectToUnauthorizedHome = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.replace('/')
    }
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()

    // Get initial session
    supabase.auth.getSession().then(({ data }: any) => {
      setSession(data.session)
      const currentUser = data.session?.user ?? null
      setUser(currentUser)
      hadUserRef.current = !!currentUser
      setLoading(false)
    })

    // Listen to auth changes
    const { data: listener } = supabase.auth.onAuthStateChange((event: any, newSession: any) => {
      const newUser = newSession?.user ?? null
      setSession(newSession)
      setUser(newUser)
      setLoading(false)

      // When ANY account logs out anytime (explicit logout, cross-tab, token expiration)
      if (event === 'SIGNED_OUT' || (hadUserRef.current && !newUser)) {
        hadUserRef.current = false
        setIsSettingsOpen(false)
        redirectToUnauthorizedHome()
      } else if (newUser) {
        hadUserRef.current = true
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [redirectToUnauthorizedHome])

  const signInWithGithub = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: getAuthRedirectUrl('/auth/callback'),
      },
    })
  }, [])

  const signInWithLinkedIn = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: getAuthRedirectUrl('/auth/callback'),
      },
    })
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    hadUserRef.current = false
    setIsSettingsOpen(false)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    } finally {
      setUser(null)
      setSession(null)
      redirectToUnauthorizedHome()
    }
  }, [redirectToUnauthorizedHome])

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
