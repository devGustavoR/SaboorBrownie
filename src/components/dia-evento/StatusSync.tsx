"use client";

import { processarFila, useStatusSync } from "@/lib/sync";
import { Cloud, CloudOff, Loader2, LogIn, RefreshCw } from "lucide-react";
import Link from "next/link";

// Selo mostrando se as vendas do dia já estão salvas no banco
export function StatusSync() {
  const s = useStatusSync();

  if (s.semLogin) {
    return (
      <Link
        href="/"
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-100 text-red-700 text-xs font-bold"
        title="As vendas estão guardadas neste aparelho, mas só vão para o banco depois do login."
      >
        <LogIn size={16} /> Entrar para salvar no banco ({s.pendentes})
      </Link>
    );
  }
  if (!s.online) {
    return (
      <span
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-100 text-amber-800 text-xs font-bold"
        title="Sem internet. Tudo fica guardado neste aparelho e vai para o banco quando a conexão voltar."
      >
        <CloudOff size={16} /> Sem internet
        {s.pendentes > 0 ? ` · ${s.pendentes} a enviar` : ""}
      </span>
    );
  }
  if (s.pendentes > 0) {
    return (
      <button
        onClick={() => void processarFila()}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold ${
          s.erro ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
        }`}
        title={s.erro ?? "Enviando para o banco"}
      >
        {s.enviando ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <RefreshCw size={16} />
        )}
        {s.erro ? "Erro ao salvar · tentar de novo" : "Salvando"} ({s.pendentes})
      </button>
    );
  }
  return (
    <span
      className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-100 text-green-700 text-xs font-bold"
      title="Tudo salvo no banco"
    >
      <Cloud size={16} /> Salvo no banco
    </span>
  );
}
