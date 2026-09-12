'use client'

import { useState, useEffect } from 'react'
import { X, Settings, Link2, Trash2, Plus, CheckCircle2, AlertCircle, Shield, User, GitBranch } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { getSupabaseBrowserClient } from '@/lib/supabase'

interface LinkedAccount {
  id: string
  provider: string
  account_identifier: string
  label?: string
  linked_at: string
}

export function SettingsModal() {
  const { user, isSettingsOpen, setIsSettingsOpen } = useAuth()
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [providerType, setProviderType] = useState<'github_secondary' | 'linkedin' | 'email_secondary' | 'custom'>('github_secondary')
  const [identifier, setIdentifier] = useState('')
  const [label, setLabel] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadLinkedAccounts = async () => {
    if (!user) return
    setLoading(true)
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase
      .from('linked_accounts')
      .select('*')
      .order('linked_at', { ascending: false })

    if (!error && data) {
      setLinkedAccounts(data as LinkedAccount[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isSettingsOpen && user) {
      loadLinkedAccounts()
      setFeedback(null)
    }
  }, [isSettingsOpen, user])

  if (!isSettingsOpen || !user) return null

  const handleAddSecondaryAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!identifier.trim()) return

    setSubmitting(true)
    setFeedback(null)
    const supabase = getSupabaseBrowserClient()

    try {
      const { data, error } = await supabase
        .from('linked_accounts')
        .insert({
          user_id: user.id,
          provider: providerType,
          account_identifier: identifier.trim(),
          label: label.trim() || (providerType === 'github_secondary' ? 'Secondary GitHub' : 'Secondary Account'),
        })
        .select()
        .single()

      if (error) {
        setFeedback({ type: 'error', message: error.message })
      } else {
        setFeedback({ type: 'success', message: 'Secondary account successfully linked to your main GitHub ID!' })
        setIdentifier('')
        setLabel('')
        await loadLinkedAccounts()
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err?.message || 'Failed to link secondary account.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleUnlink = async (accountId: string) => {
    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.from('linked_accounts').delete().eq('id', accountId)
    if (!error) {
      setLinkedAccounts((prev) => prev.filter((acc) => acc.id !== accountId))
      setFeedback({ type: 'success', message: 'Secondary account unlinked.' })
    } else {
      setFeedback({ type: 'error', message: error.message })
    }
  }

  const primaryHandle =
    user.user_metadata?.user_name ||
    user.user_metadata?.preferred_username ||
    user.user_metadata?.name ||
    user.user_metadata?.full_name ||
    user.email?.split('@')[0] ||
    'GitHub User'

  const primaryEmail = user.email || user.user_metadata?.email || 'OAuth Identity'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        onClick={() => setIsSettingsOpen(false)}
        className="fixed inset-0 bg-[#171717]/60 backdrop-blur-xs transition-opacity dark:bg-black/80"
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border-4 border-[#171717] bg-[#fffaf0] p-6 shadow-[8px_8px_0_#171717] transition-all sm:p-8 dark:border-[#2e323b] dark:bg-[#15171c] dark:shadow-[8px_8px_0_#000000]">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border-2 border-[#171717] bg-[#ffd84d] shadow-[2px_2px_0_#171717] dark:border-[#000000]">
              <Settings className="h-5 w-5 text-[#171717]" />
            </div>
            <div>
              <h2 className="font-display text-2xl uppercase tracking-tight sm:text-3xl text-[#171717] dark:text-[#f4f4f7]">
                Account Settings
              </h2>
              <p className="text-xs font-bold text-[#171717]/70 dark:text-[#a1a1aa]">
                Manage primary credentials & linked secondary accounts
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border-2 border-[#171717] bg-white text-[#171717] shadow-sm transition hover:bg-neutral-100 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div
            className={`mb-5 flex items-start gap-2.5 rounded-2xl border-2 border-[#171717] p-3 text-xs font-bold shadow-sm ${
              feedback.type === 'success'
                ? 'bg-[#6ee56b] text-[#171717]'
                : 'bg-rose-100 text-[#171717] dark:bg-rose-950/60 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#171717]" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Primary GitHub Account Card */}
        <div className="mb-6 rounded-2xl border-2 border-[#171717] bg-white p-4 shadow-[3px_3px_0_#171717] dark:border-[#2e323b] dark:bg-[#111317] dark:shadow-[3px_3px_0_#000000]">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-[10px] font-black uppercase tracking-wider text-[#171717]/60 dark:text-[#a1a1aa]">
              Primary Authenticated Account
            </span>
            <span className="flex items-center gap-1 rounded-full border border-[#171717] bg-[#6ee56b] px-2 py-0.5 text-[9px] font-black uppercase text-[#171717] dark:border-[#000000]">
              <Shield className="h-2.5 w-2.5" /> Primary ID
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[#171717] bg-[#24292f] text-white">
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg tracking-wide uppercase truncate text-[#171717] dark:text-[#f4f4f7]">
                {primaryHandle}
              </div>
              <div className="text-xs font-bold text-[#171717]/60 truncate dark:text-[#a1a1aa]">
                {primaryEmail}
              </div>
            </div>
          </div>
        </div>

        {/* Linked Secondary Accounts List */}
        <div className="mb-6">
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="font-mono text-xs font-black uppercase tracking-wider text-[#171717] dark:text-[#d4d4d8]">
              Linked Secondary Accounts ({linkedAccounts.length})
            </h3>
          </div>

          {loading ? (
            <div className="rounded-xl border-2 border-dashed border-[#171717]/30 p-4 text-center text-xs font-bold text-[#171717]/50 dark:border-white/20 dark:text-[#a1a1aa]">
              Checking linked accounts...
            </div>
          ) : linkedAccounts.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-[#171717]/30 p-4 text-center text-xs font-bold text-[#171717]/60 dark:border-white/20 dark:text-[#a1a1aa]">
              No secondary accounts linked yet. Add one below to link your work GitHub or alternate email.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {linkedAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="flex items-center justify-between rounded-xl border-2 border-[#171717] bg-white p-3 shadow-xs dark:border-[#2e323b] dark:bg-[#111317]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#171717] bg-[#39d5c8] text-[#171717] dark:border-[#000000]">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black uppercase truncate text-[#171717] dark:text-[#f4f4f7]">
                          {acc.account_identifier}
                        </span>
                        {acc.label && (
                          <span className="rounded bg-[#ffd84d] px-1.5 py-0.2 font-mono text-[9px] font-black uppercase text-[#171717]">
                            {acc.label}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-[#171717]/50 dark:text-[#a1a1aa]">
                        Linked {new Date(acc.linked_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnlink(acc.id)}
                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-[#171717] bg-white text-rose-600 transition hover:bg-rose-50 dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-rose-400"
                    title="Unlink Account"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link New Secondary Account Form */}
        <form onSubmit={handleAddSecondaryAccount} className="space-y-3 border-t-2 border-[#171717]/15 pt-4 dark:border-[#2e323b]">
          <span className="font-mono text-xs font-black uppercase tracking-wider text-[#171717] dark:text-[#d4d4d8]">
            Link Another Account
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-[#171717]/70 dark:text-[#a1a1aa]">
                Account Type
              </label>
              <select
                value={providerType}
                onChange={(e) => setProviderType(e.target.value as any)}
                className="w-full cursor-pointer rounded-xl border-2 border-[#171717] bg-white px-2.5 py-2 text-xs font-bold text-[#171717] shadow-xs outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
              >
                <option value="github_secondary">Secondary GitHub Handle</option>
                <option value="linkedin">LinkedIn Profile URL</option>
                <option value="email_secondary">Secondary Work/Personal Email</option>
                <option value="custom">Other Identity</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase text-[#171717]/70 dark:text-[#a1a1aa]">
                Label / Tag
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Work GitHub, LinkedIn, Personal"
                className="w-full rounded-xl border-2 border-[#171717] bg-white px-2.5 py-2 text-xs font-bold text-[#171717] shadow-xs outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase text-[#171717]/70 dark:text-[#a1a1aa]">
              {providerType === 'github_secondary'
                ? 'Secondary GitHub Username or Org Handle'
                : providerType === 'linkedin'
                  ? 'LinkedIn Profile URL (e.g. linkedin.com/in/username)'
                  : 'Account Identifier / Email'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  providerType === 'github_secondary'
                    ? 'e.g. @work-developer or octocat'
                    : providerType === 'linkedin'
                      ? 'https://www.linkedin.com/in/yourname'
                      : 'e.g. engineer@work.com'
                }
                className="flex-1 rounded-xl border-2 border-[#171717] bg-white px-3 py-2 text-xs font-bold text-[#171717] shadow-xs outline-none dark:border-[#2e323b] dark:bg-[#1c1f26] dark:text-[#f4f4f7]"
              />
              <button
                type="submit"
                disabled={submitting || !identifier.trim()}
                className="flex cursor-pointer items-center gap-1.5 rounded-xl border-2 border-[#171717] bg-[#39d5c8] px-4 py-2 text-xs font-black uppercase text-[#171717] shadow-[2px_2px_0_#171717] transition hover:bg-[#2bc4b8] disabled:opacity-50 dark:border-[#000000] dark:shadow-[2px_2px_0_#000000]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{submitting ? 'Linking...' : 'Link'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
