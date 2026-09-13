import { NextResponse } from 'next/server'
import { ownedPosition, portalActor } from '@/lib/portal-server'
import { getSupabaseAdminClient } from '@/lib/portal-server'

/**
 * Append a question to a position's manual pool. Company only, and only for a
 * position they own.
 *
 * This table holds the answer key and is never readable by students — see the
 * RLS in backend/migrations/004_company_mentor_portal.sql.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await portalActor('company')
  if (!actor) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 })
  }

  const { id } = await params
  const position = await ownedPosition(actor, id)
  if (!position) {
    return NextResponse.json(
      { error: 'not_found', message: 'No such position, or not yours.' },
      { status: 404 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const prompt = String(body.prompt ?? '').trim()
  if (!prompt) {
    return NextResponse.json(
      { error: 'invalid_body', message: 'prompt is required.' },
      { status: 400 },
    )
  }

  const kind = body.kind === 'theory' ? 'theory' : 'mcq'
  const options = Array.isArray(body.options)
    ? body.options.map((o: unknown) => String(o))
    : []

  if (kind === 'mcq' && options.length < 2) {
    return NextResponse.json(
      {
        error: 'invalid_body',
        message: 'Multiple choice needs at least two options.',
      },
      { status: 400 },
    )
  }

  const rawIndex = Number(body.correct_index)
  const correct_index =
    kind === 'mcq' && Number.isInteger(rawIndex) && rawIndex >= 0
      ? rawIndex
      : null

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('position_questions')
    .insert({
      position_id: id,
      prompt,
      kind,
      options,
      correct_index,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ question: data }, { status: 201 })
}

/** The company may review the pool it wrote (answer key included). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await portalActor('company')
  if (!actor) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 })
  }

  const { id } = await params
  const position = await ownedPosition(actor, id)
  if (!position) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('position_questions')
    .select('*')
    .eq('position_id', id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ questions: data ?? [] })
}

/** Delete a question from a position's manual pool. Company only. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await portalActor('company')
  if (!actor) {
    return NextResponse.json({ error: 'not_authorised' }, { status: 403 })
  }

  const { id } = await params
  const position = await ownedPosition(actor, id)
  if (!position) {
    return NextResponse.json(
      { error: 'not_found', message: 'No such position, or not yours.' },
      { status: 404 },
    )
  }

  const url = new URL(request.url)
  let questionId = url.searchParams.get('questionId')
  if (!questionId) {
    try {
      const body = await request.json()
      questionId = String(body.questionId ?? '')
    } catch {
      // ignore
    }
  }

  if (!questionId) {
    return NextResponse.json(
      { error: 'missing_id', message: 'questionId is required.' },
      { status: 400 },
    )
  }

  const admin = getSupabaseAdminClient()
  const { error } = await admin
    .from('position_questions')
    .delete()
    .eq('id', questionId)
    .eq('position_id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
