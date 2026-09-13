'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Bell, Video, CheckCircle2, UserCheck, Shield, X, Radio, ExternalLink } from 'lucide-react'
import { useNotifications, UserRole } from '@/lib/notifications'
import { useNavigation } from '@/lib/navigation'
import { useAuth } from '@/lib/auth'
import { isMentor } from '@/lib/portal'

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const {
    notifications,
    activeRole,
    setActiveRole,
    unreadCount,
    markAsRead,
    markAllAsRead,
    joinMeeting,
  } = useNotifications()
  const { setTab } = useNavigation()
  const { user, isAuthorized } = useAuth()
  const isUserMentor = isMentor(user?.email)
  const isStudentWorkflow = isAuthorized && !isUserMentor

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const roleNotifications = notifications.filter((n) => n.targetRole === activeRole)
  const hasLiveSession = roleNotifications.some((n) => n.isLive && !n.read)

  const handleJoinCall = (notifId: string) => {
    markAsRead(notifId)
    setIsOpen(false)
    const notif = notifications.find((n) => n.id === notifId)
    const query = notif?.meetingId ? `?meeting=${encodeURIComponent(notif.meetingId)}` : ''
    setTab('mentorship', query)
    if (notif?.meetingId) joinMeeting(notif.meetingId)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#171717] bg-white text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-[#ffd84d] hover:-translate-y-0.5 active:translate-y-0 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[2px_2px_0_#000000] dark:hover:bg-[#222630]"
        title="Notifications: Round 2 Mentorship"
        aria-label="Toggle notifications"
      >
        <Bell className="h-4 w-4" />

        {/* Pulsing indicator when live call is ready */}
        {hasLiveSession && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ff57ce] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ff57ce]" />
          </span>
        )}

        {/* Unread Counter Badge */}
        {unreadCount > 0 && !hasLiveSession && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-[#171717] bg-[#ffd84d] px-1 text-[9px] font-black text-[#171717] dark:border-black">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-[360px] max-w-[calc(100vw-32px)] sm:w-[410px] rounded-2xl border-3 border-[#171717] bg-[#fffaf0] p-4 text-[#171717] shadow-[6px_6px_0_#171717] z-50 animate-in fade-in zoom-in-95 duration-150 dark:border-[#2e323b] dark:bg-[#15171c] dark:text-[#f4f4f7] dark:shadow-[6px_6px_0_#000000]">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-[#171717]/15 pb-3 dark:border-[#2e323b]">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#ffd84d] text-[#171717]">
                <Bell className="h-3.5 w-3.5 fill-current" />
              </div>
              <h3 className="font-display text-lg uppercase tracking-wide">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full border border-[#171717] bg-[#39d5c8] px-2 py-0.2 text-[9px] font-black text-[#171717] dark:border-black">
                  {unreadCount} NEW
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="cursor-pointer text-[10px] font-black uppercase text-[#171717]/70 hover:text-[#171717] hover:underline dark:text-zinc-400 dark:hover:text-white"
                >
                  Mark read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="cursor-pointer rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Perspective / Role Switcher Tabs (Candidate vs Mentor) — hidden in student-authorized workflow */}
          {!isStudentWorkflow && (
            <div className="mt-3 rounded-xl border-2 border-[#171717] bg-white p-1 dark:border-[#2e323b] dark:bg-[#0c0d11]">
              <div className="mb-1 px-2 pt-1 text-[9px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-zinc-400 flex items-center justify-between">
                <span>View As Role:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold lowercase">
                  synced with platform
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => setActiveRole('candidate')}
                  className={`cursor-pointer flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black uppercase transition-all ${
                    activeRole === 'candidate'
                      ? 'border border-[#171717] bg-[#ffd84d] text-[#171717] shadow-[2px_2px_0_#171717] dark:border-black'
                      : 'text-[#171717]/70 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Candidate
                </button>
                <button
                  onClick={() => setActiveRole('mentor')}
                  className={`cursor-pointer flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-black uppercase transition-all ${
                    activeRole === 'mentor'
                      ? 'border border-[#171717] bg-[#39d5c8] text-[#171717] shadow-[2px_2px_0_#171717] dark:border-black'
                      : 'text-[#171717]/70 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  Mentor
                </button>
              </div>
            </div>
          )}

          {/* Notifications List */}
          <div className="mt-3 max-h-[360px] space-y-2.5 overflow-y-auto pr-1">
            {roleNotifications.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#171717]/30 p-6 text-center text-xs font-bold text-[#171717]/50 dark:border-zinc-700 dark:text-zinc-500">
                No active notifications for this role.
              </div>
            ) : (
              roleNotifications.map((notif) => {
                const isRound2 = notif.type === 'round2_mentorship'

                return (
                  <div
                    key={notif.id}
                    className={`relative rounded-xl border-2 border-[#171717] p-3.5 shadow-[3px_3px_0_#171717] transition-all dark:border-[#2e323b] dark:shadow-[3px_3px_0_#000000] ${
                      notif.read
                        ? 'bg-white/80 opacity-80 dark:bg-[#1c1f26]'
                        : 'bg-white dark:bg-[#1c1f26]'
                    }`}
                  >
                    {/* Live Badge & Timestamp */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {notif.isLive ? (
                          <span className="flex items-center gap-1 rounded-md border border-[#171717] bg-[#ff57ce] px-2 py-0.5 text-[9px] font-black uppercase text-white dark:border-black">
                            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
                            Live Call · Round 2
                          </span>
                        ) : (
                          <span className="rounded-md border border-[#171717] bg-[#ffd84d] px-1.5 py-0.5 text-[9px] font-black uppercase text-[#171717] dark:border-black">
                            Update
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-[#171717]/50 dark:text-zinc-400">
                        {notif.timestamp}
                      </span>
                    </div>

                    {/* Title & Body */}
                    <div className="mt-2">
                      <h4 className="font-display text-base uppercase leading-tight text-[#171717] dark:text-[#f4f4f7]">
                        {notif.title}
                      </h4>
                      <p className="mt-1 text-xs font-semibold leading-snug text-[#171717]/80 dark:text-zinc-300">
                        {notif.subtitle}
                      </p>
                      {notif.details && (
                        <p className="mt-1 text-[11px] text-[#171717]/60 dark:text-zinc-400">
                          {notif.details}
                        </p>
                      )}
                    </div>

                    {/* Round 2 Call Meta Pill */}
                    {Boolean(notif.meetingId) && (
                      <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#171717]/20 bg-[#fffaf0] px-2.5 py-1.5 text-[10px] font-bold text-[#171717] dark:border-zinc-700 dark:bg-[#15171c] dark:text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />
                          <span>
                            {activeRole === 'candidate'
                              ? `Mentor: ${notif.mentorName || notif.senderName}`
                              : `Candidate: ${notif.candidateName || 'Student'}`}
                          </span>
                        </div>
                        <span className="font-mono text-[9px] text-[#171717]/50 dark:text-zinc-500">
                          ID: {notif.meetingId}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="mt-3 flex items-center gap-2">
                      {Boolean(notif.meetingId) && (
                        <button
                          onClick={() => handleJoinCall(notif.id)}
                          className="cursor-pointer flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-[#171717] bg-[#ffd84d] py-2 text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] transition hover:brightness-105 active:translate-y-0.5 dark:border-black dark:shadow-[2px_2px_0_#000000]"
                        >
                          <Video className="h-3.5 w-3.5 fill-current" />
                          <span>
                            {activeRole === 'candidate'
                              ? 'Join Mentorship Call'
                              : 'Enter Meeting Room'}
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => markAsRead(notif.id)}
                        className="cursor-pointer rounded-lg border border-[#171717]/30 p-2 text-xs font-bold text-[#171717]/70 hover:bg-black/5 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-white/5"
                        title="Mark as read"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
