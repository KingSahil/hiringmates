'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Loader2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
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
  theory_elapsed_seconds: number | null
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

export function AssessmentContent() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [saved, setSaved] = useState<Enhanced | null>(null)
  const [session, setSession] = useState<SessionView | null>(null)
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

  const poll = useCallback((id: string) => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/onboarding?id=${encodeURIComponent(id)}`)
        const data = await res.json()
        setSession(data)
        if (data.status === 'awaiting' || data.status === 'complete' || data.status === 'failed') {
          stopPolling()
        }
      } catch {
        /* transient; keep polling */
      }
    }, POLL_MS)
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
      setSession(data)
      poll(data.id)
    } catch {
      setError('Could not reach the onboarding API.')
    } finally {
      setBusy(false)
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
      setSession(data)
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

        {!session && (
          <button
            onClick={start}
            disabled={busy}
            className="mt-4 flex items-center gap-2 rounded-xl border-2 border-[#171717] bg-[#6d73ff] px-4 py-2 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171717] transition hover:bg-[#585fe6] disabled:opacity-50 dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Start assessment
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

      {session?.status === 'awaiting' && session.questions.length > 0 && (
        <div className={card}>
          <h3 className="text-xs font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
            Questions
          </h3>
          <div className="mt-4 space-y-5">
            {session.questions.map((q, i) => (
              <div key={q.id}>
                <p className="text-sm font-bold text-[#171717] dark:text-[#f4f4f7]">
                  {i + 1}. {q.prompt}
                </p>
                {q.kind === 'mcq' ? (
                  <div className="mt-2 grid gap-2">
                    {q.options.map((opt, oi) => (
                      <label
                        key={oi}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3 py-2 text-sm transition ${
                          answers[q.id]?.index === oi
                            ? 'border-[#6d73ff] bg-[#6d73ff]/10'
                            : 'border-[#171717]/20 hover:border-[#6d73ff] dark:border-[#2e323b]'
                        }`}
                      >
                        <input
                          type="radio"
                          name={q.id}
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

          <dl className="mt-4 grid gap-2 border-t-2 border-[#171717]/10 pt-4 text-sm dark:border-[#2e323b]">
            <div className="flex justify-between">
              <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">MCQs</dt>
              <dd className="font-black text-[#171717] dark:text-[#f4f4f7]">
                {session.enhanced.grade.mcq_correct} / {session.enhanced.grade.mcq_total}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#171717]/60 dark:text-[#f4f4f7]/60">Theory time</dt>
              <dd className="flex items-center gap-1 font-black text-[#171717] dark:text-[#f4f4f7]">
                <Clock className="h-3 w-3" />
                {session.enhanced.theory_elapsed_seconds ?? '—'}s
              </dd>
            </div>
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
