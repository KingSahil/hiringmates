/**
 * Company & mentor portal access.
 *
 * Access is allowlist-based: a signed-in user unlocks the company portal only
 * if their email is the company address, and the mentor portal only if their
 * email is one of the mentor addresses. The allowlist is checked SERVER-SIDE
 * wherever it gates data (see the RLS policies in
 * backend/migrations/004_company_mentor_portal.sql); this module exists so the
 * UI can decide what to render without a round trip.
 *
 * NOTE: replace the addresses below with the real ones. They are deliberately
 * plain constants — there is exactly one company and four mentors for now, and
 * a config file or env var would be indirection without a benefit.
 */

export const COMPANY_EMAIL = 'company@hiringmates.app'

export const MENTOR_EMAILS = [
  'mentor1@hiringmates.app',
  'mentor2@hiringmates.app',
  'mentor3@hiringmates.app',
  'mentor4@hiringmates.app',
] as const

export type PortalRole = 'company' | 'mentor' | null

/**
 * Normalise before comparing: providers hand back emails with different
 * casing, and a mentor who typed "Mentor1@…" must still get in.
 */
function normalise(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}

/**
 * Which portal, if any, this email may enter. The single company owns every
 * position, and all four mentors are linked to it.
 */
export function portalRoleFor(email: string | null | undefined): PortalRole {
  const value = normalise(email)
  if (!value) return null
  if (value === normalise(COMPANY_EMAIL)) return 'company'
  if (MENTOR_EMAILS.some((m) => normalise(m) === value)) return 'mentor'
  return null
}

export function isCompany(email: string | null | undefined): boolean {
  return portalRoleFor(email) === 'company'
}

export function isMentor(email: string | null | undefined): boolean {
  return portalRoleFor(email) === 'mentor'
}

/** The company every mentor is attached to. Single-company for now. */
export function companyForMentor(email: string | null | undefined): string | null {
  return isMentor(email) ? COMPANY_EMAIL : null
}
