"use client";

import { supabase } from "@/lib/supabase";
import {
  CheckCircle,
  History,
  Layers,
  Package,
  Plus,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

// --- CONSTANTES ---
const FLAVORS = [
  "TRADICIONAL",
  "NINHO",
  "BRIGADEIRO",
  "DOCE_DE_LEITE",
  "MISTO",
  "SEM_RECHEIO",
];
const FLAVOR_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  DOCE_DE_LEITE: "Doce de Leite",
  MISTO: "Misto",
  SEM_RECHEIO: "Sem Recheio",
};

export default function InventoryPage() {
  const [selectedFlavor, setSelectedFlavor] = useState("TRADICIONAL");

  // Stats
  const [totalProduced, setTotalProduced] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal / Form
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entryMode, setEntryMode] = useState<"SIMPLE" | "MIXED">("SIMPLE");

  // Inputs
  const [simpleQty, setSimpleQty] = useState("12"); // Padrão 12 (1 tabuleiro)
  const [mixedFlavor1, setMixedFlavor1] = useState("TRADICIONAL");
  const [mixedQty1, setMixedQty1] = useState("9");
  const [mixedFlavor2, setMixedFlavor2] = useState("SEM_RECHEIO");
  const [mixedQty2, setMixedQty2] = useState("3");

  // --- CARREGAR DADOS ---
  const fetchInventory = async () => {
    setLoading(true);
    const { data: lotes } = await supabase
      .from("LOTES")
      .select("qt_produzida")
      .eq("tp_sabor", selectedFlavor);

    if (lotes) {
      const total = lotes.reduce((acc, l) => acc + l.qt_produzida, 0);
      setTotalProduced(total);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, [selectedFlavor]);

  // --- AÇÕES ---
  const handleCreateSimple = async () => {
    // Agora só enviamos quantidade. O custo o banco calcula (se tiver trigger) ou fica null.
    // Usando uma RPC simplificada ou insert direto se a lógica de baixa estiver no banco
    // Para simplificar, vou assumir insert direto na tabela LOTES, e você pode criar uma trigger no banco para dar baixa no estoque depois.
    return await supabase.from("LOTES").insert([
      {
        tp_sabor: selectedFlavor,
        qt_produzida: Number(simpleQty),
        vl_custo_total_ingredientes: 0, // Placeholder, já que removemos a entrada manual
      },
    ]);
  };

  const handleCreateMixed = async () => {
    // Cria 2 lotes separados
    const p1 = supabase.from("LOTES").insert([
      {
        tp_sabor: mixedFlavor1,
        qt_produzida: Number(mixedQty1),
        vl_custo_total_ingredientes: 0,
      },
    ]);
    const p2 = supabase.from("LOTES").insert([
      {
        tp_sabor: mixedFlavor2,
        qt_produzida: Number(mixedQty2),
        vl_custo_total_ingredientes: 0,
      },
    ]);

    const [res1, res2] = await Promise.all([p1, p2]);
    if (res1.error) return res1;
    return res2;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    let result;
    if (entryMode === "SIMPLE") {
      if (!simpleQty) return;
      result = await handleCreateSimple();
    } else {
      if (!mixedQty1 || !mixedQty2) return;
      result = await handleCreateMixed();
    }

    if (!result.error) {
      setIsCreating(false);
      fetchInventory();
      // Reset inteligente
      setSimpleQty("12");
      setMixedQty1("9");
      setMixedQty2("3");
    } else {
      alert("Erro ao registrar produção.");
      console.error(result.error);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-[#E9D5FF] min-h-screen font-sans text-gray-800 pb-20">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Header da Página */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Estoque de Coberturas
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Gerencie a produção e consulte o estoque disponível.
            </p>
          </div>

          <button
            onClick={() => setIsCreating(!isCreating)}
            className={`px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg transition-all transform active:scale-95 ${
              isCreating
                ? "bg-white text-gray-600 hover:bg-gray-50"
                : "bg-[#6B21A8] hover:bg-purple-800 text-white shadow-purple-500/30"
            }`}
          >
            {isCreating ? <X size={18} /> : <Plus size={18} />}
            <span className="font-medium text-sm">
              {isCreating ? "Cancelar" : "Registrar Produção"}
            </span>
          </button>
        </div>

        {/* --- FORMULÁRIO DE PRODUÇÃO (Expandable) --- */}
        {isCreating && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-purple-100 animate-in zoom-in-95 duration-300">
            {/* Abas de Modo */}
            <div className="border-b border-gray-100 mb-6">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setEntryMode("SIMPLE")}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    entryMode === "SIMPLE"
                      ? "border-[#6B21A8] text-[#6B21A8]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Lote Único
                </button>
                <button
                  onClick={() => setEntryMode("MIXED")}
                  className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    entryMode === "MIXED"
                      ? "border-[#6B21A8] text-[#6B21A8]"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  Tabuleiro Misto (9/3)
                </button>
              </nav>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {entryMode === "SIMPLE" ? (
                  <>
                    {/* Sabor (Read-only no modo simples, muda pela aba lá embaixo) */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Sabor do Lote
                      </label>
                      <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-700 font-bold">
                        {FLAVOR_LABELS[selectedFlavor]}
                      </div>
                      <p className="text-[10px] text-gray-400">
                        * Selecione o sabor na lista abaixo para mudar.
                      </p>
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Qtd Produzida
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={simpleQty}
                          onChange={(e) => setSimpleQty(e.target.value)}
                          className="block w-full pl-4 pr-10 py-3 border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-[#6B21A8] focus:border-[#6B21A8] transition-all font-bold text-lg"
                          placeholder="12"
                        />
                        <span className="absolute inset-y-0 right-4 flex items-center text-gray-400 text-sm font-medium">
                          un
                        </span>
                      </div>
                    </div>

                    {/* Info Card (Placeholder do custo removido) */}
                    <div className="flex items-center p-4 bg-purple-50 rounded-xl border border-purple-100 text-purple-700 text-sm">
                      <Package className="mr-3 shrink-0" size={20} />
                      <span>
                        Isso adicionará <b>{simpleQty || 0} unidades</b> ao
                        estoque de {FLAVOR_LABELS[selectedFlavor]}.
                      </span>
                    </div>
                  </>
                ) : (
                  // MODO MISTO
                  <>
                    {/* Parte 1 */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Parte Maior (9)
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={mixedFlavor1}
                          onChange={(e) => setMixedFlavor1(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-3 text-sm font-medium focus:ring-[#6B21A8]"
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
                          className="w-20 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold"
                        />
                      </div>
                    </div>

                    {/* Parte 2 */}
                    <div className="space-y-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Parte Menor (3)
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={mixedFlavor2}
                          onChange={(e) => setMixedFlavor2(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-3 text-sm font-medium focus:ring-[#6B21A8]"
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
                          className="w-20 bg-gray-50 border border-gray-200 rounded-lg text-center font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-center p-4 bg-blue-50 rounded-xl border border-blue-100 text-blue-700 text-sm">
                      <Layers className="mr-2" size={20} />
                      <span>
                        Total: <b>{Number(mixedQty1) + Number(mixedQty2)} un</b>
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-50">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-[#10B981] hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-emerald-500/30 transition-all transform hover:-translate-y-0.5 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Salvando..." : "Confirmar Produção"}
                  {!isSubmitting && <CheckCircle size={18} />}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* --- SELETOR DE SABORES (ABAS VISUAIS) --- */}
        <div className="bg-white/60 backdrop-blur-md rounded-xl p-2 mb-8 flex flex-wrap gap-2 shadow-sm border border-white/40">
          {FLAVORS.map((flavor) => (
            <button
              key={flavor}
              onClick={() => {
                setSelectedFlavor(flavor);
                setIsCreating(false);
              }}
              className={`flex-1 min-w-[100px] py-2.5 px-4 rounded-lg text-sm font-medium text-center transition-all ${
                selectedFlavor === flavor
                  ? "bg-white text-[#6B21A8] shadow-md ring-1 ring-purple-100 font-bold transform scale-105"
                  : "text-gray-500 hover:bg-white/50 hover:text-gray-800"
              }`}
            >
              {FLAVOR_LABELS[flavor]}
            </button>
          ))}
        </div>

        {/* --- STATS GRID --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card Total */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-purple-50 group hover:border-purple-200 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg text-[#6B21A8]">
                <Package size={20} />
              </div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                Total Produzido
              </h3>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-4xl font-black text-gray-900">
                {loading ? "..." : totalProduced}
              </span>
              <span className="text-sm font-medium text-gray-400 mb-1">
                unidades
              </span>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded">
              <History size={12} />
              Histórico Geral
            </div>
          </div>

          {/* Card Status (Visual) */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-purple-50 group hover:border-purple-200 transition-all">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                <TrendingUp size={20} />
              </div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                Status do Estoque
              </h3>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-2xl font-bold text-gray-900">
                {totalProduced > 0 ? "Disponível" : "Zerado"}
              </span>
            </div>
            <div className="mt-4 text-xs text-gray-400">
              Baseado na produção atual de {FLAVOR_LABELS[selectedFlavor]}.
            </div>
          </div>

          {/* Card Imagem (Decorativo) */}
          <div className="relative w-full h-full min-h-[160px] rounded-2xl overflow-hidden shadow-lg group">
            <div className="absolute inset-0 bg-gradient-to-t from-[#6B21A8]/90 to-transparent z-10"></div>
            {/* Imagem de Brownie Genérica */}
            <div className="absolute inset-0 bg-gray-300">
              <img
                src="https://images.unsplash.com/photo-1606313564200-e75d5e30476c?q=80&w=800&auto=format&fit=crop"
                alt="Brownie"
                className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700"
              />
            </div>
            <div className="absolute bottom-0 left-0 p-6 z-20">
              <h4 className="text-xs font-bold text-white/80 uppercase tracking-widest mb-1">
                Produção
              </h4>
              <h2 className="text-xl font-bold text-white leading-tight">
                Lote Recente - {FLAVOR_LABELS[selectedFlavor]}
              </h2>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
