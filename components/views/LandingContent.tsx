'use client'

import { useState } from 'react'
import {
  Code2,
  Gamepad2,
  Plus,
  Minus,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'

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
  const { setTab } = useNavigation()
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const toggleFaq = (idx: number) => {
    setOpenFaq(openFaq === idx ? null : idx)
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-60px)]">
      {/* 1. HERO DUAL PATH PANELS (ENLARGED & CENTRALIZED AT TOP) */}
      <section className="mx-auto max-w-5xl px-4 pt-8 pb-6 sm:px-6 sm:pt-12">
        <div className="grid gap-6 md:grid-cols-2">
          {/* HIREME */}
          <div
            onClick={() => setTab('hireme')}
            className="group flex min-h-[380px] cursor-pointer flex-col justify-between rounded-3xl border-3 border-[#171717] bg-[#39d5c8] p-8 text-[#171717] shadow-hard-lg transition-all hover:-translate-y-1 sm:min-h-[410px] sm:p-9 dark:border-[#000000] dark:shadow-[8px_8px_0_#000000]"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-xl border-2 border-[#171717] bg-white px-3 py-1 font-mono text-xs font-black sm:text-sm dark:border-[#000000]">
                01
              </span>
              <span className="rounded-full border border-[#171717] bg-[#171717] px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-[#39d5c8] dark:border-[#000000]">
                OPPORTUNITY
              </span>
            </div>

            <div className="my-6">
              <h2 className="font-display text-5xl uppercase leading-none sm:text-6xl md:text-7xl">
                Hire Me
              </h2>
              <p className="mt-3 max-w-md text-sm font-bold leading-relaxed text-[#171717]/85 sm:text-base">
                Show your architectural reasoning, SQL optimization, and race condition debugging through fair, signal-rich assessments.
              </p>
            </div>

            <div className="flex items-center justify-between border-t-2 border-[#171717] pt-4 text-xs font-black uppercase sm:text-sm dark:border-[#171717]/40">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                <span>Integrity Verified</span>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#171717] bg-white text-lg font-black transition-transform group-hover:translate-x-1.5 dark:border-[#000000]">
                →
              </span>
            </div>
          </div>

          {/* CODEMATES */}
          <div
            onClick={() => setTab('codemates')}
            className="group flex min-h-[380px] cursor-pointer flex-col justify-between rounded-3xl border-3 border-[#171717] bg-[#ffd84d] p-8 text-[#171717] shadow-hard-lg transition-all hover:-translate-y-1 sm:min-h-[410px] sm:p-9 dark:border-[#000000] dark:shadow-[8px_8px_0_#000000]"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-xl border-2 border-[#171717] bg-white px-3 py-1 font-mono text-xs font-black sm:text-sm dark:border-[#000000]">
                02
              </span>
              <span className="rounded-full border border-[#171717] bg-[#ff57ce] px-3.5 py-1 text-[11px] font-black uppercase tracking-wider text-white dark:border-[#000000]">
                MULTIPLAYER
              </span>
            </div>

            <div className="my-6">
              <h2 className="font-display text-5xl uppercase leading-none sm:text-6xl md:text-7xl">
                CodeMates
              </h2>
              <p className="mt-3 max-w-md text-sm font-bold leading-relaxed text-[#171717]/85 sm:text-base">
                Drop into a live shared Monaco editor with your crew. Solve concurrent challenges, run instant tests, and climb the room ranks.
              </p>
            </div>

            <div className="flex items-center justify-between border-t-2 border-[#171717] pt-4 text-xs font-black uppercase sm:text-sm dark:border-[#171717]/40">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                <span>Realtime Websockets</span>
              </div>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#171717] bg-white text-lg font-black transition-transform group-hover:translate-x-1.5 dark:border-[#000000]">
                →
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HERO SECTION (CENTERED DIRECTLY AFTER DUAL PANELS) */}
      <section className="px-4 pb-12 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Tag */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-[#171717] bg-white px-3.5 py-1 text-xs font-black uppercase text-[#171717] shadow-hard-sm dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[3px_3px_0_#000000]">
            <span className="flex h-2 w-2 rounded-full bg-[#6ee56b]" />
            <span>High-Signal Developer Workspace</span>
          </div>

          {/* Main Headline */}
          <h1 className="font-display text-5xl uppercase leading-[0.9] tracking-tight text-[#171717] sm:text-7xl md:text-8xl dark:text-[#f4f4f7]">
            PROVE YOUR CRAFT. <br />
            <span className="inline-block rounded-xl border-3 border-[#171717] bg-[#ffd84d] px-4 py-0.5 text-[#171717] shadow-hard sm:px-5 dark:border-[#000000] dark:shadow-[6px_6px_0_#000000]">
              BUILD WITH YOUR CREW.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-sm font-bold leading-relaxed text-[#171717]/75 sm:text-base dark:text-[#d4d4d8]">
            Authentic technical assessments designed around production systems, paired with a collaborative multiplayer coding arcade.
          </p>

          {/* Call to Actions */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => setTab('hireme')}
              className="btn-neo btn-neo-aqua text-xs sm:text-sm"
            >
              <Code2 className="h-4 w-4" /> Take An Assessment
            </button>
            <button
              onClick={() => setTab('codemates')}
              className="btn-neo btn-neo-berry text-xs sm:text-sm"
            >
              <Gamepad2 className="h-4 w-4" /> Enter Multiplayer Arcade
            </button>
          </div>
        </div>
      </section>

      {/* 3. 3-STEP STRUCTURED FLOW */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <span className="text-xs font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
            HOW IT WORKS
          </span>
          <h2 className="mt-1 font-display text-3xl uppercase sm:text-5xl dark:text-[#f4f4f7]">
            Platform Workflow
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2 py-0.5 font-mono text-[11px] font-black text-[#171717] dark:border-[#000000]">
              01
            </span>
            <h3 className="mt-3 font-display text-2xl uppercase dark:text-[#f4f4f7]">Pick Your Track</h3>
            <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#171717]/70 dark:text-[#a1a1aa]">
              Complete a verified 45-minute technical assessment for recruiters or host a multiplayer coding round with teammates.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#39d5c8] px-2 py-0.5 font-mono text-[11px] font-black text-[#171717] dark:border-[#000000]">
              02
            </span>
            <h3 className="mt-3 font-display text-2xl uppercase dark:text-[#f4f4f7]">Code In Realtime</h3>
            <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#171717]/70 dark:text-[#a1a1aa]">
              Write production code in the embedded Monaco editor with live presence, chat, syntax highlighting, and unit tests.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#171717] bg-white p-5 shadow-hard transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000]">
            <span className="rounded-md border border-[#171717] bg-[#ff57ce] px-2 py-0.5 font-mono text-[11px] font-black text-white dark:border-[#000000]">
              03
            </span>
            <h3 className="mt-3 font-display text-2xl uppercase dark:text-[#f4f4f7]">Earn Signals & Rank</h3>
            <p className="mt-1.5 text-xs font-bold leading-relaxed text-[#171717]/70 dark:text-[#a1a1aa]">
              Obtain verified signal scores, recruiter review scorecards, and room leaderboard ranks saved to your profile.
            </p>
          </div>
        </div>
      </section>

      {/* 4. FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 text-center">
          <h2 className="font-display text-3xl uppercase sm:text-4xl dark:text-[#f4f4f7]">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={faq.question}
              className="overflow-hidden rounded-xl border-2 border-[#171717] bg-white shadow-hard-sm transition-colors dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[3px_3px_0_#000000]"
            >
              <button
                onClick={() => toggleFaq(idx)}
                className="flex w-full cursor-pointer items-center justify-between p-4 text-left text-xs font-black uppercase text-[#171717] sm:text-sm dark:text-[#f4f4f7]"
              >
                <span>{faq.question}</span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[#171717] bg-[#ffd84d] text-[#171717] dark:border-[#000000]">
                  {openFaq === idx ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </span>
              </button>
              {openFaq === idx && (
                <div className="border-t border-[#171717]/15 bg-[#fffaf0] p-4 text-xs font-bold leading-relaxed text-[#171717]/80 dark:border-[#2e323b] dark:bg-[#111317] dark:text-[#d4d4d8]">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 5. FOOTER */}
      <footer className="mt-12 border-t-2 border-[#171717] bg-[#fffaf0] py-6 transition-colors dark:border-[#2e323b] dark:bg-[#0c0d11]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 fill-current text-[#ffd84d]" />
            <span className="font-display text-lg uppercase tracking-wider text-[#171717] dark:text-[#f4f4f7]">
              HiringMates
            </span>
          </div>

          <div className="flex items-center gap-5 text-xs font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
            <button onClick={() => setTab('hireme')} className="cursor-pointer hover:underline">
              HireMe
            </button>
            <button onClick={() => setTab('codemates')} className="cursor-pointer hover:underline">
              CodeMates
            </button>
            <button onClick={() => setTab('auth')} className="cursor-pointer hover:underline">
              Sign In
            </button>
          </div>

          <p className="text-[11px] font-bold text-[#171717]/50 dark:text-[#71717a]">
            © 2026 HiringMates.
          </p>
        </div>
      </footer>
    </div>
  )
}
