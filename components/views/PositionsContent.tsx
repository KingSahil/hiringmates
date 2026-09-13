'use client'

import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Wifi } from 'lucide-react'
import { HireMeContent, HireMePosition } from '@/components/views/HireMeContent'

interface Position extends HireMePosition {
  id: string
  role: string
  description: string
  tags: string[]
  pass_threshold: number
  question_mode: string
}

interface Question {
  id: string
  kind: 'mcq' | 'theory'
  prompt: string
  options?: string[]
}

interface Slot {
  id: string
  scheduled_at: string
  meeting_id: string
  status: string
  positions?: { role: string } | null
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

// Badge cards cycle through the theme palette so a grid of them reads as a
// set without every card looking identical.
const BADGE_ACCENTS = [
  { chip: 'bg-lemon text-ink', ring: 'shadow-hard-lemon' },
  { chip: 'bg-aqua text-ink', ring: 'shadow-hard-aqua' },
  { chip: 'bg-berry text-white', ring: 'shadow-hard-berry' },
  { chip: 'bg-iris text-white', ring: 'shadow-hard-iris' },
]

export function PositionsContent() {
  const [selectedProctorPosition, setSelectedProctorPosition] = useState<Position | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [activeRole, setActiveRole] = useState('')
  const [answers, setAnswers] = useState<
    Record<string, { index?: number; text?: string }>
  >({})
  const [result, setResult] = useState<{ score: number | null; passed: boolean } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingPositionId, setLoadingPositionId] = useState<string | null>(null)

  const load = async () => {
    const { data } = await api('/api/portal/positions')
    setPositions(data.positions ?? [])
    const mine = await api('/api/portal/slots')
    setSlots(mine.data.slots ?? [])
  }

  useEffect(() => {
    void load()
  }, [])

  const start = (position: Position) => {
    setError('')
    setResult(null)
    setSelectedProctorPosition(position)
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const submit = async () => {
    if (!attemptId) return
    setBusy(true)
    setError('')
    const payload = Object.entries(answers).map(([question_id, v]) => ({
      question_id,
      selected_index: v.index,
      text: v.text ?? '',
    }))
    const { ok, data } = await api(`/api/portal/attempts/${attemptId}`, {
      method: 'POST',
      body: JSON.stringify({ answers: payload }),
    })
    setBusy(false)
    if (!ok) {
      setError(data.message ?? data.error ?? 'Could not submit.')
      return
    }
    setResult({ score: data.score, passed: data.passed })
    setAttemptId(null)
    setQuestions([])
    void load()
  }

  if (selectedProctorPosition) {
    return (
      <HireMeContent
        position={selectedProctorPosition}
        onComplete={(res) => {
          setResult({ score: res.score, passed: res.passed })
          void load()
        }}
        onExit={() => {
          setSelectedProctorPosition(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className="grid-paper min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-6 py-14">
        {/* ---------------------------------------------------------- header */}
        <header>
          <div className="inline-flex items-center gap-2 border-2 border-ink bg-lemon px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ink shadow-hard-sm">
            Position marketplace
          </div>
          <h1 className="font-display mt-5 text-5xl leading-[0.95] sm:text-7xl">
            Find a badge. Apply.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 opacity-70">
            Every card below is a real opening published by a hiring company.
            Applying starts round 1 — you get a fresh question set drawn from that
            role, and passing puts you in front of a mentor.
          </p>
        </header>

        {error && (
          <div className="mt-8 border-2 border-ink bg-coral px-5 py-4 font-mono text-xs font-black uppercase tracking-wider text-ink shadow-hard-sm">
            {error}
          </div>
        )}

        {result && (
          <div
            className={`card-neo mt-8 flex flex-wrap items-center justify-between gap-4 p-6 ${
              result.passed ? 'border-grass' : ''
            }`}
          >
            <div>
              <div className="font-display text-3xl">
                {result.passed ? 'Round 1 cleared' : 'Not this time'}
              </div>
              <p className="mt-1 text-sm opacity-70">
                Score {result.score === null ? 'n/a' : `${result.score}%`}. A mentor
                can book a session with you once you pass.
              </p>
            </div>
            <span
              className={`btn-neo ${result.passed ? 'btn-neo-aqua' : 'btn-neo-paper'}`}
            >
              {result.score === null ? 'Submitted' : `${result.score}%`}
            </span>
          </div>
        )}

        {/* ------------------------------------------- active round 1 (apply) */}
        {questions.length > 0 && (
          <section className="card-neo mt-10 p-7">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-iris">
              Round 1 in progress
            </div>
            <h2 className="font-display mt-2 text-4xl">{activeRole}</h2>

            <div className="mt-7 grid gap-7">
              {questions.map((q, i) => (
                <div key={q.id}>
                  <p className="text-sm font-bold leading-6">
                    <span className="mr-2 font-mono text-iris">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {q.prompt}
                  </p>

                  {q.kind === 'mcq' ? (
                    <div className="mt-3 grid gap-2">
                      {(q.options ?? []).map((opt, idx) => {
                        const picked = answers[q.id]?.index === idx
                        return (
                          <label
                            key={idx}
                            className={`flex cursor-pointer items-center gap-3 border-2 px-4 py-3 text-sm transition-colors ${
                              picked
                                ? 'border-ink bg-lemon text-ink'
                                : 'border-ink/20 hover:border-ink'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              className="accent-ink"
                              checked={picked}
                              onChange={() =>
                                setAnswers((a) => ({ ...a, [q.id]: { index: idx } }))
                              }
                            />
                            {opt}
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <textarea
                      className="mt-3 min-h-[120px] w-full border-2 border-ink bg-white p-4 text-sm text-ink dark:border-white/20 dark:bg-black/20 dark:text-paper"
                      placeholder="Explain your approach…"
                      value={answers[q.id]?.text ?? ''}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              className="btn-neo btn-neo-lemon mt-8 flex items-center gap-2"
              onClick={submit}
              disabled={busy}
            >
              {busy && !loadingPositionId ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                'Submit answers'
              )}
            </button>
          </section>
        )}

        {/* ------------------------------------------------- available badges */}
        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-4xl">Available badges</h2>
            <span className="font-mono text-xs font-black uppercase opacity-60">
              {positions.length} open
            </span>
          </div>

          {loadingPositionId && (
            <div className="mt-6 flex items-center gap-3 border-2 border-ink bg-lemon/20 px-5 py-3.5 font-mono text-xs font-bold text-ink shadow-hard-sm dark:border-lemon dark:bg-lemon/10 dark:text-lemon">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <div className="flex flex-1 flex-wrap items-center justify-between gap-2">
                <span>
                  Preparing assessment for{' '}
                  <strong className="underline">
                    {positions.find((pos) => pos.id === loadingPositionId)?.role || 'role'}
                  </strong>
                  … Fetching fresh questions from backend
                </span>
                <span className="text-[10px] tracking-wider uppercase opacity-75">
                  Please wait
                </span>
              </div>
            </div>
          )}

          {positions.length === 0 && (
            <p className="mt-4 max-w-xl text-sm leading-7 opacity-70">
              No company has published a card yet. Sign in with the company account
              and open a position — it appears here immediately.
            </p>
          )}

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {positions.map((p, i) => {
              const accent = BADGE_ACCENTS[i % BADGE_ACCENTS.length]
              const isCardLoading = loadingPositionId === p.id
              return (
                <article
                  key={p.id}
                  className={`card-neo flex flex-col justify-between p-6 ${accent.ring}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-3xl leading-none">{p.role}</h3>
                      <span
                        className={`border-2 border-ink px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider ${accent.chip}`}
                      >
                        {p.question_mode === 'auto' ? 'Auto' : 'Manual'}
                      </span>
                    </div>

                    {p.description && (
                      <p className="mt-4 text-sm leading-6 opacity-70">
                        {p.description}
                      </p>
                    )}

                    {p.tags?.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {p.tags.map((t) => (
                          <span
                            key={t}
                            className="border-2 border-ink/25 px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider opacity-80"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-5">
                    <span className="font-mono text-[10px] font-black uppercase tracking-wider opacity-60">
                      Pass mark {p.pass_threshold}%
                    </span>
                    <button
                      className={`btn-neo flex items-center justify-center gap-2 transition-all ${
                        isCardLoading
                          ? 'bg-lemon text-ink opacity-90 cursor-wait shadow-none translate-x-[2px] translate-y-[2px]'
                          : 'btn-neo-lemon'
                      }`}
                      onClick={() => start(p)}
                      disabled={busy}
                    >
                      {isCardLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                          <span>Loading…</span>
                        </>
                      ) : (
                        'Apply'
                      )}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        {/* ---------------------------------------------------- your sessions */}
        <section className="mt-14">
          <h2 className="font-display text-4xl">Your sessions</h2>
          {slots.length === 0 ? (
            <p className="mt-4 text-sm opacity-70">No mentor session booked yet.</p>
          ) : (
            <div className="mt-5 grid gap-3">
              {slots.map((s) => (
                <div
                  key={s.id}
                  className="card-neo flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <div className="text-sm font-bold">
                      {new Date(s.scheduled_at).toLocaleString()}
                    </div>
                    {s.positions?.role && (
                      <div className="mt-1 text-xs opacity-60">{s.positions.role}</div>
                    )}
                  </div>
                  <span className="border-2 border-ink bg-aqua px-3 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-ink">
                    {s.meeting_id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
