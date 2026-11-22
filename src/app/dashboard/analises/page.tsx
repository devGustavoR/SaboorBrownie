"use client";

import { dinheiro, nomeSabor, num } from "@/lib/sabores";
import { supabase } from "@/lib/supabase";
import Chart from "chart.js/auto";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  DollarSign,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Venda {
  cd_venda: string;
  vl_preco_venda: number;
  ts_venda: string;
  nm_cliente: string | null;
  sabor: string | null;
}

interface Despesa {
  cd_despesa: string;
  ds_descricao: string;
  vl_valor: number;
  ts_despesa: string;
}

const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const quando = (ts: string) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? `Hoje, ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const chaveDia = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function AnalyticsPage() {
  const [dias, setDias] = useState(30);
  const [carregando, setCarregando] = useState(true);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graficoRef = useRef<Chart | null>(null);

  useEffect(() => {
    let vivo = true;
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    desde.setDate(desde.getDate() - (dias - 1));
    const iso = desde.toISOString();
    Promise.all([
      supabase
        .from("VENDAS")
        .select("cd_venda, vl_preco_venda, ts_venda, nm_cliente, LOTES ( tp_sabor )")
        .gte("ts_venda", iso)
        .order("ts_venda", { ascending: false }),
      supabase
        .from("DESPESAS")
        .select("cd_despesa, ds_descricao, vl_valor, ts_despesa")
        .gte("ts_despesa", iso)
        .order("ts_despesa", { ascending: false }),
    ]).then(([rv, rd]) => {
      if (!vivo) return;
      setVendas(
        (rv.data ?? []).map((v) => {
          const l = (Array.isArray(v.LOTES) ? v.LOTES[0] : v.LOTES) as { tp_sabor?: string } | null;
          return {
            cd_venda: v.cd_venda as string,
            vl_preco_venda: num(v.vl_preco_venda),
            ts_venda: v.ts_venda as string,
            nm_cliente: (v.nm_cliente as string | null) ?? null,
            sabor: l?.tp_sabor ?? null,
          };
        }),
      );
      setDespesas(((rd.data ?? []) as Despesa[]).map((d) => ({ ...d, vl_valor: num(d.vl_valor) })));
      setCarregando(false);
    });
    return () => {
      vivo = false;
    };
  }, [dias]);

  const r = useMemo(() => {
    const receita = vendas.reduce((a, v) => a + v.vl_preco_venda, 0);
    const custos = despesas.reduce((a, d) => a + d.vl_valor, 0);
    const lucro = receita - custos;

    const porSabor = new Map<string, { qtd: number; valor: number }>();
    for (const v of vendas) {
      const k = v.sabor ?? "?";
      const atual = porSabor.get(k) ?? { qtd: 0, valor: 0 };
      atual.qtd += 1;
      atual.valor += v.vl_preco_venda;
      porSabor.set(k, atual);
    }
    const sabores = [...porSabor.entries()].sort((a, b) => b[1].qtd - a[1].qtd);

    // origem: eventos lançados pelo Dia do Evento × vendas avulsas
    const origem = new Map<string, { qtd: number; valor: number }>();
    for (const v of vendas) {
      const k = v.nm_cliente?.startsWith("Evento: ") ? v.nm_cliente.slice(8) : "Avulsas";
      const atual = origem.get(k) ?? { qtd: 0, valor: 0 };
      atual.qtd += 1;
      atual.valor += v.vl_preco_venda;
      origem.set(k, atual);
    }

    // gráfico: por dia (até 30 dias) ou por semana (90 dias)
    const porSemana = dias > 30;
    const passos = porSemana ? Math.ceil(dias / 7) : dias;
    const rotulos: string[] = [];
    const rec: number[] = [];
    const cus: number[] = [];
    const indice = new Map<string, number>();
    for (let i = passos - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i * (porSemana ? 7 : 1));
      rotulos.push(
        porSemana
          ? `sem ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`
          : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      );
      rec.push(0);
      cus.push(0);
      if (!porSemana) indice.set(chaveDia(d), rec.length - 1);
    }
    const posicao = (ts: string) => {
      const d = new Date(ts);
      if (!porSemana) return indice.get(chaveDia(d)) ?? -1;
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const atras = Math.floor((hoje.getTime() - new Date(d.toDateString()).getTime()) / 86400000);
      const p = passos - 1 - Math.floor(atras / 7);
      return p >= 0 && p < passos ? p : -1;
    };
    for (const v of vendas) {
      const p = posicao(v.ts_venda);
      if (p >= 0) rec[p] += v.vl_preco_venda;
    }
    for (const d of despesas) {
      const p = posicao(d.ts_despesa);
      if (p >= 0) cus[p] += d.vl_valor;
    }

    const atividade = [
      ...vendas.map((v) => ({
        id: `v-${v.cd_venda}`,
        venda: true,
        desc: `${nomeSabor(v.sabor)}${v.nm_cliente ? ` · ${v.nm_cliente}` : ""}`,
        valor: v.vl_preco_venda,
        ts: v.ts_venda,
      })),
      ...despesas.map((d) => ({ id: `d-${d.cd_despesa}`, venda: false, desc: d.ds_descricao, valor: d.vl_valor, ts: d.ts_despesa })),
    ]
      .sort((a, b) => b.ts.localeCompare(a.ts))
      .slice(0, 15);

    return {
      receita,
      custos,
      lucro,
      margem: receita > 0 ? (lucro / receita) * 100 : 0,
      unidades: vendas.length,
      precoMedio: vendas.length > 0 ? receita / vendas.length : 0,
      sabores,
      origem: [...origem.entries()].sort((a, b) => b[1].valor - a[1].valor),
      grafico: { rotulos, rec, cus },
      atividade,
    };
  }, [vendas, despesas, dias]);

  // gráfico
  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    graficoRef.current?.destroy();
    const roxo = ctx.createLinearGradient(0, 0, 0, 300);
    roxo.addColorStop(0, "rgba(124, 58, 237, 0.35)");
    roxo.addColorStop(1, "rgba(124, 58, 237, 0)");
    graficoRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: r.grafico.rotulos,
        datasets: [
          { label: "Vendas", data: r.grafico.rec, borderColor: "#7C3AED", backgroundColor: roxo, borderWidth: 3, pointRadius: dias > 30 ? 3 : 2, fill: true, tension: 0.35 },
          { label: "Gastos", data: r.grafico.cus, borderColor: "#D97706", backgroundColor: "transparent", borderWidth: 2, borderDash: [5, 5], pointRadius: 2, tension: 0.35 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dinheiro(c.parsed.y ?? 0)}` } },
        },
        scales: {
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { callback: (v) => `R$ ${v}`, color: "#6B7280" } },
          x: { grid: { display: false }, ticks: { color: "#6B7280", maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        },
      },
    });
  }, [r, dias]);

  useEffect(() => () => graficoRef.current?.destroy(), []);

  const maxSabor = Math.max(...r.sabores.map(([, x]) => x.qtd), 1);

  return (
    <div className="bg-[#F3E8FF] min-h-screen text-gray-800 font-sans pb-20">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-gray-900">Análises</h1>
            <p className="mt-1 text-sm text-gray-500 flex items-center gap-2">
              <Calendar size={16} /> Vendas registradas (avulsas e eventos lançados no estoque) e gastos
            </p>
          </div>
          <div className="flex gap-1 p-1 bg-white rounded-xl border border-purple-100">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                onClick={() => setDias(p.dias)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${dias === p.dias ? "bg-[#7C3AED] text-white" : "text-gray-500 hover:bg-purple-50"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { l: "Faturamento", v: dinheiro(r.receita), d: `${r.unidades} brownies`, icon: ShoppingBag, c: "bg-blue-50 text-blue-600" },
            { l: "Gastos", v: dinheiro(r.custos), d: `${despesas.length} lançamentos`, icon: Wallet, c: "bg-orange-50 text-orange-600" },
            { l: "Lucro", v: dinheiro(r.lucro), d: `margem ${r.margem.toFixed(0)}%`, icon: r.lucro >= 0 ? TrendingUp : TrendingDown, c: r.lucro >= 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600" },
            { l: "Preço médio", v: dinheiro(r.precoMedio), d: "por brownie", icon: DollarSign, c: "bg-purple-50 text-[#7C3AED]" },
          ].map((k) => (
            <div key={k.l} className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
              <div className="flex justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">{k.l}</h3>
                <span className={`p-2 rounded-lg ${k.c}`}>
                  <k.icon size={18} />
                </span>
              </div>
              <p className="text-2xl md:text-3xl font-black text-gray-900">{carregando ? "…" : k.v}</p>
              <p className="mt-1 text-xs text-gray-400">{k.d}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Vendas × gastos</h2>
                <p className="text-sm text-gray-500">{dias > 30 ? "Por semana" : "Por dia"}</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-gray-600">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#7C3AED]" /> Vendas</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" /> Gastos</span>
              </div>
            </div>
            <div className="relative h-72 w-full">
              <canvas ref={canvasRef} />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Por sabor</h2>
            {r.sabores.length === 0 && <p className="text-gray-400 text-sm text-center py-10">Sem vendas no período.</p>}
            <div className="space-y-3">
              {r.sabores.map(([s, x]) => (
                <div key={s}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold text-gray-800">{s === "?" ? "Sem lote" : nomeSabor(s)}</span>
                    <span className="text-gray-500">
                      {x.qtd} un · <b className="text-gray-900">{dinheiro(x.valor)}</b>
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-purple-50 overflow-hidden">
                    <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${(x.qtd / maxSabor) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {r.origem.length > 1 && (
              <>
                <h3 className="text-sm font-bold text-gray-900 mt-6 mb-2">Por origem</h3>
                <div className="space-y-1.5">
                  {r.origem.map(([o, x]) => (
                    <div key={o} className="flex justify-between text-sm">
                      <span className="text-gray-600 truncate">{o}</span>
                      <span className="font-semibold shrink-0">{dinheiro(x.valor)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Movimentações recentes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-400 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-bold">Tipo</th>
                  <th className="px-4 py-3 font-bold">Descrição</th>
                  <th className="px-4 py-3 font-bold">Quando</th>
                  <th className="px-4 py-3 font-bold text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carregando ? (
                  <tr><td colSpan={4} className="p-8 text-center text-gray-400">Carregando...</td></tr>
                ) : r.atividade.length === 0 ? (
                  <tr><td colSpan={4} className="p-8 text-center text-gray-400">Nada no período.</td></tr>
                ) : (
                  r.atividade.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {a.venda ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-green-100 text-green-700 uppercase">
                            <ArrowUpRight size={10} /> Venda
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold bg-red-100 text-red-700 uppercase">
                            <ArrowDownRight size={10} /> Gasto
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700 max-w-[260px] truncate">{a.desc}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{quando(a.ts)}</td>
                      <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${a.venda ? "text-green-600" : "text-red-500"}`}>
                        {a.venda ? "+" : "−"} {dinheiro(a.valor)}
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
