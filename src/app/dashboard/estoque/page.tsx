"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

// Enums conforme seu banco
const FLAVORS = [
  "TRADICIONAL",
  "NINHO",
  "BRIGADEIRO",
  "DOCE_DE_LEITE",
  "MISTO",
];

// Mapeamento para exibição bonita
const FLAVOR_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  DOCE_DE_LEITE: "Doce de Leite",
  MISTO: "Misto",
};

export default function InventoryPage() {
  const [selectedFlavor, setSelectedFlavor] = useState("TRADICIONAL");

  // Estados de dados
  const [totalUnits, setTotalUnits] = useState(0);
  const [totalCostIngredients, setTotalCostIngredients] = useState(0);
  const [avgUnitCost, setAvgUnitCost] = useState(0);
  const [loading, setLoading] = useState(true);

  // Estados de Criação de Lote (Modal simples ou inline)
  const [isCreating, setIsCreating] = useState(false);
  const [newBatchQty, setNewBatchQty] = useState("");
  const [newBatchCost, setNewBatchCost] = useState("");

  const fetchInventory = async () => {
    setLoading(true);
    // Buscar lotes do sabor selecionado
    const { data: lotes, error } = await supabase
      .from("LOTES")
      .select("*")
      .eq("tp_sabor", selectedFlavor);

    if (lotes) {
      // Calcular métricas
      const units = lotes.reduce((acc, lote) => acc + lote.qt_produzida, 0);
      const cost = lotes.reduce(
        (acc, lote) => acc + lote.vl_custo_total_ingredientes,
        0,
      );

      setTotalUnits(units);
      setTotalCostIngredients(cost);
      // Média ponderada simples ou custo unitário médio
      setAvgUnitCost(units > 0 ? cost / units : 0);
    }

    if (error) console.error(error);
    setLoading(false);
  };

  // Recarregar quando mudar o sabor
  useEffect(() => {
    const load = async () => {
      await fetchInventory();
    };

    load();
  }, [selectedFlavor]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchQty || !newBatchCost) return;

    const { error } = await supabase.from("LOTES").insert([
      {
        tp_sabor: selectedFlavor,
        qt_produzida: Number(newBatchQty),
        vl_custo_total_ingredientes: Number(newBatchCost),
      },
    ]);

    if (!error) {
      setIsCreating(false);
      setNewBatchQty("");
      setNewBatchCost("");
      fetchInventory(); // Atualiza dados
    } else {
      alert("Erro ao criar lote");
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col w-full px-4 py-8 md:px-10 lg:px-20 xl:px-40">
      <div className="mx-auto max-w-[960px] w-full flex flex-col gap-8">
        {/* Header */}
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

        {/* Formulário de Novo Lote (Inline) */}
        {isCreating && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-primary/10 animate-in slide-in-from-top-2">
            <h3 className="text-lg font-bold text-text-main mb-4">
              Registrar Novo Lote de {FLAVOR_LABELS[selectedFlavor]}
            </h3>
            <form
              onSubmit={handleCreateBatch}
              className="flex flex-col md:flex-row gap-4 items-end"
            >
              <div className="flex-1 w-full">
                <label className="text-sm font-bold text-text-muted block mb-1">
                  Qtd Produzida (un)
                </label>
                <input
                  type="number"
                  value={newBatchQty}
                  onChange={(e) => setNewBatchQty(e.target.value)}
                  className="w-full rounded-lg border-gray-200 bg-[#f6f6f8] p-3 text-sm focus:border-primary focus:ring-primary"
                  placeholder="Ex: 12"
                />
              </div>
              <div className="flex-1 w-full">
                <label className="text-sm font-bold text-text-muted block mb-1">
                  Custo Total Ingredientes (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newBatchCost}
                  onChange={(e) => setNewBatchCost(e.target.value)}
                  className="w-full rounded-lg border-gray-200 bg-[#f6f6f8] p-3 text-sm focus:border-primary focus:ring-primary"
                  placeholder="Ex: 15.50"
                />
              </div>
              <button className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold text-sm transition-colors">
                Salvar Lote
              </button>
            </form>
          </div>
        )}

        {/* Flavor Toggle */}
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
                  className={`flex items-center justify-center py-2 px-4 rounded-full text-sm font-medium transition-all ${
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
          {/* Main Stat */}
          <div className="flex flex-col p-6 rounded-xl bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">ac_unit</span>
              <p className="text-sm font-medium uppercase tracking-wider">
                Unidades Produzidas
              </p>
            </div>
            <p className="text-5xl font-black text-text-main tracking-tight">
              {loading ? "..." : totalUnits}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded">
              <span className="material-symbols-outlined text-sm">
                trending_up
              </span>
              Total Histórico
            </div>
          </div>

          {/* Secondary Stat 1 */}
          <div className="flex flex-col p-6 rounded-xl bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">kitchen</span>
              <p className="text-sm font-medium uppercase tracking-wider">
                Custo Total (Ingr.)
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
              Investido em {FLAVOR_LABELS[selectedFlavor]}
            </div>
          </div>

          {/* Secondary Stat 2 */}
          <div className="flex flex-col p-6 rounded-xl bg-white shadow-sm border border-transparent hover:border-primary/10 transition-colors">
            <div className="flex items-center gap-3 mb-2 text-text-muted">
              <span className="material-symbols-outlined">attach_money</span>
              <p className="text-sm font-medium uppercase tracking-wider">
                Custo Médio Unit.
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
        <div className="rounded-xl overflow-hidden shadow-md h-48 relative group">
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
                Produção Recente
              </span>
              <h3 className="text-white text-xl font-bold">
                Lote Recente - {FLAVOR_LABELS[selectedFlavor]}
              </h3>
            </div>
          </div>
        </div>

        {/* Warning Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
          <div className="flex items-center justify-center size-12 rounded-full bg-amber-100 text-amber-600 shrink-0">
            <span className="material-symbols-outlined text-2xl">warning</span>
          </div>
          <div className="flex flex-col flex-1 gap-1">
            <p className="text-amber-900 text-lg font-bold leading-tight">
              Atenção: Material de Apoio
            </p>
            <p className="text-amber-700 text-base font-medium leading-normal">
              Restam apenas 3 guardanapos no rateio atual. Solicite reposição.
            </p>
          </div>
          <button className="shrink-0 bg-white text-amber-700 text-sm font-bold px-4 py-2 rounded border border-amber-200 hover:bg-amber-50 transition-colors active:scale-95">
            Solicitar Reposição
          </button>
        </div>
      </div>
    </div>
  );
}
