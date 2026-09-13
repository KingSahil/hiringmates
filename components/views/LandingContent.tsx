'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Minus,
  Zap,
  ChevronDown,
  ArrowRight,
  Code2,
  Users,
  Award,
  Terminal,
  FileCode,
  ShieldCheck,
  Sparkles,
  Briefcase,
} from 'lucide-react'
import gsap from 'gsap'
import { useAuth } from '@/lib/auth'
import { useNavigation } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const faqs = [
  {
    id: 1,
    question: 'How do HireMe technical assessments differ from traditional tests?',
    answer:
      'HireMe avoids synthetic puzzle trivia. Assessments are modeled after real engineering: distributed cache consistency, SQL optimization, architecture design, and race condition debugging, evaluated on technical reasoning.',
  },
  {
    id: 2,
    question: 'Is CodeMates real-time multiplayer?',
    answer:
      'Yes. Powered by Supabase Realtime and WebSockets, every keystroke in the Monaco code editor broadcasts to room members with zero perceived latency, alongside room chat and shared test runner.',
  },
  {
    id: 3,
    question: 'How does candidate integrity monitoring work?',
    answer:
      'Sessions track window focus events, camera preview calibration, and paste frequency. Review dashboards provide high-signal integrity statuses (Clear, Review, Flagged) for transparent evaluation.',
  },
  {
    id: 4,
    question: 'Can engineering teams create private challenge rooms?',
    answer:
      'Yes! You can generate custom private room codes, configure challenge prompts, and share the lobby code directly with teammates or candidates.',
  },
  {
    id: 5,
    question: 'What programming languages are supported in the Monaco editor?',
    answer:
      'We support JavaScript, TypeScript, Python, Go, Rust, C++, and Java with full syntax highlighting, intelligent autocomplete, and instant isolated runtime execution.',
  },
  {
    id: 6,
    question: 'How do recruiters evaluate candidate scorecards?',
    answer:
      'Recruiters receive a verified breakdown: execution accuracy, edge-case coverage, code readability, time complexity, and an interactive playback of the candidate coding session.',
  },
  {
    id: 7,
    question: 'Is HiringMates free for individual developers and students?',
    answer:
      'Yes! Developers can practice mock assessments, join multiplayer rooms, solve community challenges, and showcase verified skills on their public profile for free.',
  },
  {
    id: 8,
    question: 'Can we integrate HiringMates with our existing ATS?',
    answer:
      'Enterprise teams can export structured assessment scorecards, session recordings, and verification telemetry directly into Greenhouse, Lever, and Ashby via webhooks.',
  },
]

export function LandingContent() {
  const rootRef = useRef<HTMLDivElement>(null)
  const { signInWithGithub } = useAuth()
  const { setTab } = useNavigation()
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

  // GSAP Ambient & Interactive Animations lifecycle (Zero onload or scroll-based animations)
  useEffect(() => {
    const isClient = typeof window !== 'undefined'
    if (!isClient || !rootRef.current) return

    const ctx = gsap.context(() => {
      // 1. Continuous Organic Floating Stickers
      gsap.to('[data-float]', {
        y: 'random(-12, 12)',
        x: 'random(-8, 8)',
        rotation: 'random(-8, 8)',
        duration: 'random(2.4, 4)',
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: 0.15,
      })

      // 2. Workflow Visual Micro-Interactions
      // Micro-interaction 1: Code Scanning Line
      gsap.timeline({ repeat: -1, repeatDelay: 0.7 })
        .fromTo('[data-upload-scan]', { y: -8, opacity: 0 }, { y: 110, opacity: 1, duration: 1.1, ease: 'power1.inOut' })
        .fromTo('[data-upload-page]', { x: -8, opacity: 0.35 }, { x: 0, opacity: 1, duration: 0.28, stagger: 0.12, ease: 'power2.out' }, 0.1)
        .to('[data-upload-percent]', { scale: 1.15, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }, 0.75)
        .to('[data-upload-page]', { opacity: 0.55, duration: 0.22, stagger: 0.08 }, 1.15)

      // Micro-interaction 2: Live Room Chat / Broadcast Bubbles
      gsap.timeline({ repeat: -1, repeatDelay: 0.85 })
        .fromTo('[data-chat-bubble]', { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.36, stagger: 0.32, ease: 'power2.out' })
        .fromTo('[data-citation-tag]', { opacity: 0 }, { opacity: 1, duration: 0.28, ease: 'power2.out' }, 0.95)
        .to('[data-chat-bubble]', { opacity: 0, y: -4, duration: 0.25, stagger: 0.08 }, 2.3)

      // Micro-interaction 3: Verification Mastery / Signal Bar
      gsap.timeline({ repeat: -1, repeatDelay: 0.75 })
        .fromTo('[data-review-card]', { y: 8, opacity: 0.65 }, { y: 0, opacity: 1, duration: 0.38, ease: 'power2.out' })
        .fromTo('[data-root-cause]', { y: 10, scale: 0.94, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.42, ease: 'back.out(1.7)' }, 0.3)
        .fromTo('[data-mastery-bar]', { width: '15%' }, { width: '88%', duration: 0.7, ease: 'power2.out' }, 0.5)
        .to('[data-root-cause]', { scale: 1.03, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }, 1.15)
        .to(['[data-review-card]', '[data-root-cause]'], { opacity: 0.75, duration: 0.28 }, 2.2)

      // 3. Interactive Hero Cursor / Mouse Parallax
      const hero = rootRef.current?.querySelector<HTMLElement>('[data-hero]')
      if (hero) {
        const setTitleX = gsap.quickTo(hero, '--hero-title-x', { duration: 0.45, ease: 'power3.out', unit: 'px' })
        const setTitleY = gsap.quickTo(hero, '--hero-title-y', { duration: 0.45, ease: 'power3.out', unit: 'px' })
        const setAssetX = gsap.quickTo(hero, '--hero-asset-x', { duration: 0.65, ease: 'power3.out', unit: 'px' })
        const setAssetY = gsap.quickTo(hero, '--hero-asset-y', { duration: 0.65, ease: 'power3.out', unit: 'px' })

        const handlePointerMove = (e: PointerEvent) => {
          const rect = hero.getBoundingClientRect()
          const x = (e.clientX - rect.left) / rect.width - 0.5
          const y = (e.clientY - rect.top) / rect.height - 0.5

          setTitleX(x * 12)
          setTitleY(y * 8)
          setAssetX(x * 10)
          setAssetY(y * 8)
        }

        const handlePointerLeave = () => {
          setTitleX(0)
          setTitleY(0)
          setAssetX(0)
          setAssetY(0)
        }

        hero.addEventListener('pointermove', handlePointerMove)
        hero.addEventListener('pointerleave', handlePointerLeave)

        return () => {
          hero.removeEventListener('pointermove', handlePointerMove)
          hero.removeEventListener('pointerleave', handlePointerLeave)
        }
      }
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef} className="grid-paper min-h-[calc(100vh-65px)] overflow-x-hidden selection:bg-[#ffd84d] selection:text-[#171717]">
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

      {/* 1. HERO SECTION WITH 3D MOUSE PARALLAX & FLOATING STICKERS */}
      <section
        data-hero
        className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 lg:px-8"
      >
        {/* Floating Decorative Neo-Brutalist Stickers */}
        <img
          data-float
          src="/hero-assets/1.png"
          alt=""
          className="sticker hidden sm:block left-[5%] top-10 w-20 md:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.25)]"
        />
        <img
          data-float
          src="/hero-assets/2.png"
          alt=""
          className="sticker hidden sm:block right-[6%] top-12 w-20 md:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.25)]"
        />
        <img
          data-float
          src="/hero-assets/3.png"
          alt=""
          className="sticker hidden sm:block left-[7%] bottom-4 w-16 md:w-24 filter drop-shadow-[5px_7px_0_rgba(0,0,0,0.2)]"
        />
        <img
          data-float
          src="/hero-assets/7.png"
          alt=""
          className="sticker hidden sm:block right-[8%] bottom-6 w-20 md:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.2)]"
        />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Tag / Badge */}
          <div
            data-rise
            className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-[#171717] bg-white px-4 py-1.5 text-xs font-black uppercase text-[#171717] shadow-hard-sm transition-transform hover:scale-105 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[3px_3px_0_#000000]"
          >
            <span className="flex h-2.5 w-2.5 animate-pulse rounded-full bg-[#6ee56b]" />
            <span>High-Signal Developer Workspace</span>
          </div>

          {/* Main Headline with Parallax and Neo Banner */}
          <h1
            data-rise
            style={{
              transform: 'translate3d(var(--hero-title-x, 0px), var(--hero-title-y, 0px), 0px)',
            }}
            className="font-display text-5xl uppercase leading-[0.92] tracking-tight text-[#171717] sm:text-7xl md:text-8xl lg:text-9xl dark:text-[#f4f4f7]"
          >
            PROVE YOUR CRAFT. <br />
            <span className="inline-block mt-2 rounded-2xl border-4 border-[#171717] bg-[#ffd84d] px-5 py-1 text-[#171717] shadow-hard-lg sm:px-7 dark:border-[#000000] dark:shadow-[8px_8px_0_#000000] transition-transform hover:rotate-1">
              BUILD WITH YOUR CREW.
            </span>
          </h1>

          <p
            data-rise
            className="mx-auto mt-6 max-w-xl text-sm font-bold leading-relaxed text-[#171717]/80 sm:text-base md:text-lg dark:text-[#d4d4d8]"
          >
            Authentic technical assessments designed around production engineering, paired with a collaborative multiplayer coding arcade.
          </p>

          {/* Call to Action: Sign in to GitHub */}
          <div data-rise className="mt-8 flex flex-col items-center justify-center gap-4">
            <button
              onClick={handleGitHubSignIn}
              disabled={loading}
              className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-3 border-[#171717] bg-[#24292f] px-8 py-4 text-sm font-black uppercase tracking-wider text-white shadow-hard-lg transition-all hover:-translate-y-1 hover:bg-[#1b1f23] hover:shadow-[10px_10px_0_#171717] active:translate-y-0 disabled:opacity-60 dark:border-[#2e323b] dark:bg-[#161b22] dark:shadow-[6px_6px_0_#000000]"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span>{loading ? 'Opening GitHub...' : 'Sign in to GitHub'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            {/* If you are a mentor / recruiter button with hand-drawn curve arrow */}
            <div className="relative mt-5 flex flex-col items-center">
              {/* Playful curved arrow & annotation badge */}
              <div className="flex items-center gap-2 mb-1.5 animate-bounce [animation-duration:3s]">
                <span className="rounded-full border-2 border-[#171717] bg-[#ffd84d] px-3 py-0.5 font-mono text-[11px] font-black uppercase tracking-wider text-[#171717] shadow-[2px_2px_0_#171717] rotate-[-2.5deg]">
                  If you are a mentor / recruiter
                </span>
                {/* Curved Arrow SVG */}
                <svg
                  className="h-7 w-10 text-[#171717] dark:text-[#ffd84d]"
                  viewBox="0 0 40 28"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M4 4 C 18 2, 34 8, 28 22"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="3 3"
                  />
                  <path
                    d="M21 17 L 28 23 L 34 16"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Company & mentor sign-in (was the recruiter redirect) */}
              <button
                onClick={() => setTab('portal')}
                className="group flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-3 border-[#171717] bg-[#39d5c8] px-6 py-3 text-xs sm:text-sm font-black uppercase tracking-wider text-[#171717] shadow-hard transition-all hover:-translate-y-1 hover:bg-[#2dc4b7] hover:shadow-[7px_7px_0_#171717] active:translate-y-0 dark:border-[#2e323b] dark:bg-[#39d5c8] dark:shadow-[4px_4px_0_#000000]"
                title="Open the company & mentor portal"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg border-2 border-[#171717] bg-white text-[#171717] shadow-xs transition-transform group-hover:rotate-12">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <span>Company &amp; Mentor Sign In</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. HOW IT WORKS / PLATFORM WORKFLOW (SCROLLTRIGGER 3D CARDS & MICRO-INTERACTIONS) */}
      <section
        data-loop-section
        className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
      >
        {/* Floating Decorative Neo Stickers */}
        <img
          data-float
          src="/hero-assets/4.png"
          alt=""
          className="sticker hidden sm:block -left-4 top-10 w-16 sm:w-24 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.18)]"
        />
        <img
          data-float
          src="/hero-assets/5.png"
          alt=""
          className="sticker hidden sm:block -right-4 top-14 w-14 sm:w-20 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.18)]"
        />

        <div data-loop-heading className="mb-12 text-center">
          <span className="font-mono text-xs font-black uppercase tracking-widest text-[#171717]/60 dark:text-[#a1a1aa]">
            HIGH-SIGNAL WORKFLOW
          </span>
          <h2 className="mt-2 font-display text-4xl uppercase sm:text-6xl md:text-7xl text-[#171717] dark:text-[#f4f4f7]">
            <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1">
              <span className="loop-title-word-wrap">
                <span data-loop-title-word>HOW</span>
              </span>
              <span className="loop-title-word-wrap">
                <span data-loop-title-word>HIRINGMATES</span>
              </span>
              <span className="loop-title-word-wrap">
                <span
                  data-loop-highlight
                  className="inline-block rounded-xl border-3 border-[#171717] bg-[#39d5c8] px-3 py-0.5 text-[#171717] shadow-hard-sm"
                >
                  WORKS
                </span>
              </span>
            </div>
          </h2>
        </div>

        {/* 3D Perspective Cards Grid */}
        <div data-loop-grid className="grid gap-6 md:grid-cols-3">
          {/* Card 01: Assessment Verification */}
          <div
            data-loop-card
            className="flex flex-col justify-between rounded-3xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[10px_10px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-xl border-2 border-[#171717] bg-[#ffd84d] px-3 py-1 font-mono text-xs font-black text-[#171717] shadow-xs">
                  01
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  VERIFIED EVAL
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
                PICK YOUR TRACK
              </h3>
              <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
                Complete verified 45-minute technical assessments modeled after production systems, evaluated on genuine engineering judgment.
              </p>
            </div>

            {/* Micro-interaction 1: Code Scanning Preview */}
            <div className="relative mt-6 overflow-hidden rounded-2xl border-2 border-[#171717] bg-[#faf9f5] p-3 text-[#171717] shadow-xs dark:bg-[#111317] dark:border-[#2e323b] dark:text-white">
              <span data-upload-scan className="upload-scan-line" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#39d5c8] text-[#171717]">
                    <FileCode className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black">Cache_Worker.ts</p>
                    <p className="text-[9px] font-bold opacity-60">Running test suite</p>
                  </div>
                </div>
                <span data-upload-percent className="rounded-full bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black text-[#171717]">
                  94% PASS
                </span>
              </div>
              <div className="mt-2.5 space-y-1.5">
                {['Concurrency Lock Test', 'Eviction Policy Suite', 'Memory Boundary Check'].map((t) => (
                  <div
                    key={t}
                    data-upload-page
                    className="flex items-center justify-between rounded-lg border border-[#171717]/20 bg-white px-2 py-1 text-[10px] font-black dark:bg-[#1a1d24] dark:border-[#2e323b]"
                  >
                    <span>{t}</span>
                    <span className="text-[#07bc0c]">✓ PASS</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 02: Realtime Multiplayer */}
          <div
            data-loop-card
            className="flex flex-col justify-between rounded-3xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[10px_10px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-xl border-2 border-[#171717] bg-[#39d5c8] px-3 py-1 font-mono text-xs font-black text-[#171717] shadow-xs">
                  02
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  MULTIPLAYER
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
                CODE IN REALTIME
              </h3>
              <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
                Write production code in an embedded Monaco editor with live cursor presence, audio sync, syntax diagnostics, and room chat.
              </p>
            </div>

            {/* Micro-interaction 2: Live Room Chat / Broadcast Bubbles */}
            <div className="relative mt-6 space-y-2 rounded-2xl border-2 border-[#171717] bg-[#faf9f5] p-3 text-[#171717] shadow-xs dark:bg-[#111317] dark:border-[#2e323b] dark:text-white">
              <div data-chat-bubble className="max-w-[85%] rounded-xl bg-white p-2.5 text-[11px] font-bold leading-tight border border-[#171717]/15 dark:bg-[#1a1d24] dark:border-[#2e323b]">
                <span className="text-[9px] font-black text-[#6d73ff] block mb-0.5">DEV_402 • Room Host</span>
                Let&apos;s refactor this binary tree balancer to avoid recursive stack overflow.
              </div>
              <div data-chat-bubble className="ml-auto max-w-[90%] rounded-xl bg-[#39d5c8] p-2.5 text-[11px] font-bold text-[#171717]">
                <span className="text-[9px] font-black text-[#171717] block mb-0.5">YOU</span>
                Done! Replaced recursion with an iterative stack traversal.
                <span data-citation-tag className="mt-1 inline-block rounded-full bg-[#171717] px-2 py-0.5 text-[8px] font-black text-white">
                  Broadcasted to 4 peers
                </span>
              </div>
            </div>
          </div>

          {/* Card 03: Signals & Rank */}
          <div
            data-loop-card
            className="flex flex-col justify-between rounded-3xl border-3 border-[#171717] bg-white p-6 shadow-hard transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[10px_10px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[6px_6px_0_#000000]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="rounded-xl border-2 border-[#171717] bg-[#ff57ce] px-3 py-1 font-mono text-xs font-black text-white shadow-xs">
                  03
                </span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
                  PORTFOLIO
                </span>
              </div>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide text-[#171717] dark:text-[#f4f4f7]">
                EARN SIGNALS & RANK
              </h3>
              <p className="mt-2 text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-sm dark:text-[#a1a1aa]">
                Obtain verified signal scores, recruiter review scorecards, and room leaderboard ranks saved permanently to your profile.
              </p>
            </div>

            {/* Micro-interaction 3: Verification Mastery / Signal Bar */}
            <div className="relative mt-6 rounded-2xl border-2 border-[#171717] bg-[#faf9f5] p-3 text-[#171717] shadow-xs dark:bg-[#111317] dark:border-[#2e323b] dark:text-white">
              <div data-review-card className="rounded-xl bg-white p-2.5 border border-[#171717]/15 dark:bg-[#1a1d24] dark:border-[#2e323b]">
                <div className="flex items-center justify-between text-[10px] font-black uppercase opacity-60">
                  <span>Candidate Telemetry</span>
                  <span className="text-[#07bc0c]">Verified Clear</span>
                </div>
                <p className="mt-1 text-xs font-black">Top 4% High-Throughput Engineering</p>
              </div>
              <div data-root-cause className="mt-2 rounded-xl bg-[#6d73ff] p-2.5 text-xs font-black text-white">
                <div className="flex justify-between items-center">
                  <span>Architecture & Resilience</span>
                  <span className="text-[10px] opacity-90">92 Score</span>
                </div>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/30">
                  <span data-mastery-bar className="block h-full rounded-full bg-[#ffd84d]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FREQUENTLY ASKED QUESTIONS (#faq) WITH FLOATING MONA ARTWORK & VERTICAL MARQUEE TICKER */}
      <section
        id="faq"
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
      >
        <div className="mb-10 text-center">
          <div
            data-faq-badge
            className="inline-flex items-center gap-2 rounded-full border-2 border-[#171717] bg-[#ffd84d] px-4 py-1 text-xs font-black uppercase text-[#171717] shadow-hard-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>HAVE QUESTIONS?</span>
          </div>

          <h2 className="mt-3 font-display text-4xl uppercase sm:text-6xl md:text-7xl text-[#171717] dark:text-[#f4f4f7]">
            <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-1">
              <span className="loop-title-word-wrap">
                <span data-faq-title-word>FREQUENTLY</span>
              </span>
              <span className="loop-title-word-wrap">
                <span data-faq-title-word>ASKED</span>
              </span>
              <span className="loop-title-word-wrap">
                <span data-faq-title-word>QUESTIONS</span>
              </span>
            </div>
          </h2>

          <p
            data-faq-subheading
            className="mt-3 text-xs font-bold text-[#171717]/75 sm:text-base max-w-xl mx-auto dark:text-[#a1a1aa]"
          >
            Everything you need to know about technical assessments, real-time multiplayer coding, anti-cheat signals, and recruiter evaluation.
          </p>
        </div>

        {/* Centered FAQ Infinite Marquee Ticker */}
        <div className="mx-auto max-w-3xl pb-4 sm:pb-6">
          <div className={cn('faq-marquee-container py-1', openFaq !== null && 'has-open-card')}>
            <div className="faq-marquee-track">
              {[...faqs, ...faqs].map((faq, idx) => {
                const isOpen = openFaq === idx
                return (
                  <div
                    key={`${faq.id}-${idx}`}
                    className="faq-card rounded-[18px] border-3 border-[#171717] bg-white text-[#171717] shadow-[4px_4px_0_#171717] overflow-hidden transition-all duration-200 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[4px_4px_0_#000000]"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between p-3.5 sm:p-4 text-left font-black uppercase tracking-tight gap-3 hover:bg-[#ffd84d]/20 transition cursor-pointer select-none"
                    >
                      <span className="leading-snug flex-1 text-xs sm:text-sm">
                        {faq.question}
                      </span>
                      <div
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-2 border-[#171717] transition-transform duration-200 shadow-xs dark:border-[#2e323b]',
                          isOpen
                            ? 'bg-[#ffd84d] rotate-180 text-[#171717]'
                            : 'bg-[#39d5c8] hover:scale-105 text-[#171717]'
                        )}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t-2 border-[#171717]/15 bg-[#faf9f5] px-4 py-3.5 text-xs sm:text-sm font-semibold leading-relaxed text-[#171717]/90 animate-in fade-in slide-in-from-top-1 duration-150 dark:border-[#2e323b] dark:bg-[#111317] dark:text-[#d4d4d8]">
                        {faq.answer}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <p className="mt-3 text-center text-[11px] font-bold text-[#171717]/50 dark:text-[#71717a]">
            (Hover or open any card to pause the question ticker)
          </p>
        </div>
      </section>

      {/* 4. JOIN / CTA SECTION (#join) WITH FLOATING STICKERS & BOUNCE ENTRANCE */}
      <div className="bg-[#1b1f23]">
        <section
          id="join"
          className="grid-paper relative rounded-t-[42px] sm:rounded-t-[54px] border-t-4 border-[#171717] px-4 py-16 text-[#171717] sm:px-8 sm:py-24 lg:px-12 dark:border-[#000000]"
        >
          {/* Floating Stickers around CTA */}
          <img
            data-float
            src="/hero-assets/1.png"
            alt=""
            className="sticker hidden sm:block left-[4%] top-10 w-16 sm:left-[8%] sm:top-14 sm:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.2)]"
          />
          <img
            data-float
            src="/hero-assets/2.png"
            alt=""
            className="sticker hidden sm:block right-[4%] top-12 w-16 sm:right-[10%] sm:top-16 sm:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.2)]"
          />
          <img
            data-float
            src="/hero-assets/3.png"
            alt=""
            className="sticker hidden sm:block left-[6%] bottom-6 w-14 sm:left-[12%] sm:bottom-10 sm:w-24 filter drop-shadow-[5px_7px_0_rgba(0,0,0,0.18)]"
          />
          <img
            data-float
            src="/hero-assets/7.png"
            alt=""
            className="sticker hidden sm:block right-[6%] bottom-8 w-16 sm:right-[12%] sm:bottom-12 sm:w-28 filter drop-shadow-[6px_8px_0_rgba(0,0,0,0.18)]"
          />

          <div className="mx-auto max-w-4xl text-center">
            <h2 className="font-display text-3xl uppercase tracking-tight text-center sm:text-7xl md:text-8xl leading-snug sm:leading-none text-[#171717] dark:text-[#f4f4f7]">
              <div className="flex flex-wrap justify-center items-center gap-x-2.5 sm:gap-x-4 gap-y-1.5 sm:gap-y-3 max-w-3xl mx-auto">
                <span className="loop-title-word-wrap">
                  <span data-waitlist-title-word>LET&apos;S</span>
                </span>
                <span className="loop-title-word-wrap">
                  <span data-waitlist-title-word>PROVE</span>
                </span>
                <span className="loop-title-word-wrap">
                  <span data-waitlist-title-word>YOUR</span>
                </span>
                <span className="loop-title-word-wrap">
                  <span data-waitlist-title-word>CRAFT</span>
                </span>
                <span className="loop-title-word-wrap">
                  <span data-waitlist-title-word>WITH</span>
                </span>
                <span className="loop-title-word-wrap">
                  <span
                    data-waitlist-title-word
                    className="inline-block rounded-2xl border-4 border-[#171717] bg-[#ffd84d] px-4 py-0.5 text-[#171717] shadow-hard-sm"
                  >
                    HIRINGMATES
                  </span>
                </span>
              </div>
            </h2>

            <p
              data-waitlist-subheading
              className="mx-auto mt-4 max-w-xl text-xs font-bold leading-relaxed text-[#171717]/75 sm:text-base md:text-lg px-2 dark:text-[#d4d4d8]"
            >
              Sign up today with your GitHub profile. Complete assessments, invite teammates to live multiplayer rounds, and get discovered by top engineering teams.
            </p>

            <div
              data-waitlist-form
              className="mx-auto mt-8 flex max-w-md justify-center"
            >
              <button
                onClick={handleGitHubSignIn}
                disabled={loading}
                className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border-3 border-[#171717] bg-[#24292f] px-8 py-4 text-sm font-black uppercase tracking-wider text-white shadow-hard-lg transition-all hover:-translate-y-1 hover:bg-[#1b1f23] hover:shadow-[10px_10px_0_#171717] active:translate-y-0 disabled:opacity-60 dark:border-[#2e323b] dark:bg-[#161b22] dark:shadow-[6px_6px_0_#000000]"
              >
                <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  />
                </svg>
                <span>{loading ? 'Opening GitHub...' : 'Get Started with GitHub'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* 5. FOOTER */}
      <footer className="border-t-3 border-[#171717] bg-[#171717] px-4 py-8 text-white sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row text-center sm:text-left">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-[#171717] bg-[#ffd84d] shadow-[2px_2px_0_#000000]">
                <img
                  src="/brand-logo.png"
                  alt="HiringMates"
                  className="h-4.5 w-4.5 object-contain"
                />
              </div>
              <span className="font-display text-2xl uppercase tracking-wider text-white">
                Hiring<span className="text-[#ffd84d]">Mates</span>
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-white/60">
              Prove your craft with verified engineering signals and multiplayer coding.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-black uppercase text-white/90">
            <button
              onClick={() => setTab('portal')}
              className="cursor-pointer hover:underline text-[#39d5c8] flex items-center gap-1.5"
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>Company &amp; Mentor Sign In</span>
            </button>
            <span className="text-white/30">•</span>
            <button
              onClick={handleGitHubSignIn}
              className="cursor-pointer hover:underline text-[#ffd84d]"
            >
              Sign In With GitHub
            </button>
          </div>

          <p className="text-xs font-bold text-white/50">
            © {new Date().getFullYear()} HiringMates. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
