/**
 * Centralized utility for resolving the absolute URL for Supabase Auth redirects.
 * Redirects OAuth to the production site https://hiringmates.vercel.app.
 */
export function getAuthRedirectUrl(path: string = '/auth/callback'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  // Default to production site https://hiringmates.vercel.app
  const productionBase = 'https://hiringmates.vercel.app'
  const base = process.env.NEXT_PUBLIC_SITE_URL || productionBase

  const normalizedBase =
    base.startsWith('http://') || base.startsWith('https://') ? base : `https://${base}`

  return `${normalizedBase.replace(/\/+$/, '')}${cleanPath}`
}
