import { useState } from 'react'
import { login } from '@/lib/api'

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const result = await login(password);
      if (result.authenticated) {
        onSuccess();
      } else {
        setError('Invalid password');
        setShake(true);
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setError('Invalid password');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div
        className={`w-full max-w-sm mx-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 space-y-6 ${shake ? 'animate-shake' : ''}`}
      >
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mx-auto">
            <span className="text-2xl">🔥</span>
          </div>
          <h1 className="text-xl font-semibold text-white">OpenForge</h1>
          <p className="text-sm text-white/50">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-accent/60 focus:bg-white/8 transition-all"
            />
            {error && (
              <p className="text-sm text-red-400 px-1">{error}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 rounded-xl bg-accent hover:bg-accent/80 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Enter OpenForge'}
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
  );
}
