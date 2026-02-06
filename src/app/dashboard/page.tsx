"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

// Mapeamento bonito
const FLAVOR_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  DOCE_DE_LEITE: "Doce de Leite",
  MISTO: "Misto",
  SEM_RECHEIO: "Sem Recheio",
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [processingSale, setProcessingSale] = useState(false);

  const [profit, setProfit] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [products, setProducts] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);

    // 1. Buscar Preços Configurados
    const { data: precos } = await supabase.from("TABELA_PRECOS").select("*");
    if (precos) setProducts(precos);

    // 2. Buscar Vendas (Faturamento)
    const { data: vendas } = await supabase
      .from("VENDAS")
      .select("vl_preco_venda");

    // 3. Buscar Despesas (Contas Pagas / Embalagens)
    const { data: despesas } = await supabase
      .from("DESPESAS")
      .select("vl_valor");

    if (vendas && despesas) {
      // Soma Faturamento
      const totalVendas = vendas.reduce(
        (acc, curr) => acc + (curr.vl_preco_venda || 0),
        0,
      );

      // Soma Despesas
      const totalDespesas = despesas.reduce(
        (acc, curr) => acc + (curr.vl_valor || 0),
        0,
      );

      // Cálculo Final: Entradas - Saídas
      // Se você quiser descontar TAMBÉM os ingredientes, precisaria somar o custo dos lotes aqui.
      // Mas para bater com o Analytics (Caixa), é Vendas - Despesas.
      const lucroLiquido = totalVendas - totalDespesas;

      setProfit(lucroLiquido);
      setSalesCount(vendas.length);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSale = async (flavor: string, price: number) => {
    setProcessingSale(true);

    // 1. Tenta achar lote ATIVO (FIFO)
    const { data: lotes } = await supabase
      .from("LOTES")
      .select("cd_lote")
      .eq("tp_sabor", flavor)
      .order("ts_producao", { ascending: true });

    let loteId = null;
    if (lotes && lotes.length > 0) {
      loteId = lotes[0].cd_lote;
    }

    // 2. Vende
    const { error } = await supabase
      .from("VENDAS")
      .insert([{ vl_preco_venda: price, cd_lote: loteId }]);

    if (!error) {
      fetchData();
    } else {
      alert("Erro ao registrar venda.");
      console.error(error);
    }
    setProcessingSale(false);
  };

  return (
    <div className="flex flex-col h-full bg-brand-bg text-[#101019]">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:px-6">
        <div className="layout-content-container flex flex-col w-full max-w-[600px] gap-6">
          {/* Lucro Card */}
          <div className="flex flex-col items-center justify-center rounded-[24px] bg-white p-8 shadow-lg shadow-purple-900/5 text-center transition-transform hover:scale-[1.01]">
            <p className="text-[#585a8d] text-sm font-bold uppercase tracking-wider mb-1">
              Saldo de Caixa (Vendas - Gastos)
            </p>
            <p
              className={`tracking-tight text-5xl font-black leading-tight ${profit >= 0 ? "text-[#101019]" : "text-red-500"}`}
            >
              {loading
                ? "..."
                : profit.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {salesCount} vendas realizadas
            </p>
          </div>

          {/* Grid de Vendas (POS) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products.length === 0 && !loading && (
              <div className="col-span-3 text-center text-gray-400 py-4 bg-white/50 rounded-xl border border-dashed border-gray-300">
                Configure os preços na aba Configurações.
              </div>
            )}

            {products.map((prod) => (
              <button
                key={prod.tp_sabor}
                onClick={() => handleSale(prod.tp_sabor, prod.vl_preco)}
                disabled={processingSale}
                className="flex flex-col items-center justify-center bg-white p-4 rounded-2xl shadow-sm border border-transparent hover:border-primary hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                <span className="font-bold text-[#101019] text-sm">
                  {FLAVOR_LABELS[prod.tp_sabor] || prod.tp_sabor}
                </span>
                <span className="text-primary font-black text-lg">
                  R$ {prod.vl_preco}
                </span>
              </button>
            ))}
          </div>

          {!products.find((p) => p.tp_sabor === "SEM_RECHEIO") && (
            <p className="text-center text-xs text-gray-400">
              Dica: Adicione "Sem Recheio" nas configurações.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
