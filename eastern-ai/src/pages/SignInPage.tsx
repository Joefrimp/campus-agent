/**
 * Sign In page — Vector design system (index.css + tailwind config tokens).
 * Email + password, plus Google OAuth. No styling outside the existing palette.
 *
 * Auth state: Supabase (already in useAuth).
 * Routing: react-router-dom (already installed).
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Bot, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export function SignInPage() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && session) navigate('/dashboard', { replace: true });
  }, [session, authLoading, navigate]);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Email and password required.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen bg-vector-bg text-vector-secondary overflow-hidden selection:bg-vector-primary selection:text-white">
      {/* Background nebula glows — mirrors landing */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-vector-primary/5 blur-[150px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/5 blur-[120px]" />
      </div>

      {/* Nav (same pill shape as landing) */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto glass-pill rounded-full px-6 py-3 flex items-center justify-between border-white/5 bg-[#030303]/50 backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-vector-primary/10 border border-vector-primary/20 flex items-center justify-center glow-shadow">
              <Bot className="text-white w-5 h-5 drop-shadow-md" />
            </div>
            <span className="font-display font-bold text-xl text-white tracking-tight">Vector</span>
          </Link>
          <div className="flex items-center gap-6">
            <span className="hidden sm:inline text-sm font-semibold text-zinc-300">New here?</span>
            <Link
              to="/register"
              className="bg-white text-black px-6 py-2.5 rounded-full text-sm font-bold hover:bg-vector-primary hover:text-white hover:glow-shadow transition-all flex items-center gap-2"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10 pt-32 pb-20 flex items-start justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl md:text-5xl font-black text-white tracking-tight leading-[1.05] mb-3">
              Welcome back.
            </h1>
            <p className="text-zinc-400 text-lg">Sign in to your Vector.</p>
          </div>

          <div className="glass-pill rounded-[2rem] border border-white/10 bg-[#0A0A0A] p-8">
            {/* Google */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="flex items-center justify-center gap-3 w-full h-12 rounded-full bg-white text-gray-900 font-[Outfit] font-bold text-sm hover:brightness-95 active:scale-[0.98] transition-all disabled:opacity-60 mb-5"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
              <span className="font-[Inter] text-[10px] tracking-[0.15em] text-[#A1A1AA] uppercase font-medium">
                Or with email
              </span>
              <div className="flex-1 h-px bg-[rgba(255,255,255,0.1)]" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="chief@eastern.ai"
                autoFocus
              />
              <Field
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />

              {error && (
                <p className="text-sm text-[#F87171] font-[Inter] font-medium pt-1">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-vector-primary text-black font-[Outfit] font-bold px-6 py-4 rounded-full hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-60 text-base"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    Sign in <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center text-sm text-zinc-400 font-[Inter] pt-6 mt-6 border-t border-[rgba(255,255,255,0.1)]">
              New here?{' '}
              <Link
                to="/register"
                className="text-vector-primary hover:brightness-110 font-semibold transition-all"
              >
                Create an account
              </Link>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

/* Inline form field — matches Vector design (bg #0A0A0A inputs, white text) */
function Field({
  label,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="block font-[Inter] text-xs font-medium uppercase tracking-widest text-[#E0E0E0] mb-2">
        {label}
      </span>
      <input
        {...inputProps}
        className="w-full h-12 px-4 rounded-xl bg-[#0A0A0A] border border-[rgba(255,255,255,0.1)] text-white font-[Inter] text-sm placeholder:text-zinc-600 focus:outline-none focus:border-vector-primary/60 focus:ring-2 focus:ring-vector-primary/20 transition-all"
      />
    </label>
  );
}
