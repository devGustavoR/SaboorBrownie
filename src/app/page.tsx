"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg("Email ou senha inválidos.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-bg">
      {/* Card de Login */}
      <div className="w-full max-w-sm bg-white/90 backdrop-blur-sm rounded-[2rem] shadow-xl shadow-primary/10 p-8 md:p-10 transition-all hover:scale-[1.01]">
        {/* Logo / Header */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex items-center justify-center size-16 bg-white rounded-full shadow-md text-primary animate-bounce">
            <span className="material-symbols-outlined text-4xl">cookie</span>
          </div>
          <div className="text-center">
            <h1 className="text-[#101019] text-2xl font-bold tracking-tight">
              Saboor Brownie
            </h1>
            <p className="text-[#585a8d] text-sm font-medium mt-1">
              Bem-vindo de volta!
            </p>
          </div>
        </div>

        {/* Formulário */}
        <form onSubmit={handleLogin} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold text-[#585a8d] uppercase tracking-wider mb-2 ml-1">
              Email
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
                mail
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-11 pr-4 py-3.5 bg-[#f6f6f8] border-transparent focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/10 rounded-2xl text-sm font-medium text-[#101019] transition-all outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#585a8d] uppercase tracking-wider mb-2 ml-1">
              Senha
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
                lock
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 bg-[#f6f6f8] border-transparent focus:bg-white focus:border-primary/30 focus:ring-4 focus:ring-primary/10 rounded-2xl text-sm font-medium text-[#101019] transition-all outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-4 bg-primary hover:bg-[#23268a] text-white rounded-2xl font-bold text-base shadow-lg shadow-primary/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="material-symbols-outlined animate-spin">
                progress_activity
              </span>
            ) : (
              <>
                <span>Entrar</span>
                <span className="material-symbols-outlined text-lg">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <a
            href="#"
            className="text-sm font-medium text-[#585a8d] hover:text-primary transition-colors"
          >
            Esqueceu a senha?
          </a>
        </div>
      </div>

      <p className="mt-8 text-primary/60 text-sm font-medium">
        © 2024 Saboor Brownie
      </p>
    </div>
  );
}
