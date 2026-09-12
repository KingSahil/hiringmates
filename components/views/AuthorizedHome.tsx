'use client'

import { useState } from 'react'
import { ShieldCheck, Zap } from 'lucide-react'
import { useNavigation } from '@/lib/navigation'

export function AuthorizedHome() {
  const { setTab } = useNavigation()
  const [hovered, setHovered] = useState<'hireme' | 'codemates' | null>(null)

  const isHireMeDull = hovered === 'codemates'
  const isCodeMatesDull = hovered === 'hireme'

  return (
    <div
      onMouseLeave={() => setHovered(null)}
      className="w-full min-h-[calc(100vh-65px)] grid grid-cols-1 md:grid-cols-2 m-0 p-0 select-none overflow-hidden"
    >
      {/* 01 HIRE ME PANEL (Touches extreme left edge) */}
      <section
        onClick={() => setTab('hireme')}
        onMouseEnter={() => setHovered('hireme')}
        onMouseLeave={() => setHovered(null)}
        className={`group relative flex min-h-[420px] md:min-h-full cursor-pointer flex-col justify-between border-b-4 md:border-b-0 md:border-r-4 border-[#171717] bg-[#39d5c8] p-8 sm:p-12 lg:p-16 xl:p-20 text-[#171717] dark:border-[#000000] overflow-hidden transition-all duration-500 ease-in-out ${
          isHireMeDull
            ? 'grayscale-[40%] opacity-70 brightness-[0.97]'
            : hovered === 'hireme'
            ? 'brightness-105'
            : ''
        }`}
      >
        {/* Soft grey tint overlay when dull */}
        <div
          className={`pointer-events-none absolute inset-0 bg-[#171717]/5 dark:bg-black/15 transition-opacity duration-500 ease-in-out ${
            isHireMeDull ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Top Badges */}
        <div className="flex items-center justify-between">
          <span className="rounded-2xl border-3 border-[#171717] bg-white px-4 py-1.5 font-mono text-sm font-black sm:text-base dark:border-[#000000] shadow-[2px_2px_0_#171717] dark:shadow-[2px_2px_0_#000000]">
            01
          </span>
          <span className="rounded-full border-2 border-[#171717] bg-[#171717] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-[#39d5c8] dark:border-[#000000]">
            OPPORTUNITY
          </span>
        </div>

        {/* Center Typography & Description */}
        <div className="my-auto py-10">
          <h1 className="font-display text-6xl uppercase leading-none tracking-tight sm:text-7xl lg:text-8xl xl:text-9xl text-[#171717]">
            HIRE ME
          </h1>
          <p className="mt-5 max-w-xl text-base font-bold leading-relaxed text-[#171717]/90 sm:text-lg lg:text-xl">
            Show your architectural reasoning, SQL optimization, and race condition debugging through fair, signal-rich assessments.
          </p>
        </div>

        {/* Bottom Integrity Bar & Arrow Button */}
        <div>
          <div className="mb-6 h-1 w-full bg-[#171717]/80 dark:bg-[#171717]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-xs font-black uppercase tracking-wider sm:text-sm">
              <ShieldCheck className="h-5 w-5" />
              <span>INTEGRITY VERIFIED</span>
            </div>
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border-3 border-[#171717] bg-white text-xl font-black shadow-[3px_3px_0_#171717] transition-transform group-hover:translate-x-2 dark:border-[#000000] dark:shadow-[3px_3px_0_#000000]">
              →
            </div>
          </div>
        </div>
      </section>

      {/* 02 CODEMATES PANEL (Touches extreme right edge) */}
      <section
        onClick={() => setTab('codemates')}
        onMouseEnter={() => setHovered('codemates')}
        onMouseLeave={() => setHovered(null)}
        className={`group relative flex min-h-[420px] md:min-h-full cursor-pointer flex-col justify-between bg-[#ffd84d] p-8 sm:p-12 lg:p-16 xl:p-20 text-[#171717] overflow-hidden transition-all duration-500 ease-in-out ${
          isCodeMatesDull
            ? 'grayscale-[40%] opacity-70 brightness-[0.97]'
            : hovered === 'codemates'
            ? 'brightness-105'
            : ''
        }`}
      >
        {/* Soft grey tint overlay when dull */}
        <div
          className={`pointer-events-none absolute inset-0 bg-[#171717]/5 dark:bg-black/15 transition-opacity duration-500 ease-in-out ${
            isCodeMatesDull ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Top Badges */}
        <div className="flex items-center justify-between">
          <span className="rounded-2xl border-3 border-[#171717] bg-white px-4 py-1.5 font-mono text-sm font-black sm:text-base dark:border-[#000000] shadow-[2px_2px_0_#171717] dark:shadow-[2px_2px_0_#000000]">
            02
          </span>
          <span className="rounded-full border-2 border-[#171717] bg-[#ff57ce] px-4 py-1.5 text-xs font-black uppercase tracking-wider text-white dark:border-[#000000]">
            MULTIPLAYER
          </span>
        </div>

        {/* Center Typography & Description */}
        <div className="my-auto py-10">
          <h1 className="font-display text-6xl uppercase leading-none tracking-tight sm:text-7xl lg:text-8xl xl:text-9xl text-[#171717]">
            CODEMATES
          </h1>
          <p className="mt-5 max-w-xl text-base font-bold leading-relaxed text-[#171717]/90 sm:text-lg lg:text-xl">
            Drop into a live shared Monaco editor with your crew. Solve concurrent challenges, run instant tests, and climb the room ranks.
          </p>
        </div>

        {/* Bottom Realtime Bar & Arrow Button */}
        <div>
          <div className="mb-6 h-1 w-full bg-[#171717]/80 dark:bg-[#171717]" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-xs font-black uppercase tracking-wider sm:text-sm">
              <Zap className="h-5 w-5 fill-current" />
              <span>REALTIME WEBSOCKETS</span>
            </div>
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border-3 border-[#171717] bg-white text-xl font-black shadow-[3px_3px_0_#171717] transition-transform group-hover:translate-x-2 dark:border-[#000000] dark:shadow-[3px_3px_0_#000000]">
              →
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
