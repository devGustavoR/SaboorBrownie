"use client";

import { Bell, ChefHat, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Custos", href: "/dashboard/custos" },
  { name: "Analytics", href: "/dashboard/analises" },
  { name: "Estoque", href: "/dashboard/estoque" },
  { name: "Materiais", href: "/dashboard/materiais" },
  { name: "Evento", href: "/dashboard/evento" },
  { name: "Configurações", href: "/dashboard/settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-purple-100 shadow-sm transition-all">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="bg-[#6B21A8] p-2 rounded-lg text-white shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
              <ChefHat size={24} />
            </div>
            <h2 className="font-serif text-[#6B21A8] text-xl font-bold leading-tight tracking-tight">
              Saboor Brownie
            </h2>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-md ${
                    isActive
                      ? "text-[#6B21A8] font-bold"
                      : "text-gray-500 hover:text-[#6B21A8] hover:bg-purple-50"
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-[#6B21A8] rounded-full"></span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Actions (Notificação + Perfil + Mobile Toggle) */}
          <div className="flex items-center gap-4">
            {/* Notificações */}
            <div className="relative hidden sm:block">
              <button className="p-2 rounded-full text-gray-400 hover:bg-purple-50 hover:text-[#6B21A8] transition-colors">
                <Bell size={20} />
              </button>
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse ring-2 ring-white"></span>
            </div>

            {/* Avatar Placeholder */}
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-400 to-[#6B21A8] p-0.5 shadow-md cursor-pointer hover:shadow-lg transition-shadow">
              <div className="h-full w-full rounded-full bg-white flex items-center justify-center overflow-hidden">
                <span className="text-[#6B21A8] font-bold text-sm">G</span>
              </div>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-gray-500 hover:bg-purple-50 rounded-md transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-purple-100 shadow-xl py-4 px-6 flex flex-col gap-2 animate-in slide-in-from-top-2 z-40">
          {NAV_LINKS.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded-xl text-base font-medium transition-colors ${
                  isActive
                    ? "bg-purple-50 text-[#6B21A8]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-[#6B21A8]"
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
