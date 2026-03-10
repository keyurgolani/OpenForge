import { useState, useRef, useEffect, FormEvent } from 'react'
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginAuth } from '@/lib/api'

interface LoginPageProps {
    onSuccess: () => void
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [shake, setShake] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        if (!password.trim() || loading) return

        setLoading(true)
        setError('')
        try {
            await loginAuth(password)
            onSuccess()
        } catch {
            setError('Incorrect password. Please try again.')
            setShake(true)
            setTimeout(() => setShake(false), 600)
            setPassword('')
            setTimeout(() => inputRef.current?.focus(), 50)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
            {/* Background glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
            </div>

            <div
                className={`relative w-full max-w-sm mx-4 glass-card rounded-2xl p-8 shadow-2xl transition-transform ${shake ? 'animate-shake' : ''}`}
            >
                {/* Logo / icon */}
                <div className="flex flex-col items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-accent/15 ring-1 ring-accent/30 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-accent" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-xl font-semibold text-foreground">OpenForge</h1>
                        <p className="text-sm text-muted-foreground mt-1">Enter your password to continue</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="relative">
                        <input
                            ref={inputRef}
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Password"
                            autoComplete="current-password"
                            className={`w-full h-11 bg-muted/30 border rounded-xl px-4 pr-11 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus:ring-2 focus:ring-accent/50 focus:border-accent/50 ${error ? 'border-red-500/50 focus:ring-red-500/30' : 'border-border/50'}`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 text-center -mt-1">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !password.trim()}
                        className="h-11 rounded-xl bg-accent/20 hover:bg-accent/30 border border-accent/30 text-accent font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Signing in…
                            </>
                        ) : (
                            'Sign in'
                        )}
                    </button>
                </form>
            </div>

            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    20%, 60% { transform: translateX(-8px); }
                    40%, 80% { transform: translateX(8px); }
                }
                .animate-shake { animation: shake 0.5s ease-in-out; }
            `}</style>
        </div>
    )
}
