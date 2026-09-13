#!/usr/bin/env node
/**
 * Create or refresh the portal accounts in Supabase Auth.
 *
 * The emails are read from lib/portal.ts so this script and the app can never
 * disagree about who is allowed in. Edit that file, then re-run this.
 *
 * Usage (from the repo root):
 *   node tools/seed-portal-accounts.mjs --password 'YourPassword'
 *   PORTAL_SEED_PASSWORD='YourPassword' node tools/seed-portal-accounts.mjs
 *
 * What it does:
 *   - creates any company/mentor account that does not exist yet
 *   - resets the password and confirms the email for accounts that do
 *   - reports Supabase auth users that look like stale portal accounts
 *
 * It never deletes anything; removing old accounts is a separate, explicit SQL
 * step (see the note it prints at the end).
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

/* ------------------------------------------------------------------ config */

function readEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

const frontendEnv = readEnv(path.join(ROOT, '.env'))
const backendEnv = readEnv(path.join(ROOT, 'backend', '.env'))

const SUPABASE_URL =
  frontendEnv.NEXT_PUBLIC_SUPABASE_URL || backendEnv.SUPABASE_URL
const SERVICE_KEY = backendEnv.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run this from the repo root.',
  )
  process.exit(1)
}

/* ------------------------------------------- emails, from lib/portal.ts only */

const portalSrc = fs.readFileSync(path.join(ROOT, 'lib', 'portal.ts'), 'utf8')

const company =
  portalSrc.match(/export const COMPANY_EMAIL\s*=\s*'([^']+)'/)?.[1] ??
  portalSrc.match(/export const COMPANY_EMAIL\s*=\s*"([^"]+)"/)?.[1]

const mentorsBlock =
  portalSrc.match(/export const MENTOR_EMAILS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
const mentors = [...mentorsBlock.matchAll(/'([^']+)'/g)].map((m) => m[1])

if (!company || mentors.length === 0) {
  console.error('Could not read COMPANY_EMAIL / MENTOR_EMAILS from lib/portal.ts')
  process.exit(1)
}

/* ---------------------------------------------------------------- password */

function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i !== -1 ? process.argv[i + 1] : undefined
}

const PASSWORD =
  argValue('--password') ?? process.env.PORTAL_SEED_PASSWORD ?? 'HiringMates2026!'

if (PASSWORD === 'HiringMates2026!') {
  console.warn(
    'WARNING: using the default password. Pass --password to set your own.',
  )
}

/* ------------------------------------------------------------------- admin */

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function listUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
    headers,
  })
  const json = await res.json()
  return json.users ?? []
}

async function createUser(email, name) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name },
    }),
  })
  return { ok: res.ok, json: await res.json() }
}

async function updateUser(id, name) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: name },
    }),
  })
  return { ok: res.ok, json: await res.json() }
}

/* -------------------------------------------------------------------- main */

const targets = [
  { email: company, name: 'Hiring Company' },
  ...mentors.map((email, i) => ({ email, name: `Mentor ${i + 1}` })),
]

console.log(`Seeding ${targets.length} portal accounts against ${SUPABASE_URL}\n`)

const users = await listUsers()
const byEmail = new Map(users.map((u) => [u.email?.toLowerCase(), u]))

for (const { email, name } of targets) {
  const existing = byEmail.get(email.toLowerCase())
  if (existing) {
    const { ok, json } = await updateUser(existing.id, name)
    console.log(
      ok
        ? `  updated   ${email}`
        : `  FAILED    ${email} — ${json.msg ?? json.message ?? JSON.stringify(json).slice(0, 120)}`,
    )
  } else {
    const { ok, json } = await createUser(email, name)
    console.log(
      ok
        ? `  created   ${email}`
        : `  FAILED    ${email} — ${json.msg ?? json.message ?? JSON.stringify(json).slice(0, 120)}`,
    )
  }
}

// Anything that still points at the old placeholder domain is stale.
const wanted = new Set(targets.map((t) => t.email.toLowerCase()))
const stale = users.filter(
  (u) =>
    /@hiringmates\.app$/i.test(u.email ?? '') && !wanted.has(u.email.toLowerCase()),
)

console.log(`\nPassword for all portal accounts: ${PASSWORD}`)

if (stale.length) {
  console.log(
    `\n${stale.length} stale auth account(s) still exist and are NOT in lib/portal.ts:`,
  )
  for (const u of stale) console.log(`  ${u.email}  (${u.id})`)
  console.log(
    '\nRemove them in the Supabase SQL editor if you replaced those addresses:\n' +
      stale.map((u) => `  delete from auth.users where id = '${u.id}';`).join('\n'),
  )
}

console.log('\nNext: update the portal_members table so RLS matches lib/portal.ts:')
console.log(
  targets
    .map((t, i) => {
      const role = i === 0 ? 'company' : 'mentor'
      return `  insert into public.portal_members (email, role) values ('${t.email}', '${role}') on conflict (email) do update set role = excluded.role;`
    })
    .join('\n'),
)
