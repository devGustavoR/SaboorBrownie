"use client";

import { supabase } from "@/lib/supabase";
import { ArrowRight, ChefHat, Loader2, Lock, User } from "lucide-react";
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
    <div className="bg-[#F3E8FF] min-h-screen font-sans flex items-center justify-center p-4">
      {/* Container Principal: Reduzi max-w para 7xl para não ficar esticado demais em telas ultrawide */}
      <div className="w-full max-w-7xl bg-white shadow-2xl rounded-3xl overflow-hidden flex flex-col lg:flex-row min-h-[600px] lg:min-h-[800px]">
        {/* --- LADO ESQUERDO: IMAGEM (Apenas Desktop/Tablet Grande) --- */}
        <div className="hidden lg:block lg:w-1/2 relative bg-gray-900">
          <div className="absolute inset-0 bg-[#6B21A8]/40 z-10 mix-blend-multiply transition-opacity hover:opacity-90"></div>
          {/* Imagem */}
          <img
            alt="Brownie delicioso"
            className="absolute inset-0 w-full h-full object-cover opacity-90"
            src="https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=1974&auto=format&fit=crop"
          />

          {/* Texto sobre a imagem */}
          <div className="absolute bottom-16 left-12 right-12 z-20 text-white">
            <h2 className="font-serif text-4xl xl:text-5xl font-bold mb-6 leading-tight drop-shadow-lg">
              A doçura que transforma momentos.
            </h2>
            <p className="text-lg xl:text-xl font-light text-purple-50 drop-shadow-md max-w-md">
              Gerencie sua produção com a mesma excelência que você coloca em
              cada receita.
            </p>
          </div>
        </div>

        {/* --- LADO DIREITO: FORMULÁRIO --- */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 lg:p-16 xl:p-20 bg-white">
          <div className="w-full max-w-md space-y-8">
            {/* Header */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center bg-[#6B21A8] p-3 rounded-2xl text-white shadow-lg shadow-purple-200 mb-6 transform transition-transform hover:scale-105">
                <ChefHat size={32} />
              </div>
              <h1 className="font-serif font-bold text-3xl lg:text-4xl text-gray-900 mb-2 tracking-tight">
                Saboor Brownie
              </h1>
              <p className="text-gray-500 text-base lg:text-lg">
                Bem-vindo de volta, Chef.
              </p>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium text-center border border-red-100 animate-in fade-in slide-in-from-top-2">
                {errorMsg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleLogin} className="mt-8 space-y-5">
              <div className="space-y-4">
                {/* Email */}
                <div>
                  <label
                    className="block text-sm font-bold text-gray-700 mb-1.5 ml-1"
                    htmlFor="email"
                  >
                    Email
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#6B21A8] transition-colors">
                      <User size={20} />
                    </div>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6B21A8]/20 focus:border-[#6B21A8] transition-all bg-gray-50 focus:bg-white text-base"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </div>

                {/* Senha */}
                <div>
                  <label
                    className="block text-sm font-bold text-gray-700 mb-1.5 ml-1"
                    htmlFor="password"
                  >
                    Senha
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#6B21A8] transition-colors">
                      <Lock size={20} />
                    </div>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-11 pr-4 py-3.5 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#6B21A8]/20 focus:border-[#6B21A8] transition-all bg-gray-50 focus:bg-white text-base"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    type="checkbox"
                    className="h-4 w-4 text-[#6B21A8] focus:ring-[#6B21A8] border-gray-300 rounded cursor-pointer"
                  />
                  <label
                    htmlFor="remember-me"
                    className="ml-2 block text-sm text-gray-600 cursor-pointer select-none"
                  >
                    Lembrar de mim
                  </label>
                </div>
                <a
                  href="#"
                  className="text-sm font-bold text-[#6B21A8] hover:text-purple-700 transition-colors"
                >
                  Esqueceu a senha?
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-4 px-4 border border-transparent rounded-xl shadow-lg shadow-purple-500/20 text-base font-bold text-white bg-[#6B21A8] hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6B21A8] transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    Entrar no Dashboard
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                © 2026 Saboor Brownie System. <br className="sm:hidden" />
                Desenvolvido com 💜 e café.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
