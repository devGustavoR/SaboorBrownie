"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

const formatCurrency = (value: number) => {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // 1. Buscar Vendas (Apenas Preço e Data)
      const { data: sales } = await supabase
        .from("VENDAS")
        .select("vl_preco_venda, ts_venda")
        .gte("ts_venda", sevenDaysAgo);

      // 2. Buscar Despesas (Essas são as que você quer descontar: Embalagem, etc)
      const { data: expenses } = await supabase
        .from("DESPESAS")
        .select("vl_valor, ts_despesa")
        .gte("ts_despesa", sevenDaysAgo);

      if (sales || expenses) {
        const daysMap = new Map();
        const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

        // Inicializa os dias com zero
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dayName = weekDays[date.getDay()];
          daysMap.set(dayName, {
            day: dayName,
            revenue: 0,
            cost: 0,
            profit: 0,
          });
        }

        let revenueTotal = 0;

        // --- PROCESSAMENTO DAS VENDAS ---
        sales?.forEach((sale: any) => {
          const dayName = weekDays[new Date(sale.ts_venda).getDay()];
          if (daysMap.has(dayName)) {
            const current = daysMap.get(dayName);

            // Faturamento (Soma tudo o que entrou)
            const preco = Number(sale.vl_preco_venda);
            current.revenue += preco;

            // ALTERAÇÃO AQUI: NÃO SOMAMOS MAIS O CUSTO DO INGREDIENTE
            // O custo aqui fica zero, pois só vamos considerar as DESPESAS abaixo
            current.profit += preco; // Lucro inicial é igual ao preço (antes das despesas)

            daysMap.set(dayName, current);
            revenueTotal += preco;
          }
        });

        // --- PROCESSAMENTO DAS DESPESAS (EMBALAGEM, GÁS, ETC) ---
        expenses?.forEach((expense) => {
          const dayName = weekDays[new Date(expense.ts_despesa).getDay()];
          if (daysMap.has(dayName)) {
            const current = daysMap.get(dayName);
            const valorDespesa = Number(expense.vl_valor);

            current.cost += valorDespesa; // Soma ao custo total do dia
            current.profit -= valorDespesa; // Abate do lucro

            daysMap.set(dayName, current);
          }
        });

        setChartData(Array.from(daysMap.values()));
        setTotalRevenue(revenueTotal);
      }
      setLoading(false);
    };

    fetchAnalytics();
  }, []);

  const maxValue = Math.max(...chartData.map((d) => d.revenue || 0), 100);

  return (
    <div className="flex flex-col w-full min-h-screen bg-brand-bg text-text-main font-display overflow-x-hidden">
      <main className="flex-1 px-4 py-8 md:px-10 lg:px-20 xl:px-40">
        <div className="mx-auto max-w-[1280px] flex flex-col gap-8">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-text-main text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
                Analytics Financeiro
              </h1>
              <p className="text-primary/70 text-base font-normal">
                Visão de Caixa (Vendas - Despesas Pagas)
              </p>
            </div>
          </div>

          <div className="w-full bg-white rounded-[1.5rem] shadow-xl shadow-primary/5 p-6 md:p-8 border border-white/40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-text-main text-lg font-bold">
                  Faturamento vs Despesas
                </h3>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold tracking-tight text-primary">
                    {loading ? "..." : formatCurrency(totalRevenue)}
                  </span>
                </div>
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-sm text-text-muted font-medium">
                    Entradas
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary/30"></div>
                  <span className="text-sm text-text-muted font-medium">
                    Saídas (Despesas)
                  </span>
                </div>
              </div>
            </div>

            {/* GRÁFICO VISUAL */}
            <div className="relative h-[240px] w-full mt-4">
              <div className="absolute inset-0 flex flex-col justify-between text-gray-200 text-xs z-0 pointer-events-none">
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-gray-100 w-full h-0"></div>
              </div>

              <div className="absolute inset-0 flex items-end justify-between px-2 sm:px-8 z-10">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    Carregando...
                  </div>
                ) : (
                  chartData.map((data, index) => {
                    const safeMax = maxValue || 100;
                    const revenueHeight = Math.max(
                      (data.revenue / safeMax) * 100,
                      4,
                    );
                    const costHeight = Math.max((data.cost / safeMax) * 100, 0);

                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center gap-3 w-full group cursor-pointer h-full justify-end relative"
                      >
                        <div className="relative w-8 sm:w-12 h-full flex items-end justify-center">
                          {/* Barra de Custo (Despesas) */}
                          <div
                            className="w-full bg-primary/30 rounded-t-md absolute bottom-0 transition-all duration-300 group-hover:bg-primary/40"
                            style={{ height: `${costHeight}%` }}
                          ></div>
                          {/* Barra de Faturamento */}
                          <div
                            className="w-full bg-primary rounded-t-md absolute bottom-0 transition-all duration-300 hover:shadow-lg group-hover:brightness-110"
                            style={{ height: `${revenueHeight}%` }}
                          ></div>

                          {/* Tooltip Detalhado */}
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-20 bg-white border border-gray-100 text-text-main text-xs px-3 py-2 rounded-xl transition-all duration-200 whitespace-nowrap z-20 shadow-xl pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                            <p className="font-bold text-primary text-sm">
                              {formatCurrency(data.revenue)}
                            </p>
                            <p className="text-red-500 font-medium text-[10px] mt-1">
                              - {formatCurrency(data.cost)} (Despesas)
                            </p>
                            <div
                              className={`border-t border-gray-100 mt-1 pt-1 font-bold ${data.profit >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              = {formatCurrency(data.profit)} (Saldo)
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-text-muted group-hover:text-primary transition-colors">
                          {data.day}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
