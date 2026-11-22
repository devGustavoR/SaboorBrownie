// Fila de sincronização com o Supabase.
// Tudo que o Dia do Evento registra vai primeiro para o navegador (funciona sem
// internet) e entra nesta fila; quando há conexão, a fila é enviada ao banco na
// ordem. Se o envio falha, nada se perde: tenta de novo depois.
import { supabase } from "@/lib/supabase";
import { useSyncExternalStore } from "react";

export type Tabela = "EVENTOS" | "EVENTO_VENDAS" | "ROLETA_SORTEIOS" | "VENDAS";

export type Operacao =
  | {
      id: string;
      tipo: "upsert";
      tabela: Tabela;
      chave: string; // coluna da chave primária
      linha: Record<string, unknown>;
    }
  | {
      id: string;
      tipo: "update";
      tabela: Tabela;
      chave: string;
      valor: string;
      campos: Record<string, unknown>;
    }
  | {
      id: string;
      tipo: "delete";
      tabela: Tabela;
      chave: string;
      valores: string[];
    };

type NovaOperacao = Operacao extends infer O
  ? O extends Operacao
    ? Omit<O, "id">
    : never
  : never;

export interface StatusSync {
  pendentes: number;
  enviando: boolean;
  online: boolean;
  erro: string | null;
  semLogin: boolean;
  ultimoEnvio: string | null;
}

const FILA_KEY = "saboor:fila-sync-v1";

let fila: Operacao[] = [];
let carregada = false;
let status: StatusSync = {
  pendentes: 0,
  enviando: false,
  online: true,
  erro: null,
  semLogin: false,
  ultimoEnvio: null,
};
const ouvintes = new Set<() => void>();

const emitir = (patch: Partial<StatusSync>) => {
  status = { ...status, ...patch, pendentes: fila.length };
  ouvintes.forEach((f) => f());
};

const carregar = () => {
  if (carregada || typeof window === "undefined") return;
  carregada = true;
  try {
    fila = JSON.parse(localStorage.getItem(FILA_KEY) ?? "[]") as Operacao[];
  } catch {
    fila = [];
  }
  emitir({ online: navigator.onLine });
};

const persistir = () => {
  try {
    localStorage.setItem(FILA_KEY, JSON.stringify(fila));
  } catch {
    // sem storage: a fila vale só enquanto a página estiver aberta
  }
};

const novoId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Coloca uma operação na fila e tenta enviar. Um upsert da mesma linha que ainda
// não foi enviado é substituído (só o estado mais recente importa).
export const enfileirar = (op: NovaOperacao) => {
  carregar();
  if (op.tipo === "upsert") {
    const k = String(op.linha[op.chave]);
    const i = fila.findIndex(
      (o) =>
        o.tipo === "upsert" &&
        o.tabela === op.tabela &&
        String(o.linha[o.chave]) === k,
    );
    if (i >= 0) {
      fila[i] = { ...op, id: fila[i].id } as Operacao;
      persistir();
      emitir({});
      void processarFila();
      return;
    }
  }
  fila.push({ ...op, id: novoId() } as Operacao);
  persistir();
  emitir({});
  void processarFila();
};

// ids com exclusão ainda não enviada (para não "ressuscitar" ao recuperar do banco)
export const exclusoesPendentes = (tabela: Tabela): Set<string> => {
  carregar();
  const s = new Set<string>();
  for (const o of fila) {
    if (o.tipo === "delete" && o.tabela === tabela) o.valores.forEach((v) => s.add(v));
  }
  return s;
};

const executar = async (op: Operacao) => {
  if (op.tipo === "upsert") {
    return supabase.from(op.tabela).upsert(op.linha, { onConflict: op.chave });
  }
  if (op.tipo === "update") {
    return supabase.from(op.tabela).update(op.campos).eq(op.chave, op.valor);
  }
  return supabase.from(op.tabela).delete().in(op.chave, op.valores);
};

let processando: Promise<void> | null = null;

export const processarFila = (): Promise<void> => {
  carregar();
  if (processando) return processando;
  if (fila.length === 0) {
    emitir({ erro: null });
    return Promise.resolve();
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    emitir({ online: false });
    return Promise.resolve();
  }
  processando = (async () => {
    emitir({ enviando: true });
    const { data } = await supabase.auth.getSession();
    const logado = !!data.session;
    while (fila.length > 0) {
      const op = fila[0];
      // tabelas com dados de clientes exigem login (RLS)
      if (!logado && op.tabela !== "VENDAS") {
        emitir({ semLogin: true, erro: "Entre com seu login para salvar no banco." });
        break;
      }
      try {
        const { error } = await executar(op);
        if (error) {
          emitir({ erro: error.message });
          break;
        }
      } catch {
        emitir({ erro: "Sem conexão com o banco." });
        break;
      }
      fila.shift();
      persistir();
      emitir({ erro: null, semLogin: false, ultimoEnvio: new Date().toISOString() });
    }
  })().finally(() => {
    processando = null;
    emitir({ enviando: false });
  });
  return processando;
};

// Liga o envio automático: ao voltar a internet e a cada 20 s
let ligado = false;
const ligar = () => {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  carregar();
  window.addEventListener("online", () => {
    emitir({ online: true });
    void processarFila();
  });
  window.addEventListener("offline", () => emitir({ online: false }));
  setInterval(() => void processarFila(), 20000);
  void processarFila();
};

const assinar = (f: () => void) => {
  ligar();
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
};

const SERVIDOR: StatusSync = {
  pendentes: 0,
  enviando: false,
  online: true,
  erro: null,
  semLogin: false,
  ultimoEnvio: null,
};

export const useStatusSync = () =>
  useSyncExternalStore(
    assinar,
    () => status,
    () => SERVIDOR,
  );
