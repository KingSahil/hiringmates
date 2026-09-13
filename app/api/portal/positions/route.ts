import { NextResponse } from 'next/server'
import { getSupabaseAdminClient, portalActor } from '@/lib/portal-server'

/** List every position. Students browse these; the company owns them. */
export async function GET() {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('positions')
    .select('*, position_questions(count)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const positions = (data ?? []).map((p: any) => ({
    ...p,
    question_count: Array.isArray(p.position_questions)
      ? p.position_questions[0]?.count ?? 0
      : 0,
  }))

  return NextResponse.json({ positions })
}

/** Create a position. Company only. */
export async function POST(request: Request) {
  const actor = await portalActor('company')
  if (!actor) {
    return NextResponse.json(
      { error: 'not_authorised', message: 'The company account only.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const role = String(body.role ?? '').trim()
  if (!role) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'role is required.' },
      { status: 400 },
    )
  }

  const rawThreshold = Number(body.pass_threshold)
  const pass_threshold = Number.isFinite(rawThreshold)
    ? Math.min(100, Math.max(0, Math.round(rawThreshold)))
    : 60

  const question_mode = body.question_mode === 'manual' ? 'manual' : 'auto'

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('positions')
    .insert({
      owner_email: actor.email,
      role,
      description: String(body.description ?? ''),
      tags: Array.isArray(body.tags)
        ? body.tags.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [],
      pass_threshold,
      question_mode,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If manual questions were supplied during position creation, insert them
  if (
    question_mode === 'manual' &&
    Array.isArray(body.questions) &&
    body.questions.length > 0
  ) {
    const questionRows = body.questions
      .map((q: any) => ({
        position_id: data.id,
        prompt: String(q.prompt ?? '').trim(),
        kind: q.kind === 'theory' ? 'theory' : 'mcq',
        options: Array.isArray(q.options)
          ? q.options.map((o: unknown) => String(o).trim()).filter(Boolean)
          : [],
        correct_index:
          q.kind !== 'theory' &&
          Number.isInteger(Number(q.correct_index)) &&
          Number(q.correct_index) >= 0
            ? Number(q.correct_index)
            : null,
      }))
      .filter((q: any) => q.prompt.length > 0)

    if (questionRows.length > 0) {
      const { error: qError } = await admin
        .from('position_questions')
        .insert(questionRows)
      if (qError) {
        console.error('Error inserting initial manual questions:', qError)
      }
    }
  }

  return NextResponse.json({ position: data }, { status: 201 })
}
