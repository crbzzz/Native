import { useState } from 'react';
import { signUp, signIn, signInWithGoogle } from '../lib/auth';
import { Sparkles, X } from 'lucide-react';

interface AuthProps {
  onSuccess: () => void;
  onClose?: () => void;
  variant?: 'page' | 'embed';
}

export default function Auth({ onSuccess, onClose, variant = 'page' }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const isEmbed = variant === 'embed';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await signIn(email, password);
        if (error) throw error;
        if (!data.session) {
          throw new Error("Connexion impossible (session manquante). Vérifie tes identifiants et la config Supabase.");
        }
      } else {
        const { data, error } = await signUp(email, password);
        if (error) throw error;

        // Cas courant: confirmation email activée => session null
        if (!data.session) {
          setInfo(
            "Compte créé. Vérifie ta boîte mail pour confirmer l'adresse, puis reconnecte-toi. " +
            "(Tu peux aussi désactiver la confirmation email dans Supabase → Authentication → Providers → Email.)"
          );
          setLoading(false);
          return;
        }
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      // OAuth redirect: la page va recharger. Le listener onAuthStateChange mettra à jour l'état user.
      const path = (window.location.pathname || '/').toLowerCase();
      const postAuthPath = path.startsWith('/admin') ? '/admin' : '/chat';

      // Fallback: si jamais la config Supabase force un retour sur '/', on redirige après login.
      window.localStorage.setItem('native_post_auth_path', postAuthPath);

      const redirectTo = `${window.location.origin}${postAuthPath}`;
      const { error } = await signInWithGoogle(redirectTo);
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const content = (
    <div className="w-full max-w-md">
      <div
        className={
          'relative overflow-hidden rounded-3xl p-8 space-y-8 ' +
          'bg-white/35 border border-white/45 ' +
          'shadow-xl backdrop-blur-sm backdrop-saturate-150 ' +
          "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none " +
          'before:ring-1 before:ring-white/20 ' +
          "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none " +
          'after:bg-gradient-to-br after:from-white/35 after:to-transparent after:opacity-60'
        }
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 p-2 rounded-xl bg-white/25 border border-white/45 hover:bg-white/35 transition-colors"
            aria-label="Close"
            title="Close"
          >
            <X size={18} className="text-gray-800" />
          </button>
        )}

        <div className="flex items-center justify-center gap-3 mb-8">
          <Sparkles className="text-gray-900" size={32} />
          <h1 className="text-3xl font-normal text-gray-900">Native AI</h1>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className={
            'w-full py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
            'relative overflow-hidden ' +
            'bg-white/25 text-gray-900 ' +
            'border border-white/45 ' +
            'backdrop-blur-sm backdrop-saturate-150 hover:bg-white/35'
          }
        >
          Continue with Google
        </button>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-gray-200"></div>
          <span className="text-sm text-gray-600">or</span>
          <div className="flex-1 h-px bg-gray-200"></div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl border border-white/55 bg-white/65 text-gray-900 focus:outline-none focus:border-white/80 transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl border border-white/55 bg-white/65 text-gray-900 focus:outline-none focus:border-white/80 transition-colors"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          {info && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">{info}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={
              'w-full py-3 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
              'relative overflow-hidden ' +
              'bg-white/45 text-gray-900 ' +
              'border border-white/55 ' +
              'backdrop-blur-sm backdrop-saturate-150 hover:bg-white/55 ' +
              "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none " +
              'before:bg-gradient-to-br before:from-white/25 before:to-transparent before:opacity-70'
            }
          >
            {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
            setInfo('');
          }}
          className={
            'w-full py-3 rounded-xl font-medium transition-colors ' +
            'relative overflow-hidden ' +
            'bg-white/25 text-gray-900 ' +
            'border border-white/45 ' +
            'backdrop-blur-sm backdrop-saturate-150 hover:bg-white/35 ' +
            "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none " +
            'before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-60'
          }
        >
          {isLogin ? 'Create Account' : 'Already have account?'}
        </button>

        <p className="text-xs text-gray-500 text-center">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );

  if (isEmbed) return content;

  return <div className="min-h-screen bg-transparent flex items-center justify-center p-4">{content}</div>;
}
