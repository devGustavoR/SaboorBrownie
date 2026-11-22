"use client";

import { dinheiro, ehMassa, nomeSabor, num } from "@/lib/sabores";
import { supabase } from "@/lib/supabase";
import {
  BarChart3,
  CalendarDays,
  Loader2,
  Package,
  Plus,
  Receipt,
  Store,
  TrendingDown,
  TrendingUp,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Preco {
  tp_sabor: string;
  vl_preco: number;
}

interface Lote {
  cd_lote: string;
  tp_sabor: string;
  qt_produzida: number;
  ts_producao: string;
}

interface Resumo {
  hojeValor: number;
  hojeUnidades: number;
  mesValor: number;
  mesUnidades: number;
  mesDespesas: number;
  hojePorSabor: Record<string, number>;
}

const CORES: Record<string, string> = {
  TRADICIONAL: "bg-amber-100 text-amber-800",
  NINHO: "bg-yellow-100 text-yellow-800",
  BRIGADEIRO: "bg-orange-100 text-orange-900",
  MARACUJA: "bg-lime-100 text-lime-800",
  MORANGO: "bg-rose-100 text-rose-800",
  MISTO: "bg-purple-100 text-purple-800",
};

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

const inicioDoDia = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const inicioDoMes = () => {
  const d = inicioDoDia();
  d.setDate(1);
  return d;
};

const ATALHOS = [
  { href: "/dashboard/evento", label: "Planejar evento", desc: "Orçamento e compras", icon: CalendarDays, cor: "bg-purple-100 text-[#6B21A8]" },
  { href: "/dashboard/dia-evento", label: "Dia do Evento", desc: "PDV e roleta", icon: Store, cor: "bg-green-100 text-green-700" },
  { href: "/dashboard/estoque", label: "Estoque", desc: "Produção e lotes", icon: Package, cor: "bg-blue-100 text-blue-700" },
  { href: "/dashboard/custos", label: "Lançar gasto", desc: "Notas e despesas", icon: Receipt, cor: "bg-orange-100 text-orange-700" },
];

export default function DashboardPage() {
  const [carregando, setCarregando] = useState(true);
  const [precos, setPrecos] = useState<Preco[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [vendidosLote, setVendidosLote] = useState<Record<string, number>>({});
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [vendendo, setVendendo] = useState<string | null>(null);
  const [ultima, setUltima] = useState<{ id: string; sabor: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const mes = inicioDoMes().toISOString();
    const hoje = inicioDoDia().getTime();
    const [rp, rl, rv, rvm, rd] = await Promise.all([
      supabase.from("TABELA_PRECOS").select("tp_sabor, vl_preco"),
      supabase.from("LOTES").select("cd_lote, tp_sabor, qt_produzida, ts_producao").order("ts_producao"),
      supabase.from("VENDAS").select("cd_lote").not("cd_lote", "is", null),
      supabase.from("VENDAS").select("vl_preco_venda, ts_venda, LOTES ( tp_sabor )").gte("ts_venda", mes),
      supabase.from("DESPESAS").select("vl_valor").gte("ts_despesa", mes),
    ]);

    setPrecos(
      (rp.data ?? [])
        .map((p) => ({ tp_sabor: p.tp_sabor as string, vl_preco: num(p.vl_preco) }))
        .filter((p) => !ehMassa(p.tp_sabor))
        .sort((a, b) => nomeSabor(a.tp_sabor).localeCompare(nomeSabor(b.tp_sabor))),
    );
    setLotes((rl.data ?? []) as Lote[]);
    const porLote: Record<string, number> = {};
    for (const v of rv.data ?? []) porLote[v.cd_lote] = (porLote[v.cd_lote] ?? 0) + 1;
    setVendidosLote(porLote);

    const r: Resumo = {
      hojeValor: 0,
      hojeUnidades: 0,
      mesValor: 0,
      mesUnidades: 0,
      mesDespesas: (rd.data ?? []).reduce((a, d) => a + num(d.vl_valor), 0),
      hojePorSabor: {},
    };
    for (const v of rvm.data ?? []) {
      const valor = num(v.vl_preco_venda);
      r.mesValor += valor;
      r.mesUnidades += 1;
      if (new Date(v.ts_venda).getTime() >= hoje) {
        r.hojeValor += valor;
        r.hojeUnidades += 1;
        const l = (Array.isArray(v.LOTES) ? v.LOTES[0] : v.LOTES) as { tp_sabor?: string } | null;
        const s = l?.tp_sabor ?? "?";
        r.hojePorSabor[s] = (r.hojePorSabor[s] ?? 0) + 1;
      }
    }
    setResumo(r);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const mostrar = (msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(null), 2500);
  };

  // disponível de cada sabor = produzido nos lotes − vendido desses lotes
  const disponivel = (sabor: string) =>
    lotes
      .filter((l) => l.tp_sabor === sabor)
      .reduce((a, l) => a + Math.max(l.qt_produzida - (vendidosLote[l.cd_lote] ?? 0), 0), 0);

  // Venda avulsa: 1 unidade, sai do lote mais antigo que ainda tem brownie
  const vender = async (p: Preco) => {
    setVendendo(p.tp_sabor);
    const doSabor = lotes.filter((l) => l.tp_sabor === p.tp_sabor);
    const lote =
      doSabor.find((l) => l.qt_produzida - (vendidosLote[l.cd_lote] ?? 0) > 0) ??
      doSabor[doSabor.length - 1];
    const { data, error } = await supabase
      .from("VENDAS")
      .insert([{ vl_preco_venda: p.vl_preco, cd_lote: lote?.cd_lote ?? null, nm_cliente: "Venda avulsa" }])
      .select("cd_venda")
      .single();
    setVendendo(null);
    if (error) {
      alert("Não foi possível registrar a venda.");
      return;
    }
    setUltima({ id: data.cd_venda as string, sabor: p.tp_sabor });
    mostrar(`1 ${nomeSabor(p.tp_sabor)} vendido${lote ? "" : " (sem lote cadastrado)"}`);
    void carregar();
  };

  const desfazer = async () => {
    if (!ultima) return;
    const { error } = await supabase.from("VENDAS").delete().eq("cd_venda", ultima.id);
    if (error) {
      alert("Não foi possível desfazer.");
      return;
    }
    mostrar(`Venda de ${nomeSabor(ultima.sabor)} desfeita`);
    setUltima(null);
    void carregar();
  };

  const saldoMes = (resumo?.mesValor ?? 0) - (resumo?.mesDespesas ?? 0);
  const mesNome = new Date().toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="min-h-screen font-sans bg-[#F3E8FF] text-gray-800">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="font-serif text-4xl text-gray-900 mb-1">
            {saudacao()},{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6B21A8] to-purple-500 font-bold">
              Chef!
            </span>
          </h1>
          <p className="text-gray-500">
            Resumo de hoje e de {mesNome}.
          </p>
        </div>

        {/* Números */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="col-span-2 lg:col-span-1 rounded-2xl bg-gradient-to-br from-[#6B21A8] to-indigo-900 text-white p-5 shadow-xl shadow-purple-900/20">
            <p className="text-xs uppercase tracking-wider text-purple-200 font-semibold">Vendido hoje</p>
            <p className="text-3xl font-bold mt-1">{carregando ? "…" : dinheiro(resumo?.hojeValor ?? 0)}</p>
            <p className="text-sm text-purple-200 mt-1">
              {resumo?.hojeUnidades ?? 0} {resumo?.hojeUnidades === 1 ? "brownie" : "brownies"}
            </p>
          </div>
          <div className="rounded-2xl bg-white border border-purple-100 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Vendas no mês</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{carregando ? "…" : dinheiro(resumo?.mesValor ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-1">{resumo?.mesUnidades ?? 0} brownies</p>
          </div>
          <div className="rounded-2xl bg-white border border-purple-100 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Gastos no mês</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{carregando ? "…" : dinheiro(resumo?.mesDespesas ?? 0)}</p>
            <Link href="/dashboard/custos" className="text-xs text-[#7C3AED] hover:underline mt-1 inline-block">
              Lançar gasto
            </Link>
          </div>
          <div className="col-span-2 lg:col-span-1 rounded-2xl bg-white border border-purple-100 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Saldo do mês</p>
            <p className={`text-2xl font-bold mt-1 flex items-center gap-2 ${saldoMes >= 0 ? "text-green-700" : "text-red-600"}`}>
              {saldoMes >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              {carregando ? "…" : dinheiro(saldoMes)}
            </p>
            <Link href="/dashboard/analises" className="text-xs text-[#7C3AED] hover:underline mt-1 inline-flex items-center gap-1">
              <BarChart3 size={12} /> Ver análises
            </Link>
          </div>
        </section>

        {/* Atalhos */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {ATALHOS.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white rounded-2xl p-5 border border-purple-100 hover:border-purple-300 hover:shadow-md transition-all flex items-center gap-4 group"
            >
              <span className={`p-3 rounded-xl ${a.cor} group-hover:scale-110 transition-transform`}>
                <a.icon size={22} />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-gray-900">{a.label}</span>
                <span className="block text-xs text-gray-500">{a.desc}</span>
              </span>
            </Link>
          ))}
        </section>

        {/* Venda avulsa */}
        <section className="bg-white rounded-2xl border border-purple-100 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Venda avulsa</h2>
              <p className="text-sm text-gray-500">
                Para vendas fora de evento: cada toque registra 1 brownie e dá
                baixa no lote mais antigo do sabor. Em evento, use o{" "}
                <Link href="/dashboard/dia-evento" className="text-[#7C3AED] hover:underline">
                  Dia do Evento
                </Link>
                .
              </p>
            </div>
            {ultima && (
              <button
                onClick={desfazer}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold text-gray-600 hover:bg-gray-200"
              >
                <Undo2 size={16} /> Desfazer última
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {carregando &&
              [1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}
            {!carregando && precos.length === 0 && (
              <p className="col-span-full text-center py-8 text-gray-400">
                Nenhum preço cadastrado. Defina em{" "}
                <Link href="/dashboard/settings" className="text-[#7C3AED] hover:underline">
                  Configurações
                </Link>
                .
              </p>
            )}
            {precos.map((p) => {
              const disp = disponivel(p.tp_sabor);
              const hoje = resumo?.hojePorSabor[p.tp_sabor] ?? 0;
              return (
                <div key={p.tp_sabor} className="flex items-center gap-4 rounded-2xl p-4 bg-gray-50 border border-transparent hover:border-purple-200 transition">
                  <span className={`w-14 h-14 rounded-xl flex items-center justify-center font-bold text-lg ${CORES[p.tp_sabor] ?? "bg-gray-100 text-gray-600"}`}>
                    {nomeSabor(p.tp_sabor).charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate">{nomeSabor(p.tp_sabor)}</p>
                    <p className="text-sm font-semibold text-[#6B21A8]">{dinheiro(p.vl_preco)}</p>
                    <p className={`text-xs ${disp <= 0 ? "text-orange-600" : "text-gray-400"}`}>
                      {disp > 0 ? `${disp} em estoque` : "sem estoque nos lotes"}
                      {hoje > 0 ? ` · ${hoje} hoje` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => vender(p)}
                    disabled={vendendo !== null}
                    className="w-12 h-12 rounded-xl bg-[#7C3AED] text-white flex items-center justify-center hover:bg-[#6B21A8] active:scale-90 transition disabled:opacity-50"
                    aria-label={`Vender 1 ${nomeSabor(p.tp_sabor)}`}
                  >
                    {vendendo === p.tp_sabor ? <Loader2 size={20} className="animate-spin" /> : <Plus size={22} />}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {aviso && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {aviso}
        </div>
      )}
    </div>
  );
}
