"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profit, setProfit] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const salesGoal = 12;

  // Carregar dados reais do Supabase
  const fetchData = async () => {
    setLoading(true);

    // 1. Buscar Vendas com o Custo do Lote relacionado
    // Nota: Como suas tabelas usam aspas duplas ("LOTES"), precisamos referenciar exatamente assim no select se o Supabase exigir,
    // mas geralmente a lib js abstrai isso se configurado. Se der erro, tente .from('"VENDAS"')
    const { data: vendas, error } = await supabase.from("VENDAS").select(`
        vl_preco_venda,
        LOTES (
          vl_custo_unitario
        )
      `);

    if (vendas) {
      let totalLucro = 0;
      const totalVendas = vendas.length;

      vendas.forEach((venda: any) => {
        const preco = venda.vl_preco_venda || 0;
        // Se tiver lote vinculado, pega o custo, senão assume 0 (ou um custo médio fixo se preferir)
        const custo = venda.LOTES?.vl_custo_unitario || 0;
        totalLucro += preco - custo;
      });

      setProfit(totalLucro);
      setSalesCount(totalVendas);
    }
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await fetchData();
    };
    load();
  }, []);

  const handleSale = async () => {
    const { error } = await supabase.from("VENDAS").insert([
      { vl_preco_venda: 7.0 }, // cd_lote ficará NULL por enquanto
    ]);

    if (!error) {
      fetchData(); // Recarrega os dados
    } else {
      console.error("Erro ao vender:", error);
    }
  };

  const progressPercentage = Math.min((salesCount / salesGoal) * 100, 100);

  return (
    <div className="flex flex-col h-full bg-brand-bg text-[#101019]">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 md:px-6">
        <div className="layout-content-container flex flex-col w-full max-w-[500px] gap-6">
          {/* Main Stats Card */}
          <div className="flex flex-col items-center justify-center rounded-[24px] bg-white p-10 shadow-lg shadow-purple-900/5 text-center transition-transform hover:scale-[1.01]">
            <div className="mb-4 p-3 bg-purple-50 rounded-full text-primary">
              <span className="material-symbols-outlined text-4xl">
                payments
              </span>
            </div>
            <p className="text-[#585a8d] text-base font-medium leading-normal mb-1">
              Lucro Líquido Real
            </p>
            <p className="text-[#101019] tracking-tight text-5xl font-bold leading-tight">
              {loading
                ? "..."
                : profit.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </p>
          </div>

          {/* Action Button */}
          <button
            onClick={handleSale}
            disabled={loading}
            className="group relative w-full cursor-pointer overflow-hidden rounded-full h-14 bg-primary text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-[#23268a] active:scale-[0.98] disabled:opacity-70"
          >
            <div className="flex items-center justify-center gap-2">
              <span className="material-symbols-outlined">
                add_shopping_cart
              </span>
              <span className="text-lg font-bold leading-normal tracking-[0.015em]">
                {loading ? "Processando..." : "Vender 1 (R$ 7,00)"}
              </span>
            </div>
          </button>

          {/* Progress (Mantido igual) */}
          <div className="flex flex-col gap-4 p-6 rounded-[24px] bg-white shadow-md shadow-purple-900/5">
            {/* ... código da barra de progresso igual ao anterior ... */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">
                  trending_up
                </span>
                <p className="text-[#101019] text-base font-bold leading-normal">
                  Meta da Semana
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-lg">
                {salesCount >= salesGoal ? "Concluída!" : "Em andamento"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="relative h-4 w-full rounded-full bg-[#f0f0f5] overflow-hidden">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-primary to-indigo-400 transition-all duration-500 ease-out"
                  style={{ width: `${progressPercentage}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-1">
                <p className="text-[#585a8d] text-sm font-medium">
                  {salesCount} de {salesGoal} unidades
                </p>
                <p className="text-[#101019] text-sm font-bold">
                  {Math.round(progressPercentage)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
