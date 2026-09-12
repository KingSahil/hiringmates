'use client'

import { useState } from 'react'
import { ArrowRight, ArrowLeft, Check } from 'lucide-react'

export interface IntakeQuestion {
  id: string
  label: string
  type: 'text' | 'choice'
  options?: string[]
  placeholder?: string
}

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    id: 'role',
    label: 'What best describes you right now?',
    type: 'choice',
    options: [
      'Student or bootcamp',
      'Junior engineer',
      'Mid-level engineer',
      'Senior engineer',
      'Career switcher',
      'Something else',
    ],
  },
  {
    id: 'years',
    label: 'How long have you been writing code?',
    type: 'choice',
    options: ['Less than a year', '1 to 3 years', '3 to 6 years', 'More than 6 years'],
  },
  {
    id: 'stack',
    label: 'Which languages or tools do you reach for most?',
    type: 'text',
    placeholder: 'e.g. Python, TypeScript, Docker',
  },
  {
    id: 'goal',
    label: 'What kind of role are you aiming for?',
    type: 'text',
    placeholder: 'e.g. backend role on a product team',
  },
]

const CARD = 'rounded-xl border-2 border-[#171717] bg-[#fffaf0] p-5 shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[2px_2px_0_#000000]'
const BTN_DARK = 'border-2 border-[#171717] bg-[#6d73ff] px-4 py-1.5 text-xs font-black uppercase text-white shadow-[2px_2px_0_#171717] disabled:opacity-50 dark:border-[#2e323b] dark:shadow-[2px_2px_0_#000000]'
const BTN_LIGHT = 'rounded-xl border-2 border-[#171717] px-3 py-1.5 text-xs font-black uppercase dark:border-[#2e323b]'

interface IntakeFormProps {
  onSubmit: (answers: Record<string, string>) => Promise<void> | void
}

/**
 * Typeform-style intake: one question at a time with a progress bar. Shown while
 * extraction and profiling run in the background, so the wait feels purposeful.
 * Skipping is allowed — intake is context, not a gate.
 */
export function IntakeForm({ onSubmit }: IntakeFormProps) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const question = INTAKE_QUESTIONS[index]
  const value = answers[question.id] ?? ''
  const isLast = index === INTAKE_QUESTIONS.length - 1
  const done = Math.max(Object.keys(answers).length, index)
  const pct = Math.round((done / INTAKE_QUESTIONS.length) * 100)

  const finish = async () => {
    setBusy(true)
    await onSubmit(answers)
    setBusy(false)
  }

  const choose = (opt: string) => {
    setAnswers((a) => ({ ...a, [question.id]: opt }))
    if (!isLast) setTimeout(() => setIndex((i) => i + 1), 180)
  }

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#171717]/50 dark:text-[#f4f4f7]/50">
          A few quick questions
        </p>
        <p className="text-[10px] font-black uppercase text-[#171717]/50 dark:text-[#f4f4f7]/50">
          {index + 1} of {INTAKE_QUESTIONS.length}
        </p>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#171717]/10 dark:bg-[#2e323b]">
        <div className="h-full bg-[#6d73ff] transition-all" style={{ width: pct + '%' }} />
      </div>

      <p className="mt-4 font-display text-lg text-[#171717] dark:text-[#f4f4f7]">
        {question.label}
      </p>

      {question.type === 'choice' ? (
        <div className="mt-3 grid gap-2">
          {question.options?.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => choose(opt)}
              className={
                'rounded-lg border-2 px-3 py-2 text-left text-sm transition ' +
                (value === opt
                  ? 'border-[#6d73ff] bg-[#6d73ff]/10'
                  : 'border-[#171717]/20 hover:border-[#6d73ff] dark:border-[#2e323b]')
              }
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <input
          value={value}
          onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
          placeholder={question.placeholder}
          className="mt-3 w-full rounded-lg border-2 border-[#171717]/20 bg-white p-3 text-sm outline-none focus:border-[#6d73ff] dark:border-[#2e323b] dark:bg-[#0f1116]"
        />
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="text-[10px] font-black uppercase text-[#171717]/40 hover:text-[#171717] dark:text-[#f4f4f7]/40 dark:hover:text-[#f4f4f7]"
        >
          Skip
        </button>

        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className={'flex items-center gap-1 ' + BTN_LIGHT}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? finish : () => setIndex((i) => i + 1)}
            disabled={busy}
            className={'flex items-center gap-1 rounded-xl ' + BTN_DARK}
          >
            {isLast ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Done
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
