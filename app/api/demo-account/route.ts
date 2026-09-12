import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const demoEmail = 'demo@codemates.app'
const demoPassword = 'CodeMatesDemo2026!'

export async function POST() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) return NextResponse.json({ error: 'Demo account service unavailable.' }, { status: 503 })

  const found = existing.users.find((user) => user.email?.toLowerCase() === demoEmail)
  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, { password: demoPassword, email_confirm: true })
    if (error) return NextResponse.json({ error: 'Demo account could not be refreshed.' }, { status: 503 })
    return NextResponse.json({ ready: true })
  }

  const { error } = await admin.auth.admin.createUser({
    email: demoEmail,
    password: demoPassword,
    email_confirm: true,
    user_metadata: { display_name: 'Demo Player' },
  })
  if (error) return NextResponse.json({ error: 'Demo account could not be created.' }, { status: 503 })
  return NextResponse.json({ ready: true })
}
