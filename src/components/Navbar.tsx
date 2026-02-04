"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { name: "Dashboard", href: "/dashboard" },
  // { name: "Vendas", href: "/dashboard/vendas" },
  { name: "Custos", href: "/dashboard/custos" },
  { name: "Analytics", href: "/dashboard/analises" },
  { name: "Estoque", href: "/dashboard/estoque" },
  // { name: "Configurações", href: "/dashboard/settings" },
];

export function Navbar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-white/20 px-6 py-3 shadow-sm">
      <div className="mx-auto max-w-[1280px] flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="text-primary size-8 flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">
              bakery_dining
            </span>
          </div>
          <h2 className="text-text-main text-lg font-bold leading-tight tracking-[-0.015em]">
            Saboor Brownie
          </h2>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          <nav className="flex items-center gap-6">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors ${
                    isActive
                      ? "text-primary font-bold"
                      : "text-text-main hover:text-primary"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Actions (Botão + Perfil) */}
        <div className="flex items-center gap-4">
          {/* <button className="hidden sm:flex h-10 px-4 items-center gap-2 bg-primary hover:bg-[#23268a] transition-colors text-white rounded-full text-sm font-bold shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span className="truncate">Novo Lançamento</span>
          </button> */}

          {/* Avatar Placeholder */}
          {/* <div
            className="bg-center bg-no-repeat bg-cover rounded-full size-10 border-2 border-white shadow-sm cursor-pointer bg-gray-200"
            style={{
              backgroundImage: 'url("https://i.pravatar.cc/150?img=12")',
            }}
          ></div> */}

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden text-text-main"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-100 shadow-lg py-4 px-6 flex flex-col gap-4 animate-in slide-in-from-top-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="text-text-main font-medium py-2 hover:text-primary"
            >
              {link.name}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
