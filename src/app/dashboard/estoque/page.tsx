"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

const FLAVOR_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  DOCE_DE_LEITE: "Doce de Leite",
  MISTO: "Misto",
  SEM_RECHEIO: "Sem Recheio",
};

const FLAVORS = Object.keys(FLAVOR_LABELS);

export default function InventoryPage() {
  const [selectedFlavor, setSelectedFlavor] = useState("TRADICIONAL");

  // Dados do Dashboard
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalCostIngredients, setTotalCostIngredients] = useState(0);
  const [avgUnitCost, setAvgUnitCost] = useState(0);
  const [loading, setLoading] = useState(true);

  // Estados do Modal
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- MODO DE CRIAÇÃO (Simples vs Misto) ---
  const [entryMode, setEntryMode] = useState<"SIMPLE" | "MIXED">("SIMPLE");

  // Estados Lote Simples
  const [simpleQty, setSimpleQty] = useState("");
  const [simpleCost, setSimpleCost] = useState("");

  // Estados Lote Misto (O Tabuleiro Dividido)
  const [mixedFlavor1, setMixedFlavor1] = useState("TRADICIONAL");
  const [mixedQty1, setMixedQty1] = useState("9");

  const [mixedFlavor2, setMixedFlavor2] = useState("SEM_RECHEIO");
  const [mixedQty2, setMixedQty2] = useState("3");

  const [mixedTotalCost, setMixedTotalCost] = useState("");

  const fetchInventory = async () => {
    setLoading(true);
    const { data: lotes, error } = await supabase
      .from("LOTES")
      .select("*")
      .eq("tp_sabor", selectedFlavor);

    if (lotes) {
      const units = lotes.reduce((acc, lote) => acc + lote.qt_produzida, 0);
      const cost = lotes.reduce(
        (acc, lote) => acc + lote.vl_custo_total_ingredientes,
        0,
      );

      setTotalUnits(units);
      setTotalCostIngredients(cost);
      setAvgUnitCost(units > 0 ? cost / units : 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, [selectedFlavor]);

  // --- LÓGICA DE SALVAR ---

  const handleCreateSimple = async () => {
    return await supabase.rpc("criar_lote_com_baixa", {
      p_tp_sabor: selectedFlavor,
      p_qt_produzida: Number(simpleQty),
      p_vl_custo_total: Number(simpleCost),
    });
  };

  const handleCreateMixed = async () => {
    const qty1 = Number(mixedQty1);
    const qty2 = Number(mixedQty2);
    const totalQty = qty1 + qty2;
    const totalCost = Number(mixedTotalCost);

    if (totalQty === 0) throw new Error("Quantidade total não pode ser zero");

    // Calcula custo proporcional por unidade para dividir o valor
    const costPerUnit = totalCost / totalQty;
    const cost1 = costPerUnit * qty1;
    const cost2 = costPerUnit * qty2;

    // Envia os dois lotes para o banco (Paralelamente)
    const promise1 = supabase.rpc("criar_lote_com_baixa", {
      p_tp_sabor: mixedFlavor1,
      p_qt_produzida: qty1,
      p_vl_custo_total: cost1,
    });

    const promise2 = supabase.rpc("criar_lote_com_baixa", {
      p_tp_sabor: mixedFlavor2,
      p_qt_produzida: qty2,
      p_vl_custo_total: cost2,
    });

    const [res1, res2] = await Promise.all([promise1, promise2]);

    // Retorna erro se algum falhou
    if (res1.error) return res1;
    if (res2.error) return res2;
    return { error: null };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let result;
    if (entryMode === "SIMPLE") {
      if (!simpleQty || !simpleCost) return;
      result = await handleCreateSimple();
    } else {
      if (!mixedQty1 || !mixedQty2 || !mixedTotalCost) return;
      result = await handleCreateMixed();
    }

    if (!result.error) {
      setIsCreating(false);
      // Limpa formulários
      setSimpleQty("");
      setSimpleCost("");
      setMixedTotalCost("");
      // Reset padrão do misto
      setMixedQty1("9");
      setMixedQty2("3");

      fetchInventory();
      alert(
        entryMode === "SIMPLE"
          ? "Lote criado!"
          : "Tabuleiro dividido registrado com sucesso!",
      );
    } else {
      console.error(result.error);
      alert("Erro ao criar. Verifique o console.");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="flex flex-col w-full px-4 py-8 md:px-10 lg:px-20 xl:px-40 bg-brand-bg min-h-screen text-[#101019]">
      <div className="mx-auto max-w-[960px] w-full flex flex-col gap-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight text-text-main">
              Estoque de Coberturas
            </h1>
            <p className="text-primary/70 text-base font-normal">
              Gerencie seus ingredientes e produtos prontos
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="bg-primary hover:bg-[#23268a] text-white px-5 py-2.5 rounded text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-primary/20 active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">
                {isCreating ? "close" : "add"}
              </span>
              {isCreating ? "Cancelar" : "Nova Entrada"}
            </button>
          </div>
        </header>

        {/* --- FORMULÁRIO DE ENTRADA --- */}
        {isCreating && (
          <div className="bg-white p-6 rounded-[24px] shadow-md border border-primary/10 animate-in slide-in-from-top-2">
            {/* Abas do Formulário */}
            <div className="flex gap-4 mb-6 border-b border-gray-100 pb-2">
              <button
                onClick={() => setEntryMode("SIMPLE")}
                className={`text-sm font-bold pb-2 transition-colors ${entryMode === "SIMPLE" ? "text-primary border-b-2 border-primary" : "text-gray-400 hover:text-gray-600"}`}
              >
                Lote Único
              </button>
              <button
                onClick={() => setEntryMode("MIXED")}
                className={`text-sm font-bold pb-2 transition-colors ${entryMode === "MIXED" ? "text-primary border-b-2 border-primary" : "text-gray-400 hover:text-gray-600"}`}
              >
                Tabuleiro Dividido (9/3)
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* MODO SIMPLES */}
              {entryMode === "SIMPLE" && (
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Sabor
                    </label>
                    <div className="h-12 flex items-center px-4 bg-gray-100 rounded-xl text-gray-500 font-bold text-sm cursor-not-allowed">
                      {FLAVOR_LABELS[selectedFlavor]}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      * Selecione o sabor nas abas abaixo para mudar.
                    </p>
                  </div>
                  <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Qtd Produzida (un)
                    </label>
                    <input
                      type="number"
                      value={simpleQty}
                      onChange={(e) => setSimpleQty(e.target.value)}
                      className="w-full h-12 bg-[#f6f6f8] rounded-xl px-4 font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Ex: 12"
                      required
                    />
                  </div>
                  <div className="flex-1 w-full">
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Custo Total (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={simpleCost}
                      onChange={(e) => setSimpleCost(e.target.value)}
                      className="w-full h-12 bg-[#f6f6f8] rounded-xl px-4 font-bold outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Ex: 15.50"
                      required
                    />
                  </div>
                </div>
              )}

              {/* MODO MISTO (TABULEIRO DIVIDIDO) */}
              {entryMode === "MIXED" && (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-blue-800 text-sm">
                    <span className="font-bold">Como funciona:</span> O sistema
                    vai dividir o custo proporcionalmente e criar 2 lotes
                    separados, garantindo que o recheio seja descontado apenas
                    da parte que tem recheio.
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Parte 1 */}
                    <div className="p-4 border border-gray-200 rounded-2xl">
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">
                          Parte 1
                        </label>
                      </div>
                      <select
                        value={mixedFlavor1}
                        onChange={(e) => setMixedFlavor1(e.target.value)}
                        className="w-full h-10 bg-white border border-gray-200 rounded-lg px-2 mb-3 text-sm font-bold"
                      >
                        {FLAVORS.map((f) => (
                          <option key={f} value={f}>
                            {FLAVOR_LABELS[f]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={mixedQty1}
                        onChange={(e) => setMixedQty1(e.target.value)}
                        className="w-full h-10 bg-[#f6f6f8] rounded-lg px-3 font-bold text-sm"
                        placeholder="Qtd"
                      />
                    </div>

                    {/* Parte 2 */}
                    <div className="p-4 border border-gray-200 rounded-2xl">
                      <div className="flex justify-between mb-2">
                        <label className="text-xs font-bold text-gray-400 uppercase">
                          Parte 2
                        </label>
                      </div>
                      <select
                        value={mixedFlavor2}
                        onChange={(e) => setMixedFlavor2(e.target.value)}
                        className="w-full h-10 bg-white border border-gray-200 rounded-lg px-2 mb-3 text-sm font-bold"
                      >
                        {FLAVORS.map((f) => (
                          <option key={f} value={f}>
                            {FLAVOR_LABELS[f]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={mixedQty2}
                        onChange={(e) => setMixedQty2(e.target.value)}
                        className="w-full h-10 bg-[#f6f6f8] rounded-lg px-3 font-bold text-sm"
                        placeholder="Qtd"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Custo TOTAL do Tabuleiro (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={mixedTotalCost}
                      onChange={(e) => setMixedTotalCost(e.target.value)}
                      className="w-full h-14 bg-[#f6f6f8] rounded-xl px-4 text-lg font-bold text-primary outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Ex: 20.00"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  disabled={isSubmitting}
                  className="h-12 w-full md:w-auto bg-green-600 hover:bg-green-700 text-white px-8 rounded-xl font-bold text-sm transition-all shadow-lg shadow-green-600/20 active:scale-95 disabled:opacity-70"
                >
                  {isSubmitting ? "Processando..." : "Confirmar Produção"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- RESTO DA PÁGINA (Abas, Grid) --- */}
        {/* Seletor de Sabores */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex p-1.5 bg-white/50 rounded-full w-fit md:w-full min-w-[320px] border border-white/20">
            {FLAVORS.map((flavor) => (
              <label key={flavor} className="flex-1 cursor-pointer">
                <input
                  type="radio"
                  name="flavor"
                  value={flavor}
                  checked={selectedFlavor === flavor}
                  onChange={() => setSelectedFlavor(flavor)}
                  className="sr-only"
                />
                <div
                  className={`flex items-center justify-center py-2 px-4 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    selectedFlavor === flavor
                      ? "bg-white text-primary shadow-sm font-bold"
                      : "text-text-muted hover:text-text-main"
                  }`}
                >
                  {FLAVOR_LABELS[flavor]}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col p-6 rounded-[24px] bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">ac_unit</span>
              <p className="text-xs font-bold uppercase tracking-wider">
                Total Produzido
              </p>
            </div>
            <p className="text-5xl font-black text-text-main tracking-tight">
              {loading ? "..." : totalUnits}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded">
              <span className="material-symbols-outlined text-sm">history</span>
              Histórico Geral
            </div>
          </div>

          <div className="flex flex-col p-6 rounded-[24px] bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">kitchen</span>
              <p className="text-xs font-bold uppercase tracking-wider">
                Investimento Total
              </p>
            </div>
            <p className="text-4xl font-bold text-text-main tracking-tight">
              {loading
                ? "..."
                : totalCostIngredients.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </p>
            <div className="mt-auto pt-2 text-sm text-text-muted">
              Em {FLAVOR_LABELS[selectedFlavor]}
            </div>
          </div>

          <div className="flex flex-col p-6 rounded-[24px] bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">attach_money</span>
              <p className="text-xs font-bold uppercase tracking-wider">
                Custo Médio/Un
              </p>
            </div>
            <p className="text-4xl font-bold text-text-main tracking-tight">
              {loading
                ? "..."
                : avgUnitCost.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
            </p>
            <div className="mt-auto pt-2 text-sm text-text-muted">
              Baseado no histórico
            </div>
          </div>
        </div>

        {/* Product Image */}
        <div className="rounded-[24px] overflow-hidden shadow-md h-48 relative group">
          <div
            className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
            style={{
              backgroundImage:
                'url("https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=800&auto=format&fit=crop")',
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-6">
            <div>
              <span className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1 block">
                Controle de Qualidade
              </span>
              <h3 className="text-white text-xl font-bold">
                Lote Recente - {FLAVOR_LABELS[selectedFlavor]}
              </h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
