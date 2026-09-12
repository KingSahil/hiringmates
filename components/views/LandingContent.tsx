'use client'

import { useState, useEffect } from 'react'
import { Plus, Minus, Zap } from 'lucide-react'
import { useAuth } from '@/lib/auth'

const faqs = [
  {
    question: 'How do HireMe technical assessments differ from traditional tests?',
    answer:
      'HireMe avoids synthetic puzzle trivia. Assessments are modeled after real engineering: distributed cache consistency, SQL optimization, architecture design, and race condition debugging, evaluated on technical reasoning.',
  },
  {
    question: 'Is CodeMates real-time multiplayer?',
    answer:
      'Yes. Powered by Supabase Realtime and WebSockets, every keystroke in the Monaco code editor broadcasts to room members with zero perceived latency, alongside room chat and shared test runner.',
  },
  {
    question: 'How does candidate integrity monitoring work?',
    answer:
      'Sessions track window focus events, camera preview calibration, and paste frequency. Review dashboards provide high-signal integrity statuses (Clear, Review, Flagged) for transparent evaluation.',
  },
  {
    question: 'Can teams create private rooms?',
    answer:
      'Yes. You can generate custom private room codes, configure challenge prompts, and share the lobby code directly with teammates.',
  },
]

export function LandingContent() {
  const { signInWithGithub } = useAuth()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const err = params.get('error')
      if (err) {
        setErrorMessage(decodeURIComponent(err))
      }
    }
  }, [])

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx)
  }

  const handleGitHubSignIn = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      await signInWithGithub()
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to start GitHub login.')
      setLoading(false)
    }
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-65px)]">
      {/* Optional Error Alert */}
      {errorMessage && (
        <div className="mx-auto max-w-xl px-4 pt-6">
          <div className="flex items-center justify-between gap-3 rounded-2xl border-3 border-[#171717] bg-rose-100 p-4 text-xs font-black uppercase text-[#171717] shadow-hard-sm dark:bg-rose-950/70 dark:text-rose-200">
            <span>{errorMessage}</span>
            <button
              onClick={() => setErrorMessage(null)}
              className="cursor-pointer font-mono text-sm font-black underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* 1. HERO SECTION */}
      <section className="px-4 pb-14 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Tag / Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-[#171717] bg-white px-4 py-1.5 text-xs font-black uppercase text-[#171717] shadow-hard-sm dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[3px_3px_0_#000000]">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#6ee56b]" />
            <span>High-Signal Developer Workspace</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-display text-5xl uppercase leading-[0.92] tracking-tight text-[#171717] sm:text-7xl md:text-8xl lg:text-9xl dark:text-[#f4f4f7]">
            PROVE YOUR CRAFT. <br />
            <span className="inline-block mt-2 rounded-2xl border-4 border-[#171717] bg-[#ffd84d] px-5 py-1 text-[#171717] shadow-hard-lg sm:px-7 dark:border-[#000000] dark:shadow-[8px_8px_0_#000000]">
              BUILD WITH YOUR CREW.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-sm font-bold leading-relaxed text-[#171717]/75 sm:text-base md:text-lg dark:text-[#d4d4d8]">
            Authentic technical assessments designed around production systems, paired with a collaborative multiplayer coding arcade.
          </p>

          {/* Call to Action: Sign in to GitHub */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              onClick={handleGitHubSignIn}
              disabled={loading}
              className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-3 border-[#171717] bg-[#24292f] px-8 py-4 text-sm font-black uppercase tracking-wider text-white shadow-hard-lg transition hover:-translate-y-1 hover:bg-[#1b1f23] active:translate-y-0 disabled:opacity-60 dark:border-[#2e323b] dark:bg-[#161b22] dark:shadow-[6px_6px_0_#000000]"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>{loading ? 'Opening GitHub...' : 'Sign in to GitHub'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS / PLATFORM WORKFLOW */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <span className="font-mono text-xs font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
            HOW IT WORKS
          </span>
          <h2 className="mt-1 font-display text-4xl uppercase sm:text-5xl md:text-6xl text-[#171717] dark:text-[#f4f4f7]">
            PLATFORM WORKFLOW
          </h2>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          {/* 01 */}
          <div className="rounded-2xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2.5 py-1 font-mono text-xs font-black text-[#171717] dark:border-[#000000]">
              01
            </span>
            <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              PICK YOUR TRACK
            </h3>
            <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
              Complete a verified 45-minute technical assessment for recruiters or host a multiplayer coding round with teammates.
            </p>
          </div>

          {/* 02 */}
          <div className="rounded-2xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#39d5c8] px-2.5 py-1 font-mono text-xs font-black text-[#171717] dark:border-[#000000]">
              02
            </span>
            <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              CODE IN REALTIME
            </h3>
            <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
              Write production code in the embedded Monaco editor with live presence, chat, syntax highlighting, and unit tests.
            </p>
          </div>

          {/* 03 */}
          <div className="rounded-2xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#ff57ce] px-2.5 py-1 font-mono text-xs font-black text-white dark:border-[#000000]">
              03
            </span>
            <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
              EARN SIGNALS & RANK
            </h3>
            <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
              Obtain verified signal scores, recruiter review scorecards, and room leaderboard ranks saved to your profile.
            </p>
          </div>
        </div>
      </section>

      {/* 3. FREQUENTLY ASKED QUESTIONS */}
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 text-center">
          <h2 className="font-display text-4xl uppercase sm:text-5xl text-[#171717] dark:text-[#f4f4f7]">
            FREQUENTLY ASKED QUESTIONS
          </h2>
        </div>

        <div className="space-y-3.5">
          {faqs.map((faq, idx) => (
            <div
              key={faq.question}
              className="overflow-hidden rounded-2xl border-2 border-[#171717] bg-white shadow-hard-sm transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[3px_3px_0_#000000]"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="flex w-full cursor-pointer items-center justify-between p-4 sm:p-5 text-left text-xs font-black uppercase text-[#171717] sm:text-sm dark:text-[#f4f4f7]"
              >
                <span>{faq.question}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-[#171717] bg-[#ffd84d] text-[#171717] dark:border-[#000000]">
                  {openFaq === idx ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </span>
              </button>
              {openFaq === idx && (
                <div className="border-t-2 border-[#171717]/15 bg-[#fffaf0] p-4 sm:p-5 text-xs font-bold leading-relaxed text-[#171717]/80 dark:border-[#2e323b] dark:bg-[#111317] dark:text-[#d4d4d8]">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 4. FOOTER */}
      <footer className="mt-14 border-t-2 border-[#171717] bg-[#fffaf0] py-8 transition-colors dark:border-[#2e323b] dark:bg-[#0c0d11]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 fill-current text-[#ffd84d]" />
            <span className="font-display text-xl uppercase tracking-wider text-[#171717] dark:text-[#f4f4f7]">
              HiringMates
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
            <button
              onClick={handleGitHubSignIn}
              className="cursor-pointer hover:underline text-[#6d73ff]"
            >
              Sign In With GitHub
            </button>
          </div>

          <p className="text-xs font-bold text-[#171717]/50 dark:text-[#71717a]">
            © 2026 HiringMates. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
