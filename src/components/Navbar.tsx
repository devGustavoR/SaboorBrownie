"use client";

import { supabase } from "@/lib/supabase";
import { ChefHat, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Na ordem do trabalho: planejar → vender → controlar
const NAV_LINKS = [
  { name: "Início", href: "/dashboard" },
  { name: "Evento", href: "/dashboard/evento" },
  { name: "Dia do Evento", href: "/dashboard/dia-evento" },
  { name: "Estoque", href: "/dashboard/estoque" },
  { name: "Insumos", href: "/dashboard/materiais" },
  { name: "Custos", href: "/dashboard/custos" },
  { name: "Análises", href: "/dashboard/analises" },
  { name: "Configurações", href: "/dashboard/settings" },
];

const ativo = (pathname: string, href: string) =>
  href === "/dashboard"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

export function Navbar() {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [email, setEmail] = useState("");
  const contaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  // fecha o menu da conta ao tocar fora
  useEffect(() => {
    if (!contaAberta) return;
    const fora = (e: MouseEvent) => {
      if (!contaRef.current?.contains(e.target as Node)) setContaAberta(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [contaAberta]);

  const sair = async () => {
    if (!confirm("Sair do sistema neste aparelho?")) return;
    await supabase.auth.signOut();
  };

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-purple-100 shadow-sm">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          <Link href="/dashboard" className="flex items-center gap-3 group shrink-0">
            <div className="bg-[#6B21A8] p-2 rounded-lg text-white shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
              <ChefHat size={22} />
            </div>
            <span className="font-serif text-[#6B21A8] text-lg font-bold leading-tight tracking-tight hidden sm:block">
              Saboor Brownie
            </span>
          </Link>

          <nav className="hidden xl:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const on = ativo(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-md whitespace-nowrap ${
                    on
                      ? "text-[#6B21A8] font-bold bg-purple-50"
                      : "text-gray-500 hover:text-[#6B21A8] hover:bg-purple-50"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative" ref={contaRef}>
              <button
                onClick={() => setContaAberta((v) => !v)}
                className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-[#6B21A8] p-0.5 shadow-md hover:shadow-lg transition-shadow"
                aria-label="Conta"
              >
                <span className="h-full w-full rounded-full bg-white flex items-center justify-center text-[#6B21A8] font-bold text-sm uppercase">
                  {email.charAt(0) || "S"}
                </span>
              </button>
              {contaAberta && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-xl border border-purple-100 p-2 z-50">
                  {email && (
                    <p className="px-3 py-2 text-xs text-gray-500 truncate">
                      {email}
                    </p>
                  )}
                  <button
                    onClick={sair}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Sair
                  </button>
                </div>
              )}
            </div>

            <button
              className="xl:hidden p-2 text-gray-500 hover:bg-purple-50 rounded-md transition-colors"
              onClick={() => setMenuAberto((v) => !v)}
              aria-label="Menu"
            >
              {menuAberto ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {menuAberto && (
        <div className="xl:hidden absolute top-full left-0 w-full bg-white border-b border-purple-100 shadow-xl py-3 px-4 grid grid-cols-2 sm:grid-cols-4 gap-2 z-40">
          {NAV_LINKS.map((link) => {
            const on = ativo(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuAberto(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                  on
                    ? "bg-purple-100 text-[#6B21A8] font-bold"
                    : "text-gray-600 bg-gray-50 hover:bg-purple-50 hover:text-[#6B21A8]"
                }`}
              >
                {link.name}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
