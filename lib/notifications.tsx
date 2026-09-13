'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { isMentor } from '@/lib/portal'

export type UserRole = 'candidate' | 'mentor'

export interface AppNotification {
  id: string
  type: 'round2_mentorship' | 'assessment_passed' | 'interview_scheduled'
  title: string
  subtitle: string
  details?: string
  targetRole: UserRole // Who should see this notification
  recipientId?: string // Authenticated recipient user ID
  senderId?: string
  senderName: string
  senderRole: string
  candidateName: string
  mentorName: string
  meetingId: string
  timestamp: string
  isLive: boolean
  read: boolean
}

/**
 * No unauthenticated seeded notifications.
 *
 * Everything in the bell is derived from real rows or authenticated targeted events.
 */
const INITIAL_NOTIFICATIONS: AppNotification[] = []

/** A mentorship slot booked for the signed-in student. */
interface MentorshipSlot {
  id: string
  position_id: string
  mentor_email: string
  student_id: string
  scheduled_at: string
  meeting_id: string
  status: string
  positions?: { role: string } | null
}

interface NotificationContextType {
  notifications: AppNotification[]
  activeRole: UserRole
  setActiveRole: (role: UserRole) => void
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  triggerRound2Notification: (
    role?: UserRole,
    customCandidate?: string,
    targetRecipientId?: string,
    customOptions?: {
      title?: string
      subtitle?: string
      details?: string
      meetingId?: string
      mentorName?: string
      senderName?: string
    }
  ) => Promise<void>
  deleteNotification: (id: string) => void
  joinMeeting: (meetingId: string) => void
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: INITIAL_NOTIFICATIONS,
  activeRole: 'candidate',
  setActiveRole: () => {},
  unreadCount: 0,
  markAsRead: () => {},
  markAllAsRead: () => {},
  triggerRound2Notification: async () => {},
  deleteNotification: () => {},
  joinMeeting: () => {},
})

const STORAGE_KEY = 'hiringmates_notifications_v2'
const ROLE_KEY = 'hiringmates_active_role_v1'
const SLOT_READ_KEY = 'hiringmates_read_slots_v1'

/**
 * Extracts the user's active session token and formats standard authorization headers.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabaseBrowserClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      }
    }
  } catch {
    // fallback
  }
  return { 'Content-Type': 'application/json' }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS)
  const [activeRole, setActiveRoleState] = useState<UserRole>('candidate')
  const { user } = useAuth()

  // Mentorship slots a mentor has booked for this account
  const [slots, setSlots] = useState<MentorshipSlot[]>([])
  const [readSlotIds, setReadSlotIds] = useState<string[]>([])

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        setNotifications(JSON.parse(saved))
      }
      const savedRole = localStorage.getItem(ROLE_KEY) as UserRole | null
      if (savedRole === 'candidate' || savedRole === 'mentor') {
        if (savedRole === 'mentor' && user?.email && !isMentor(user.email)) {
          setActiveRoleState('candidate')
        } else {
          setActiveRoleState(savedRole)
        }
      }
    } catch (e) {
      console.warn('Could not load notifications from localStorage', e)
    }
  }, [user?.email])

  // Automatically lock role to 'candidate' for logged-in students
  useEffect(() => {
    if (user?.email) {
      if (isMentor(user.email)) {
        setActiveRoleState('mentor')
      } else {
        setActiveRoleState('candidate')
      }
    }
  }, [user?.email])

  // Slot notifications read state tracking
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(SLOT_READ_KEY)
      if (saved) setReadSlotIds(JSON.parse(saved))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(SLOT_READ_KEY, JSON.stringify(readSlotIds))
    } catch {
      /* ignore */
    }
  }, [readSlotIds])

  // Sync to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    } catch {
      // ignore
    }
  }, [notifications])

  // Load user-specific notifications from server with Bearer auth header
  const loadServerNotifications = useCallback(async () => {
    if (!user) return
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/notifications', { headers })
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications)
        }
      }
    } catch {
      // fallback
    }
  }, [user])

  // Real mentorship slots booked for this account with Bearer auth header
  useEffect(() => {
    if (!user) {
      setSlots([])
      return
    }
    let cancelled = false

    const loadSlots = async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch('/api/portal/slots', { headers })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setSlots(data.slots ?? [])
      } catch {
        /* keep whatever we already have */
      }
    }
    void loadSlots()

    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`mentorship-slots-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mentorship_slots',
          filter: `student_id=eq.${user.id}`,
        },
        () => {
          void loadSlots()
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [user])

  // TARGETED USER REALTIME CHANNEL:
  // Only listens to channel specific to THIS user's ID ('user-notifications:${user.id}').
  // Global broadcast leaking is eliminated.
  useEffect(() => {
    if (!user?.id) return

    void loadServerNotifications()

    const supabase = getSupabaseBrowserClient()
    const userChannel = supabase.channel(`user-notifications:${user.id}`)

    userChannel
      .on('broadcast', { event: 'new-notification' }, ({ payload }: { payload: any }) => {
        if (payload?.notification) {
          // Verify recipient: only accept if targeted to this user
          if (payload.notification.recipientId && payload.notification.recipientId !== user.id) {
            return
          }
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === payload.notification.id)
            if (exists) return prev
            return [payload.notification, ...prev]
          })
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => {
          void loadServerNotifications()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(userChannel)
    }
  }, [user?.id, loadServerNotifications])

  const setActiveRole = useCallback(
    (role: UserRole) => {
      // Students cannot switch to mentor role
      if (user?.email && !isMentor(user.email) && role === 'mentor') {
        return
      }
      setActiveRoleState(role)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(ROLE_KEY, role)
        } catch {
          // ignore
        }
      }
    },
    [user?.email],
  )

  // Real bookings surfaced as notifications for both candidates and mentors
  const slotNotifications: AppNotification[] = slots
    .filter((s) => s.status === 'scheduled')
    .map((s) => {
      const isMyHostedSlot = Boolean(
        user?.email && s.mentor_email.toLowerCase() === user.email.toLowerCase(),
      )
      return {
        id: `slot-${s.id}`,
        type: 'round2_mentorship',
        title: isMyHostedSlot
          ? 'Mentorship Session Scheduled'
          : 'Round 2 Mentorship Call Booked',
        subtitle: `${s.positions?.role ?? 'Mentorship session'} · ${new Date(
          s.scheduled_at,
        ).toLocaleString()}`,
        details: isMyHostedSlot
          ? 'You scheduled a 1-on-1 session. Click Enter Meeting Room to host the candidate.'
          : 'Your mentor booked a 1-on-1 session. Join the private room at the scheduled time.',
        targetRole: isMyHostedSlot ? 'mentor' : 'candidate',
        recipientId: isMyHostedSlot ? user?.id : s.student_id,
        senderName: s.mentor_email,
        senderRole: 'Mentor',
        candidateName: '',
        mentorName: s.mentor_email,
        meetingId: s.meeting_id,
        timestamp: new Date(s.scheduled_at).toLocaleString(),
        isLive: true,
        read: readSlotIds.includes(s.id),
      }
    })

  // Deduplicate and combine
  const allNotifications = [
    ...slotNotifications,
    ...notifications.filter((n) => !n.id.startsWith('slot-')),
  ]

  // Filtered unread count for current active role
  const unreadCount = allNotifications.filter(
    (n) => n.targetRole === activeRole && !n.read
  ).length

  const markAsRead = useCallback(async (id: string) => {
    if (id.startsWith('slot-')) {
      const slotId = id.slice('slot-'.length)
      setReadSlotIds((prev) =>
        prev.includes(slotId) ? prev : [...prev, slotId],
      )
      return
    }

    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )

    try {
      const headers = await getAuthHeaders()
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id }),
      })
    } catch {
      // ignore
    }
  }, [])

  const joinMeeting = useCallback((meetingId: string) => {
    if (typeof window === 'undefined') return
    const url = `/mentorship?meeting=${encodeURIComponent(meetingId)}`
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.targetRole === activeRole ? { ...n, read: true } : n))
    )

    try {
      const headers = await getAuthHeaders()
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ markAll: true }),
      })
    } catch {
      // ignore
    }
  }, [activeRole])

  const deleteNotification = useCallback(async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))

    try {
      const headers = await getAuthHeaders()
      await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      })
    } catch {
      // ignore
    }
  }, [])

  // Trigger targeted notification with proper authentication headers and channel dispatch
  const triggerRound2Notification = useCallback(
    async (
      targetRole: UserRole = activeRole,
      customCandidate: string = 'Maya Chen',
      targetRecipientId?: string,
      customOptions?: {
        title?: string
        subtitle?: string
        details?: string
        meetingId?: string
        mentorName?: string
        senderName?: string
      }
    ) => {
      // Target the specified recipient, or the active user if self-testing
      const recipientId = targetRecipientId || user?.id
      if (!recipientId) return

      const newId = `notif-r2-${Date.now()}`
      const newNotif: AppNotification = {
        id: newId,
        type: 'round2_mentorship',
        title:
          customOptions?.title ||
          (targetRole === 'candidate'
            ? 'Incoming Round 2 Mentorship Call'
            : 'Candidate Waiting in Round 2 Room'),
        subtitle:
          customOptions?.subtitle ||
          (targetRole === 'candidate'
            ? `Mentor ${customOptions?.mentorName || 'Sarah Vance'} opened the live mentorship room.`
            : `${customCandidate} entered the Round 2 interview room.`),
        details:
          customOptions?.details ||
          '1-on-1 technical systems discussion, architecture review, and live feedback.',
        targetRole,
        recipientId,
        senderId: user?.id,
        senderName:
          customOptions?.senderName ||
          (targetRole === 'candidate' ? customOptions?.mentorName || 'Sarah Vance' : customCandidate),
        senderRole:
          targetRole === 'candidate'
            ? 'Staff Platform Engineer & Lead Mentor'
            : 'Software Engineer Candidate',
        candidateName: customCandidate,
        mentorName: customOptions?.mentorName || 'Sarah Vance',
        meetingId: customOptions?.meetingId || 'mentorship-r2-northstar',
        timestamp: 'Just now',
        isLive: true,
        read: false,
      }

      // If targeting self (e.g. simulate invite button), update state immediately
      if (recipientId === user?.id) {
        setNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)])
      }

      // 1. Post to authenticated /api/notifications with Bearer token
      try {
        const headers = await getAuthHeaders()
        const res = await fetch('/api/notifications', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            recipientId,
            recipientRole: targetRole,
            title: newNotif.title,
            subtitle: newNotif.subtitle,
            details: newNotif.details,
            meetingId: newNotif.meetingId,
            candidateName: newNotif.candidateName,
            mentorName: newNotif.mentorName,
            isLive: true,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.notification?.id) {
            newNotif.id = data.notification.id
          }
        }
      } catch (err) {
        console.warn('Could not persist notification via API:', err)
      }

      // 2. Broadcast EXCLUSIVELY to target recipient's channel
      try {
        const supabase = getSupabaseBrowserClient()
        const recipientChannel = supabase.channel(`user-notifications:${recipientId}`)
        recipientChannel.send({
          type: 'broadcast',
          event: 'new-notification',
          payload: { notification: newNotif },
        })
      } catch {
        // ignore
      }
    },
    [activeRole, user?.id]
  )

  return (
    <NotificationContext.Provider
      value={{
        notifications: allNotifications,
        activeRole,
        setActiveRole,
        unreadCount,
        markAsRead,
        markAllAsRead,
        triggerRound2Notification,
        deleteNotification,
        joinMeeting,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
