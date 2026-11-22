"use client";

import { dinheiro, nomeSabor, num, SABORES } from "@/lib/sabores";
import { supabase } from "@/lib/supabase";
import { CheckCircle, Layers, Loader2, Package, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Lote {
  cd_lote: string;
  tp_sabor: string;
  qt_produzida: number;
  ts_producao: string;
}

const hojeInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function InventoryPage() {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [vendidos, setVendidos] = useState<Record<string, number>>({});
  const [receita, setReceita] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string>("TRADICIONAL");

  // formulário de produção
  const [abrindo, setAbrindo] = useState(false);
  const [modo, setModo] = useState<"SIMPLES" | "MISTO">("SIMPLES");
  const [salvando, setSalvando] = useState(false);
  const [data, setData] = useState(hojeInput());
  const [sabor1, setSabor1] = useState("TRADICIONAL");
  const [qtd1, setQtd1] = useState("12");
  const [sabor2, setSabor2] = useState("NINHO");
  const [qtd2, setQtd2] = useState("3");

  const carregar = useCallback(async () => {
    const [rl, rv] = await Promise.all([
      supabase.from("LOTES").select("cd_lote, tp_sabor, qt_produzida, ts_producao").order("ts_producao", { ascending: false }),
      supabase.from("VENDAS").select("cd_lote, vl_preco_venda").not("cd_lote", "is", null),
    ]);
    setLotes((rl.data ?? []) as Lote[]);
    const qtd: Record<string, number> = {};
    const valor: Record<string, number> = {};
    for (const v of rv.data ?? []) {
      qtd[v.cd_lote] = (qtd[v.cd_lote] ?? 0) + 1;
      valor[v.cd_lote] = (valor[v.cd_lote] ?? 0) + num(v.vl_preco_venda);
    }
    setVendidos(qtd);
    setReceita(valor);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  // totais por sabor
  const porSabor = useMemo(() => {
    const m: Record<string, { produzido: number; vendido: number; receita: number }> = {};
    const sabores = new Set<string>([...SABORES, ...lotes.map((l) => l.tp_sabor)]);
    for (const s of sabores) m[s] = { produzido: 0, vendido: 0, receita: 0 };
    for (const l of lotes) {
      m[l.tp_sabor].produzido += l.qt_produzida;
      m[l.tp_sabor].vendido += vendidos[l.cd_lote] ?? 0;
      m[l.tp_sabor].receita += receita[l.cd_lote] ?? 0;
    }
    return m;
  }, [lotes, vendidos, receita]);

  const totalDisponivel = Object.values(porSabor).reduce(
    (a, s) => a + Math.max(s.produzido - s.vendido, 0),
    0,
  );
  const lotesDoSabor = lotes.filter((l) => l.tp_sabor === selecionado);

  const abrirForm = () => {
    setSabor1(selecionado);
    setAbrindo(true);
  };

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    const q1 = Math.floor(num(qtd1));
    const q2 = Math.floor(num(qtd2));
    if (q1 <= 0 || (modo === "MISTO" && q2 <= 0)) {
      alert("Informe a quantidade produzida.");
      return;
    }
    if (modo === "MISTO" && sabor1 === sabor2) {
      alert("No tabuleiro misto escolha dois sabores diferentes.");
      return;
    }
    setSalvando(true);
    // meio-dia do dia escolhido: não muda de data por causa do fuso
    const ts = new Date(`${data}T12:00:00`).toISOString();
    const linhas = [
      { tp_sabor: sabor1, qt_produzida: q1, vl_custo_total_ingredientes: 0, ts_producao: ts },
      ...(modo === "MISTO"
        ? [{ tp_sabor: sabor2, qt_produzida: q2, vl_custo_total_ingredientes: 0, ts_producao: ts }]
        : []),
    ];
    const { error } = await supabase.from("LOTES").insert(linhas);
    setSalvando(false);
    if (error) {
      alert(`Erro ao registrar produção.\n${error.message}`);
      return;
    }
    setAbrindo(false);
    setQtd1("12");
    setQtd2("3");
    setSelecionado(sabor1);
    void carregar();
  };

  const excluirLote = async (l: Lote) => {
    const v = vendidos[l.cd_lote] ?? 0;
    if (v > 0) {
      alert(
        `Este lote já tem ${v} venda(s) ligadas a ele e não pode ser excluído. Desfaça as vendas antes.`,
      );
      return;
    }
    if (!confirm(`Excluir o lote de ${l.qt_produzida} ${nomeSabor(l.tp_sabor)}?`)) return;
    const { error } = await supabase.from("LOTES").delete().eq("cd_lote", l.cd_lote);
    if (error) {
      alert(`Não foi possível excluir.\n${error.message}`);
      return;
    }
    void carregar();
  };

  const inputCls =
    "w-full bg-white border border-gray-200 rounded-lg px-3 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-[#6B21A8]";

  return (
    <div className="bg-[#F3E8FF] min-h-screen font-sans text-gray-800 pb-20">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Estoque de brownies</h1>
            <p className="mt-1 text-sm text-gray-500">
              Registre cada fornada. O disponível é o produzido menos o que já
              foi vendido (avulso ou lançado do Dia do Evento).
            </p>
          </div>
          <button
            onClick={() => (abrindo ? setAbrindo(false) : abrirForm())}
            className={`px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg transition-all active:scale-95 font-semibold text-sm ${
              abrindo ? "bg-white text-gray-600" : "bg-[#6B21A8] hover:bg-purple-800 text-white shadow-purple-500/30"
            }`}
          >
            {abrindo ? <X size={18} /> : <Plus size={18} />}
            {abrindo ? "Cancelar" : "Registrar produção"}
          </button>
        </div>

        {abrindo && (
          <form onSubmit={registrar} className="bg-white rounded-2xl shadow-xl p-6 border border-purple-100 space-y-5">
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
              {(["SIMPLES", "MISTO"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${modo === m ? "bg-white text-[#6B21A8] shadow-sm" : "text-gray-500"}`}
                >
                  {m === "SIMPLES" ? "Um sabor" : "Tabuleiro misto"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="space-y-1">
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Data</span>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {modo === "MISTO" ? "Sabor 1" : "Sabor"}
                </span>
                <div className="flex gap-2">
                  <select value={sabor1} onChange={(e) => setSabor1(e.target.value)} className={inputCls}>
                    {SABORES.map((s) => (
                      <option key={s} value={s}>{nomeSabor(s)}</option>
                    ))}
                  </select>
                  <input
                    inputMode="numeric"
                    value={qtd1}
                    onChange={(e) => setQtd1(e.target.value.replace(/\D/g, ""))}
                    className="w-20 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold outline-none focus:ring-2 focus:ring-[#6B21A8]"
                    aria-label="Quantidade"
                  />
                </div>
              </label>
              {modo === "MISTO" && (
                <label className="space-y-1">
                  <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Sabor 2</span>
                  <div className="flex gap-2">
                    <select value={sabor2} onChange={(e) => setSabor2(e.target.value)} className={inputCls}>
                      {SABORES.map((s) => (
                        <option key={s} value={s}>{nomeSabor(s)}</option>
                      ))}
                    </select>
                    <input
                      inputMode="numeric"
                      value={qtd2}
                      onChange={(e) => setQtd2(e.target.value.replace(/\D/g, ""))}
                      className="w-20 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold outline-none focus:ring-2 focus:ring-[#6B21A8]"
                      aria-label="Quantidade"
                    />
                  </div>
                </label>
              )}
              <div className="flex items-end">
                <div className="w-full flex items-center gap-2 p-3 bg-purple-50 rounded-xl text-purple-700 text-sm">
                  <Layers size={18} className="shrink-0" />
                  Total: <b>{Math.floor(num(qtd1)) + (modo === "MISTO" ? Math.floor(num(qtd2)) : 0)} un</b>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={salvando}
                className="bg-[#10B981] hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-emerald-500/30 flex items-center gap-2 disabled:opacity-60"
              >
                {salvando ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                Confirmar produção
              </button>
            </div>
          </form>
        )}

        {/* Visão geral por sabor */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-bold text-gray-900">Por sabor</h2>
            <p className="text-sm text-gray-500">
              Disponível agora: <b className="text-gray-900">{totalDisponivel}</b> brownies
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(porSabor).map(([s, t]) => {
              const disp = Math.max(t.produzido - t.vendido, 0);
              const pct = t.produzido > 0 ? Math.min(t.vendido / t.produzido, 1) : 0;
              return (
                <button
                  key={s}
                  onClick={() => setSelecionado(s)}
                  className={`text-left rounded-2xl p-4 border-2 transition-all ${
                    selecionado === s ? "bg-white border-[#7C3AED] shadow-md" : "bg-white/70 border-transparent hover:bg-white"
                  }`}
                >
                  <p className="text-sm font-bold text-gray-900 truncate">{nomeSabor(s)}</p>
                  <p className={`text-3xl font-extrabold mt-1 ${disp === 0 ? "text-gray-300" : disp <= 3 ? "text-orange-500" : "text-gray-900"}`}>
                    {carregando ? "…" : disp}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {t.produzido} feitos · {t.vendido} vendidos
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-[#7C3AED]" style={{ width: `${pct * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Lotes do sabor */}
        <section className="bg-white rounded-2xl border border-purple-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Package className="text-[#7C3AED]" size={20} /> Lotes de {nomeSabor(selecionado)}
            </h2>
            <span className="text-sm text-gray-500">
              Receita: <b className="text-gray-900">{dinheiro(porSabor[selecionado]?.receita ?? 0)}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-400 text-left">
                  <th className="px-5 py-3 font-semibold">Produzido em</th>
                  <th className="px-3 py-3 font-semibold text-right">Feitos</th>
                  <th className="px-3 py-3 font-semibold text-right">Vendidos</th>
                  <th className="px-3 py-3 font-semibold text-right">Restam</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {lotesDoSabor.map((l) => {
                  const v = vendidos[l.cd_lote] ?? 0;
                  const resta = l.qt_produzida - v;
                  return (
                    <tr key={l.cd_lote} className="border-t border-gray-50 hover:bg-purple-50/50">
                      <td className="px-5 py-3 font-medium">
                        {new Date(l.ts_producao).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-3 text-right">{l.qt_produzida}</td>
                      <td className="px-3 py-3 text-right">{v}</td>
                      <td className={`px-3 py-3 text-right font-bold ${resta < 0 ? "text-red-600" : resta === 0 ? "text-gray-300" : ""}`}>
                        {resta}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => excluirLote(l)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Excluir lote"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!carregando && lotesDoSabor.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                      Nenhum lote de {nomeSabor(selecionado)} registrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {lotesDoSabor.some((l) => l.qt_produzida - (vendidos[l.cd_lote] ?? 0) < 0) && (
            <p className="px-5 py-3 text-xs text-red-600 border-t border-gray-100">
              Número negativo: vendeu mais do que o lote registrado. Confira se
              faltou registrar alguma produção.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
