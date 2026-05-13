'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Identifiant ou mot de passe incorrect.');
      setLoading(false);
    } else {
      router.replace('/');
    }
  }

  const inputCls = 'w-full border border-[#E0E0E0] rounded-lg px-4 py-2.5 text-sm text-[#1A1A1A] focus:outline-none focus:border-[#E30613] mt-1';

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center px-4">
      <div className="w-full max-w-[420px] bg-white rounded-xl shadow-md overflow-hidden">

        {/* Header rouge */}
        <div className="bg-[#E30613] px-8 py-6 text-center">
          <p className="text-white font-black text-[32px] tracking-widest leading-none">EASYCASH ❤️</p>
        </div>

        {/* Formulaire */}
        <div className="px-8 py-7 space-y-5">
          <p className="text-sm text-[#6B7280] leading-relaxed">
            Connectez-vous à votre espace en saisissant votre identifiant et votre mot de passe ci-dessous.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-bold text-[#1A1A1A]">Identifiant</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputCls}
                placeholder="Votre identifiant..."
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-sm font-bold text-[#1A1A1A]">Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Votre mot de passe..."
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#E30613] hover:bg-[#B8050F] disabled:opacity-60 text-white font-bold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Connexion...' : 'Connexion'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
