'use client'

import { useState, useEffect } from 'react'
import { Mail, Lock, User, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, Sparkles, Zap } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useNavigation } from '@/lib/navigation'

export function AuthContent() {
  const { setTab } = useNavigation()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      if (err) {
        setError(decodeURIComponent(err))
      }
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSubmitting(true)

    const supabase = getSupabaseBrowserClient()

    try {
      if (mode === 'signin') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          setError(
            signInError.message.includes('Invalid login')
              ? 'Invalid email or password. Please double check.'
              : signInError.message
          )
        } else if (data.user) {
          setSuccess('Signed in successfully!')
          setTimeout(() => {
            setTab('codemates')
          }, 600)
        }
      } else if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: displayName.trim() || 'Candidate',
            },
            emailRedirectTo:
              process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
              (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined),
          },
        })

        if (signUpError) {
          setError(signUpError.message)
        } else if (data.user) {
          setSuccess('Account created! You are ready to explore assessments & rooms.')
          setTimeout(() => {
            setTab('codemates')
          }, 1000)
        }
      } else if (mode === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo:
            typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined,
        })

        if (resetError) {
          setError(resetError.message)
        } else {
          setSuccess(`Password reset instructions have been dispatched to ${email}.`)
        }
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid-paper relative flex min-h-[calc(100vh-65px)] items-center justify-center p-4 sm:p-8">
      {/* Decorative Badges */}
      <div className="pointer-events-none absolute left-8 top-12 hidden select-none lg:block">
        <div className="flex rotate-[-8deg] items-center gap-2 rounded-2xl border-3 border-[#171717] bg-[#ffd84d] px-4 py-2 text-xs font-black uppercase text-[#171717] shadow-hard-sm dark:border-[#000000] dark:shadow-[3px_3px_0_#000000]">
          <Zap className="h-4 w-4" /> Live Multiplayer
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-16 right-10 hidden select-none lg:block">
        <div className="flex rotate-[6deg] items-center gap-2 rounded-2xl border-3 border-[#171717] bg-[#39d5c8] px-4 py-2 text-xs font-black uppercase text-[#171717] shadow-hard-sm dark:border-[#000000] dark:shadow-[3px_3px_0_#000000]">
          <Sparkles className="h-4 w-4" /> Real Signal Assessments
        </div>
      </div>

      <div className="relative w-full max-w-md rounded-3xl border-4 border-[#171717] bg-[#fffaf0] p-6 shadow-hard-lg transition-colors sm:p-8 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[8px_8px_0_#000000]">
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border-2 border-[#171717] bg-[#ffd84d] px-3 py-1 text-[11px] font-black uppercase tracking-wider text-[#171717] dark:border-[#000000]">
            <Sparkles className="h-3 w-3" /> HiringMates ID
          </div>
          <h1 className="font-display text-4xl uppercase tracking-tight text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
            {mode === 'forgot'
              ? 'Reset Password'
              : mode === 'signup'
                ? 'Create Account'
                : 'Welcome Back'}
          </h1>
          <p className="mt-1 text-xs font-bold text-[#171717]/70 sm:text-sm dark:text-[#a1a1aa]">
            {mode === 'forgot'
              ? 'Enter your email to receive a password reset link'
              : mode === 'signup'
                ? 'Join multiplayer coding arenas & assessments'
                : 'Access your assessment drafts and real room lobbies'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        {mode !== 'forgot' && (
          <div className="mb-6 flex rounded-2xl border-3 border-[#171717] bg-white p-1.5 shadow-sm dark:border-[#2e323b] dark:bg-[#111317]">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError('')
                setSuccess('')
              }}
              className={`flex-1 cursor-pointer rounded-xl py-2.5 text-xs font-black uppercase transition-all ${
                mode === 'signin'
                  ? 'border-2 border-[#171717] bg-[#6d73ff] text-white shadow-sm dark:border-[#000000]'
                  : 'text-[#171717] opacity-60 hover:opacity-100 dark:text-[#d4d4d8]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup')
                setError('')
                setSuccess('')
              }}
              className={`flex-1 cursor-pointer rounded-xl py-2.5 text-xs font-black uppercase transition-all ${
                mode === 'signup'
                  ? 'border-2 border-[#171717] bg-[#ff57ce] text-white shadow-sm dark:border-[#000000]'
                  : 'text-[#171717] opacity-60 hover:opacity-100 dark:text-[#d4d4d8]'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="mb-5 flex items-start gap-2.5 rounded-2xl border-3 border-[#171717] bg-rose-100 p-3.5 text-xs font-bold text-[#171717] shadow-sm dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-start gap-2.5 rounded-2xl border-3 border-[#171717] bg-[#6ee56b] p-3.5 text-xs font-bold text-[#171717] shadow-sm dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#171717] dark:text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="mb-1.5 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
                Full Name / Handle
              </label>
              <div className="flex items-center rounded-2xl border-2 border-[#171717] bg-white px-3.5 py-3 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[2px_2px_0_#000000]">
                <User className="mr-2 h-4 w-4 text-[#171717]/50 dark:text-[#f4f4f7]/50" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maya Chen"
                  className="w-full bg-transparent text-xs font-bold text-[#171717] outline-none sm:text-sm dark:text-[#f4f4f7]"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
              Email Address
            </label>
            <div className="flex items-center rounded-2xl border-2 border-[#171717] bg-white px-3.5 py-3 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[2px_2px_0_#000000]">
              <Mail className="mr-2 h-4 w-4 text-[#171717]/50 dark:text-[#f4f4f7]/50" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dev@hiringmates.com"
                className="w-full bg-transparent text-xs font-bold text-[#171717] outline-none sm:text-sm dark:text-[#f4f4f7]"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot')
                      setError('')
                      setSuccess('')
                    }}
                    className="cursor-pointer text-[11px] font-black uppercase text-[#171717] opacity-70 underline hover:opacity-100 dark:text-[#d4d4d8]"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="flex items-center rounded-2xl border-2 border-[#171717] bg-white px-3.5 py-3 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[2px_2px_0_#000000]">
                <Lock className="mr-2 h-4 w-4 text-[#171717]/50 dark:text-[#f4f4f7]/50" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-transparent text-xs font-bold text-[#171717] outline-none sm:text-sm dark:text-[#f4f4f7]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`mt-4 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-3 border-[#171717] px-6 text-xs font-black uppercase text-white shadow-hard transition hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 sm:min-h-14 sm:text-sm dark:border-[#000000] dark:shadow-[4px_4px_0_#000000] ${
              mode === 'signup'
                ? 'bg-[#ff57ce] hover:bg-[#eb43b9]'
                : mode === 'forgot'
                  ? 'bg-[#39d5c8] text-[#171717] hover:bg-[#2bc4b8]'
                  : 'bg-[#6d73ff] hover:bg-[#585fe6]'
            }`}
          >
            {submitting ? (
              'Processing...'
            ) : mode === 'forgot' ? (
              'Send Reset Link'
            ) : mode === 'signup' ? (
              'Create My Account'
            ) : (
              'Sign In'
            )}
            <ArrowRight className="h-4 w-4" />
          </button>

          {mode !== 'forgot' && (
            <div className="pt-2 space-y-2.5">
              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#171717]/20 dark:border-white/10" />
                </div>
                <span className="relative bg-[#fffaf0] px-3 font-mono text-[10px] font-black uppercase text-[#171717]/60 dark:bg-[#15171c] dark:text-[#a1a1aa]">
                  Or Continue With
                </span>
              </div>

              {/* GitHub OAuth Button */}
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  setError('')
                  setSuccess('')
                  const supabase = getSupabaseBrowserClient()
                  const { error: oErr } = await supabase.auth.signInWithOAuth({
                    provider: 'github',
                    options: {
                      redirectTo: `${window.location.origin}/auth/callback`,
                    },
                  })
                  if (oErr) {
                    setError(oErr.message || 'GitHub sign-in is not enabled in Supabase yet.')
                    setSubmitting(false)
                  }
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-[#171717] bg-[#24292e] py-3 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171717] transition hover:bg-[#1b1f23] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 dark:border-[#2e323b] dark:bg-[#161b22] dark:shadow-[2px_2px_0_#000000]"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                Continue with GitHub
              </button>

              {/* Google OAuth Button */}
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  setError('')
                  setSuccess('')
                  const supabase = getSupabaseBrowserClient()
                  const { error: oErr } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: `${window.location.origin}/auth/callback` },
                  })
                  if (oErr) {
                    setError(oErr.message || 'Google sign-in is not configured yet in Supabase Auth.')
                    setSubmitting(false)
                  }
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-[#171717] bg-white py-3 text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-neutral-50 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]"
              >
                <span className="font-black text-[#4285f4]">G</span> Continue with Google
              </button>

              {/* Demo Account Button */}
              <button
                type="button"
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true)
                  setError('')
                  setSuccess('')
                  const supabase = getSupabaseBrowserClient()
                  const { data, error: anonErr } = await supabase.auth.signInAnonymously({
                    options: { data: { display_name: `Demo Player ${Math.floor(Math.random() * 9000) + 1000}` } },
                  })
                  if (!anonErr && data.session) {
                    setSuccess('Signed in with Instant Demo Player!')
                    setTimeout(() => setTab('codemates'), 600)
                  } else {
                    setError('Demo anonymous sign in disabled in Supabase. You can sign in with your email/password or GitHub above.')
                  }
                  setSubmitting(false)
                }}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#171717] bg-[#ffd84d] py-3 text-xs font-black uppercase text-[#171717] shadow-sm transition hover:bg-[#ffe37e] dark:border-[#2e323b]"
              >
                <Zap className="h-4 w-4 fill-current" /> Use Instant Demo Account
              </button>
            </div>
          )}
        </form>

        {/* Back Link */}
        {mode === 'forgot' && (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setError('')
                setSuccess('')
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-black uppercase text-[#171717] opacity-80 underline hover:opacity-100 dark:text-[#d4d4d8]"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Return to Sign In
            </button>
          </div>
        )}

        {/* Footer Navigation Back */}
        <div className="mt-6 border-t-2 border-[#171717]/15 pt-4 text-center dark:border-[#2e323b]">
          <button
            onClick={() => setTab('home')}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-black uppercase text-[#171717]/70 underline hover:text-[#171717] dark:text-[#a1a1aa] dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Landing Page
          </button>
        </div>
      </div>
    </div>
  )
}
