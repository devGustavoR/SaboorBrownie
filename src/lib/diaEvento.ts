// Tipos e funções do Dia do Evento (PDV), usados pela tela e pelo relatório
import type { Beneficio } from "@/lib/roleta";
import { Banknote, CreditCard, QrCode, Wallet } from "lucide-react";

// Os dados do planejamento vêm da tela "Evento" (orçamento salvo ou rascunho).
// Chaves de quantidade: "SABOR" (brownie), "SABOR:CAKE", "SABOR:BOMBOM".
export interface Plano {
  id: string;
  nomeEvento: string;
  qtdSabores: Record<string, string>;
  valoresVenda?: Record<string, string>;
  descontoPct?: string;
  descontoDestino?: string;
  custo?: number; // custo previsto das compras (do orçamento)
  doBanco?: boolean; // recuperado do Supabase (não existe neste aparelho)
}

export type BaseId = "BROWNIE" | "CAKE" | "BOMBOM";
export type Pagamento = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";

export interface ItemVenda {
  key: string;
  qtd: number;
  preco: number;
}

export interface CupomAplicado {
  codigo: string;
  premio: string;
  beneficio: Beneficio;
  desconto: number; // R$ abatidos desta venda
}

export interface Venda {
  id: string;
  ts: string;
  itens: ItemVenda[];
  subtotal?: number; // produtos antes do cupom (vendas antigas: = total)
  total: number; // produtos depois do cupom (base da receita e do desconto)
  acrescimo?: number; // taxa do cartão repassada ao cliente (R$)
  pagamento: Pagamento;
  recebido?: number;
  cupom?: CupomAplicado;
  lancamentos?: string[]; // ids das linhas criadas em VENDAS (estoque)
}

export interface Sorteio {
  id: string;
  vendaId: string;
  ts: string;
  email: string;
  premio: string;
  vazio?: boolean;
  cupom?: string; // código SAB-XXXX (só prêmios de verdade)
  beneficio?: Beneficio;
  valor?: number;
  usadoEm?: string; // venda em que o cupom foi usado
  usadoTs?: string;
}

// Estado do dia de cada evento (fica neste navegador e no banco)
export interface Dia {
  ajustes: Record<string, number>; // diferença em relação ao planejado
  precoDia: Record<string, string>; // preço alterado no dia
  vendas: Venda[];
  sorteios?: Sorteio[];
}

// Linha de produto à venda (sabor × massa) já com estoque e preço do dia
export interface ItemDia {
  key: string;
  sabor: string;
  base: BaseId;
  planejado: number;
  total: number;
  vendido: number;
  restante: number;
  preco: number;
}

export const BASES: { id: BaseId; label: string; curto: string; cor: string }[] = [
  { id: "BROWNIE", label: "Brownie", curto: "Brownie", cor: "bg-purple-100 text-purple-700" },
  { id: "CAKE", label: "Cake Brownie", curto: "Cake", cor: "bg-amber-100 text-amber-800" },
  { id: "BOMBOM", label: "Bombom Brownie", curto: "Bombom", cor: "bg-rose-100 text-rose-700" },
];

export const PAGAMENTOS: { id: Pagamento; label: string; icon: typeof Banknote }[] = [
  { id: "DINHEIRO", label: "Dinheiro", icon: Banknote },
  { id: "PIX", label: "Pix", icon: QrCode },
  { id: "DEBITO", label: "Débito", icon: Wallet },
  { id: "CREDITO", label: "Crédito", icon: CreditCard },
];

// vendas antigas (antes de separar débito e crédito) eram só "Cartão"
export const rotuloPagamento = (id: string) =>
  PAGAMENTOS.find((p) => p.id === id)?.label ?? "Cartão";

export const toNumber = (v: string | number | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const formatSabor = (sabor: string) =>
  sabor === "MARACUJA"
    ? "Maracujá"
    : sabor
        .toLowerCase()
        .split("_")
        .map((p) => (p === "de" ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(" ");

export const parseKey = (key: string): { sabor: string; base: BaseId } => {
  const [sabor, base] = key.split(":");
  return { sabor, base: (base as BaseId) ?? "BROWNIE" };
};
export const makeKey = (sabor: string, base: BaseId) =>
  base === "BROWNIE" ? sabor : `${sabor}:${base}`;
export const baseInfo = (id: BaseId) => BASES.find((b) => b.id === id) ?? BASES[0];

export const nomeItem = (key: string) => {
  const { sabor, base } = parseKey(key);
  return base === "BROWNIE"
    ? formatSabor(sabor)
    : `${formatSabor(sabor)} · ${baseInfo(base).curto}`;
};

export const horaCurta = (ts: string) =>
  new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const subtotalDe = (v: Venda) => v.subtotal ?? v.total;

// UUID v4 (o banco usa uuid na tabela VENDAS). crypto.randomUUID só existe em
// https; getRandomValues funciona sempre.
export const uuid = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // http (sem contexto seguro): monta na mão
    }
  }
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

// Baixa um CSV (Excel em português: separador ";" e BOM para acentos)
export const baixarCsv = (nome: string, linhas: (string | number)[][]) => {
  const csv = linhas
    .map((l) =>
      l
        .map((c) =>
          typeof c === "number"
            ? String(c).replace(".", ",")
            : `"${c.replace(/"/g, '""')}"`,
        )
        .join(";"),
    )
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
};

export const nomeArquivo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\W+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "evento";
