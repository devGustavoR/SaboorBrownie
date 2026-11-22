// Sabores (recheios) vendidos: a mesma lista para todas as telas
export const SABORES = [
  "TRADICIONAL",
  "NINHO",
  "BRIGADEIRO",
  "MARACUJA",
  "MORANGO",
  "MISTO",
] as const;

export const ROTULO_SABOR: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  MARACUJA: "Maracujá",
  MORANGO: "Morango",
  MISTO: "Misto",
  // nomes antigos que ainda podem aparecer em vendas/lotes
  DOCE_DE_LEITE: "Doce de Leite",
  SEM_RECHEIO: "Sem Recheio",
  BASE: "Massa Brownie",
  BASE_CAKE: "Massa Cake",
  BASE_BOMBOM: "Massa Bombom",
};

export const nomeSabor = (s: string | null | undefined) =>
  s
    ? (ROTULO_SABOR[s] ??
      s
        .toLowerCase()
        .split("_")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" "))
    : "Sem sabor";

export const ehMassa = (s: string) => s.startsWith("BASE");

export const dinheiro = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// numeric do banco pode chegar como texto
export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
