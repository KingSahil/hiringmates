'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'

export type UserRole = 'candidate' | 'mentor'

export interface AppNotification {
  id: string
  type: 'round2_mentorship' | 'assessment_passed' | 'interview_scheduled'
  title: string
  subtitle: string
  details?: string
  targetRole: UserRole // Who should see this notification
  senderName: string
  senderRole: string
  candidateName: string
  mentorName: string
  meetingId: string
  timestamp: string
  isLive: boolean
  read: boolean
}

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-round2-candidate',
    type: 'round2_mentorship',
    title: 'Round 2: Mentorship Session Live',
    subtitle: 'Mentor Sarah Vance (Staff Platform Eng) has invited you to Round 2',
    details: 'System Design & 1-on-1 Mentorship Deep Dive. Join the in-platform video room to begin.',
    targetRole: 'candidate',
    senderName: 'Sarah Vance',
    senderRole: 'Staff Platform Engineer & Lead Mentor',
    candidateName: 'Maya Chen',
    mentorName: 'Sarah Vance',
    meetingId: 'mentorship-r2-northstar',
    timestamp: 'Just now',
    isLive: true,
    read: false,
  },
  {
    id: 'notif-round2-mentor',
    type: 'round2_mentorship',
    title: 'Round 2: Candidate Ready for Mentorship',
    subtitle: 'Maya Chen passed Round 1 Technical Assessment (Score: 96/100 · Integrity: Clear)',
    details: 'Candidate is in the queue for Round 2 Mentorship & Technical Systems Review. Join call to host session.',
    targetRole: 'mentor',
    senderName: 'HiringMates System',
    senderRole: 'Assessment Engine',
    candidateName: 'Maya Chen',
    mentorName: 'Sarah Vance',
    meetingId: 'mentorship-r2-northstar',
    timestamp: '2 min ago',
    isLive: true,
    read: false,
  },
]

interface NotificationContextType {
  notifications: AppNotification[]
  activeRole: UserRole
  setActiveRole: (role: UserRole) => void
  unreadCount: number
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  triggerRound2Notification: (role?: UserRole, customCandidate?: string) => void
  deleteNotification: (id: string) => void
}

const NotificationContext = createContext<NotificationContextType>({
  notifications: INITIAL_NOTIFICATIONS,
  activeRole: 'candidate',
  setActiveRole: () => {},
  unreadCount: 1,
  markAsRead: () => {},
  markAllAsRead: () => {},
  triggerRound2Notification: () => {},
  deleteNotification: () => {},
})

const STORAGE_KEY = 'hiringmates_notifications_v1'
const ROLE_KEY = 'hiringmates_active_role_v1'

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS)
  const [activeRole, setActiveRoleState] = useState<UserRole>('candidate')

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
        setActiveRoleState(savedRole)
      }
    } catch (e) {
      console.warn('Could not load notifications from localStorage', e)
    }
  }, [])

  // Sync to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
    } catch {
      // ignore
    }
  }, [notifications])

  // Realtime Supabase broadcast listener for cross-tab or cross-user notifications
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase.channel('hiringmates-round2-alerts')

    channel
      .on('broadcast', { event: 'new-round2-session' }, ({ payload }: { payload: any }) => {
        if (payload && payload.notification) {
          setNotifications((prev) => {
            const exists = prev.some((n) => n.id === payload.notification.id)
            if (exists) return prev
            return [payload.notification, ...prev]
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const setActiveRole = useCallback((role: UserRole) => {
    setActiveRoleState(role)
    if (typeof window !== 'undefined') {
      localStorage.setItem(ROLE_KEY, role)
    }
  }, [])

  // Filtered unread count for current active role
  const unreadCount = notifications.filter(
    (n) => n.targetRole === activeRole && !n.read
  ).length

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.targetRole === activeRole ? { ...n, read: true } : n))
    )
  }, [activeRole])

  const deleteNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const triggerRound2Notification = useCallback(
    (targetRole: UserRole = activeRole, customCandidate: string = 'Maya Chen') => {
      const newId = `notif-r2-${Date.now()}`
      const newNotif: AppNotification = {
        id: newId,
        type: 'round2_mentorship',
        title:
          targetRole === 'candidate'
            ? 'Incoming Round 2 Mentorship Call'
            : 'Candidate Waiting in Round 2 Room',
        subtitle:
          targetRole === 'candidate'
            ? 'Mentor Sarah Vance opened the live mentorship room.'
            : `${customCandidate} entered the Round 2 interview room.`,
        details: '1-on-1 technical systems discussion, architecture review, and live feedback.',
        targetRole,
        senderName: targetRole === 'candidate' ? 'Sarah Vance' : customCandidate,
        senderRole:
          targetRole === 'candidate'
            ? 'Staff Platform Engineer & Lead Mentor'
            : 'Software Engineer Candidate',
        candidateName: customCandidate,
        mentorName: 'Sarah Vance',
        meetingId: 'mentorship-r2-northstar',
        timestamp: 'Just now',
        isLive: true,
        read: false,
      }

      setNotifications((prev) => [newNotif, ...prev])

      // Broadcast to other tabs/sessions via Supabase Realtime
      try {
        const supabase = getSupabaseBrowserClient()
        supabase.channel('hiringmates-round2-alerts').send({
          type: 'broadcast',
          event: 'new-round2-session',
          payload: { notification: newNotif },
        })
      } catch {
        // ignore
      }
    },
    [activeRole]
  )

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        activeRole,
        setActiveRole,
        unreadCount,
        markAsRead,
        markAllAsRead,
        triggerRound2Notification,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
