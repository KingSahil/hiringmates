import { NextResponse } from 'next/server'
import { getAuthenticatedUser, getSupabaseAdminClient } from '@/lib/portal-server'

/**
 * Targeted User Notifications API.
 *
 * All routes require valid authentication headers (Authorization: Bearer <token>)
 * or a valid session cookie. Endpoints strictly scope retrieval, insertion,
 * updating, and deletion to the authenticated user and target recipients.
 */

// GET: Fetch notifications intended for the authenticated user
export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required to access notifications.' },
      { status: 401 }
    )
  }

  const admin = getSupabaseAdminClient()

  // 1. Fetch custom notifications targeted to this user
  let customNotifications: any[] = []
  try {
    const { data, error } = await admin
      .from('user_notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })

    if (!error && data) {
      customNotifications = data.map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        subtitle: n.subtitle,
        details: n.details,
        targetRole: n.recipient_role,
        recipientId: n.recipient_id,
        senderId: n.sender_id,
        senderName: n.sender_name,
        senderRole: n.sender_role,
        candidateName: n.candidate_name,
        mentorName: n.mentor_name,
        meetingId: n.meeting_id,
        timestamp: new Date(n.created_at).toLocaleString(),
        isLive: n.is_live,
        read: n.read,
      }))
    }
  } catch {
    // Table may not yet be migrated in fresh environments; gracefully proceed
  }

  // 2. Fetch booked mentorship slots for this user
  let slotNotifications: any[] = []
  try {
    const { data: slots } = await admin
      .from('mentorship_slots')
      .select('*, positions(role)')
      .eq('student_id', user.id)
      .eq('status', 'scheduled')
      .order('scheduled_at', { ascending: true })

    if (slots) {
      slotNotifications = slots.map((s: any) => ({
        id: `slot-${s.id}`,
        type: 'interview_scheduled',
        title: 'Mentorship session booked',
        subtitle: `${s.positions?.role ?? 'Mentorship session'} · ${new Date(s.scheduled_at).toLocaleString()}`,
        details: 'Your mentor booked a 1-on-1 session. Join the private room at the scheduled time.',
        targetRole: 'candidate',
        recipientId: s.student_id,
        senderName: s.mentor_email,
        senderRole: 'Mentor',
        candidateName: '',
        mentorName: s.mentor_email,
        meetingId: s.meeting_id,
        timestamp: new Date(s.scheduled_at).toLocaleString(),
        isLive: false,
        read: false,
      }))
    }
  } catch {
    // Ignore if slots table isn't migrated
  }

  return NextResponse.json({
    notifications: [...slotNotifications, ...customNotifications],
  })
}

// POST: Send an authenticated notification to a targeted recipient
export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Authentication required to send notifications.' },
      { status: 401 }
    )
  }

  let body: Record<string, any>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json', message: 'Malformed JSON payload.' }, { status: 400 })
  }

  const {
    recipientId,
    recipientRole = 'candidate',
    title,
    subtitle = '',
    details = '',
    type = 'round2_mentorship',
    meetingId = '',
    candidateName = '',
    mentorName = '',
    isLive = true,
  } = body

  if (!recipientId || !title) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'recipientId and title are required.' },
      { status: 400 }
    )
  }

  const admin = getSupabaseAdminClient()
  const fallbackId = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  let createdNotification: any = {
    id: fallbackId,
    type,
    title,
    subtitle,
    details,
    targetRole: recipientRole,
    recipientId,
    senderId: user.id,
    senderName: user.email?.split('@')[0] || 'Platform',
    senderRole: recipientRole === 'candidate' ? 'Mentor' : 'Candidate',
    candidateName,
    mentorName,
    meetingId,
    timestamp: 'Just now',
    isLive,
    read: false,
  }

  try {
    const { data, error } = await admin
      .from('user_notifications')
      .insert({
        recipient_id: recipientId,
        recipient_role: recipientRole,
        sender_id: user.id,
        sender_name: createdNotification.senderName,
        sender_role: createdNotification.senderRole,
        type,
        title,
        subtitle,
        details,
        meeting_id: meetingId,
        candidate_name: candidateName,
        mentor_name: mentorName,
        is_live: isLive,
        read: false,
      })
      .select('*')
      .single()

    if (!error && data) {
      createdNotification = {
        ...createdNotification,
        id: data.id,
        timestamp: new Date(data.created_at).toLocaleString(),
      }
    }
  } catch {
    // Graceful fallback for non-migrated environment
  }

  return NextResponse.json(
    { success: true, notification: createdNotification },
    { status: 201 }
  )
}

// PATCH: Mark notification as read (strictly scoped to recipient_id = user.id)
export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { id?: string; markAll?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const admin = getSupabaseAdminClient()

  try {
    if (body.markAll) {
      await admin
        .from('user_notifications')
        .update({ read: true })
        .eq('recipient_id', user.id)
    } else if (body.id && !body.id.startsWith('slot-')) {
      await admin
        .from('user_notifications')
        .update({ read: true })
        .eq('id', body.id)
        .eq('recipient_id', user.id)
    }
  } catch {
    // Ignore if table not present
  }

  return NextResponse.json({ success: true })
}

// DELETE: Delete notification (strictly scoped to recipient_id = user.id)
export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'missing_id' }, { status: 400 })
  }

  if (!id.startsWith('slot-')) {
    try {
      const admin = getSupabaseAdminClient()
      await admin
        .from('user_notifications')
        .delete()
        .eq('id', id)
        .eq('recipient_id', user.id)
    } catch {
      // Ignore if table not present
    }
  }

  return NextResponse.json({ success: true })
}
