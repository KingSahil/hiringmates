'use client'

import { useCallback, useEffect, useState } from 'react'
import { portalRoleFor } from '@/lib/portal'
import { useAuth } from '@/lib/auth'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface Position {
  id: string
  role: string
  description: string
  tags: string[]
  pass_threshold: number
  question_mode: string
  owner_email: string
  created_at: string
  question_count?: number
}

interface QuestionItem {
  id?: string
  prompt: string
  kind: 'mcq' | 'theory'
  options: string[]
  correct_index: number | null
}

interface PassedStudent {
  attempt_id: string
  position_id: string
  position_role: string
  student_id: string
  student_name: string
  score: number | null
}

interface Slot {
  id: string
  position_id: string
  mentor_email: string
  student_id: string
  scheduled_at: string
  meeting_id: string
  status: string
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

export function PortalContent() {
  const { user, loading, signOut } = useAuth()
  const role = portalRoleFor(user?.email)

  const [positions, setPositions] = useState<Position[]>([])
  const [students, setStudents] = useState<PassedStudent[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Sign-in (company and mentor accounts are email + password)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Company: new position
  const [newRole, setNewRole] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTags, setNewTags] = useState('')
  const [newThreshold, setNewThreshold] = useState(60)
  const [newMode, setNewMode] = useState<'auto' | 'manual'>('auto')

  // Company: manual questions drafted for new position
  const [draftQuestions, setDraftQuestions] = useState<QuestionItem[]>([])
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftKind, setDraftKind] = useState<'mcq' | 'theory'>('mcq')
  const [draftOptions, setDraftOptions] = useState<string[]>(['', '', '', ''])
  const [draftCorrect, setDraftCorrect] = useState(0)

  // Company: managing existing position questions
  const [questionFor, setQuestionFor] = useState<string | null>(null)
  const [cardQuestions, setCardQuestions] = useState<QuestionItem[]>([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [qPrompt, setQPrompt] = useState('')
  const [qKind, setQKind] = useState<'mcq' | 'theory'>('mcq')
  const [qOptionsList, setQOptionsList] = useState<string[]>(['', '', '', ''])
  const [qCorrect, setQCorrect] = useState(0)

  // Mentor: booking
  const [slotFor, setSlotFor] = useState<PassedStudent | null>(null)
  const [slotAt, setSlotAt] = useState('')

  const load = useCallback(async () => {
    if (!role) return
    if (role === 'company') {
      const { data } = await api('/api/portal/positions')
      setPositions(
        (data.positions ?? []).filter(
          (p: Position) =>
            p.owner_email?.toLowerCase() === user?.email?.toLowerCase(),
        ),
      )
    } else {
      const { data } = await api('/api/portal/slots')
      setStudents(data.students ?? [])
      setSlots(data.slots ?? [])
    }
  }, [role, user?.email])

  useEffect(() => {
    if (!loading) void load()
  }, [loading, load])

  const signIn = async () => {
    setError('')
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setSigningIn(true)
    const supabase = getSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setSigningIn(false)
    if (authError) {
      setError(authError.message)
      return
    }
    setPassword('')
  }

  const addDraftQuestion = () => {
    setError('')
    const trimmed = draftPrompt.trim()
    if (!trimmed) {
      setError('Question prompt cannot be empty.')
      return
    }
    if (draftKind === 'mcq') {
      const validOpts = draftOptions.map((o) => o.trim()).filter(Boolean)
      if (validOpts.length < 2) {
        setError('Multiple choice questions require at least 2 non-empty options.')
        return
      }
      const correctIdx = Math.min(draftCorrect, validOpts.length - 1)
      setDraftQuestions((prev) => [
        ...prev,
        {
          prompt: trimmed,
          kind: 'mcq',
          options: validOpts,
          correct_index: Math.max(0, correctIdx),
        },
      ])
    } else {
      setDraftQuestions((prev) => [
        ...prev,
        {
          prompt: trimmed,
          kind: 'theory',
          options: [],
          correct_index: null,
        },
      ])
    }
    setDraftPrompt('')
    setDraftOptions(['', '', '', ''])
    setDraftCorrect(0)
  }

  const removeDraftQuestion = (index: number) => {
    setDraftQuestions((prev) => prev.filter((_, i) => i !== index))
  }

  const createPosition = async () => {
    setError('')
    if (!newRole.trim()) {
      setError('Give the position a role title.')
      return
    }
    if (newMode === 'manual' && draftQuestions.length === 0) {
      setError('Please add at least one question to the manual pool before publishing.')
      return
    }
    setBusy(true)
    const { ok, data } = await api('/api/portal/positions', {
      method: 'POST',
      body: JSON.stringify({
        role: newRole.trim(),
        description: newDescription.trim(),
        tags: newTags.split(',').map((t) => t.trim()).filter(Boolean),
        pass_threshold: newThreshold,
        question_mode: newMode,
        questions: newMode === 'manual' ? draftQuestions : [],
      }),
    })
    setBusy(false)
    if (!ok) {
      setError(data.message ?? data.error ?? 'Could not create the position.')
      return
    }
    setNewRole('')
    setNewDescription('')
    setNewTags('')
    setNewThreshold(60)
    setNewMode('auto')
    setDraftQuestions([])
    setDraftPrompt('')
    setDraftOptions(['', '', '', ''])
    setDraftCorrect(0)
    await load()
  }

  const loadCardQuestions = useCallback(async (posId: string) => {
    setLoadingQuestions(true)
    const { ok, data } = await api(`/api/portal/positions/${posId}/questions`)
    if (ok) {
      setCardQuestions(data.questions ?? [])
    }
    setLoadingQuestions(false)
  }, [])

  const toggleManageQuestions = async (posId: string) => {
    if (questionFor === posId) {
      setQuestionFor(null)
      setCardQuestions([])
    } else {
      setQuestionFor(posId)
      setQPrompt('')
      setQOptionsList(['', '', '', ''])
      setQCorrect(0)
      setQKind('mcq')
      await loadCardQuestions(posId)
    }
  }

  const addQuestionToPool = async () => {
    setError('')
    if (!questionFor || !qPrompt.trim()) {
      setError('Question prompt cannot be empty.')
      return
    }
    const trimmed = qPrompt.trim()
    let opts: string[] = []
    let correctIdx: number | null = null

    if (qKind === 'mcq') {
      opts = qOptionsList.map((o) => o.trim()).filter(Boolean)
      if (opts.length < 2) {
        setError('Multiple choice questions require at least 2 non-empty options.')
        return
      }
      correctIdx = Math.max(0, Math.min(qCorrect, opts.length - 1))
    }

    setBusy(true)
    const { ok, data } = await api(
      `/api/portal/positions/${questionFor}/questions`,
      {
        method: 'POST',
        body: JSON.stringify({
          prompt: trimmed,
          kind: qKind,
          options: opts,
          correct_index: correctIdx,
        }),
      },
    )
    setBusy(false)
    if (!ok) {
      setError(data.message ?? data.error ?? 'Could not add the question.')
      return
    }
    setQPrompt('')
    setQOptionsList(['', '', '', ''])
    setQCorrect(0)
    await loadCardQuestions(questionFor)
    await load()
  }

  const deleteQuestionFromPool = async (questionId: string) => {
    if (!questionFor) return
    setError('')
    setBusy(true)
    const { ok, data } = await api(
      `/api/portal/positions/${questionFor}/questions?questionId=${questionId}`,
      { method: 'DELETE' },
    )
    setBusy(false)
    if (!ok) {
      setError(data.message ?? data.error ?? 'Could not delete the question.')
      return
    }
    await loadCardQuestions(questionFor)
    await load()
  }

  const bookSlot = async () => {
    setError('')
    if (!slotFor || !slotAt) {
      setError('Pick a date and time for the session.')
      return
    }
    setBusy(true)
    const { ok, data } = await api('/api/portal/slots', {
      method: 'POST',
      body: JSON.stringify({
        position_id: slotFor.position_id,
        student_id: slotFor.student_id,
        scheduled_at: new Date(slotAt).toISOString(),
      }),
    })
    setBusy(false)
    if (!ok) {
      setError(data.message ?? data.error ?? 'Could not book the slot.')
      return
    }
    setSlotFor(null)
    setSlotAt('')
    await load()
  }

  const field =
    'w-full border-2 border-ink bg-white px-4 py-3 text-sm text-ink placeholder:text-ink/40 dark:border-white/20 dark:bg-black/20 dark:text-paper'
  const label =
    'mb-1.5 block font-mono text-[10px] font-black uppercase tracking-[0.2em] opacity-60'

  if (loading) {
    return (
      <div className="grid-paper flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
          Loading…
        </span>
      </div>
    )
  }

  /* ------------------------------------------------- not signed in: log in */
  if (!user) {
    return (
      <div className="grid-paper flex min-h-screen items-center justify-center px-6 py-16">
        <div className="card-neo w-full max-w-md p-8">
          <div className="inline-flex border-2 border-ink bg-iris px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-white">
            Company &amp; mentor
          </div>
          <h1 className="font-display mt-5 text-5xl leading-none">Sign in</h1>
          <p className="mt-3 text-sm leading-6 opacity-70">
            This portal is limited to the company and mentor accounts. Students
            apply from the marketplace instead.
          </p>

          {error && (
            <div className="mt-6 border-2 border-ink bg-coral px-4 py-3 font-mono text-[11px] font-black uppercase tracking-wider text-ink">
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-4">
            <div>
              <label className={label}>Email</label>
              <input
                className={field}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="company@hiringmates.app"
              />
            </div>
            <div>
              <label className={label}>Password</label>
              <input
                className={field}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && signIn()}
                placeholder="••••••••"
              />
            </div>
            <button
              className="btn-neo btn-neo-lemon mt-2 w-full"
              onClick={signIn}
              disabled={signingIn}
            >
              {signingIn ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------- signed in but not on the allowlist */
  if (!role) {
    return (
      <div className="grid-paper flex min-h-screen items-center justify-center px-6 py-16">
        <div className="card-neo w-full max-w-md p-8 text-center">
          <h1 className="font-display text-5xl leading-none">Not on the list</h1>
          <p className="mt-4 text-sm leading-6 opacity-70">
            {user.email} is not a company or mentor account. Sign in with one of
            those addresses to use this portal.
          </p>
          <button className="btn-neo btn-neo-paper mt-7" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------- dashboards */
  return (
    <div className="grid-paper min-h-screen w-full">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <header>
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 border-2 border-ink bg-lemon px-3 py-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ink shadow-hard-sm">
              {role === 'company' ? 'Company portal' : 'Mentor portal'}
            </div>
            <button
              onClick={signOut}
              className="btn-neo btn-neo-paper px-3 py-1 text-xs font-black uppercase"
            >
              Sign out
            </button>
          </div>
          <h1 className="font-display mt-5 text-5xl leading-none sm:text-7xl">
            {role === 'company' ? 'Open a position.' : 'Book your mentees.'}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 opacity-70">
            {role === 'company'
              ? 'Publish a card and it appears in the student marketplace immediately. Autogenerated sets are rebuilt from the role and tags for every applicant.'
              : 'Everyone below cleared round 1 on one of your company’s positions. Give them a time slot and they get notified.'}
          </p>
        </header>

        {error && (
          <div className="mt-8 border-2 border-ink bg-coral px-5 py-4 font-mono text-xs font-black uppercase tracking-wider text-ink shadow-hard-sm">
            {error}
          </div>
        )}

        {role === 'company' && (
          <>
            {/* ----------------------------------------------- new position */}
            <section className="card-neo mt-10 p-7">
              <h2 className="font-display text-4xl">New position</h2>
              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <div>
                  <label className={label}>Role</label>
                  <input
                    className={field}
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="Frontend Engineer (React)"
                  />
                </div>
                <div>
                  <label className={label}>Tags (comma separated)</label>
                  <input
                    className={field}
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                    placeholder="React, TypeScript, testing"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={label}>Description</label>
                  <textarea
                    className={`${field} min-h-[120px]`}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="What the role involves, and what you need from a student."
                  />
                </div>
                <div>
                  <label className={label}>Pass threshold (%)</label>
                  <input
                    className={field}
                    type="number"
                    min={0}
                    max={100}
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={label}>Questions</label>
                  <select
                    className={field}
                    value={newMode}
                    onChange={(e) => setNewMode(e.target.value as 'auto' | 'manual')}
                  >
                    <option value="auto">Autogenerated (recommended)</option>
                    <option value="manual">Manual (Custom Question Set)</option>
                  </select>
                </div>
              </div>

              {newMode === 'auto' ? (
                <p className="mt-4 text-xs leading-6 opacity-60">
                  Autogenerated sets are produced fresh from the role and tags on
                  every attempt, so no two students see the same paper.
                </p>
              ) : (
                <div className="mt-8 border-t-2 border-dashed border-ink/20 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-2xl uppercase">Manual Question Pool</h3>
                      <p className="text-xs opacity-70">
                        Add the questions candidates will answer during their round 1 screening.
                      </p>
                    </div>
                    <span className="border-2 border-ink bg-lemon px-2.5 py-1 font-mono text-xs font-black uppercase shadow-hard-sm">
                      {draftQuestions.length} Question{draftQuestions.length === 1 ? '' : 's'} Drafted
                    </span>
                  </div>

                  {/* List of drafted questions */}
                  {draftQuestions.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {draftQuestions.map((q, idx) => (
                        <div key={idx} className="border-2 border-ink bg-white p-4 shadow-hard-sm dark:bg-black/40">
                          <div className="flex items-start justify-between gap-3">
                            <span className="border border-ink bg-paper px-2 py-0.5 font-mono text-[10px] font-black uppercase">
                              Q{idx + 1} &bull; {q.kind === 'mcq' ? 'Multiple Choice' : 'Theory'}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeDraftQuestion(idx)}
                              className="text-xs font-bold text-rose-600 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                          <p className="mt-2 text-sm font-semibold">{q.prompt}</p>
                          {q.kind === 'mcq' && (
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              {q.options.map((opt, oIdx) => (
                                <div
                                  key={oIdx}
                                  className={`flex items-center gap-2 border px-2.5 py-1 text-xs ${
                                    oIdx === q.correct_index
                                      ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'border-ink/20 bg-paper opacity-80'
                                  }`}
                                >
                                  <span className="font-mono text-[10px] opacity-60">{String.fromCharCode(65 + oIdx)}.</span>
                                  <span>{opt}</span>
                                  {oIdx === q.correct_index && (
                                    <span className="ml-auto font-mono text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                      &check; Correct
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Question builder */}
                  <div className="mt-6 border-2 border-ink bg-paper p-5 shadow-hard-sm dark:bg-[#1c1f26]">
                    <h4 className="font-mono text-xs font-black uppercase tracking-wider text-ink/80 dark:text-paper/80">
                      + Add a question to this card
                    </h4>
                    <div className="mt-4 space-y-4">
                      <div>
                        <label className={label}>Question prompt</label>
                        <textarea
                          className={`${field} min-h-[70px]`}
                          value={draftPrompt}
                          onChange={(e) => setDraftPrompt(e.target.value)}
                          placeholder="e.g. Explain the difference between optimistic UI updates and pessimistic updates."
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={label}>Question Type</label>
                          <select
                            className={field}
                            value={draftKind}
                            onChange={(e) => setDraftKind(e.target.value as 'mcq' | 'theory')}
                          >
                            <option value="mcq">Multiple Choice (MCQ)</option>
                            <option value="theory">Written Theory</option>
                          </select>
                        </div>
                      </div>

                      {draftKind === 'mcq' && (
                        <div className="space-y-3 pt-2">
                          <label className={label}>Options (select the letter to set the correct answer)</label>
                          {draftOptions.map((opt, oIdx) => (
                            <div key={oIdx} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setDraftCorrect(oIdx)}
                                className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center border-2 border-ink font-mono text-xs font-black transition ${
                                  draftCorrect === oIdx
                                    ? 'bg-emerald-500 text-white shadow-hard-sm'
                                    : 'bg-white text-ink hover:bg-lemon dark:bg-black/30 dark:text-paper'
                                }`}
                                title="Click to mark as correct answer"
                              >
                                {String.fromCharCode(65 + oIdx)}
                              </button>
                              <input
                                className={field}
                                value={opt}
                                onChange={(e) => {
                                  const updated = [...draftOptions]
                                  updated[oIdx] = e.target.value
                                  setDraftOptions(updated)
                                }}
                                placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                              />
                              {draftOptions.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = draftOptions.filter((_, i) => i !== oIdx)
                                    setDraftOptions(updated)
                                    if (draftCorrect >= updated.length) {
                                      setDraftCorrect(Math.max(0, updated.length - 1))
                                    }
                                  }}
                                  className="px-2 py-1 text-sm font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                  title="Remove option"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                          {draftOptions.length < 6 && (
                            <button
                              type="button"
                              onClick={() => setDraftOptions((prev) => [...prev, ''])}
                              className="font-mono text-xs font-bold text-iris hover:underline"
                            >
                              + Add another option
                            </button>
                          )}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={addDraftQuestion}
                        className="btn-neo btn-neo-iris text-xs"
                      >
                        Add Question to Draft
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                className="btn-neo btn-neo-lemon mt-7"
                onClick={createPosition}
                disabled={busy}
              >
                {newMode === 'manual'
                  ? `Publish card (${draftQuestions.length} question${draftQuestions.length === 1 ? '' : 's'})`
                  : 'Publish card'}
              </button>
            </section>

            {/* ------------------------------------------------ your cards */}
            <section className="mt-12">
              <div className="flex items-end justify-between gap-4">
                <h2 className="font-display text-4xl">Your cards</h2>
                <span className="font-mono text-xs font-black uppercase opacity-60">
                  {positions.length} published
                </span>
              </div>

              {positions.length === 0 && (
                <p className="mt-4 text-sm opacity-70">
                  No positions yet. Publish one above and it goes straight to the
                  marketplace.
                </p>
              )}

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {positions.map((p) => (
                  <article key={p.id} className="card-neo p-6 shadow-hard-aqua">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-3xl leading-none">{p.role}</h3>
                      <span className="border-2 border-ink bg-aqua px-2 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-ink">
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

                    <div className="mt-6 flex items-center justify-between gap-3 border-t-2 border-ink/10 pt-5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-black uppercase tracking-wider opacity-60">
                          Pass mark {p.pass_threshold}%
                        </span>
                        {p.question_mode === 'manual' && (
                          <span
                            className={`border px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                              (p.question_count ?? 0) > 0
                                ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                : 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                            }`}
                          >
                            {p.question_count ?? 0} question{(p.question_count ?? 0) === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {p.question_mode === 'manual' && (
                        <button
                          className="btn-neo btn-neo-paper text-xs"
                          onClick={() => toggleManageQuestions(p.id)}
                        >
                          {questionFor === p.id ? 'Close pool' : 'Manage pool'}
                        </button>
                      )}
                    </div>

                    {/* Question Pool Manager for this card */}
                    {questionFor === p.id && (
                      <div className="mt-5 border-t-2 border-dashed border-ink/20 pt-5">
                        <div className="flex items-center justify-between">
                          <h4 className="font-display text-xl uppercase">Questions in pool</h4>
                          <span className="font-mono text-[11px] font-black opacity-60">
                            {cardQuestions.length} total
                          </span>
                        </div>

                        {loadingQuestions ? (
                          <p className="mt-3 font-mono text-xs opacity-60">Loading questions…</p>
                        ) : cardQuestions.length === 0 ? (
                          <div className="mt-3 border border-dashed border-ink/30 bg-amber-50/50 p-3 text-xs opacity-80 dark:bg-amber-950/20">
                            No manual questions in this pool yet. Add questions below so candidates can take this test.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {cardQuestions.map((q, qIdx) => (
                              <div
                                key={q.id ?? qIdx}
                                className="border border-ink/30 bg-white p-3 shadow-hard-sm dark:bg-black/30"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="border border-ink/40 bg-paper px-1.5 py-0.5 font-mono text-[9px] font-black uppercase">
                                    Q{qIdx + 1} &bull; {q.kind === 'mcq' ? 'MCQ' : 'Theory'}
                                  </span>
                                  {q.id && (
                                    <button
                                      type="button"
                                      onClick={() => deleteQuestionFromPool(q.id!)}
                                      className="font-mono text-[10px] font-bold text-rose-600 hover:underline"
                                      disabled={busy}
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                                <p className="mt-1.5 text-xs font-bold">{q.prompt}</p>
                                {q.kind === 'mcq' && (
                                  <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                    {(q.options ?? []).map((opt, oIdx) => (
                                      <div
                                        key={oIdx}
                                        className={`flex items-center gap-1.5 border px-2 py-0.5 text-[11px] ${
                                          oIdx === q.correct_index
                                            ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/40 dark:text-emerald-300'
                                            : 'border-ink/15 bg-paper/60 opacity-80'
                                        }`}
                                      >
                                        <span className="font-mono text-[9px] opacity-60">
                                          {String.fromCharCode(65 + oIdx)}.
                                        </span>
                                        <span>{opt}</span>
                                        {oIdx === q.correct_index && (
                                          <span className="ml-auto font-mono text-[8px] uppercase text-emerald-700 dark:text-emerald-400">
                                            &check;
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add question to existing pool */}
                        <div className="mt-5 border-t border-ink/20 pt-4">
                          <h5 className="font-mono text-xs font-black uppercase tracking-wider text-ink/80 dark:text-paper/80">
                            + Add question to pool
                          </h5>
                          <div className="mt-3 space-y-3">
                            <textarea
                              className={`${field} min-h-[64px]`}
                              value={qPrompt}
                              onChange={(e) => setQPrompt(e.target.value)}
                              placeholder="Question prompt"
                            />
                            <div className="grid gap-3 sm:grid-cols-2">
                              <select
                                className={field}
                                value={qKind}
                                onChange={(e) =>
                                  setQKind(e.target.value as 'mcq' | 'theory')
                                }
                              >
                                <option value="mcq">Multiple choice</option>
                                <option value="theory">Theory</option>
                              </select>
                            </div>

                            {qKind === 'mcq' && (
                              <div className="space-y-2 pt-1">
                                <label className={label}>
                                  Options (click letter to set correct answer)
                                </label>
                                {qOptionsList.map((opt, oIdx) => (
                                  <div key={oIdx} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setQCorrect(oIdx)}
                                      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-2 border-ink font-mono text-xs font-black transition ${
                                        qCorrect === oIdx
                                          ? 'bg-emerald-500 text-white shadow-hard-sm'
                                          : 'bg-white text-ink hover:bg-lemon dark:bg-black/30 dark:text-paper'
                                      }`}
                                      title="Mark as correct answer"
                                    >
                                      {String.fromCharCode(65 + oIdx)}
                                    </button>
                                    <input
                                      className={field}
                                      value={opt}
                                      onChange={(e) => {
                                        const updated = [...qOptionsList]
                                        updated[oIdx] = e.target.value
                                        setQOptionsList(updated)
                                      }}
                                      placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                                    />
                                    {qOptionsList.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = qOptionsList.filter((_, i) => i !== oIdx)
                                          setQOptionsList(updated)
                                          if (qCorrect >= updated.length) {
                                            setQCorrect(Math.max(0, updated.length - 1))
                                          }
                                        }}
                                        className="px-2 py-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                                        title="Remove option"
                                      >
                                        &times;
                                      </button>
                                    )}
                                  </div>
                                ))}
                                {qOptionsList.length < 6 && (
                                  <button
                                    type="button"
                                    onClick={() => setQOptionsList((prev) => [...prev, ''])}
                                    className="font-mono text-xs font-bold text-iris hover:underline"
                                  >
                                    + Add another option
                                  </button>
                                )}
                              </div>
                            )}

                            <button
                              className="btn-neo btn-neo-iris text-xs"
                              onClick={addQuestionToPool}
                              disabled={busy}
                            >
                              Save question to pool
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        {role === 'mentor' && (
          <>
            {/* --------------------------------------------- passed students */}
            <section className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <h2 className="font-display text-4xl">Passed round 1</h2>
                <span className="font-mono text-xs font-black uppercase opacity-60">
                  {students.length} ready
                </span>
              </div>

              {students.length === 0 && (
                <p className="mt-4 text-sm opacity-70">
                  No student has passed round 1 on one of your company’s positions
                  yet.
                </p>
              )}

              <div className="mt-6 grid gap-4">
                {students.map((s) => (
                  <article
                    key={s.attempt_id}
                    className="card-neo flex flex-wrap items-center justify-between gap-4 p-6"
                  >
                    <div>
                      <h3 className="font-display text-3xl leading-none">
                        {s.student_name}
                      </h3>
                      <p className="mt-2 font-mono text-[10px] font-black uppercase tracking-wider opacity-60">
                        {s.position_role} · {s.score ?? '—'}%
                      </p>
                    </div>
                    <button
                      className="btn-neo btn-neo-lemon"
                      onClick={() =>
                        setSlotFor(
                          slotFor?.attempt_id === s.attempt_id ? null : s,
                        )
                      }
                    >
                      {slotFor?.attempt_id === s.attempt_id
                        ? 'Cancel'
                        : 'Give time slot'}
                    </button>

                    {slotFor?.attempt_id === s.attempt_id && (
                      <div className="grid w-full gap-3 border-t-2 border-ink/10 pt-5 sm:grid-cols-2">
                        <input
                          className={field}
                          type="datetime-local"
                          value={slotAt}
                          onChange={(e) => setSlotAt(e.target.value)}
                        />
                        <button
                          className="btn-neo btn-neo-iris"
                          onClick={bookSlot}
                          disabled={busy}
                        >
                          Book &amp; notify
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            {/* --------------------------------------------- booked sessions */}
            <section className="mt-12">
              <h2 className="font-display text-4xl">Booked sessions</h2>
              {slots.length === 0 ? (
                <p className="mt-4 text-sm opacity-70">Nothing booked yet.</p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {slots.map((s) => (
                    <div
                      key={s.id}
                      className="card-neo flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <span className="text-sm font-bold">
                        {new Date(s.scheduled_at).toLocaleString()}
                      </span>
                      <span className="border-2 border-ink bg-aqua px-3 py-1 font-mono text-[10px] font-black uppercase tracking-wider text-ink">
                        {s.meeting_id}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
