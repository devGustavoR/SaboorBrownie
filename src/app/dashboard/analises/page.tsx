"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

// Função para formatar moeda
const formatCurrency = (value: number) => {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);

  // Estados para dados reais
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [chartData, setChartData] = useState<any[]>([]);

  // Carregar dados reais
  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);

      // 1. Buscar Vendas (últimos 7 dias)
      const { data: sales } = await supabase
        .from("VENDAS")
        .select("vl_preco_venda, ts_venda")
        .gte(
          "ts_venda",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        ); // Últimos 7 dias

      // 2. Buscar Custos (Despesas) (últimos 7 dias)
      const { data: expenses } = await supabase
        .from("DESPESAS")
        .select("vl_valor, ts_despesa")
        .gte(
          "ts_despesa",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        );

      if (sales && expenses) {
        // Agrupar por dia (seg, ter, qua...)
        const daysMap = new Map();
        const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

        // Inicializa os últimos 7 dias com zero
        for (let i = 6; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dayName = weekDays[date.getDay()];
          daysMap.set(dayName, { day: dayName, revenue: 0, cost: 0 });
        }

        // Soma Vendas
        let revenueTotal = 0;
        sales.forEach((sale) => {
          const dayName = weekDays[new Date(sale.ts_venda).getDay()];
          if (daysMap.has(dayName)) {
            const current = daysMap.get(dayName);
            current.revenue += Number(sale.vl_preco_venda);
            daysMap.set(dayName, current);
            revenueTotal += Number(sale.vl_preco_venda);
          }
        });

        // Soma Despesas
        expenses.forEach((expense) => {
          const dayName = weekDays[new Date(expense.ts_despesa).getDay()];
          if (daysMap.has(dayName)) {
            const current = daysMap.get(dayName);
            current.cost += Number(expense.vl_valor);
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

  const maxValue = Math.max(...chartData.map((d) => d.revenue || 0), 100); // Evita divisão por zero

  return (
    <div className="flex flex-col w-full min-h-screen bg-brand-bg text-text-main font-display overflow-x-hidden">
      <main className="flex-1 px-4 py-8 md:px-10 lg:px-20 xl:px-40">
        <div className="mx-auto max-w-[1280px] flex flex-col gap-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-text-main text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
                Analytics Financeiro
              </h1>
              <p className="text-primary/70 text-base font-normal">
                Visão detalhada de faturamento e custos semanais
              </p>
            </div>
            {/* Botões (Mantidos estáticos por enquanto) */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-full border border-green-200">
                <span className="material-symbols-outlined text-green-700 text-[18px]">
                  verified
                </span>
                <span className="text-green-700 text-sm font-bold">
                  Status: Nível Pleno
                </span>
              </div>
              <button className="flex items-center justify-center gap-2 h-10 px-6 bg-white border border-white/40 text-text-main rounded-full text-sm font-bold hover:bg-white/80 transition-colors shadow-sm">
                <span className="material-symbols-outlined text-[18px]">
                  download
                </span>
                <span>Exportar Relatório</span>
              </button>
            </div>
          </div>

          {/* Chart Section */}
          <div className="w-full bg-white rounded-[1.5rem] shadow-xl shadow-primary/5 p-6 md:p-8 border border-white/40">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-text-main text-lg font-bold">
                  Faturamento vs Custos
                </h3>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold tracking-tight text-primary">
                    {loading ? "..." : formatCurrency(totalRevenue)}
                  </span>
                  <div className="flex items-center gap-1 text-[#07883f] bg-green-50 px-2 py-1 rounded-md">
                    <span className="material-symbols-outlined text-sm">
                      trending_up
                    </span>
                    <span className="text-sm font-bold">Semana Atual</span>
                  </div>
                </div>
                <p className="text-text-muted text-sm">Comparativo Semanal</p>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-sm text-text-muted font-medium">
                    Faturamento
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary/30"></div>
                  <span className="text-sm text-text-muted font-medium">
                    Custos
                  </span>
                </div>
              </div>
            </div>

            {/* Bar Chart Visual */}
            <div className="relative h-[240px] w-full mt-4">
              {/* Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between text-gray-200 text-xs z-0 pointer-events-none">
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-dashed border-gray-100 w-full h-0"></div>
                <div className="border-b border-gray-100 w-full h-0"></div>
              </div>

              {/* Bars Container */}
              <div className="absolute inset-0 flex items-end justify-between px-2 sm:px-8 z-10">
                {loading ? (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    Carregando gráfico...
                  </div>
                ) : (
                  chartData.map((data, index) => {
                    const revenueHeight = Math.max(
                      (data.revenue / maxValue) * 100,
                      5,
                    ); // Min 5% pra não sumir
                    const costHeight = Math.max(
                      (data.cost / maxValue) * 100,
                      0,
                    );

                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center gap-3 w-full group cursor-pointer h-full justify-end relative"
                      >
                        <div className="relative w-8 sm:w-12 h-full flex items-end justify-center">
                          {/* Cost Bar */}
                          <div
                            className="w-full bg-primary/30 rounded-t-md absolute bottom-0 transition-all duration-300 group-hover:bg-primary/40"
                            style={{ height: `${costHeight}%` }}
                          ></div>
                          {/* Revenue Bar */}
                          <div
                            className="w-full bg-primary rounded-t-md absolute bottom-0 transition-all duration-300 hover:shadow-lg group-hover:brightness-110"
                            style={{ height: `${revenueHeight}%` }}
                          ></div>

                          {/* Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-14 bg-white border border-gray-100 text-text-main text-xs px-3 py-2 rounded-xl transition-all duration-200 whitespace-nowrap z-20 shadow-xl pointer-events-none transform translate-y-2 group-hover:translate-y-0">
                            <p className="font-bold text-primary">
                              {formatCurrency(data.revenue)}
                            </p>
                            <p className="text-text-muted text-[10px]">
                              Custo: {formatCurrency(data.cost)}
                            </p>
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

          {/* Stats Grid (Estático por enquanto, mas pode conectar com o banco depois) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              icon="pie_chart"
              color="blue"
              trend="up"
              trendValue="2.5%"
              label="Margem por Unidade"
              value="32%"
            />
            <StatCard
              icon="monitoring"
              color="purple"
              trend="up"
              trendValue="12%"
              label="Projeção Anual"
              value="R$ 650k"
            />
            <StatCard
              icon="balance"
              color="orange"
              trend="neutral"
              trendValue="Estável"
              label="Ponto de Equilíbrio"
              value="850"
              subValue="un/mês"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// Componente Auxiliar
function StatCard({
  icon,
  color,
  trend,
  trendValue,
  label,
  value,
  subValue,
}: any) {
  const colors: any = {
    blue: { bg: "bg-blue-50", text: "text-primary" },
    purple: { bg: "bg-purple-50", text: "text-purple-600" },
    orange: { bg: "bg-orange-50", text: "text-orange-600" },
  };

  const trendIcon =
    trend === "up"
      ? "arrow_upward"
      : trend === "down"
        ? "arrow_downward"
        : "remove";
  const trendColor =
    trend === "up"
      ? "text-[#07883f] bg-green-50"
      : trend === "down"
        ? "text-red-600 bg-red-50"
        : "text-orange-600 bg-orange-50";

  return (
    <div className="flex flex-col justify-between bg-white p-6 rounded-[1.5rem] shadow-sm hover:shadow-md transition-all border border-transparent hover:border-primary/10">
      <div className="flex justify-between items-start mb-4">
        <div
          className={`p-3 rounded-2xl ${colors[color].bg} ${colors[color].text}`}
        >
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div
          className={`flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-lg ${trendColor}`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {trendIcon}
          </span>
          <span>{trendValue}</span>
        </div>
      </div>
      <div>
        <p className="text-text-muted text-sm font-medium mb-1">{label}</p>
        <h4 className="text-text-main text-3xl font-bold tracking-tight">
          {value}{" "}
          {subValue && (
            <span className="text-xl font-normal text-gray-400">
              {subValue}
            </span>
          )}
        </h4>
      </div>
    </div>
  );
}
