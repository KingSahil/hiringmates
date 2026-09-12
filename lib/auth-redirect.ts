/**
 * Centralized utility for resolving the absolute URL for Supabase Auth redirects.
 * Handles local development, Vercel preview environments, and production domains.
 */
export function getAuthRedirectUrl(path: string = '/auth/callback'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  // 1. In browser, dynamically use the current active origin (e.g. https://hiringmates.vercel.app)
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${cleanPath}`
  }

  // 2. Server-side / fallback from environment variables
  let base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null) ||
    'https://hiringmates.vercel.app'

  if (!base.startsWith('http://') && !base.startsWith('https://')) {
    base = `https://${base}`
  }

  return `${base.replace(/\/+$/, '')}${cleanPath}`
}
