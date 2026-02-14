"use client";

import { supabase } from "@/lib/supabase";
import Chart from "chart.js/auto";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  DollarSign,
  MoreHorizontal,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Helper para formatar moeda
const formatCurrency = (value: number) => {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday)
    return `Hoje, ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);

  // Métricas
  const [revenue, setRevenue] = useState(0);
  const [costs, setCosts] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Chart
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const [chartData, setChartData] = useState<{
    labels: string[];
    revenue: number[];
    costs: number[];
  } | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // 1. Buscar Vendas
      const { data: sales } = await supabase
        .from("VENDAS")
        .select(`id_venda, vl_preco_venda, ts_venda, LOTES ( tp_sabor )`)
        .gte("ts_venda", thirtyDaysAgo)
        .order("ts_venda", { ascending: false });

      // 2. Buscar Despesas
      const { data: expenses } = await supabase
        .from("DESPESAS")
        .select("*")
        .gte("ts_despesa", thirtyDaysAgo)
        .order("ts_despesa", { ascending: false });

      if (sales && expenses) {
        // Cálculos Totais
        const totalRev = sales.reduce(
          (acc, curr) => acc + (curr.vl_preco_venda || 0),
          0,
        );
        const totalExp = expenses.reduce(
          (acc, curr) => acc + (curr.vl_valor || 0),
          0,
        );

        setRevenue(totalRev);
        setCosts(totalExp);
        setSalesCount(sales.length);

        // Top Produtos
        const productMap: Record<string, number> = {};
        sales.forEach((sale) => {
          // @ts-ignore
          const flavor = sale.LOTES?.tp_sabor || "Avulso";
          productMap[flavor] = (productMap[flavor] || 0) + 1;
        });

        const sortedProducts = Object.entries(productMap)
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 4);

        setTopProducts(sortedProducts);

        // Atividade Recente (Merge)
        const allActivities = [
          ...sales.map((s) => ({
            id: s.id_venda,
            type: "SALE",
            desc: "Venda",
            amount: s.vl_preco_venda,
            date: s.ts_venda,
          })),
          ...expenses.map((e) => ({
            id: e.cd_despesa,
            type: "EXPENSE",
            desc: e.ds_descricao,
            amount: e.vl_valor,
            date: e.ts_despesa,
          })),
        ]
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          )
          .slice(0, 10);

        setRecentActivity(allActivities);

        // Dados Gráfico
        const daysMap = new Map();
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const label = d.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });
          daysMap.set(label, { rev: 0, cost: 0 });
        }

        sales.forEach((s) => {
          const label = new Date(s.ts_venda).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });
          if (daysMap.has(label)) daysMap.get(label).rev += s.vl_preco_venda;
        });
        expenses.forEach((e) => {
          const label = new Date(e.ts_despesa).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          });
          if (daysMap.has(label)) daysMap.get(label).cost += e.vl_valor;
        });

        setChartData({
          labels: Array.from(daysMap.keys()),
          revenue: Array.from(daysMap.values()).map((v: any) => v.rev),
          costs: Array.from(daysMap.values()).map((v: any) => v.cost),
        });
      }
      setLoading(false);
    };

    fetchData();
  }, []);

  // Configuração Gráfico
  useEffect(() => {
    if (chartData && chartRef.current) {
      if (chartInstance.current) chartInstance.current.destroy();

      const ctx = chartRef.current.getContext("2d");
      if (!ctx) return;

      const gradientPurple = ctx.createLinearGradient(0, 0, 0, 300);
      gradientPurple.addColorStop(0, "rgba(124, 58, 237, 0.4)");
      gradientPurple.addColorStop(1, "rgba(124, 58, 237, 0.0)");

      const gradientOrange = ctx.createLinearGradient(0, 0, 0, 300);
      gradientOrange.addColorStop(0, "rgba(217, 119, 6, 0.4)");
      gradientOrange.addColorStop(1, "rgba(217, 119, 6, 0.0)");

      chartInstance.current = new Chart(ctx, {
        type: "line",
        data: {
          labels: chartData.labels,
          datasets: [
            {
              label: "Vendas",
              data: chartData.revenue,
              borderColor: "#7C3AED",
              backgroundColor: gradientPurple,
              borderWidth: 3,
              pointBackgroundColor: "#fff",
              pointBorderColor: "#7C3AED",
              fill: true,
              tension: 0.4,
            },
            {
              label: "Custos",
              data: chartData.costs,
              borderColor: "#D97706",
              backgroundColor: gradientOrange,
              borderWidth: 2,
              borderDash: [5, 5],
              pointBackgroundColor: "#fff",
              pointBorderColor: "#D97706",
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#FFF",
              titleColor: "#1F2937",
              bodyColor: "#4B5563",
              borderColor: "#E5E7EB",
              borderWidth: 1,
              padding: 10,
              displayColors: true,
              callbacks: {
                label: (ctx) =>
                  `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: "rgba(0, 0, 0, 0.05)", drawBorder: false as any },
              ticks: { callback: (v) => `R$ ${v}`, color: "#6B7280" },
            },
            x: { grid: { display: false }, ticks: { color: "#6B7280" } },
          },
        },
      });
    }
  }, [chartData]);

  const profit = revenue - costs;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const ticket = salesCount > 0 ? revenue / salesCount : 0;

  return (
    <div className="bg-[#F3E8FF] min-h-screen text-gray-800 font-sans pb-20">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-serif font-bold text-gray-900">
            Analytics Financeiro
          </h1>
          <p className="mt-2 text-sm text-gray-500 flex items-center gap-2">
            <Calendar size={16} />
            Visão de Caixa (Últimos 30 dias)
          </p>
        </div>

        {/* --- KPI CARDS --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Ticket Médio */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 transition-all hover:shadow-md">
            <div className="flex justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Ticket Médio
              </h3>
              <div className="p-2 bg-purple-50 rounded-lg text-[#7C3AED]">
                <Wallet size={20} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-900">
                {loading ? "..." : formatCurrency(ticket)}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Média por venda realizada
            </p>
          </div>

          {/* Margem de Lucro */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 transition-all hover:shadow-md">
            <div className="flex justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Margem Líquida
              </h3>
              <div className="p-2 bg-green-50 rounded-lg text-green-600">
                <DollarSign size={20} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-900">
                {loading ? "..." : margin.toFixed(1)}%
              </span>
              <span
                className={`text-sm font-bold flex items-center gap-1 ${profit >= 0 ? "text-green-600" : "text-red-500"}`}
              >
                {profit >= 0 ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )}
                {formatCurrency(profit)}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Lucro (Vendas - Despesas)
            </p>
          </div>

          {/* Faturamento */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 transition-all hover:shadow-md">
            <div className="flex justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Faturamento
              </h3>
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <ShoppingBag size={20} />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-gray-900">
                {loading ? "..." : formatCurrency(revenue)}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-4 overflow-hidden">
              <div
                className="bg-[#7C3AED] h-1.5 rounded-full"
                style={{ width: "100%" }}
              ></div>
            </div>
          </div>
        </div>

        {/* --- GRÁFICO & TOP PRODUTOS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Gráfico */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Evolução Diária
                </h2>
                <p className="text-sm text-gray-500">
                  Comparativo Vendas vs. Custos (7 dias)
                </p>
              </div>
              <div className="flex items-center gap-3 mt-4 sm:mt-0 bg-gray-50 p-1 rounded-lg">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-600 px-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]"></span>{" "}
                  Vendas
                </div>
                <div className="flex items-center gap-2 text-xs font-medium text-gray-600 px-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]"></span>{" "}
                  Custos
                </div>
              </div>
            </div>
            <div className="relative h-72 w-full">
              <canvas ref={chartRef}></canvas>
            </div>
          </div>

          {/* Top Produtos */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col">
            <div className="mb-6 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Top Produtos</h2>
            </div>
            <div className="flex-grow space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-[280px]">
              {topProducts.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-10">
                  Sem dados ainda.
                </p>
              )}
              {topProducts.map((prod, idx) => {
                const percent =
                  salesCount > 0
                    ? ((prod.count / salesCount) * 100).toFixed(0)
                    : 0;
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-4 group p-3 hover:bg-[#F3E8FF]/50 rounded-xl transition-all border border-transparent hover:border-purple-100"
                  >
                    <div className="h-10 w-10 rounded-lg bg-purple-100 text-[#7C3AED] flex items-center justify-center font-bold text-sm shrink-0">
                      #{idx + 1}
                    </div>
                    <div className="flex-grow min-w-0">
                      <h4 className="text-sm font-bold text-gray-800 truncate">
                        {prod.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {prod.count} unidades
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block text-sm font-bold text-[#7C3AED]">
                        {percent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* --- TABELA DE ENTRADAS RECENTES --- */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-900">
              Atividade Recente
            </h3>
            <button className="text-gray-400 hover:text-[#7C3AED] transition-colors">
              <MoreHorizontal size={20} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-50 rounded-lg">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Descrição</th>
                  <th className="px-4 py-3 font-bold">Data</th>
                  <th className="px-4 py-3 font-bold text-right rounded-r-lg">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  recentActivity.map((item, idx) => (
                    <tr
                      key={`${item.type}-${item.id}-${idx}`}
                      className="group hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {item.type === "SALE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-green-100 text-green-700 uppercase tracking-wide">
                            <ArrowUpRight size={10} /> Venda
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-100 text-red-700 uppercase tracking-wide">
                            <ArrowDownRight size={10} /> Despesa
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {item.desc ||
                          (item.type === "SALE"
                            ? "Venda Avulsa"
                            : "Despesa Variável")}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {formatDate(item.date)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${item.type === "SALE" ? "text-green-600" : "text-red-500"}`}
                      >
                        {item.type === "SALE" ? "+" : "-"}{" "}
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
