'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Check,
  ChevronRight,
  Zap,
  ShieldAlert,
  ShieldCheck,
  LockKeyhole,
  AlertOctagon,
  XCircle,
} from 'lucide-react'
import { IntakeForm } from '@/components/views/IntakeForm'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { useNavigation } from '@/lib/navigation'
import { EnvironmentShield, SecurityViolation } from '@/lib/proctoring/antiCheatEngine'

interface Question {
  id: string
  kind: 'mcq' | 'theory'
  prompt: string
  options?: string[]
  correct_index?: number | null
}

interface RoughProfile {
  summary: string
  headline: string
  strengths?: string[]
  gaps?: string[]
  evidence?: string[]
}

interface SkillTag {
  name: string
  confidence: string
  evidence: string[]
}

interface Enhanced {
  summary: string
  theory_elapsed_seconds: number | null
  mcq_elapsed_seconds: number | null
  mcq_seconds_allowed: number | null
  mcq_over_limit: boolean
  cloned: { name: string; path: string; loc: number }[]
  tags: string[]
  skills: SkillTag[]
  grade: {
    criteria: { criterion: string; score: number; evidence: string }[]
    total: number
    verdict: string
    mcq_correct: number
    mcq_total: number
  }
  rough: RoughProfile
}

interface SessionView {
  id: string
  status: string
  error: string | null
  extraction_source: string | null
  rough_profile: RoughProfile | null
  questions: Question[]
  served_at: string | null
  enhanced: Enhanced | null
}

const POLL_MS = 2000
// Seconds allowed per multiple-choice question. Theory questions are unlimited.
const MCQ_SECONDS = 120


function normalizeSession(data: any): SessionView | null {
  if (!data) return null
  const questions: Question[] = Array.isArray(data.questions)
    ? data.questions
    : Array.isArray(data.question_set?.questions)
    ? data.question_set.questions
    : []
  return {
    ...data,
    questions,
  }
}

/** Formats inline backticks (e.g. `nprobe`, `use client`) with styled monospace tags */
function renderFormattedPrompt(text: string) {
  if (!text) return null
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <code
              key={index}
              className="mx-0.5 rounded-md border border-[#171717]/20 bg-[#171717]/5 px-1.5 py-0.5 font-mono text-[0.88em] font-semibold text-[#171717] dark:border-[#2e323b] dark:bg-white/10 dark:text-[#ffd84d]"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </>
  )
}

export function AssessmentContent() {
  const { signInWithGithub } = useAuth()
  const { lockAssessment, unlockAssessment } = useNavigation()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [saved, setSaved] = useState<Enhanced | null>(null)
  const [session, setSession] = useState<SessionView | null>(null)

  // Hardened Environment Shield & Proctoring State
  const [isTerminated, setIsTerminated] = useState(false)
  const [terminationReason, setTerminationReason] = useState('')
  const isTerminatedRef = useRef(false)
  const [tabViolations, setTabViolations] = useState(0)
  const [showTabWarning, setShowTabWarning] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [securityViolations, setSecurityViolations] = useState<SecurityViolation[]>([])
  const [violationToast, setViolationToast] = useState<string | null>(null)

  useEffect(() => {
    isTerminatedRef.current = isTerminated
  }, [isTerminated])

  // Invalidate Assessment immediately upon critical integrity breach
  const invalidateAssessment = useCallback((reason: string) => {
    if (isTerminatedRef.current) return
    isTerminatedRef.current = true
    setIsTerminated(true)
    setIsPaused(true)
    setShowTabWarning(false)
    setTerminationReason(reason)
    unlockAssessment()

    setSecurityViolations((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        type: 'HARDWARE_ANOMALY',
        detail: `CRITICAL INTEGRITY VIOLATION: ${reason}`,
        severity: 'CRITICAL',
      },
      ...prev.slice(0, 19),
    ])
  }, [unlockAssessment])

  // Per-question countdown for MCQs only. Theory questions are unlimited.
  const [timeLeft, setTimeLeft] = useState<Record<string, number>>({})
  const [expired, setExpired] = useState<Record<string, boolean>>({})
  const [intakeDone, setIntakeDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, { index?: number; text?: string }>>({})

  // Active question focus index and staggered entrance animation state
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [questionsRevealed, setQuestionsRevealed] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const questionRefs = useRef<(HTMLDivElement | null)[]>([])
  const isAutoScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }: any) => setSignedIn(!!data.session?.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_e: any, s: any) =>
      setSignedIn(!!s?.user),
    )
    return () => listener.subscription.unsubscribe()
  }, [])

  // Returning candidate: load the durable profile.
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/profile')
        if (res.status === 204) return
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setSaved(data)
        }
      } catch {
        /* no saved profile or backend unreachable: fall back to start view */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  // Start the clock when backend questions arrive: MCQs get MCQ_SECONDS each.
  useEffect(() => {
    if (!session?.questions?.length) return
    const mcqs = session.questions.filter((q) => q.kind === 'mcq')
    setTimeLeft((prev) => {
      const next = { ...prev }
      let changed = false
      for (const q of mcqs) {
        if (next[q.id] === undefined) {
          next[q.id] = MCQ_SECONDS
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [session?.questions])

  // Tick down; lock a question when its time runs out. Pauses during alerts or termination.
  useEffect(() => {
    const ids = Object.keys(timeLeft)
    if (!ids.length || isPaused || isTerminated) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        const next = { ...prev }
        for (const id of ids) {
          if (expired[id]) continue
          next[id] = Math.max(0, (prev[id] ?? 0) - 1)
          if (next[id] === 0) setExpired((e) => ({ ...e, [id]: true }))
        }
        return next
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [Object.keys(timeLeft).join(','), expired, isPaused, isTerminated])

  // 1. Activate Hardened Environment Shield (DevTools, shortcut traps, split-screen)
  useEffect(() => {
    if (session?.status !== 'awaiting' || !session.questions?.length || isTerminated) return

    const shield = new EnvironmentShield((violation) => {
      setSecurityViolations((prev) => [violation, ...prev.slice(0, 19)])
      setViolationToast(`${violation.type}: ${violation.detail}`)
      setTimeout(() => setViolationToast(null), 4500)
    })

    const cleanup = shield.activateShield()
    return () => cleanup()
  }, [session?.status, session?.questions?.length, isTerminated])

  // 2. Global Assessment Navigation Lockdown
  useEffect(() => {
    if (session?.status === 'awaiting' && (session.questions?.length ?? 0) > 0 && !isTerminated) {
      lockAssessment((reason) => {
        invalidateAssessment(reason || 'Navigation violation detected during active examination.')
      })
      return () => {
        unlockAssessment()
      }
    }
  }, [session?.status, session?.questions?.length, isTerminated, lockAssessment, unlockAssessment, invalidateAssessment])

  // 3. Tab switching & window blur detection listener
  useEffect(() => {
    if (session?.status !== 'awaiting' || !session.questions?.length || isTerminated) return

    let lastEventTime = 0

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now()
        if (now - lastEventTime < 1500) return
        lastEventTime = now

        setSecurityViolations((prev) => [
          {
            timestamp: new Date().toLocaleTimeString(),
            type: 'TAB_SWITCH',
            detail: 'Navigated away or switched tab during proctored evaluation.',
            severity: 'CRITICAL',
          },
          ...prev.slice(0, 19),
        ])

        setTabViolations((prev) => {
          const nextCount = prev + 1
          if (nextCount === 1) {
            setIsPaused(true)
            setShowTabWarning(true)
          } else if (nextCount >= 2) {
            invalidateAssessment('Multiple tab switches detected during active examination session.')
          }
          return nextCount
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [session?.status, session?.questions?.length, isTerminated, invalidateAssessment])

  // 4. Clipboard protection: block copy, cut, and paste
  useEffect(() => {
    if (session?.status !== 'awaiting' || !session.questions?.length || isTerminated) return

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const violation: SecurityViolation = {
        timestamp: new Date().toLocaleTimeString(),
        type: 'PASTE_BLOCKED',
        detail: 'External clipboard paste was blocked by Environment Shield.',
        severity: 'HIGH',
      }
      setSecurityViolations((prev) => [violation, ...prev.slice(0, 19)])
      setViolationToast('Clipboard Action Blocked: External pasting is prohibited.')
      setTimeout(() => setViolationToast(null), 4500)
    }

    const handleCopyCut = (e: ClipboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const violation: SecurityViolation = {
        timestamp: new Date().toLocaleTimeString(),
        type: 'DEVTOOLS_SHORTCUT',
        detail: 'Clipboard copy/cut was blocked by Environment Shield.',
        severity: 'WARNING',
      }
      setSecurityViolations((prev) => [violation, ...prev.slice(0, 19)])
      setViolationToast('Clipboard Action Blocked: Copying question content is prohibited.')
      setTimeout(() => setViolationToast(null), 4500)
    }

    document.addEventListener('paste', handlePaste, true)
    document.addEventListener('copy', handleCopyCut, true)
    document.addEventListener('cut', handleCopyCut, true)

    return () => {
      document.removeEventListener('paste', handlePaste, true)
      document.removeEventListener('copy', handleCopyCut, true)
      document.removeEventListener('cut', handleCopyCut, true)
    }
  }, [session?.status, session?.questions?.length, isTerminated])

  // Stagger questions entrance when backend questions arrive
  useEffect(() => {
    if (session?.status === 'awaiting' && session.questions && session.questions.length > 0) {
      setActiveIndex(0)
      const t = setTimeout(() => {
        setQuestionsRevealed(true)
      }, 100)
      return () => clearTimeout(t)
    } else {
      setQuestionsRevealed(false)
    }
  }, [session?.status, session?.questions?.length])

  // Center-based scroll tracking: smoothly highlights whichever question card is centered in viewport
  useEffect(() => {
    if (!session?.questions?.length || !questionsRevealed) return

    const handleScroll = () => {
      if (isAutoScrollingRef.current) return

      const viewportHeight = window.innerHeight
      const viewportCenter = viewportHeight / 2

      let closestIndex = activeIndex
      let smallestDistance = Infinity

      questionRefs.current.forEach((el, idx) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const cardCenter = rect.top + rect.height / 2
        const distance = Math.abs(cardCenter - viewportCenter)

        // Only consider cards in comfortable viewing bounds
        if (rect.bottom > 100 && rect.top < viewportHeight - 100) {
          if (distance < smallestDistance) {
            smallestDistance = distance
            closestIndex = idx
          }
        }
      })

      if (closestIndex !== activeIndex && smallestDistance < viewportHeight * 0.42) {
        setActiveIndex(closestIndex)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [session?.questions?.length, questionsRevealed, activeIndex])

  const poll = useCallback(
    (id: string) => {
      stopPolling()
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/onboarding?id=${encodeURIComponent(id)}`)
          const data = await res.json()
          setSession(normalizeSession(data))
          if (data.status === 'awaiting' || data.status === 'complete' || data.status === 'failed') {
            stopPolling()
          }
        } catch {
          /* transient; keep polling */
        }
      }, POLL_MS)
    },
    [stopPolling],
  )

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Could not start onboarding.')
        if (data.missing) setError(`${data.message} Missing: ${data.missing.join(', ')}.`)
        return
      }
      setSession(normalizeSession(data))
      poll(data.id)
    } catch {
      setError('Could not reach the onboarding API.')
    } finally {
      setBusy(false)
    }
  }

  // Adopt session from auto-onboarding or previous in-flight visit
  useEffect(() => {
    if (!signedIn || session) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/auto', { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.sessionId) return

        const resumable =
          data.status === 'new' || ['pending', 'awaiting'].includes(data.sessionStatus)
        if (!resumable) return

        if (data.session) setSession(normalizeSession(data.session))
        poll(data.sessionId)
      } catch {
        // Fall back to manual start view.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn, session, poll])

  const submitIntake = async (intakeAnswers: Record<string, string>) => {
    setIntakeDone(true)
    if (!session) return
    try {
      await fetch('/api/onboarding/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, answers: intakeAnswers }),
      })
    } catch {
      /* intake is context, never a gate */
    }
  }

  const submit = async () => {
    if (!session || isTerminated) return
    setBusy(true)
    setError('')
    unlockAssessment()

    try {
      const payload = Object.entries(answers).map(([question_id, v]) => ({
        question_id,
        selected_index: v.index,
        text: v.text ?? '',
      }))
      const res = await fetch('/api/onboarding/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, answers: payload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message ?? data.error ?? 'Could not submit answers.')
        return
      }
      setSession(normalizeSession(data))
    } catch {
      setError('Could not reach the onboarding API.')
    } finally {
      setBusy(false)
    }
  }

  // Smooth scroll and focus transition helper
  const advanceToQuestion = useCallback(
    (nextIndex: number) => {
      if (!session?.questions?.length) return
      const clampedIndex = Math.max(0, Math.min(nextIndex, session.questions.length - 1))
      setActiveIndex(clampedIndex)

      isAutoScrollingRef.current = true
      const targetEl = questionRefs.current[clampedIndex]
      if (targetEl) {
        targetEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isAutoScrollingRef.current = false
      }, 750)
    },
    [session?.questions?.length],
  )

  // Handle MCQ selection: records answer, visually updates, and smoothly advances to next question
  const handleSelectMcq = (questionId: string, optionIndex: number, questionIndex: number) => {
    if (expired[questionId]) return

    setAnswers((prev) => ({
      ...prev,
      [questionId]: { index: optionIndex },
    }))

    // Auto-advance to next question if one exists with a smooth natural pause
    if (session?.questions && questionIndex < session.questions.length - 1) {
      setTimeout(() => {
        advanceToQuestion(questionIndex + 1)
      }, 350)
    }
  }

  const totalQuestions = session?.questions?.length ?? 0
  const attemptedCount = session?.questions
    ? session.questions.filter(
        (q) =>
          answers[q.id]?.index !== undefined ||
          (answers[q.id]?.text && answers[q.id].text!.trim().length > 0),
      ).length
    : 0

  if (signedIn === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#ffd84d]" />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl border-3 border-[#171717] bg-white p-8 sm:p-12 shadow-[8px_8px_0_#171717] dark:border-[#2e323b] dark:bg-[#14161d] dark:shadow-[8px_8px_0_#000000]">
          <div className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-[#ffd84d]/20 blur-2xl" />
          <div className="flex items-center gap-2">
            <span className="rounded-xl border-2 border-[#171717] bg-[#ffd84d] px-3 py-1 font-mono text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] dark:border-[#000000]">
              Candidate Verification
            </span>
          </div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
            Candidate Assessment
          </h2>
          <p className="mt-3 max-w-2xl text-base sm:text-lg leading-relaxed text-[#171717]/70 dark:text-[#f4f4f7]/70">
            Sign in with GitHub and Google to generate your custom engineering profile. Our backend analyzes your repositories and serves bespoke multiple-choice and architecture theory questions.
          </p>

          <div className="mt-8">
            <button
              onClick={() => signInWithGithub()}
              className="btn-neo btn-neo-lemon flex items-center gap-2 text-sm sm:text-base font-black px-6 py-3"
            >
              <Zap className="h-4 w-4" /> Sign In with GitHub to Begin
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* 01: Top Banner / Candidate Assessment Card */}
      <section className="relative overflow-hidden rounded-2xl border-3 border-[#171717] bg-white p-6 sm:p-8 shadow-[6px_6px_0_#171717] transition-all dark:border-[#2e323b] dark:bg-[#14161d] dark:shadow-[6px_6px_0_#000000]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="rounded-xl border-2 border-[#171717] bg-[#ffd84d] px-3 py-1 font-mono text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] dark:border-[#000000]">
                Candidate Assessment
              </span>
              {session?.extraction_source && (
                <span className="rounded-xl border-2 border-[#171717] bg-[#39d5c8] px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                  {session.extraction_source}
                </span>
              )}
              {session?.status === 'awaiting' && !isTerminated && (
                <span className="flex items-center gap-1.5 rounded-xl border-2 border-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-emerald-700 dark:border-emerald-400 dark:text-emerald-400 shadow-[1px_1px_0_#059669]">
                  <ShieldCheck className="h-3.5 w-3.5 animate-pulse" />
                  <span>CF Shield Active</span>
                </span>
              )}
            </div>
            <h1 className="mt-3 font-display text-3xl sm:text-4xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              Technical Skills Evaluation
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm sm:text-base leading-relaxed text-[#171717]/70 dark:text-[#f4f4f7]/70">
              We read your public GitHub activity, synthesize a rough engineering profile, then ask three multiple-choice questions and one short written question.
            </p>
          </div>

          {session && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl border-2 border-[#171717] bg-[#171717]/5 px-3.5 py-2 font-mono text-xs font-black uppercase dark:border-[#2e323b] dark:bg-white/5">
              {session.status === 'pending' || session.status === 'extracting' ? (
                <span className="flex items-center gap-2 text-[#171717] dark:text-[#f4f4f7]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#6d73ff]" />
                  Analysing GitHub
                </span>
              ) : session.status === 'awaiting' ? (
                <span className="flex items-center gap-2 text-[#39d5c8]">
                  <CheckCircle2 className="h-4 w-4 text-[#39d5c8]" />
                  Questions Ready
                </span>
              ) : session.status === 'complete' ? (
                <span className="flex items-center gap-2 text-[#6ee56b]">
                  <CheckCircle2 className="h-4 w-4 text-[#6ee56b]" />
                  Complete
                </span>
              ) : null}
            </div>
          )}
        </div>

        {/* Saved profile prompt if present and not currently in active session */}
        {!session && saved && (
          <div className="mt-6 rounded-xl border-2 border-[#39d5c8] bg-[#39d5c8]/10 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#f4f4f7]/60">
                Saved Profile Detected
              </p>
              <span className="rounded-full bg-[#39d5c8] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717]">
                Durable
              </span>
            </div>
            <p className="mt-2 font-display text-xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              {saved.rough.headline}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#171717]/80 dark:text-[#f4f4f7]/80">
              {saved.summary}
            </p>
          </div>
        )}

        {/* Start Button */}
        {!session && (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              onClick={start}
              disabled={busy}
              className="btn-neo btn-neo-lemon flex items-center gap-2.5 px-6 py-2.5 text-xs font-black uppercase shadow-[3px_3px_0_#171717] dark:shadow-[3px_3px_0_#000000]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              {saved ? 'Start New Assessment' : 'Start Assessment'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border-2 border-rose-500 bg-rose-500/10 p-3 text-xs font-bold text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {session?.error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border-2 border-rose-500 bg-rose-500/10 p-3 text-xs font-bold text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Backend: {session.error}</span>
          </div>
        )}
      </section>

      {/* Intake form during background pipeline extraction */}
      {session && (session.status === 'pending' || session.status === 'extracting') && !intakeDone && (
        <IntakeForm onSubmit={submitIntake} />
      )}

      {/* 02: Rough Profile Card from backend */}
      {session?.rough_profile && (
        <section className="rounded-2xl border-3 border-[#171717] bg-white p-6 sm:p-8 shadow-[6px_6px_0_#171717] dark:border-[#2e323b] dark:bg-[#14161d] dark:shadow-[6px_6px_0_#000000]">
          <div className="flex items-center gap-2">
            <span className="rounded-xl border-2 border-[#171717] bg-[#39d5c8] px-3 py-1 font-mono text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] dark:border-[#000000]">
              Rough Profile
            </span>
          </div>
          <h2 className="mt-4 font-display text-2xl sm:text-3xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
            {session.rough_profile.headline}
          </h2>
          <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-[#171717]/80 dark:text-[#f4f4f7]/80">
            {session.rough_profile.summary}
          </p>

          {session.rough_profile.strengths && session.rough_profile.strengths.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {session.rough_profile.strengths.map((str, idx) => (
                <span
                  key={idx}
                  className="rounded-lg border-2 border-[#171717] bg-[#ffd84d]/20 px-2.5 py-1 font-mono text-[11px] font-bold text-[#171717] dark:border-[#2e323b] dark:text-[#ffd84d]"
                >
                  ✓ {str}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 02.5: Disqualification Section if Integrity Terminated */}
      {isTerminated && (
        <section className="relative overflow-hidden rounded-2xl border-4 border-[#171717] bg-rose-50 p-6 sm:p-8 text-[#171717] shadow-[6px_6px_0_#171717] dark:border-[#000000] dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 border-[#171717] bg-rose-600 text-white shadow-[2px_2px_0_#171717]">
              <AlertOctagon className="h-8 w-8" />
            </div>
            <div>
              <span className="rounded bg-rose-600 px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-white">
                ASSESSMENT TERMINATED · DISQUALIFIED
              </span>
              <h2 className="mt-1 font-display text-2xl sm:text-3xl uppercase tracking-tight text-rose-700 dark:text-rose-400">
                Integrity Violation Detected
              </h2>
            </div>
          </div>

          <div className="mt-5 rounded-xl border-2 border-[#171717] bg-white p-4 text-xs font-bold leading-relaxed text-[#171717] shadow-[2px_2px_0_#171717] dark:bg-[#15171c] dark:border-[#2e323b] dark:text-[#f4f4f7]">
            <p>{terminationReason}</p>
            <p className="mt-2 text-rose-600 dark:text-rose-400 font-black">
              This assessment was automatically terminated and disqualified by the proctoring environment shield. All examination telemetry and recorded security violations have been captured for the auditing team.
            </p>
          </div>

          {securityViolations.length > 0 && (
            <div className="mt-5 space-y-2 font-mono text-xs">
              <h4 className="font-black uppercase text-[11px] text-rose-800 dark:text-rose-300">
                Security Violation Trail ({securityViolations.length} Events):
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {securityViolations.map((v, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-white/70 p-2 border border-rose-200 text-[11px] text-rose-900 dark:bg-black/40 dark:border-rose-900/50 dark:text-rose-200">
                    <span className="truncate mr-2">[{v.type}] {v.detail}</span>
                    <span className="opacity-70 shrink-0">{v.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 03: Questions Section with Dynamic Visual Focus, Sizing, Lighting & Staggered Entrance */}
      {session?.status === 'awaiting' && session.questions && session.questions.length > 0 && !isTerminated && (
        <div className="space-y-6">
          {/* Violation Toast Notification */}
          {violationToast && (
            <div className="flex items-center justify-between rounded-xl border-2 border-rose-600 bg-rose-500/15 p-3 text-xs font-black text-rose-600 dark:text-rose-400 animate-pulse shadow-[2px_2px_0_#e11d48]">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{violationToast}</span>
              </span>
              <button
                onClick={() => setViolationToast(null)}
                className="cursor-pointer text-[10px] uppercase underline hover:text-rose-700 ml-3"
              >
                Dismiss
              </button>
            </div>
          )}
          {/* Sticky Progress & Navigator Bar */}
          <div className="sticky top-16 z-30 rounded-2xl border-3 border-[#171717] bg-[#fffaf0]/95 p-3.5 sm:p-4 backdrop-blur-md shadow-[4px_4px_0_#171717] transition-all dark:border-[#2e323b] dark:bg-[#0c0d11]/95 dark:shadow-[4px_4px_0_#000000]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm sm:text-base uppercase tracking-wider text-[#171717] dark:text-[#f4f4f7] mr-1">
                  Questions
                </span>
                {session.questions.map((q, idx) => {
                  const isAct = idx === activeIndex
                  const isDone =
                    answers[q.id]?.index !== undefined ||
                    (answers[q.id]?.text && answers[q.id].text!.trim().length > 0)

                  return (
                    <button
                      key={q.id}
                      onClick={() => advanceToQuestion(idx)}
                      className={`flex h-8 sm:h-9 items-center gap-1.5 px-3 rounded-xl border-2 font-mono text-xs font-black transition-all cursor-pointer ${
                        isAct
                          ? 'border-[#171717] bg-[#ffd84d] text-[#171717] shadow-[2px_2px_0_#171717] scale-105 dark:border-white'
                          : isDone
                          ? 'border-[#39d5c8] bg-[#39d5c8]/20 text-[#171717] dark:text-[#39d5c8] hover:bg-[#39d5c8]/30'
                          : 'border-[#171717]/20 bg-white/50 text-[#171717]/60 hover:border-[#171717]/50 dark:border-[#2e323b] dark:bg-white/5 dark:text-[#f4f4f7]/60'
                      }`}
                      title={`Go to Question ${idx + 1}`}
                    >
                      {isDone ? (
                        <Check className="h-3 w-3 stroke-[3] text-emerald-600 dark:text-emerald-400" />
                      ) : null}
                      <span>Q{idx + 1}</span>
                      {isAct && (
                        <span className="hidden sm:inline-block h-1.5 w-1.5 rounded-full bg-[#171717] animate-pulse" />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Progress Count & Visual Bar */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-emerald-700 dark:border-emerald-400 dark:text-emerald-400 shadow-[1px_1px_0_#059669]">
                  <ShieldCheck className="h-3 w-3 animate-pulse" />
                  <span>Shield Active</span>
                </div>
                <span className="font-mono text-xs font-black text-[#171717]/70 dark:text-[#f4f4f7]/70">
                  {attemptedCount} / {totalQuestions} Done
                </span>
                <div className="h-2.5 w-20 sm:w-28 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden border border-[#171717]/20 dark:border-[#2e323b]">
                  <div
                    className="h-full bg-[#39d5c8] transition-all duration-500 ease-out"
                    style={{
                      width: `${totalQuestions > 0 ? (attemptedCount / totalQuestions) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Staggered Question Cards Container */}
          <div className="space-y-10 sm:space-y-12 md:space-y-14">
            {session.questions.map((q, i) => {
              const isActive = i === activeIndex
              const isAttempted =
                answers[q.id]?.index !== undefined ||
                (answers[q.id]?.text && answers[q.id].text!.trim().length > 0)
              const remainingTime = timeLeft[q.id] ?? MCQ_SECONDS
              const isUrgent = remainingTime <= 20 && !expired[q.id]
              const optionsList = q.options || []

              return (
                <div
                  key={q.id}
                  ref={(el) => {
                    questionRefs.current[i] = el
                  }}
                  data-question-index={i}
                  onClick={() => {
                    if (!isActive) {
                      advanceToQuestion(i)
                    }
                  }}
                  style={{
                    transitionDelay: questionsRevealed ? `${i * 130}ms` : '0ms',
                  }}
                  className={`group relative rounded-2xl p-6 sm:p-8 md:p-10 transition-all duration-500 ease-out ${
                    // Staggered reveal animation
                    questionsRevealed
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-8 pointer-events-none'
                  } ${
                    // Dynamic Visual Focus: Dynamic Sizing & Lighting
                    isActive
                      ? 'z-10 scale-[1.01] sm:scale-[1.018] border-3 border-[#171717] bg-white shadow-[8px_8px_0_#ffd84d] sm:shadow-[10px_10px_0_#ffd84d] ring-4 ring-[#ffd84d]/25 dark:border-[#ffd84d] dark:bg-gradient-to-b dark:from-[#1b1e27] dark:to-[#14161d] dark:shadow-[0_0_35px_rgba(255,216,77,0.18),_6px_6px_0_#000000] dark:ring-4 dark:ring-[#ffd84d]/20'
                      : 'z-0 scale-[0.985] border-2 border-[#171717]/25 bg-white/75 opacity-60 shadow-[3px_3px_0_rgba(23,23,23,0.12)] hover:opacity-90 hover:scale-[0.995] hover:border-[#171717]/50 dark:border-[#2e323b]/60 dark:bg-[#14161d]/60 dark:opacity-55 dark:hover:opacity-85 dark:hover:border-[#2e323b] dark:shadow-[2px_2px_0_#000000] cursor-pointer'
                  }`}
                >
                  {/* Top Lighting Accent Line for Focused Question */}
                  <div
                    className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-xl transition-all duration-500 ${
                      isActive ? 'bg-[#ffd84d]' : 'bg-transparent'
                    }`}
                  />

                  {/* Header Row: Question Number, Kind, Focus Badge, Timer */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b-2 border-[#171717]/10 dark:border-[#2e323b]">
                    <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                      <span
                        className={`flex h-8 px-3 items-center justify-center rounded-xl border-2 font-mono text-xs font-black transition-all ${
                          isActive
                            ? 'border-[#171717] bg-[#ffd84d] text-[#171717] shadow-[2px_2px_0_#171717] dark:border-[#000000]'
                            : 'border-[#171717]/30 bg-neutral-100 text-[#171717]/80 dark:border-[#2e323b] dark:bg-neutral-800 dark:text-neutral-300'
                        }`}
                      >
                        QUESTION {i + 1} OF {session.questions.length}
                      </span>

                      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#171717]/50 dark:text-[#f4f4f7]/50">
                        {q.kind === 'mcq' ? 'Multiple Choice' : 'Short Written Theory'}
                      </span>

                      {isActive && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffd84d]/20 border border-[#ffd84d] px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717] dark:text-[#ffd84d]">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ffd84d] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ffd84d]"></span>
                          </span>
                          Current Focus
                        </span>
                      )}

                      {isAttempted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#39d5c8]/20 border border-[#39d5c8] px-2.5 py-0.5 font-mono text-[10px] font-black uppercase text-[#171717] dark:text-[#39d5c8]">
                          <Check className="h-3 w-3 stroke-[3]" /> Attempted
                        </span>
                      )}
                    </div>

                    {/* Timer Badge (MCQs only) */}
                    {q.kind === 'mcq' && (
                      <div
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border-2 font-mono text-xs font-black uppercase transition-all ${
                          expired[q.id]
                            ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : isUrgent
                            ? 'border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400 animate-pulse'
                            : isActive
                            ? 'border-[#171717] bg-[#ffd84d]/20 text-[#171717] dark:border-[#ffd84d] dark:text-[#ffd84d]'
                            : 'border-[#171717]/20 bg-neutral-100 text-[#171717]/60 dark:border-[#2e323b] dark:bg-neutral-800 dark:text-[#f4f4f7]/60'
                        }`}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        <span>{expired[q.id] ? 'Time Expired' : `${remainingTime}s left`}</span>
                      </div>
                    )}
                  </div>

                  {/* Question Prompt with Ample Breathing Room */}
                  <div className="py-5">
                    <p className="text-base sm:text-lg md:text-xl font-bold leading-relaxed text-[#171717] dark:text-[#f4f4f7]">
                      {renderFormattedPrompt(q.prompt)}
                    </p>
                  </div>

                  {/* Question Options / Input */}
                  {q.kind === 'mcq' ? (
                    <div className="space-y-3 sm:space-y-3.5">
                      {optionsList.map((opt, oi) => {
                        const isSelected = answers[q.id]?.index === oi
                        const optionLetter = String.fromCharCode(65 + oi)
                        const isExp = expired[q.id]

                        return (
                          <div
                            key={oi}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSelectMcq(q.id, oi, i)
                            }}
                            className={`group/opt flex items-center justify-between gap-4 p-4 sm:p-4.5 rounded-xl border-2 transition-all duration-200 select-none ${
                              isExp ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:translate-x-1.5'
                            } ${
                              isSelected
                                ? 'border-[#6d73ff] bg-[#6d73ff]/15 shadow-[3px_3px_0_#6d73ff] text-[#171717] dark:text-white dark:bg-[#6d73ff]/25 font-semibold'
                                : 'border-[#171717]/20 bg-white dark:bg-[#15171c] hover:border-[#6d73ff]/70 hover:bg-[#6d73ff]/5 dark:border-[#2e323b] dark:hover:border-[#6d73ff]/70 text-[#171717]/90 dark:text-[#f4f4f7]/90'
                            }`}
                          >
                            <div className="flex items-center gap-3.5 flex-1 min-w-0">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 font-mono text-xs font-black transition-colors ${
                                  isSelected
                                    ? 'border-[#6d73ff] bg-[#6d73ff] text-white shadow-[1px_1px_0_#171717]'
                                    : 'border-[#171717]/30 bg-[#171717]/5 text-[#171717]/70 group-hover/opt:border-[#6d73ff] group-hover/opt:text-[#6d73ff] dark:border-[#2e323b] dark:bg-white/5 dark:text-[#f4f4f7]/70'
                                }`}
                              >
                                {optionLetter}
                              </span>
                              <span className="text-sm sm:text-base leading-snug break-words">
                                {renderFormattedPrompt(opt)}
                              </span>
                            </div>

                            <div
                              className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-[#6d73ff] bg-[#6d73ff] text-white scale-110'
                                  : 'border-[#171717]/30 dark:border-[#2e323b]'
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={answers[q.id]?.text ?? ''}
                        onChange={(e) =>
                          setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))
                        }
                        onClick={(e) => e.stopPropagation()}
                        rows={5}
                        placeholder="Write your technical explanation or design reasoning here... A few clear sentences is plenty."
                        className="w-full rounded-xl border-2 border-[#171717]/25 bg-white p-4 text-sm sm:text-base outline-none transition focus:border-[#6d73ff] focus:ring-3 focus:ring-[#6d73ff]/20 dark:border-[#2e323b] dark:bg-[#0f1116] dark:text-[#f4f4f7]"
                      />
                      <div className="flex items-center justify-between text-xs text-[#171717]/50 dark:text-[#f4f4f7]/50 font-mono">
                        <span>{answers[q.id]?.text?.trim().length || 0} characters entered</span>
                        {i < session.questions.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              advanceToQuestion(i + 1)
                            }}
                            className="text-xs font-bold text-[#6d73ff] hover:underline"
                          >
                            Proceed to next question &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Focused Question Footer Helper / Next Question Navigator */}
                  {isActive && i < session.questions.length - 1 && (
                    <div className="mt-6 pt-4 border-t border-[#171717]/10 dark:border-[#2e323b] flex items-center justify-between">
                      <p className="text-xs font-mono text-[#171717]/50 dark:text-[#f4f4f7]/50">
                        {isAttempted ? 'Answer registered.' : 'Select an option to advance.'}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          advanceToQuestion(i + 1)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-[#171717]/20 px-3 py-1 font-mono text-xs font-black uppercase text-[#171717] hover:bg-[#171717]/5 dark:border-[#2e323b] dark:text-[#f4f4f7] dark:hover:bg-white/5 transition"
                      >
                        <span>Next Question</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 04: Submission Card */}
          <div className="mt-12 rounded-2xl border-3 border-[#171717] bg-white p-6 sm:p-8 shadow-[6px_6px_0_#171717] dark:border-[#2e323b] dark:bg-[#14161d] dark:shadow-[6px_6px_0_#000000] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h3 className="font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
                Ready to Complete Assessment?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-[#171717]/70 dark:text-[#f4f4f7]/70">
                {attemptedCount === totalQuestions
                  ? 'All questions have been answered. Submit now to generate your enhanced profile and grade breakdown.'
                  : `${totalQuestions - attemptedCount} of ${totalQuestions} questions remaining. You can submit now or review your answers.`}
              </p>
            </div>

            <button
              onClick={submit}
              disabled={busy}
              className="w-full sm:w-auto btn-neo btn-neo-lemon flex items-center justify-center gap-2.5 px-8 py-3 text-sm font-black uppercase shadow-hard hover:shadow-hard-lg disabled:opacity-50 shrink-0"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Evaluating Assessment...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Submit Answers</span>
                </>
              )}
            </button>
          </div>

          {/* Security Audit Log */}
          {securityViolations.length > 0 && (
            <div className="rounded-2xl border-2 border-[#171717]/20 bg-[#171717]/5 p-4 sm:p-5 dark:border-[#2e323b] dark:bg-[#14161d]">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-2 font-mono text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">
                  <ShieldAlert className="h-4 w-4 text-rose-500" />
                  Environment Shield Telemetry ({securityViolations.length} Events Logged)
                </span>
                <span className="font-mono text-[10px] text-[#171717]/60 dark:text-[#a1a1aa]">
                  Active Integrity Monitor
                </span>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 text-[11px] font-mono">
                {securityViolations.slice(0, 8).map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-white/80 p-2.5 border border-[#171717]/10 dark:bg-[#1c1f26] dark:border-[#2e323b]"
                  >
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black shrink-0 ${
                          v.severity === 'CRITICAL'
                            ? 'bg-rose-500 text-white'
                            : v.severity === 'HIGH'
                            ? 'bg-amber-500 text-white'
                            : 'bg-[#ffd84d] text-black'
                        }`}
                      >
                        {v.type}
                      </span>
                      <span className="text-[#171717]/80 dark:text-[#d4d4d8] truncate">{v.detail}</span>
                    </div>
                    <span className="text-[10px] text-[#171717]/50 dark:text-[#a1a1aa] shrink-0 ml-2">
                      {v.timestamp}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 05: Enhanced Profile Results Card */}
      {session?.enhanced && (
        <section className="relative overflow-hidden rounded-2xl border-3 border-[#171717] bg-white p-6 sm:p-8 md:p-10 shadow-[8px_8px_0_#171717] dark:border-[#2e323b] dark:bg-[#14161d] dark:shadow-[8px_8px_0_#000000]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="rounded-xl border-2 border-[#171717] bg-[#ffd84d] px-3 py-1 font-mono text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] dark:border-[#000000]">
              Enhanced Evaluation Profile
            </span>
            <span className="rounded-full bg-[#39d5c8] px-3 py-1 font-mono text-xs font-black uppercase text-[#171717]">
              {session.enhanced.grade.verdict || 'Evaluation Complete'}
            </span>
          </div>

          <h2 className="mt-4 font-display text-3xl sm:text-4xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
            {session.enhanced.rough.headline}
          </h2>
          <p className="mt-2 text-sm sm:text-base leading-relaxed text-[#171717]/80 dark:text-[#f4f4f7]/80">
            {session.enhanced.summary}
          </p>

          {/* Tags */}
          <div className="mt-5 flex flex-wrap gap-2">
            {session.enhanced.tags.map((t) => (
              <span
                key={t}
                className="rounded-lg border-2 border-[#171717] bg-[#39d5c8] px-2.5 py-1 font-mono text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Skills Breakdown */}
          {session.enhanced.skills.length > 0 && (
            <div className="mt-6">
              <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#171717]/50 dark:text-[#f4f4f7]/50 mb-3">
                Identified Competencies
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                {session.enhanced.skills.map((s) => (
                  <div
                    key={s.name}
                    className="rounded-xl border-2 border-[#171717]/20 bg-neutral-50/50 p-3.5 dark:border-[#2e323b] dark:bg-[#171922]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-[#171717] dark:text-[#f4f4f7]">
                        {s.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-black uppercase text-[#171717] ${
                          s.confidence === 'high' ? 'bg-[#39d5c8]' : 'bg-[#ffd84d]'
                        }`}
                      >
                        {s.confidence}
                      </span>
                    </div>
                    {s.evidence.length > 0 && (
                      <p className="mt-1.5 text-xs text-[#171717]/60 dark:text-[#f4f4f7]/60 leading-normal">
                        {s.evidence.join(' · ')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics DL */}
          <dl className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t-2 border-[#171717]/10 pt-6 dark:border-[#2e323b]">
            <div className="rounded-xl border-2 border-[#171717]/15 p-3.5 dark:border-[#2e323b]">
              <dt className="text-xs font-mono text-[#171717]/60 dark:text-[#f4f4f7]/60">MCQ Score</dt>
              <dd className="mt-1 font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">
                {session.enhanced.grade.mcq_correct} / {session.enhanced.grade.mcq_total}
              </dd>
            </div>
            <div className="rounded-xl border-2 border-[#171717]/15 p-3.5 dark:border-[#2e323b]">
              <dt className="text-xs font-mono text-[#171717]/60 dark:text-[#f4f4f7]/60">MCQ Time</dt>
              <dd className="mt-1 font-display text-2xl flex items-center gap-1.5 text-[#171717] dark:text-[#f4f4f7]">
                <Clock className="h-4 w-4" />
                {session.enhanced.mcq_elapsed_seconds ?? '—'}s
              </dd>
            </div>
            {session.enhanced.cloned.length > 0 && (
              <div className="rounded-xl border-2 border-[#171717]/15 p-3.5 dark:border-[#2e323b]">
                <dt className="text-xs font-mono text-[#171717]/60 dark:text-[#f4f4f7]/60">Analyzed Repos</dt>
                <dd className="mt-1 font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">
                  {session.enhanced.cloned.length}
                </dd>
              </div>
            )}
            <div className="rounded-xl border-2 border-[#171717]/15 p-3.5 dark:border-[#2e323b]">
              <dt className="text-xs font-mono text-[#171717]/60 dark:text-[#f4f4f7]/60">Overall Rating</dt>
              <dd className="mt-1 font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">
                {session.enhanced.grade.total} / 5
              </dd>
            </div>
          </dl>

          {/* Criteria details */}
          {session.enhanced.grade.criteria.length > 0 && (
            <div className="mt-6 border-t-2 border-[#171717]/10 pt-6 dark:border-[#2e323b]">
              <h4 className="font-mono text-xs font-black uppercase tracking-wider text-[#171717]/50 dark:text-[#f4f4f7]/50 mb-3">
                Scoring Breakdown
              </h4>
              <ul className="space-y-2">
                {session.enhanced.grade.criteria.map((c) => (
                  <li
                    key={c.criterion}
                    className="flex items-center justify-between rounded-lg border border-[#171717]/10 p-2.5 text-xs text-[#171717]/80 dark:border-[#2e323b] dark:text-[#f4f4f7]/80"
                  >
                    <span>{c.criterion}</span>
                    <span className="font-mono font-bold">{c.score} / 5</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Tab Switching Warning Modal */}
      {showTabWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border-4 border-[#171717] bg-[#ffd84d] p-6 text-[#171717] shadow-hard-lg dark:border-[#000000]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ff6b6b] text-white">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <div>
                <span className="rounded bg-[#171717] px-2 py-0.5 font-mono text-[10px] font-black uppercase text-white">
                  PROCTORING ALERT · 1 OF 1 WARNING
                </span>
                <h3 className="font-display text-2xl uppercase tracking-tight sm:text-3xl">
                  Tab Switch Detected!
                </h3>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-2 border-[#171717] bg-white p-4 text-xs font-bold leading-relaxed text-[#171717] shadow-[2px_2px_0_#171717]">
              <p>
                You navigated away from this proctored assessment window. Leaving the assessment, switching tabs, or minimizing the active window is strictly monitored.
              </p>
              <p className="mt-2 text-rose-700 font-black">
                ⚠️ THIS IS YOUR FIRST AND FINAL WARNING. If you switch tabs or leave this window again, your assessment session will be IMMEDIATELY TERMINATED with an automatic disqualification flag.
              </p>
            </div>

            <button
              onClick={() => {
                setShowTabWarning(false)
                setIsPaused(false)
              }}
              className="btn-neo btn-neo-ink mt-5 w-full py-3 text-xs uppercase cursor-pointer"
            >
              I Understand — Resume Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
