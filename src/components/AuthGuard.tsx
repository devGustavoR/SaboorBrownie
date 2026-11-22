"use client";

import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Há login guardado neste aparelho? (vale mesmo sem internet e com o token
// vencido: no evento o tablet não pode ser jogado para fora do PDV)
const temLoginGuardado = () => {
  try {
    return Object.keys(localStorage).some(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
  } catch {
    return false;
  }
};

// Só mostra o painel para quem entrou com email e senha
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      if (data.session || temLoginGuardado()) setLiberado(true);
      else router.replace("/");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") router.replace("/");
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (!liberado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3E8FF] text-[#6B21A8]">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }
  return <>{children}</>;
}
