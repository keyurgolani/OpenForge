import { useState } from 'react'
import { Anvil, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import { loginAuth } from '@/lib/api'

/* -------------------------------------------------------------------------- */
/* Props                                                                      */
/* -------------------------------------------------------------------------- */

interface LoginPageProps {
  onSuccess: () => void
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await loginAuth(password)
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Invalid password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Warm gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/60 to-rose-50 dark:from-amber-950/30 dark:via-bg dark:to-rose-950/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(251,191,36,0.12),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(244,114,182,0.08),transparent_50%)]" />

      {/* Card */}
      <div
        className={cn(
          'relative z-10 w-full max-w-md',
          'rounded-2xl border border-border/50 bg-bg-elevated/80 backdrop-blur-xl',
          'p-8 shadow-2xl shadow-black/5',
        )}
      >
        {/* Brand hero */}
        <div className="mb-10 flex flex-col items-center gap-4">
          <div
            className={cn(
              'flex h-20 w-20 items-center justify-center rounded-2xl',
              'bg-gradient-to-br from-primary to-primary/80',
              'shadow-lg shadow-primary/25',
            )}
          >
            <Anvil className="h-10 w-10 text-white" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <h1 className="font-display text-3xl font-bold tracking-tight text-fg">
              OpenForge
            </h1>
            <p className="mt-1.5 font-body text-sm text-fg-muted">
              Sign in to your workspace
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2.5 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
              <p className="font-body text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Password field */}
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="font-label text-sm font-medium text-fg"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your admin password"
                autoFocus
                required
                className={cn(
                  'w-full rounded-lg border border-border bg-bg py-2.5 pl-4 pr-10',
                  'font-body text-sm text-fg placeholder:text-fg-subtle',
                  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
                  'transition-all',
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg transition-colors"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={loading || !password}
            className={cn(
              'flex w-full items-center justify-center gap-2 rounded-lg',
              'bg-primary px-4 py-2.5',
              'font-label text-sm font-semibold text-fg-on-primary',
              'hover:bg-primary-hover',
              'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-bg-elevated',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all',
            )}
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
