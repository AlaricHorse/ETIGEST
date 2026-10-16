// src/app/login/page.tsx
// Item 4.1: Tela de Login Institucional ETI (Usuário ou E-mail + Senha, sem auto-cadastro de professores)
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha na autenticação.');
      }
      router.push(data.redirectTo || '/professor/chamadas');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-[#0A192F] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border-t-8 border-[#FF6B00]">
        <div className="p-8">
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 rounded-full bg-[#0A192F] text-[#FFB800] text-xs font-bold uppercase tracking-wider">
              Escola Técnica Império
            </span>
            <h1 className="text-2xl font-extrabold text-[#0A192F] mt-3">
              ETI Gestão Escolar
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Acesse com seu usuário ou e-mail institucional
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-50 border border-red-400 text-red-900 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Usuário ou E-mail
              </label>
              <input
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ex: prof.carlos ou admin@imperio.edu.br"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#FF6B00] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Senha de Acesso
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:border-[#FF6B00] text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[#FF6B00] hover:bg-[#e66000] text-white font-bold text-sm shadow-lg transition disabled:opacity-50"
            >
              {loading ? 'Autenticando...' : 'Entrar no Sistema'}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500">
              Acesso exclusivo para docentes e administração vinculados pela Escola Técnica Império.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
