/**
 * Bridge to the Python RAG backend.
 *
 * All of this runs server-side. `BACKEND_BASE_URL` has no NEXT_PUBLIC_ prefix
 * on purpose: the backend is an internal service, and the provider token we
 * forward must never reach the browser.
 */

export const BACKEND_URL_ERROR =
  'BACKEND_BASE_URL is not set. Point it at the Python backend (e.g. http://127.0.0.1:8000).'

export function backendUrl(): string {
  const base = process.env.BACKEND_BASE_URL
  if (!base) throw new Error(BACKEND_URL_ERROR)
  return base.replace(/\/+$/, '')
}

export interface BackendIdentity {
  user_id: string
  github_email: string
  google_email: string
  github_handle: string
  provider_token: string | null
}

/**
 * Map a Supabase user onto the backend's `Identity`.
 *
 * Both emails are required, because the extraction cache is keyed on the pair.
 * A user who has only linked GitHub will produce a partial key and the cache
 * will never hit — so we report that rather than silently starting a session.
 */
export function buildIdentity(
  user: any,
  session: any,
): { identity: BackendIdentity; missing: string[] } {
  const identities: any[] = user?.identities ?? []

  const find = (provider: string) =>
    identities.find((i) => i?.provider === provider) ??
    (user?.app_metadata?.provider === provider ? user : undefined)

  const github = find('github')
  const google = find('google')

  const githubEmail: string = github?.identity_data?.email ?? github?.email ?? ''
  const googleEmail: string =
    google?.identity_data?.email ?? google?.email ?? user?.email ?? ''

  const identity: BackendIdentity = {
    user_id: user?.id ?? '',
    github_email: githubEmail,
    google_email: googleEmail,
    github_handle:
      github?.identity_data?.user_name ??
      github?.identity_data?.preferred_username ??
      '',
    // Only present for the provider used in this session, and not persisted
    // across sessions by Supabase.
    provider_token: session?.provider_token ?? null,
  }

  const missing: string[] = []
  if (!identity.user_id) missing.push('user id')
  if (!identity.github_email) missing.push('GitHub account (email)')
  if (!identity.google_email) missing.push('Google account (email)')
  if (!identity.github_handle) missing.push('GitHub handle')

  return { identity, missing }
}
