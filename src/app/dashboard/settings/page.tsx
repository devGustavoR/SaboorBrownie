"use client";

import { supabase } from "@/lib/supabase";
import {
  Check,
  Cookie,
  Droplet,
  Egg,
  Loader2,
  Menu,
  Package,
  Pencil,
  Plus,
  Save,
  Trash2,
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

export default function SettingsPage() {
  // --- STATES ---
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null); // Qual sabor está salvando

  // Receita
  const [selectedFlavor, setSelectedFlavor] = useState("TRADICIONAL");
  const [materials, setMaterials] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);

  // Form Ingrediente
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [recipeYield, setRecipeYield] = useState(12);
  const [addingItem, setAddingItem] = useState(false);

  // Edição de ingrediente da receita
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // --- CARREGAMENTO INICIAL ---
  useEffect(() => {
    const fetchData = async () => {
      setLoadingPrices(true);

      // 1. Preços
      const { data: pricesData } = await supabase
        .from("TABELA_PRECOS")
        .select("*");
      if (pricesData) {
        const pricesMap: Record<string, number> = {};
        pricesData.forEach(
          (item: any) => (pricesMap[item.tp_sabor] = item.vl_preco),
        );
        setPrices(pricesMap);
      }

      // 2. Materiais
      const { data: matData } = await supabase
        .from("MATERIAS_PRIMAS")
        .select("*")
        .order("nm_item");
      if (matData) setMaterials(matData);

      setLoadingPrices(false);
    };
    fetchData();
  }, []);

  // Carregar Receita ao trocar aba
  useEffect(() => {
    const fetchRecipe = async () => {
      const { data } = await supabase
        .from("FICHA_TECNICA")
        .select(`*, MATERIAS_PRIMAS ( nm_item, ds_unidade_medida )`)
        .eq("tp_sabor", selectedFlavor);
      if (data) setRecipeItems(data);
    };
    fetchRecipe();
  }, [selectedFlavor]);

  // --- AÇÕES DE PREÇO ---
  const handlePriceChange = (flavor: string, newVal: string) => {
    setPrices((prev) => ({ ...prev, [flavor]: parseFloat(newVal) || 0 }));
  };

  const savePrice = async (flavor: string) => {
    setSavingPrice(flavor);
    const priceToSave = prices[flavor] || 0;

    await supabase
      .from("TABELA_PRECOS")
      .upsert({ tp_sabor: flavor, vl_preco: priceToSave });

    // Pequeno delay visual para feedback
    setTimeout(() => setSavingPrice(null), 1000);
  };

  // --- AÇÕES DE RECEITA ---
  const handleMaterialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedMaterialId(id);
    const material = materials.find((m) => m.cd_materia == id); // == para aceitar string/number
    setSelectedUnit(material ? material.ds_unidade_medida : "");
  };

  const handleAddIngredient = async () => {
    if (!selectedMaterialId || !amountInput) return;
    setAddingItem(true);

    // Lógica de conversão (salva unitário no banco)
    // Se a unidade for KG/L, o usuário digita gramas/ml, mas salvamos a fração de KG
    // Ex: 140g -> 0.140 kg -> divide por 12 (rendimento) = 0.0116 kg/unidade

    let rawValue = parseFloat(amountInput);
    if (
      selectedUnit.toLowerCase() === "kg" ||
      selectedUnit.toLowerCase() === "l"
    ) {
      // Assume que o usuário digitou gramas/ml se a unidade base for grande
      // Mas vamos simplificar: O usuário digita na unidade base?
      // Vamos assumir que ele digita na unidade de MEDIDA COMUM (gramas)
      rawValue = rawValue / 1000;
    }

    const valuePerUnit = rawValue / recipeYield;

    const { error } = await supabase.from("FICHA_TECNICA").insert([
      {
        tp_sabor: selectedFlavor,
        cd_materia: selectedMaterialId,
        qt_uso_por_unidade: valuePerUnit,
      },
    ]);

    if (!error) {
      setAmountInput("");
      // Recarrega lista
      const { data } = await supabase
        .from("FICHA_TECNICA")
        .select(`*, MATERIAS_PRIMAS ( nm_item, ds_unidade_medida )`)
        .eq("tp_sabor", selectedFlavor);
      if (data) setRecipeItems(data);
    }
    setAddingItem(false);
  };

  const handleRemoveItem = async (id: string) => {
    if (!confirm("Remover este ingrediente da receita?")) return;
    // Atualização otimista
    setRecipeItems((prev) => prev.filter((i) => i.cd_ficha !== id));
    await supabase.from("FICHA_TECNICA").delete().eq("cd_ficha", id);
  };

  // kg/L são digitados em g/ml (mesma regra do formulário de adicionar)
  const isBigUnit = (unit: string) =>
    ["kg", "l"].includes((unit || "").toLowerCase());

  const startEdit = (item: any) => {
    const unit = item.MATERIAS_PRIMAS.ds_unidade_medida;
    const total = item.qt_uso_por_unidade * recipeYield;
    const shown = isBigUnit(unit) ? total * 1000 : total;
    setEditingId(item.cd_ficha);
    setEditValue(String(parseFloat(shown.toFixed(2))));
  };

  const handleSaveEdit = async (item: any) => {
    const value = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || recipeYield <= 0) {
      alert("Informe uma quantidade válida.");
      return;
    }
    setSavingEdit(true);
    const unit = item.MATERIAS_PRIMAS.ds_unidade_medida;
    const base = isBigUnit(unit) ? value / 1000 : value;
    const valuePerUnit = base / recipeYield;

    const { error } = await supabase
      .from("FICHA_TECNICA")
      .update({ qt_uso_por_unidade: valuePerUnit })
      .eq("cd_ficha", item.cd_ficha);

    if (error) {
      alert("Erro ao salvar a alteração.");
    } else {
      setRecipeItems((prev) =>
        prev.map((i) =>
          i.cd_ficha === item.cd_ficha
            ? { ...i, qt_uso_por_unidade: valuePerUnit }
            : i,
        ),
      );
      setEditingId(null);
    }
    setSavingEdit(false);
  };

  // Helper para exibir valor total da receita (Unitário * Rendimento)
  const formatRecipeValue = (valUnit: number, unit: string) => {
    let total = valUnit * recipeYield;
    let label = unit;

    if (unit === "kg" && total < 1) {
      total *= 1000;
      label = "g";
    }
    if ((unit === "l" || unit === "L") && total < 1) {
      total *= 1000;
      label = "ml";
    }

    return `${parseFloat(total.toFixed(2))} ${label}`;
  };

  const getIconForMaterial = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("ovo")) return <Egg size={20} />;
    if (n.includes("leite") || n.includes("oleo") || n.includes("agua"))
      return <Droplet size={20} />;
    if (n.includes("embalagem")) return <Package size={20} />;
    return <Cookie size={20} />;
  };

  return (
    <div className="bg-[#E9D5FF] min-h-screen font-sans text-gray-800 pb-20">
      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">
            Configuração Geral
          </h1>
          <p className="text-gray-500">
            Gerencie preços de venda e fichas técnicas dos seus produtos.
          </p>
        </header>

        {/* --- SEÇÃO 1: PREÇOS --- */}
        <section className="bg-white rounded-2xl p-6 md:p-8 shadow-sm mb-10 border border-purple-50">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg text-[#7C3AED]">
              <Save size={20} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              Tabela de Preços
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FLAVORS.map((flavor) => (
              <div
                key={flavor}
                className="bg-[#F3F4F6] rounded-xl p-4 flex items-center justify-between border border-transparent hover:border-purple-200 transition-all group"
              >
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    {FLAVOR_LABELS[flavor]}
                  </p>
                  <div className="flex items-center">
                    <span className="text-gray-400 mr-1 text-sm font-medium">
                      R$
                    </span>
                    <input
                      type="number"
                      step="0.50"
                      value={prices[flavor] || ""}
                      onChange={(e) =>
                        handlePriceChange(flavor, e.target.value)
                      }
                      className="bg-transparent border-none p-0 text-xl font-bold text-gray-800 w-20 focus:ring-0 placeholder-gray-300"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <button
                  onClick={() => savePrice(flavor)}
                  disabled={savingPrice === flavor}
                  className={`w-10 h-10 rounded-full shadow-sm flex items-center justify-center transition-all ${
                    savingPrice === flavor
                      ? "bg-green-500 text-white scale-110"
                      : "bg-white text-green-500 hover:bg-green-50"
                  }`}
                >
                  {savingPrice === flavor ? (
                    <Check size={20} />
                  ) : (
                    <Save size={20} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* --- SEÇÃO 2: FICHA TÉCNICA --- */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg text-[#7C3AED]">
              <Menu size={20} />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Fichas Técnicas</h2>
          </div>

          {/* Abas de Sabor */}
          <div className="flex flex-wrap gap-2 mb-8">
            {FLAVORS.map((flavor) => (
              <button
                key={flavor}
                onClick={() => setSelectedFlavor(flavor)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedFlavor === flavor
                    ? "bg-[#7C3AED] text-white shadow-md shadow-purple-300 transform scale-105"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {FLAVOR_LABELS[flavor]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna Esquerda: Formulário */}
            <div className="bg-white rounded-2xl p-6 shadow-sm h-fit sticky top-24 border border-purple-50">
              <h3 className="text-lg font-bold text-[#7C3AED] mb-6 flex items-center gap-2">
                <Plus size={20} /> Novo Ingrediente
              </h3>

              {/* Config Rendimento */}
              <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <label className="block text-xs font-bold text-blue-600 uppercase">
                    Rendimento Base
                  </label>
                  <p className="text-[10px] text-blue-400">Tabuleiro padrão</p>
                </div>
                <div className="flex items-center bg-white rounded-lg px-2 border border-blue-200">
                  <input
                    type="number"
                    value={recipeYield}
                    onChange={(e) => setRecipeYield(Number(e.target.value))}
                    className="w-12 py-1 text-center font-bold text-blue-700 border-none focus:ring-0 bg-transparent"
                  />
                  <span className="text-xs text-blue-500 font-medium pr-1">
                    un
                  </span>
                </div>
              </div>

              <form className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                    Item do Estoque
                  </label>
                  <select
                    value={selectedMaterialId}
                    onChange={handleMaterialChange}
                    className="w-full bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-gray-700 font-medium focus:ring-2 focus:ring-[#7C3AED] transition-all cursor-pointer"
                  >
                    <option value="">Selecione...</option>
                    {materials.map((m) => (
                      <option key={m.cd_materia} value={m.cd_materia}>
                        {m.nm_item}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                    Qtd Total ({recipeYield} Brownies)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      placeholder="Ex: 500"
                      className="flex-1 bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-gray-700 font-medium focus:ring-2 focus:ring-[#7C3AED]"
                    />
                    <div className="w-20 flex items-center justify-center bg-[#F3F4F6] rounded-xl text-gray-500 text-sm font-bold border border-gray-200 uppercase">
                      {selectedUnit || "--"}
                    </div>
                  </div>
                  {selectedUnit === "kg" && (
                    <p className="text-[10px] text-orange-500 mt-1 pl-1">
                      * Digite em gramas (g)
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddIngredient}
                  disabled={!selectedMaterialId || !amountInput || addingItem}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-4 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingItem ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus size={20} />
                  )}
                  Adicionar à Receita
                </button>
              </form>
            </div>

            {/* Coluna Direita: Lista */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-purple-50 min-h-[400px]">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
                <h3 className="text-xl font-bold text-gray-900">
                  Receita: {FLAVOR_LABELS[selectedFlavor]}
                </h3>
                <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide">
                  {recipeItems.length} Ingredientes
                </span>
              </div>

              <div className="space-y-3">
                {recipeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                    <Cookie size={48} className="mb-2 opacity-50" />
                    <p>Nenhum ingrediente cadastrado.</p>
                  </div>
                ) : (
                  recipeItems.map((item) => (
                    <div
                      key={item.cd_ficha}
                      className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl group hover:shadow-sm hover:bg-white border border-transparent hover:border-purple-100 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-400 shadow-sm">
                          {getIconForMaterial(item.MATERIAS_PRIMAS.nm_item)}
                        </div>
                        <div>
                          <span className="font-bold text-gray-800 block">
                            {item.MATERIAS_PRIMAS.nm_item}
                          </span>
                          <span className="text-[10px] text-gray-400 uppercase font-bold">
                            Por unidade:{" "}
                            {(
                              item.qt_uso_por_unidade *
                              (item.MATERIAS_PRIMAS.ds_unidade_medida === "kg"
                                ? 1000
                                : 1)
                            ).toFixed(2)}{" "}
                            {item.MATERIAS_PRIMAS.ds_unidade_medida === "kg"
                              ? "g"
                              : item.MATERIAS_PRIMAS.ds_unidade_medida}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {editingId === item.cd_ficha ? (
                          <>
                            <div className="flex items-center bg-white rounded-lg border border-purple-200 px-2">
                              <input
                                autoFocus
                                type="text"
                                inputMode="decimal"
                                value={editValue}
                                onChange={(e) =>
                                  setEditValue(
                                    e.target.value.replace(/[^\d.,]/g, ""),
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveEdit(item);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="w-20 py-1.5 text-right font-bold text-[#7C3AED] border-none focus:ring-0 bg-transparent outline-none"
                              />
                              <span className="text-xs text-gray-400 font-bold pl-1 uppercase">
                                {isBigUnit(
                                  item.MATERIAS_PRIMAS.ds_unidade_medida,
                                )
                                  ? item.MATERIAS_PRIMAS.ds_unidade_medida.toLowerCase() ===
                                    "kg"
                                    ? "g"
                                    : "ml"
                                  : item.MATERIAS_PRIMAS.ds_unidade_medida}
                              </span>
                            </div>
                            <button
                              onClick={() => handleSaveEdit(item)}
                              disabled={savingEdit}
                              className="text-green-500 hover:bg-green-50 p-2 rounded-lg transition-colors disabled:opacity-50"
                              title="Salvar"
                            >
                              {savingEdit ? (
                                <Loader2 size={18} className="animate-spin" />
                              ) : (
                                <Check size={18} />
                              )}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="font-bold text-[#7C3AED] text-lg bg-purple-50 px-3 py-1 rounded-lg">
                              {formatRecipeValue(
                                item.qt_uso_por_unidade,
                                item.MATERIAS_PRIMAS.ds_unidade_medida,
                              )}
                            </span>
                            <button
                              onClick={() => startEdit(item)}
                              className="text-gray-300 hover:text-[#7C3AED] p-2 rounded-lg hover:bg-purple-50 transition-colors"
                              title="Editar quantidade"
                            >
                              <Pencil size={18} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleRemoveItem(item.cd_ficha)}
                          className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
