'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { IntakeForm } from '@/components/views/IntakeForm'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface Question {
  id: string
  kind: 'mcq' | 'theory'
  prompt: string
  options: string[]
  correct_index: number | null
}

interface RoughProfile {
  summary: string
  headline: string
  strengths: string[]
  gaps: string[]
  evidence: string[]
}

interface SkillTag {
  name: string
  confidence: string
  evidence: string[]
}

interface Enhanced {
  summary: string
  // Display only — theory questions are unlimited, so this carries no signal.
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

const POLL_MS = 2000
// Seconds allowed per multiple-choice question. Theory questions are unlimited.
const MCQ_SECONDS = 120

export function AssessmentContent() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [saved, setSaved] = useState<Enhanced | null>(null)
  const [session, setSession] = useState<SessionView | null>(null)
  // Per-question countdown for MCQs only. Theory questions are unlimited.
  const [timeLeft, setTimeLeft] = useState<Record<string, number>>({})
  const [expired, setExpired] = useState<Record<string, boolean>>({})
  const [intakeDone, setIntakeDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState<Record<string, { index?: number; text?: string }>>({})
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getSession().then(({ data }: any) => setSignedIn(!!data.session?.user))
    const { data: listener } = supabase.auth.onAuthStateChange((_e: any, s: any) =>
      setSignedIn(!!s?.user),
    )
    return () => listener.subscription.unsubscribe()
  }, [])

  // Returning candidate: load the durable profile. It outlives the extraction
  // cache TTL, so show it instead of silently asking them to start again.
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
        /* no saved profile or backend unreachable: fall back to the start view */
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

  // Start the clock when questions arrive: MCQs get MCQ_SECONDS each.
  useEffect(() => {
    const qList = session?.questions ?? []
    if (!qList.length) return
    const mcqs = qList.filter((q) => q.kind === 'mcq')
    setTimeLeft(Object.fromEntries(mcqs.map((q) => [q.id, MCQ_SECONDS])))
    setExpired({})
  }, [session?.id, session?.status, session?.questions])

  // Tick down; lock a question when its time runs out.
  useEffect(() => {
    const ids = Object.keys(timeLeft)
    if (!ids.length) return
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
  }, [Object.keys(timeLeft).join(','), expired])

  const poll = useCallback((id: string) => {
    stopPolling()
    const doFetch = async () => {
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
    }
    void doFetch()
    pollRef.current = setInterval(doFetch, POLL_MS)
  }, [stopPolling])

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

  // Adopt the session that auto-onboarding started on first sign-in, or one a
  // previous visit left in flight. Idempotent: the endpoint only starts a
  // pipeline for accounts that have never been registered, so mounting or
  // refreshing here can never duplicate a run.
  useEffect(() => {
    if (!signedIn || session) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/onboarding/auto', { method: 'POST' })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled || !data?.sessionId) return

        // Resume only work that is still open. A finished session is already
        // surfaced by the saved profile above; adopting it here would cover
        // that view with a stale run.
        const resumable =
          data.status === 'new' ||
          ['pending', 'awaiting'].includes(data.sessionStatus)
        if (!resumable) return

        if (data.session) setSession(normalizeSession(data.session))
        poll(data.sessionId)
      } catch {
        // Fall back to the manual start view.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [signedIn, session, poll])

  const submitIntake = async (answers: Record<string, string>) => {
    setIntakeDone(true)
    if (!session) return
    try {
      await fetch('/api/onboarding/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, answers }),
      })
    } catch {
      /* intake is context, never a gate — a failure must not block the flow */
    }
  }

  const submit = async () => {
    if (!session) return
    setBusy(true)
    setError('')
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

  const card =
    'rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-5 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[2px_2px_0_#000000]'

  if (signedIn === null) return null

  if (!signedIn) {
    return (
      <section className={card}>
        <h2 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
          Candidate assessment
        </h2>
        <p className="mt-2 text-sm text-[#171717]/60 dark:text-[#f4f4f7]/60">
          Sign in with GitHub and Google to generate your profile.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <div className={card}>
        <h2 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
          Candidate assessment
        </h2>
        <p className="mt-2 text-sm text-[#171717]/60 dark:text-[#f4f4f7]/60">
          We read your public GitHub activity, build a rough profile, then ask
          three multiple-choice questions and one short written question.
        </p>

        {!session && saved && (
          <div className="mt-4 rounded-lg border-2 border-[#39d5c8] bg-[#39d5c8]/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
              Saved profile found
            </p>
            <p className="mt-1 text-sm font-bold text-[#171717] dark:text-[#f4f4f7]">
              {saved.rough.headline}
            </p>
            <p className="mt-1 text-xs text-[#171717]/70 dark:text-[#f4f4f7]/70">
              {saved.summary}
            </p>
          </div>
        )}

        {!session && (
          <button
            onClick={start}
            disabled={busy}
            className="mt-4 flex items-center gap-2 rounded-xl border-2 border-[#171717] bg-[#6d73ff] px-4 py-2 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171717] transition hover:bg-[#585fe6] disabled:opacity-50 dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {saved ? 'Start new assessment' : 'Start assessment'}
          </button>
        )}

        {session && (
          <div className="mt-4 flex items-center gap-2 text-xs font-black uppercase">
            {session.status === 'pending' || session.status === 'extracting' ? (
              <span className="flex items-center gap-1.5 text-[#171717]/70 dark:text-[#f4f4f7]/70">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analysing GitHub
              </span>
            ) : session.status === 'awaiting' ? (
              <span className="flex items-center gap-1.5 text-[#171717]/70 dark:text-[#f4f4f7]/70">
                <CheckCircle2 className="h-3.5 w-3.5" /> Questions ready
              </span>
            ) : session.status === 'complete' ? (
              <span className="flex items-center gap-1.5 text-[#171717]/70 dark:text-[#f4f4f7]/70">
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </span>
            ) : null}
            {session.extraction_source && (
              <span className="rounded border border-[#171717] bg-[#39d5c8] px-1.5 py-0.5 text-[9px] text-[#171717] dark:border-[#000000]">
                {session.extraction_source}
              </span>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 flex items-start gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
        {session?.error && (
          <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400">
            Backend: {session.error}
          </p>
        )}
      </div>

      {session && (session.status === 'pending' || session.status === 'extracting') && !intakeDone && (
        <IntakeForm onSubmit={submitIntake} />
      )}

      {session?.rough_profile && (
        <div className={card}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
            Rough profile
          </h3>
          <p className="mt-2 font-display text-xl text-[#171717] dark:text-[#f4f4f7]">
            {session.rough_profile.headline}
          </p>
          <p className="mt-1 text-sm text-[#171717]/70 dark:text-[#f4f4f7]/70">
            {session.rough_profile.summary}
          </p>
        </div>
      )}

      {session?.status === 'awaiting' && (session.questions ?? []).length > 0 && (
        <div className={card}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
            Questions
          </h3>
          <div className="mt-4 space-y-5">
            {(session.questions ?? []).map((q, i) => (
              <div key={q.id}>
                <p className="text-sm font-bold text-[#171717] dark:text-[#f4f4f7]">
                  {i + 1}. {q.prompt}
                </p>
                {q.kind === 'mcq' ? (
                  <div className="mt-2 grid gap-2">
                    <p
                      className={`text-[11px] font-black uppercase ${
                        (timeLeft[q.id] ?? MCQ_SECONDS) <= 15
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-[#171717]/50 dark:text-[#f4f4f7]/50'
                      }`}
                    >
                      {expired[q.id]
                        ? 'Time up'
                        : `${timeLeft[q.id] ?? MCQ_SECONDS}s left`}
                    </p>
                    {q.options.map((opt, oi) => (
                      <label
                        key={oi}
                        className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition ${
                          expired[q.id]
                            ? 'cursor-not-allowed opacity-50'
                            : 'cursor-pointer'
                        } ${
                          answers[q.id]?.index === oi
                            ? 'border-[#6d73ff] bg-[#6d73ff]/10'
                            : 'border-[#171717]/20 hover:border-[#6d73ff] dark:border-[#2e323b]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          disabled={expired[q.id]}
                          checked={answers[q.id]?.index === oi}
                          onChange={() =>
                            setAnswers((a) => ({ ...a, [q.id]: { index: oi } }))
                          }
                          className="accent-[#6d73ff]"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    value={answers[q.id]?.text ?? ''}
                    onChange={(e) =>
                      setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))
                    }
                    rows={4}
                    placeholder="A few sentences is plenty."
                    className="mt-2 w-full rounded-lg border-2 border-[#171717]/20 bg-white p-3 text-sm outline-none focus:border-[#6d73ff] dark:border-[#2e323b] dark:bg-[#0f1116]"
                  />
                )}
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={busy}
            className="mt-5 flex items-center gap-2 rounded-xl border-2 border-[#171717] bg-[#ffd84d] px-4 py-2 text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-[#f5c518] disabled:opacity-50 dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Submit answers
          </button>
        </div>
      )}

      {session?.enhanced && (
        <div className={card}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
            Enhanced profile
          </h3>
          <p className="mt-2 font-display text-xl text-[#171717] dark:text-[#f4f4f7]">
            {session.enhanced.rough.headline}
          </p>
          <p className="mt-1 text-sm text-[#171717]/70 dark:text-[#f4f4f7]/70">
            {session.enhanced.summary}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {session.enhanced.tags.map((t) => (
              <span
                key={t}
                className="rounded border border-[#171717] bg-[#39d5c8] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#171717] dark:border-[#000000]"
              >
                {t}
              </span>
            ))}
          </div>

          {session.enhanced.skills.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {session.enhanced.skills.map((s) => (
                <li
                  key={s.name}
                  className="rounded-lg border-2 border-[#171717]/10 p-2 text-xs dark:border-[#2e323b]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black uppercase">{s.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-[#171717] ${
                        s.confidence === 'high' ? 'bg-[#39d5c8]' : 'bg-[#ffd84d]'
                      }`}
                    >
                      {s.confidence}
                    </span>
                  </div>
                  {s.evidence.length > 0 && (
                    <p className="mt-1 text-[11px] text-[#171717]/60 dark:text-[#f4f4f7]/60">
                      {s.evidence.join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <dl className="mt-4 grid gap-2 border-t-2 border-[#171717]/10 pt-4 text-sm dark:border-[#2e323b]">
            <div className="flex justify-between">
              <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">MCQs</dt>
              <dd className="font-black text-[#171717] dark:text-[#f4f4f7]">
                {session.enhanced.grade.mcq_correct} / {session.enhanced.grade.mcq_total}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">
                MCQ time (2 min each)
              </dt>
              <dd className="flex items-center gap-1 font-black text-[#171717] dark:text-[#f4f4f7]">
                <Clock className="h-3 w-3" />
                {session.enhanced.mcq_elapsed_seconds ?? '—'}s
                {session.enhanced.mcq_seconds_allowed
                  ? ` / ${session.enhanced.mcq_seconds_allowed}s`
                  : ''}
                {session.enhanced.mcq_over_limit && (
                  <span className="ml-1 rounded bg-rose-500 px-1 text-[9px] uppercase text-white">
                    over
                  </span>
                )}
              </dd>
            </div>
            {session.enhanced.cloned.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">
                  Cloned for exact LOC
                </dt>
                <dd className="font-black text-[#171717] dark:text-[#f4f4f7]">
                  {session.enhanced.cloned.length} repos
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">Overall</dt>
              <dd className="font-black text-[#171717] dark:text-[#f4f4f7]">
                {session.enhanced.grade.total} / 5
              </dd>
            </div>
          </dl>

          {session.enhanced.grade.criteria.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs text-[#171717]/70 dark:text-[#f4f4f7]/70">
              {session.enhanced.grade.criteria.map((c) => (
                <li key={c.criterion} className="flex justify-between gap-3">
                  <span>{c.criterion}</span>
                  <span className="font-bold">{c.score}/5</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
