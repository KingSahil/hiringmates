import { NextResponse } from 'next/server'
import {
  getSupabaseAdminClient,
  portalActor,
  studentActor,
} from '@/lib/portal-server'

/**
 * Mentorship time slots.
 *
 *   GET  mentor  -> every student who passed round 1 on one of their company's
 *                   positions, plus the slots already booked
 *          student -> the slots booked for them
 *   POST mentor  -> book a slot, which is what notifies the student
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdminClient()

  // Mentors get the company-wide view. Anyone else signed in sees only their
  // own booked sessions — students are deliberately NOT on the portal
  // allowlist, so gating this route on a generic portalActor() would lock them
  // out of the very slots a mentor booked for them.
  const actor = await portalActor('mentor', request)

  if (actor) {
    const { data: positions, error: posError } = await admin
      .from('positions')
      .select('id, role')
      .eq('owner_email', actor.companyEmail)

    if (posError) {
      return NextResponse.json({ error: posError.message }, { status: 500 })
    }

    const positionIds = (positions ?? []).map((p: any) => p.id)
    if (positionIds.length === 0) {
      return NextResponse.json({ students: [], slots: [] })
    }

    const { data: attempts, error: attError } = await admin
      .from('position_attempts')
      .select('id, position_id, user_id, score, passed, created_at')
      .in('position_id', positionIds)
      .eq('passed', true)
      .order('created_at', { ascending: false })

    if (attError) {
      return NextResponse.json({ error: attError.message }, { status: 500 })
    }

    // Display names live in profiles; there is no FK to embed, so map by id.
    const studentIds = [...new Set((attempts ?? []).map((a: any) => a.user_id))]
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', studentIds)

    const nameById = new Map(
      (profiles ?? []).map((p: any) => [p.id, p.display_name]),
    )
    const roleById = new Map((positions ?? []).map((p: any) => [p.id, p.role]))

    const { data: slots } = await admin
      .from('mentorship_slots')
      .select('*')
      .eq('mentor_email', actor.email)
      .order('scheduled_at', { ascending: true })

    return NextResponse.json({
      students: (attempts ?? []).map((a: any) => ({
        attempt_id: a.id,
        position_id: a.position_id,
        position_role: roleById.get(a.position_id) ?? 'Unknown role',
        student_id: a.user_id,
        student_name: nameById.get(a.user_id) ?? 'Student',
        score: a.score,
        created_at: a.created_at,
      })),
      slots: slots ?? [],
    })
  }

  // Student: the slots booked for them.
  const student = await studentActor(request)
  if (!student) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 })
  }

  const { data: slots, error } = await admin
    .from('mentorship_slots')
    .select('*, positions(role)')
    .eq('student_id', student.userId)
    .order('scheduled_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ slots: slots ?? [] })
}

/** Book a mentorship slot. Mentor only. */
export async function POST(request: Request) {
  const actor = await portalActor('mentor', request)
  if (!actor) {
    return NextResponse.json(
      { error: 'not_authorised', message: 'Mentor accounts only.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const positionId = String(body.position_id ?? '')
  const studentId = String(body.student_id ?? '')
  const scheduledAt = String(body.scheduled_at ?? '')

  if (!positionId || !studentId || !scheduledAt) {
    return NextResponse.json(
      {
        error: 'invalid_body',
        message: 'position_id, student_id and scheduled_at are required.',
      },
      { status: 400 },
    )
  }

  const when = new Date(scheduledAt)
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'scheduled_at is not a valid date.' },
      { status: 400 },
    )
  }

  const admin = getSupabaseAdminClient()

  // The position must belong to the mentor's company.
  const { data: position } = await admin
    .from('positions')
    .select('id, role')
    .eq('id', positionId)
    .eq('owner_email', actor.companyEmail)
    .maybeSingle()

  if (!position) {
    return NextResponse.json(
      { error: 'not_found', message: 'No such position for your company.' },
      { status: 404 },
    )
  }

  // Fetch candidate display name for the notification
  const { data: studentProfile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', studentId)
    .maybeSingle()
  const candidateName = studentProfile?.display_name || 'Candidate'

  const meetingId = `mentorship-${Math.random().toString(36).slice(2, 10)}`

  const { data: slot, error } = await admin
    .from('mentorship_slots')
    .insert({
      position_id: positionId,
      mentor_email: actor.email,
      student_id: studentId,
      scheduled_at: when.toISOString(),
      meeting_id: meetingId,
      status: 'scheduled',
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 1. Create targeted notification for the Student
  const studentNotif = {
    recipient_id: studentId,
    recipient_role: 'candidate',
    sender_id: actor.userId,
    sender_name: actor.email,
    sender_role: 'Lead Mentor',
    type: 'round2_mentorship',
    title: 'Round 2 Mentorship Call Booked',
    subtitle: `${position.role} with ${actor.email} scheduled for ${when.toLocaleString()}`,
    details: 'Your mentor booked a 1-on-1 session. Click Join Mentorship Call to enter the private room.',
    meeting_id: meetingId,
    candidate_name: candidateName,
    mentor_name: actor.email,
    is_live: true,
    read: false,
  }

  // 2. Create notification for the Mentor themself
  const mentorNotif = {
    recipient_id: actor.userId,
    recipient_role: 'mentor',
    sender_id: actor.userId,
    sender_name: actor.email,
    sender_role: 'Mentor',
    type: 'round2_mentorship',
    title: 'Mentorship Session Scheduled',
    subtitle: `Round 2 session with ${candidateName} for ${when.toLocaleString()}`,
    details: 'Click Enter Meeting Room to join and host the candidate in this private room.',
    meeting_id: meetingId,
    candidate_name: candidateName,
    mentor_name: actor.email,
    is_live: true,
    read: false,
  }

  try {
    const { data: insertedNotifs } = await admin
      .from('user_notifications')
      .insert([studentNotif, mentorNotif])
      .select('id, recipient_id')

    // Broadcast in real-time to the student's and mentor's private channels
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (supabaseUrl && anonKey) {
      const { createClient } = await import('@supabase/supabase-js')
      const client = createClient(supabaseUrl, anonKey)

      const sNotifId = insertedNotifs?.find((n: any) => n.recipient_id === studentId)?.id || `slot-notif-${slot.id}`
      const mNotifId = insertedNotifs?.find((n: any) => n.recipient_id === actor.userId)?.id || `slot-mentor-${slot.id}`

      client.channel(`user-notifications:${studentId}`).send({
        type: 'broadcast',
        event: 'new-notification',
        payload: { notification: { ...studentNotif, id: sNotifId } },
      })

      client.channel(`user-notifications:${actor.userId}`).send({
        type: 'broadcast',
        event: 'new-notification',
        payload: { notification: { ...mentorNotif, id: mNotifId } },
      })
    }
  } catch {
    // Non-blocking fallback if notifications table not migrated
  }

  return NextResponse.json({ slot }, { status: 201 })
}
