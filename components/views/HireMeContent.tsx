'use client'

import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Code2,
  LockKeyhole,
  Pause,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Trophy,
  UserCheck,
  Video,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase'

type HireMeStep = 'profile' | 'invite' | 'check' | 'assessment' | 'admin' | 'results'

const questions = [
  {
    id: 1,
    type: 'Multiple Choice',
    title: 'Which strategy maintains read-after-write consistency in distributed caches?',
    options: [
      'Write-through cache with synchronous database transactions and versioned key invalidation',
      'Asynchronous write-behind without sequence numbering',
      'Client-side TTL caching only with relaxed timeouts',
      'Single centralized Redis node with unbounded replication lag',
    ],
    correct: 0,
  },
  {
    id: 2,
    type: 'Architecture & System Design',
    title: 'Design a resilient checkout flow resilient to payment gateway timeouts and duplicate requests.',
    placeholder: 'Discuss idempotency keys, state machines (Pending -> Authorized -> Captured), retry queues with exponential backoff...',
    defaultValue: `1. Idempotency Key: Client submits UUID per checkout intent.
2. Two-phase transition: Order created with status 'PENDING_PAYMENT'.
3. Webhook listener: Validates digital signature, updates to 'PAID'.
4. Reconciliation cron: Audits orphaned transactions every 15 minutes.`,
  },
  {
    id: 3,
    type: 'SQL Query Challenge',
    title: 'Find the top 3 highest-value customers this quarter who placed at least 2 distinct orders.',
    placeholder: 'SELECT customer_id, ...',
    defaultValue: `SELECT 
  c.id, 
  c.name, 
  SUM(o.total_amount) AS quarter_spend
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.created_at >= DATE_TRUNC('quarter', CURRENT_DATE)
GROUP BY c.id, c.name
HAVING COUNT(o.id) >= 2
ORDER BY quarter_spend DESC
LIMIT 3;`,
  },
  {
    id: 4,
    type: 'Debugging & Async Logic',
    title: 'Fix the race condition in this concurrent job processor to ensure strict ordering.',
    placeholder: '// Provide your patch here...',
    defaultValue: `async function processQueue(items, concurrency = 3) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => worker(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}`,
  },
]

export function HireMeContent() {
  const { setTab } = useNavigation()
  const [step, setStep] = useState<HireMeStep>('invite')

  // Profile state
  const [candidateName, setCandidateName] = useState('Maya Chen')
  const [candidateLinkedin, setCandidateLinkedin] = useState('https://linkedin.com/in/mayachen')
  const [candidateGithub, setCandidateGithub] = useState('https://github.com/mayachen-dev')
  const [candidateSkills, setCandidateSkills] = useState('React, TypeScript, Next.js, Node.js, PostgreSQL')

  // Check state
  const [cameraReady] = useState(true)
  const [micReady] = useState(true)
  const [screenReady] = useState(true)
  const [consentChecked, setConsentChecked] = useState(false)

  // Assessment state
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [answers, setAnswers] = useState<Record<number, any>>({ 0: 0 })
  const [isPaused, setIsPaused] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(42 * 60)

  // Recruiter Admin state
  const [selectedCandidate, setSelectedCandidate] = useState('Maya Chen')

  // Auto-populate candidate from Supabase auth session if available
  useEffect(() => {
    const fetchUser = async () => {
      const supabase = getSupabaseBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        let name =
          user.user_metadata?.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.user_name ||
          user.email?.split('@')[0]

        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle()
          if (profile?.display_name) {
            name = profile.display_name
          }
        } catch {
          // ignore
        }

        if (name) {
          setCandidateName(name)
          setSelectedCandidate(name)
        }
        if (user.user_metadata?.user_name) {
          setCandidateGithub(`https://github.com/${user.user_metadata.user_name}`)
        }
      }
    }
    fetchUser()
  }, [])

  useEffect(() => {
    if (step !== 'assessment' || isPaused) return
    const interval = setInterval(() => {
      setTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [step, isPaused])

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-60px)] pb-16 pt-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Top Header & Breadcrumb / Steps Bar */}
        <div className="mb-6 flex flex-col justify-between gap-3 border-b-2 border-[#171717] pb-5 transition-colors sm:flex-row sm:items-center dark:border-[#2e323b]">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md border border-[#171717] bg-[#39d5c8] px-2 py-0.2 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                HIREME.APP
              </span>
              <span className="text-xs font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                High-Signal Assessments
              </span>
            </div>
            <h1 className="font-display text-4xl uppercase tracking-tight text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
              Engineering Assessment
            </h1>
          </div>

          {/* Stepper Navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'invite', label: 'Brief' },
              { id: 'profile', label: 'Profile' },
              { id: 'check', label: 'System' },
              { id: 'assessment', label: 'Assessment' },
              { id: 'admin', label: 'Recruiter' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setStep(item.id as HireMeStep)}
                className={`cursor-pointer rounded-xl border border-[#171717] px-3 py-1 text-xs font-black uppercase transition-all dark:border-[#2e323b] ${
                  step === item.id
                    ? 'bg-[#171717] text-[#fffaf0] shadow-[2px_2px_0_#39d5c8] dark:bg-[#39d5c8] dark:text-[#171717] dark:shadow-[2px_2px_0_#000000]'
                    : 'bg-white text-[#171717] hover:bg-[#e0fbf9] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:hover:bg-[#20242e]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* STEP 1: INVITATION BRIEF */}
        {step === 'invite' && (
          <div className="grid gap-6 md:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#ffd84d] px-3 py-0.5 text-xs font-black uppercase text-[#171717] dark:border-[#000000]">
                <Sparkles className="h-3 w-3" /> Senior Frontend & Fullstack
              </div>
              <h2 className="font-display text-4xl uppercase text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
                Show Us How You Think.
              </h2>
              <p className="mt-2.5 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#d4d4d8]">
                You’ve been invited to complete a 45-minute technical assessment for{' '}
                <strong className="text-[#171717] underline dark:text-white">Northstar Systems</strong>. No trick trivia.
                Just honest engineering problems modeled after production work.
              </p>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">45 MIN</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Time Limit</div>
                </div>
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">4</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Questions</div>
                </div>
                <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-3 text-center shadow-[1px_1px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:shadow-[1px_1px_0_#000000]">
                  <div className="font-display text-2xl text-[#171717] dark:text-[#f4f4f7]">SENIOR</div>
                  <div className="text-[9px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">Level</div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                <button
                  onClick={() => setStep('profile')}
                  className="btn-neo btn-neo-aqua text-xs"
                >
                  Configure Profile & Start <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setStep('admin')}
                  className="btn-neo btn-neo-paper text-xs"
                >
                  Recruiter Portal
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border-2 border-[#171717] bg-[#39d5c8] p-5 shadow-hard text-[#171717] dark:border-[#000000] dark:shadow-[5px_5px_0_#000000]">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#171717] bg-white dark:border-[#000000]">
                    <Code2 className="h-5 w-5 text-[#171717]" />
                  </div>
                  <div>
                    <h3 className="font-display text-2xl uppercase">Northstar Systems</h3>
                    <p className="text-xs font-bold text-[#171717]/70">Core Infrastructure Team</p>
                  </div>
                </div>

                <div className="my-4 border-t border-[#171717]/20" />

                <h4 className="text-xs font-black uppercase">Before You Begin</h4>
                <ul className="mt-2.5 space-y-2 text-xs font-bold">
                  <li className="flex items-center gap-2">
                    <Timer className="h-3.5 w-3.5" /> Self-paced 45 min timer
                  </li>
                  <li className="flex items-center gap-2">
                    <Video className="h-3.5 w-3.5" /> Webcam & integrity monitoring
                  </li>
                  <li className="flex items-center gap-2">
                    <LockKeyhole className="h-3.5 w-3.5" /> Autosaved answers
                  </li>
                  <li className="flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5" /> Review by engineering leads
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard-sm transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[3px_3px_0_#000000]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">Practice First?</span>
                  <button
                    onClick={() => setTab('codemates')}
                    className="flex cursor-pointer items-center gap-1 text-xs font-black text-[#ff57ce] underline"
                  >
                    Open CodeMates multiplayer <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PROFILE */}
        {step === 'profile' && (
          <div className="mx-auto max-w-xl rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#39d5c8] px-3 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
              <UserCheck className="h-3 w-3" /> Candidate Details
            </div>
            <h2 className="font-display text-3xl uppercase text-[#171717] sm:text-4xl dark:text-[#f4f4f7]">
              Candidate Profile
            </h2>

            <div className="mt-5 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Full Name</label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">LinkedIn URL</label>
                <input
                  type="url"
                  value={candidateLinkedin}
                  onChange={(e) => setCandidateLinkedin(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">GitHub URL</label>
                <input
                  type="url"
                  value={candidateGithub}
                  onChange={(e) => setCandidateGithub(e.target.value)}
                  className="w-full rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">Key Technical Skills</label>
                <textarea
                  rows={2}
                  value={candidateSkills}
                  onChange={(e) => setCandidateSkills(e.target.value)}
                  className="w-full resize-none rounded-xl border border-[#171717] bg-[#fffaf0] p-2.5 text-xs font-bold text-[#171717] outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
              <button
                onClick={() => setStep('invite')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                onClick={() => setStep('check')}
                className="btn-neo btn-neo-aqua py-2 text-xs"
              >
                Proceed to Setup <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SYSTEM CHECK */}
        {step === 'check' && (
          <div className="mx-auto max-w-2xl rounded-2xl border-2 border-[#171717] bg-white p-6 shadow-hard transition-colors sm:p-7 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="text-center">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#171717] bg-[#ffd84d] px-3 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                <ShieldCheck className="h-3 w-3" /> Hardware Check
              </div>
              <h2 className="font-display text-3xl uppercase text-[#171717] sm:text-4xl dark:text-[#f4f4f7]">
                Verify Your Setup
              </h2>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="flex aspect-video flex-col items-center justify-center rounded-xl border-2 border-[#171717] bg-[#171717] p-4 text-center text-[#fffaf0] dark:border-[#2e323b]">
                <Video className="mb-2 h-8 w-8 text-[#39d5c8]" />
                <span className="text-xs font-black uppercase text-[#39d5c8]">
                  Camera Ready
                </span>
                <span className="mt-1 text-[10px] text-white/60">Calibrated</span>
              </div>

              <div className="flex flex-col justify-between rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-4 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                <div className="space-y-2">
                  {[
                    { label: 'Camera Input', ok: cameraReady },
                    { label: 'Microphone Input', ok: micReady },
                    { label: 'Screen Permissions', ok: screenReady },
                  ].map((chk) => (
                    <div
                      key={chk.label}
                      className="flex items-center justify-between rounded border border-[#171717] bg-white p-2 text-[11px] font-bold dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]"
                    >
                      <span>{chk.label}</span>
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check className="h-3 w-3" /> Ready
                      </span>
                    </div>
                  ))}
                </div>

                <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] font-bold text-[#171717] dark:text-[#d4d4d8]">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#171717] dark:accent-[#ffd84d]"
                  />
                  <span>Session integrity monitoring consent.</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
              <button
                onClick={() => setStep('profile')}
                className="btn-neo btn-neo-paper py-2 text-xs"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <button
                disabled={!consentChecked}
                onClick={() => setStep('assessment')}
                className="btn-neo btn-neo-lemon py-2 text-xs disabled:opacity-40"
              >
                Start Assessment <Play className="h-3.5 w-3.5 fill-current" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: ASSESSMENT */}
        {step === 'assessment' && (
          <div className="rounded-2xl border-3 border-[#171717] bg-white shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#171717] bg-[#fffaf0] p-3 transition-colors sm:px-5 dark:border-[#2e323b] dark:bg-[#1c1f26]">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded border border-[#171717] bg-[#ffd84d] font-black text-xs text-[#171717] dark:border-[#000000]">
                  0{currentQuestion + 1}
                </span>
                <span className="text-xs font-black uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Question {currentQuestion + 1} of {questions.length}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 rounded-lg border border-[#171717] bg-[#171717] px-3 py-1 font-mono text-xs font-black text-[#ffd84d] dark:border-[#000000]">
                  <Timer className="h-3.5 w-3.5" />
                  {formatTimer(timeRemaining)}
                </div>

                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="cursor-pointer rounded-lg border border-[#171717] bg-white px-2.5 py-1 text-xs font-bold text-[#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7]"
                >
                  {isPaused ? <Play className="inline h-3 w-3" /> : <Pause className="inline h-3 w-3" />}
                  <span className="ml-1">{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-[200px_1fr]">
              <div className="border-r-2 border-[#171717] bg-[#fffaf0]/60 p-3 transition-colors dark:border-[#2e323b] dark:bg-[#111317]">
                <div className="space-y-1.5">
                  {questions.map((q, idx) => (
                    <button
                      key={q.id}
                      onClick={() => setCurrentQuestion(idx)}
                      className={`flex w-full cursor-pointer items-center justify-between rounded-lg border border-[#171717] p-2 text-left text-xs font-bold transition-all dark:border-[#2e323b] ${
                        currentQuestion === idx
                          ? 'bg-[#39d5c8] text-[#171717] dark:border-[#000000]'
                          : 'bg-white text-[#171717] hover:bg-[#fff0c2] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252933]'
                      }`}
                    >
                      <span className="truncate">Q{idx + 1}: {q.type.slice(0, 10)}</span>
                      {answers[idx] !== undefined && (
                        <Check className="h-3 w-3 text-emerald-800 dark:text-emerald-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-5 sm:p-6">
                {isPaused ? (
                  <div className="py-12 text-center">
                    <Radio className="mx-auto h-8 w-8 text-[#ffd84d]" />
                    <h3 className="mt-3 font-display text-2xl uppercase dark:text-[#f4f4f7]">Session Paused</h3>
                    <button
                      onClick={() => setIsPaused(false)}
                      className="btn-neo btn-neo-lemon mt-4 py-2 text-xs"
                    >
                      Resume
                    </button>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-base font-black text-[#171717] sm:text-lg dark:text-[#f4f4f7]">
                      {questions[currentQuestion].title}
                    </h2>

                    <div className="mt-4">
                      {questions[currentQuestion].options ? (
                        <div className="space-y-2">
                          {questions[currentQuestion].options.map((opt, optIdx) => (
                            <button
                              key={opt}
                              onClick={() =>
                                setAnswers({ ...answers, [currentQuestion]: optIdx })
                              }
                              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-[#171717] p-3 text-left text-xs font-bold transition-all dark:border-[#2e323b] ${
                                answers[currentQuestion] === optIdx
                                  ? 'bg-[#ffd84d] text-[#171717] dark:border-[#000000]'
                                  : 'bg-[#fffaf0] hover:bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252a35]'
                              }`}
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#171717] bg-white font-black text-[10px] text-[#171717] dark:border-[#2e323b] dark:bg-[#111317] dark:text-[#f4f4f7]">
                                {String.fromCharCode(65 + optIdx)}
                              </span>
                              <span>{opt}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          rows={8}
                          value={answers[currentQuestion] ?? questions[currentQuestion].defaultValue}
                          onChange={(e) =>
                            setAnswers({ ...answers, [currentQuestion]: e.target.value })
                          }
                          className="w-full rounded-xl border-2 border-[#171717] bg-[#171717] p-3 font-mono text-xs text-[#fffaf0] outline-none dark:border-[#2e323b]"
                        />
                      )}
                    </div>

                    <div className="mt-6 flex items-center justify-between border-t border-[#171717]/15 pt-4 dark:border-[#2e323b]">
                      <button
                        disabled={currentQuestion === 0}
                        onClick={() => setCurrentQuestion(currentQuestion - 1)}
                        className="btn-neo btn-neo-paper py-1.5 text-xs disabled:opacity-40"
                      >
                        <ArrowLeft className="h-3 w-3" /> Previous
                      </button>

                      {currentQuestion < questions.length - 1 ? (
                        <button
                          onClick={() => setCurrentQuestion(currentQuestion + 1)}
                          className="btn-neo btn-neo-aqua py-1.5 text-xs"
                        >
                          Next <ArrowRight className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setStep('results')}
                          className="btn-neo btn-neo-lemon py-1.5 text-xs"
                        >
                          Submit <Send className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: RESULTS */}
        {step === 'results' && (
          <div className="mx-auto max-w-xl rounded-2xl border-3 border-[#171717] bg-white p-6 text-center shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[#171717] bg-[#ffd84d] dark:border-[#000000]">
              <Trophy className="h-8 w-8 text-[#171717]" />
            </div>

            <h2 className="mt-4 font-display text-4xl uppercase text-[#171717] dark:text-[#f4f4f7]">
              Assessment Submitted
            </h2>
            <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
              Your responses have been forwarded to Northstar Systems.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-[#171717] bg-[#e0fbf9] p-3 dark:border-[#000000]">
                <div className="font-display text-2xl text-[#171717]">94/100</div>
                <div className="text-[9px] font-black uppercase text-[#171717]/60">Score</div>
              </div>
              <div className="rounded-xl border border-[#171717] bg-[#fff0c2] p-3 dark:border-[#000000]">
                <div className="font-display text-2xl text-[#171717]">4 / 4</div>
                <div className="text-[9px] font-black uppercase text-[#171717]/60">Finished</div>
              </div>
              <div className="rounded-xl border border-[#171717] bg-[#ffe6f8] p-3 dark:border-[#000000]">
                <div className="font-display text-2xl text-[#ff57ce]">CLEAR</div>
                <div className="text-[9px] font-black uppercase text-[#171717]/60">Integrity</div>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setStep('admin')}
                className="btn-neo btn-neo-aqua py-2 text-xs"
              >
                Inspect Scorecard <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setTab('codemates')}
                className="btn-neo btn-neo-berry py-2 text-xs"
              >
                Open CodeMates
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: ADMIN */}
        {step === 'admin' && (
          <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <div className="flex flex-col justify-between gap-3 border-b border-[#171717]/20 pb-4 sm:flex-row sm:items-center dark:border-[#2e323b]">
              <div>
                <h2 className="font-display text-3xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Candidate Review
                </h2>
                <p className="text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                  Inspect candidate signals and integrity logs.
                </p>
              </div>

              <span className="rounded-lg border border-[#171717] bg-[#ffd84d] px-2.5 py-1 font-mono text-[11px] font-black text-[#171717] dark:border-[#000000]">
                Frontend Role · 3 Evaluated
              </span>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                {[
                  { name: 'Maya Chen', score: 94, integrity: 'Clear', time: '12 min ago' },
                  { name: 'Alex Rivera', score: 88, integrity: 'Review', time: '35 min ago' },
                  { name: 'Jordan Lee', score: 82, integrity: 'Clear', time: '1 hr ago' },
                ].map((c) => (
                  <div
                    key={c.name}
                    onClick={() => setSelectedCandidate(c.name)}
                    className={`flex cursor-pointer items-center justify-between rounded-xl border border-[#171717] p-3 text-xs font-bold transition-all dark:border-[#2e323b] ${
                      selectedCandidate === c.name
                        ? 'bg-[#ffd84d] text-[#171717] dark:border-[#000000]'
                        : 'bg-[#fffaf0] hover:bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:hover:bg-[#252a35]'
                    }`}
                  >
                    <div>
                      <h4 className="font-display text-xl uppercase">{c.name}</h4>
                      <p className="text-[10px] text-[#171717]/70 dark:text-[#a1a1aa]">{c.time}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-display text-xl">{c.score}</span>
                      <span className="block text-[9px] uppercase">{c.integrity}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-[#171717] bg-[#fffaf0] p-4 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">{selectedCandidate}</h3>
                <div className="my-2 border-t border-[#171717]/15 dark:border-[#2e323b]" />
                <p className="text-xs font-bold text-[#171717] dark:text-[#f4f4f7]">Signal Score: 94/100</p>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-1">Integrity: No focus loss</p>
                <div className="mt-4 flex gap-2">
                  <button className="btn-neo btn-neo-ink flex-1 py-1.5 text-xs">
                    Contact
                  </button>
                  <button
                    onClick={() => setStep('invite')}
                    className="btn-neo btn-neo-paper flex-1 py-1.5 text-xs"
                  >
                    Back to Brief
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
