'use client'

import { useState } from 'react'
import {
  Trophy,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Search,
  CheckCircle2,
  Calendar,
  Clock,
  Video,
  ExternalLink,
  Code2,
  Sparkles,
  Send,
  X,
  Zap,
  ArrowLeft,
} from 'lucide-react'
import { useNavigation } from '@/lib/navigation'
import { useNotifications } from '@/lib/notifications'
import { useAuth } from '@/lib/auth'
import { portalRoleFor, portalRoleForUser } from '@/lib/portal'

interface StudentCandidate {
  id: string
  rank: number
  name: string
  github: string
  avatar: string
  score: number
  round1Status: 'PASSED' | 'FLAGGED_REVIEW'
  aiConfidenceScore: number // 0 to 100% (High = Organic Human, Low/Flagged = AI Generated)
  isAIGenerated: boolean
  detectedEmojis: string[]
  flaggedCommentCount: number
  winnowingOverlap: number
  specialty: string
  contactStatus: 'PENDING' | 'INVITATION_SENT' | 'ACCEPTED'
  invitedAt?: string
  scheduledTime?: string
}

const INITIAL_STUDENTS: StudentCandidate[] = [
  {
    id: 'cand-1',
    rank: 1,
    name: 'Maya Chen',
    github: 'mayachen-dev',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    score: 98,
    round1Status: 'PASSED',
    aiConfidenceScore: 98.5,
    isAIGenerated: false,
    detectedEmojis: [],
    flaggedCommentCount: 0,
    winnowingOverlap: 18.2,
    specialty: 'Senior Fullstack & Platform Architecture',
    contactStatus: 'INVITATION_SENT',
    invitedAt: '15 mins ago',
    scheduledTime: 'Tomorrow, 2:00 PM EST',
  },
  {
    id: 'cand-2',
    rank: 2,
    name: 'Priya Sharma',
    github: 'priya-systems',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    score: 96,
    round1Status: 'PASSED',
    aiConfidenceScore: 96.0,
    isAIGenerated: false,
    detectedEmojis: [],
    flaggedCommentCount: 0,
    winnowingOverlap: 21.4,
    specialty: 'Distributed Systems & Cloud Telemetry',
    contactStatus: 'PENDING',
  },
  {
    id: 'cand-3',
    rank: 3,
    name: 'Marcus Vance',
    github: 'mvance-core',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    score: 94,
    round1Status: 'PASSED',
    aiConfidenceScore: 94.5,
    isAIGenerated: false,
    detectedEmojis: [],
    flaggedCommentCount: 0,
    winnowingOverlap: 24.8,
    specialty: 'Rust / Go Infrastructure & Concurrency',
    contactStatus: 'PENDING',
  },
  {
    id: 'cand-4',
    rank: 4,
    name: 'Jordan Lee',
    github: 'jordan-lee99',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    score: 91,
    round1Status: 'PASSED',
    aiConfidenceScore: 92.0,
    isAIGenerated: false,
    detectedEmojis: [],
    flaggedCommentCount: 1,
    winnowingOverlap: 29.5,
    specialty: 'Fullstack TypeScript & Next.js Performance',
    contactStatus: 'PENDING',
  },
  {
    id: 'cand-5',
    rank: 5,
    name: 'Alex Rivera',
    github: 'arivera-campus',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80',
    score: 88,
    round1Status: 'FLAGGED_REVIEW',
    aiConfidenceScore: 42.0,
    isAIGenerated: true,
    detectedEmojis: ['🚀', '✨', '🤖'],
    flaggedCommentCount: 5,
    winnowingOverlap: 84.5,
    specialty: 'Frontend Engineering & React UI',
    contactStatus: 'PENDING',
  },
]

export function RecruiterPortal() {
  const { user } = useAuth()
  const { setTab } = useNavigation()
  const { triggerRound2Notification, setActiveRole } = useNotifications()
  const portalRole = portalRoleForUser(user) || portalRoleFor(user?.email)

  const [students, setStudents] = useState<StudentCandidate[]>(INITIAL_STUDENTS)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'ALL' | 'VERIFIED' | 'FLAGGED'>('ALL')
  const [selectedStudentForContact, setSelectedStudentForContact] = useState<StudentCandidate | null>(null)
  const [selectedStudentForAudit, setSelectedStudentForAudit] = useState<StudentCandidate | null>(null)

  // Modal contact fields
  const [meetingDate, setMeetingDate] = useState('Tomorrow, 4:00 PM EST')
  const [customInviteNote, setCustomInviteNote] = useState(
    'Congratulations on completing Round 1! We would love to invite you to Round 2 for a 1-on-1 technical systems discussion and live mentorship session.'
  )
  const [contactSuccessToast, setContactSuccessToast] = useState<string | null>(null)

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.github.toLowerCase().includes(searchQuery.toLowerCase())
    if (filterType === 'VERIFIED') return matchesSearch && !s.isAIGenerated
    if (filterType === 'FLAGGED') return matchesSearch && s.isAIGenerated
    return matchesSearch
  })

  const handleDispatchRound2 = () => {
    if (!selectedStudentForContact) return

    const studentId = selectedStudentForContact.id
    const studentName = selectedStudentForContact.name

    // Update student state to INVITATION_SENT
    setStudents((prev) =>
      prev.map((s) =>
        s.id === studentId
          ? {
              ...s,
              contactStatus: 'INVITATION_SENT',
              invitedAt: 'Just now',
              scheduledTime: meetingDate,
            }
          : s
      )
    )

    // Trigger targeted in-app notification for candidate & mentor
    triggerRound2Notification('candidate', studentName, studentId, {
      subtitle: `Invited to Round 2 by recruiter for ${meetingDate}.`,
      meetingId: `mentorship-${studentId.slice(0, 8)}`,
    })
    setActiveRole('mentor')

    setContactSuccessToast(`Round 2 invitation sent to ${studentName}! Video mentorship meeting room generated.`)
    setTimeout(() => setContactSuccessToast(null), 5000)

    setSelectedStudentForContact(null)
  }

  return (
    <div className="grid-paper min-h-[calc(100vh-65px)] pb-16 pt-8">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Top Recruiter Header */}
        <div className="mb-6 flex flex-col justify-between gap-4 border-b-2 border-[#171717] pb-5 transition-colors sm:flex-row sm:items-center dark:border-[#2e323b]">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-2 py-0.5 text-[10px] font-black uppercase text-[#171717] dark:border-[#000000]">
                CAMPUS RECRUITER & MENTOR PORTAL
              </span>
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Round 1 Assessments Concluded
              </span>
            </div>
            <h1 className="font-display text-4xl uppercase tracking-tight text-[#171717] sm:text-5xl dark:text-[#f4f4f7]">
              Shortlisted Candidates
            </h1>
            <p className="mt-1 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
              Review ranked candidates who passed Round 1, inspect AI provenance confidence scores, and dispatch Round 2 mentorship interviews.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab(portalRole ? 'portal' : 'home')}
              className="btn-neo btn-neo-paper text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {portalRole ? 'Back to Portal' : 'Back to Home'}
            </button>
          </div>
        </div>

        {/* Contact Dispatch Toast Alert */}
        {contactSuccessToast && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border-3 border-[#171717] bg-[#6ee56b] p-4 text-xs font-black text-[#171717] shadow-hard dark:border-[#000000]">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              <span>{contactSuccessToast}</span>
            </div>
            <button
              onClick={() => {
                setActiveRole('mentor')
                setTab('mentorship')
              }}
              className="btn-neo btn-neo-ink px-3 py-1 text-[10px] flex items-center gap-1"
            >
              <Video className="h-3 w-3" /> Enter Call Room
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[4px_4px_0_#000000]">
            <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">
              Round 1 Passed
            </div>
            <div className="mt-1 font-display text-3xl text-[#171717] dark:text-[#f4f4f7]">
              {students.length} Candidates
            </div>
            <div className="mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              Ranked by Test Performance
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#171717] bg-[#ffd84d] p-4 shadow-hard text-[#171717] dark:border-[#000000] dark:shadow-[4px_4px_0_#000000]">
            <div className="text-[10px] font-black uppercase text-[#171717]/80">
              Top Ranked Score
            </div>
            <div className="mt-1 font-display text-3xl">
              98 / 100
            </div>
            <div className="mt-1 text-[10px] font-black">
              Maya Chen (#1 Platinum)
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[4px_4px_0_#000000]">
            <div className="text-[10px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">
              Average AI Confidence
            </div>
            <div className="mt-1 font-display text-3xl text-emerald-600 dark:text-emerald-400">
              95.2%
            </div>
            <div className="mt-1 text-[10px] font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
              Verified Organic Codebase
            </div>
          </div>

          <div className="rounded-2xl border-2 border-[#171717] bg-[#ff6b6b] p-4 text-white shadow-hard dark:border-[#000000] dark:shadow-[4px_4px_0_#000000]">
            <div className="text-[10px] font-black uppercase text-white/80">
              AI / Plagiarism Flagged
            </div>
            <div className="mt-1 font-display text-3xl">
              1 Candidate
            </div>
            <div className="mt-1 text-[10px] font-black text-white/90">
              Alex Rivera (84.5% Overlap)
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-hard sm:flex-row sm:items-center sm:justify-between dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[4px_4px_0_#000000]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#171717]/40 dark:text-[#a1a1aa]/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate name, engineering specialty, or GitHub handle..."
              className="w-full rounded-xl border-2 border-[#171717] bg-[#fffaf0] py-2 pl-9 pr-3 text-xs font-bold text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000]"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilterType('ALL')}
              className={`rounded-xl border border-[#171717] px-3 py-1.5 text-xs font-black uppercase transition-all dark:border-[#2e323b] ${
                filterType === 'ALL'
                  ? 'bg-[#171717] text-white shadow-[2px_2px_0_#ffd84d] dark:bg-[#ffd84d] dark:text-[#171717]'
                  : 'bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7]'
              }`}
            >
              All Ranked ({students.length})
            </button>
            <button
              onClick={() => setFilterType('VERIFIED')}
              className={`rounded-xl border border-[#171717] px-3 py-1.5 text-xs font-black uppercase transition-all dark:border-[#2e323b] ${
                filterType === 'VERIFIED'
                  ? 'bg-[#171717] text-white shadow-[2px_2px_0_#6ee56b] dark:bg-[#6ee56b] dark:text-[#171717]'
                  : 'bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7]'
              }`}
            >
              Verified Human ({students.filter((s) => !s.isAIGenerated).length})
            </button>
            <button
              onClick={() => setFilterType('FLAGGED')}
              className={`rounded-xl border border-[#171717] px-3 py-1.5 text-xs font-black uppercase transition-all dark:border-[#2e323b] ${
                filterType === 'FLAGGED'
                  ? 'bg-[#171717] text-white shadow-[2px_2px_0_#ff6b6b] dark:bg-[#ff6b6b] dark:text-white'
                  : 'bg-white text-[#171717] dark:bg-[#1c1f26] dark:text-[#f4f4f7]'
              }`}
            >
              AI Flagged ({students.filter((s) => s.isAIGenerated).length})
            </button>
          </div>
        </div>

        {/* Candidate List (Ranked based on score) */}
        <div className="space-y-4">
          {filteredStudents.map((candidate) => (
            <div
              key={candidate.id}
              className={`rounded-2xl border-3 border-[#171717] bg-white p-5 shadow-hard transition-all hover:-translate-y-0.5 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[5px_5px_0_#000000] ${
                candidate.rank === 1 ? 'border-amber-400 dark:border-amber-400' : ''
              }`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                {/* Candidate Info & Avatar */}
                <div className="flex items-start gap-4">
                  {/* Rank Badge */}
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-[#171717] font-display text-xl shadow-[2px_2px_0_#171717] dark:border-[#000000] dark:shadow-[2px_2px_0_#000000] ${
                      candidate.rank === 1
                        ? 'bg-[#ffd84d] text-[#171717]'
                        : candidate.rank === 2
                        ? 'bg-[#39d5c8] text-[#171717]'
                        : candidate.rank === 3
                        ? 'bg-[#ff57ce] text-white'
                        : 'bg-[#f4f4f7] text-[#171717] dark:bg-[#252830] dark:text-[#f4f4f7]'
                    }`}
                  >
                    #{candidate.rank}
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                        {candidate.name}
                      </h3>
                      <span className="rounded-md border border-[#171717] bg-[#fffaf0] px-2 py-0.5 font-mono text-[10px] font-black text-[#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#a1a1aa]">
                        @{candidate.github}
                      </span>
                      {candidate.contactStatus === 'INVITATION_SENT' && (
                        <span className="rounded-full border border-emerald-600 bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Round 2 Dispatched
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                      {candidate.specialty}
                    </p>

                    {/* Score and Metric Badges */}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-[#171717] bg-[#ffd84d] px-2 py-0.5 font-mono text-xs font-black text-[#171717] dark:border-[#000000]">
                        Round 1 Score: {candidate.score} / 100
                      </span>

                      {/* AI Confidence Badge */}
                      <span
                        className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-xs font-black ${
                          candidate.isAIGenerated
                            ? 'border-rose-400 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300'
                            : 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                        }`}
                      >
                        {candidate.isAIGenerated ? (
                          <AlertTriangle className="h-3 w-3 text-rose-500" />
                        ) : (
                          <ShieldCheck className="h-3 w-3 text-emerald-600" />
                        )}
                        <span>
                          AI Confidence: {candidate.aiConfidenceScore}%{' '}
                          {candidate.isAIGenerated ? '(AI Flagged)' : '(Organic Human)'}
                        </span>
                      </span>

                      {/* Detected Emojis Badge */}
                      {candidate.detectedEmojis.length > 0 && (
                        <span className="rounded-lg border border-amber-400 bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                          AI Emojis in Code: {candidate.detectedEmojis.join(' ')}
                        </span>
                      )}

                      <span className="text-[11px] font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                        AST Token Overlap: {candidate.winnowingOverlap}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions: Contact for Round 2 & Inspect Audit */}
                <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-end">
                  <button
                    onClick={() => setSelectedStudentForContact(candidate)}
                    className="btn-neo btn-neo-lemon py-2 px-4 text-xs flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>
                      {candidate.contactStatus === 'INVITATION_SENT'
                        ? 'Resend Round 2 Call'
                        : 'Contact for Round 2'}
                    </span>
                  </button>

                  <button
                    onClick={() => setSelectedStudentForAudit(candidate)}
                    className="btn-neo btn-neo-paper py-2 px-3 text-xs flex items-center gap-1.5"
                  >
                    <Zap className="h-3.5 w-3.5 text-[#6d73ff]" />
                    <span>Inspect Forensic Audit</span>
                  </button>

                  {candidate.scheduledTime && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Clock className="h-3 w-3" /> Scheduled: {candidate.scheduledTime}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          {filteredStudents.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[#171717]/30 p-12 text-center dark:border-white/20">
              <Trophy className="mx-auto h-8 w-8 text-[#171717]/30 dark:text-[#a1a1aa]/30" />
              <h3 className="mt-2 font-display text-xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                No Candidates Found
              </h3>
              <p className="mt-1 text-xs text-[#171717]/60 dark:text-[#a1a1aa]">
                Try adjusting your search query or status filter.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: CONTACT FOR ROUND 2 DISPATCH */}
      {selectedStudentForContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border-4 border-[#171717] bg-[#fffaf0] p-6 shadow-hard-lg dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[8px_8px_0_#000000]">
            <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 dark:border-white/10">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#ffd84d]">
                  <Video className="h-5 w-5 text-[#171717]" />
                </div>
                <div>
                  <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                    Dispatch Round 2 Mentorship
                  </h3>
                  <p className="text-[10px] font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                    Candidate: {selectedStudentForContact.name} (#{selectedStudentForContact.rank} Ranked)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForContact(null)}
                className="cursor-pointer rounded-lg border border-[#171717] bg-white p-1 hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-bold">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
                  Round 1 Result Summary
                </label>
                <div className="flex items-center justify-between rounded-xl border border-[#171717] bg-white p-3 dark:border-[#2e323b] dark:bg-[#1c1f26]">
                  <div>
                    <div className="font-display text-lg text-[#171717] dark:text-[#f4f4f7]">
                      {selectedStudentForContact.score} / 100 Score
                    </div>
                    <div className="text-[10px] text-[#171717]/60 dark:text-[#a1a1aa]">
                      Specialty: {selectedStudentForContact.specialty}
                    </div>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                      selectedStudentForContact.isAIGenerated
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    AI Confidence: {selectedStudentForContact.aiConfidenceScore}%
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
                  Proposed Meeting Schedule
                </label>
                <input
                  type="text"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full rounded-xl border-2 border-[#171717] bg-white p-2.5 text-xs font-bold text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                  placeholder="e.g. Tomorrow, 3:00 PM EST"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-black uppercase text-[#171717] dark:text-[#d4d4d8]">
                  Invitation Note to Candidate
                </label>
                <textarea
                  rows={3}
                  value={customInviteNote}
                  onChange={(e) => setCustomInviteNote(e.target.value)}
                  className="w-full rounded-xl border-2 border-[#171717] bg-white p-2.5 text-xs font-bold text-[#171717] outline-none shadow-[2px_2px_0_#171717] dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
                />
              </div>

              <div className="rounded-xl border border-[#171717]/20 bg-[#ffd84d]/30 p-3 text-[11px] text-[#171717] dark:text-[#ffd84d]">
                <span className="font-black">Direct Platform Link:</span> Candidate will receive an instant in-app notification connecting them directly to the in-platform live video call room (`/mentorship`).
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setSelectedStudentForContact(null)}
                className="btn-neo btn-neo-paper flex-1 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchRound2}
                className="btn-neo btn-neo-lemon flex-1 py-2 text-xs flex items-center justify-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send Round 2 Invite</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: INSPECT FORENSIC AUDIT */}
      {selectedStudentForAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl border-4 border-[#171717] bg-white p-6 shadow-hard-lg dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[8px_8px_0_#000000]">
            <div className="flex items-center justify-between border-b-2 border-[#171717] pb-3 dark:border-white/10">
              <div>
                <h3 className="font-display text-2xl uppercase text-[#171717] dark:text-[#f4f4f7]">
                  Forensic Code Audit: {selectedStudentForAudit.name}
                </h3>
                <p className="text-[10px] font-bold text-[#171717]/60 dark:text-[#a1a1aa]">
                  Copydetect AST Winnowing & AI-Code Heuristic Report
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentForAudit(null)}
                className="cursor-pointer rounded-lg border border-[#171717] bg-white p-1 hover:bg-rose-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs font-bold">
              {/* Confidence Meter */}
              <div className="rounded-xl border border-[#171717]/20 p-3 bg-[#fffaf0] dark:bg-[#1c1f26]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa]">
                    AI Provenance Confidence Score
                  </span>
                  <span
                    className={`font-mono text-sm font-black ${
                      selectedStudentForAudit.isAIGenerated
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {selectedStudentForAudit.aiConfidenceScore}%{' '}
                    {selectedStudentForAudit.isAIGenerated ? 'AI Generated' : 'Organic Human'}
                  </span>
                </div>
                <div className="mt-2 h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      selectedStudentForAudit.isAIGenerated ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${selectedStudentForAudit.aiConfidenceScore}%` }}
                  />
                </div>
              </div>

              {/* Detected Emojis */}
              <div className="rounded-xl border border-[#171717]/20 p-3">
                <span className="text-[11px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] block mb-1">
                  Decorative Emojis in Code / Comments:
                </span>
                {selectedStudentForAudit.detectedEmojis.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedStudentForAudit.detectedEmojis.map((em, i) => (
                      <span
                        key={i}
                        className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 font-mono text-xs dark:bg-slate-900"
                      >
                        {em} Flagged
                      </span>
                    ))}
                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                      Generative LLMs frequently inject emojis into comments and step summaries.
                    </p>
                  </div>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓ Clean: Zero generative emojis detected in source code.
                  </span>
                )}
              </div>

              {/* AST Overlap Details */}
              <div className="rounded-xl border border-[#171717]/20 p-3">
                <span className="text-[11px] font-black uppercase text-[#171717]/60 dark:text-[#a1a1aa] block mb-1">
                  AST Token Winnowing Overlap vs ChatGPT Benchmark:
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm">
                    {selectedStudentForAudit.winnowingOverlap}% Structural Overlap
                  </span>
                  <span className="text-[10px] uppercase font-black text-[#171717]/60">
                    Threshold: &gt; 65% Flagged
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedStudentForAudit(null)}
                className="btn-neo btn-neo-ink px-4 py-1.5 text-xs"
              >
                Close Audit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
