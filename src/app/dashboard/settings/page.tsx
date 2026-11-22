"use client";

import { RoletaTeste } from "@/components/RoletaTeste";
import { ROTULO_SABOR, SABORES } from "@/lib/sabores";
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
const FLAVORS: string[] = [...SABORES];
const FLAVOR_LABELS = ROTULO_SABOR;

// Massa compartilhada por todos os sabores (a receita do brownie é sempre a mesma);
// cada sabor guarda só os ingredientes do recheio.
const BASE = "BASE";
// Segunda massa (cake brownie): usa os mesmos recheios do brownie
const BASE_CAKE = "BASE_CAKE";
const BASE_BOMBOM = "BASE_BOMBOM"; // massa dos bombons brownie
const BASE_LABELS: Record<string, string> = {
  [BASE]: "Massa Brownie",
  [BASE_CAKE]: "Massa Cake Brownie",
  [BASE_BOMBOM]: "Massa Bombom Brownie",
};
const isBase = (key: string) => key in BASE_LABELS;
const RECIPE_TABS = [BASE, BASE_CAKE, BASE_BOMBOM, ...FLAVORS];
// Tradicional é o brownie sem recheio: usa só a massa base
const SEM_RECHEIO_KEY = "TRADICIONAL";

// Rendimento base (quantos brownies a receita rende) fica salvo por sabor neste navegador
const YIELD_KEY = (flavor: string) => `saboor:rendimento:${flavor}`;
const DEFAULT_YIELD = 12;

const readYield = (flavor: string) => {
  try {
    const n = Number(localStorage.getItem(YIELD_KEY(flavor)));
    return n > 0 ? n : DEFAULT_YIELD;
  } catch {
    return DEFAULT_YIELD;
  }
};

const saveYield = (flavor: string, value: number) => {
  try {
    if (value > 0) localStorage.setItem(YIELD_KEY(flavor), String(value));
  } catch {
    // storage indisponível: o valor vale só para esta sessão
  }
};

// kg/L são digitados em g/ml nas receitas
const isBigUnit = (unit: string) =>
  ["kg", "l"].includes((unit || "").toLowerCase());

interface Materia {
  cd_materia: string;
  nm_item: string;
  ds_unidade_medida: string;
}

interface ItemReceita {
  cd_ficha: string;
  cd_materia: string;
  qt_uso_por_unidade: number;
  MATERIAS_PRIMAS: { nm_item: string; ds_unidade_medida: string };
}

const doBanco = (data: unknown[] | null): ItemReceita[] =>
  ((data ?? []) as ItemReceita[]).map((i) => ({
    ...i,
    qt_uso_por_unidade: Number(i.qt_uso_por_unidade) || 0,
    MATERIAS_PRIMAS: i.MATERIAS_PRIMAS ?? { nm_item: "(insumo apagado)", ds_unidade_medida: "" },
  }));

const paraNumero = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export default function SettingsPage() {
  // --- STATES ---
  const [loadingPrices, setLoadingPrices] = useState(true);
  // preço como texto para aceitar vírgula ("7,50"); salvo = o que está no banco
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [precosSalvos, setPrecosSalvos] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);
  const [precoOk, setPrecoOk] = useState<string | null>(null);

  // Receita
  const [selectedFlavor, setSelectedFlavor] = useState(BASE);
  const [materials, setMaterials] = useState<Materia[]>([]);
  const [recipeItems, setRecipeItems] = useState<ItemReceita[]>([]);

  // Form Ingrediente
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [recipeYield, setRecipeYield] = useState(DEFAULT_YIELD);
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
        const pricesMap: Record<string, string> = {};
        for (const item of pricesData as { tp_sabor: string; vl_preco: unknown }[]) {
          const n = Number(item.vl_preco) || 0;
          pricesMap[item.tp_sabor] = n > 0 ? n.toFixed(2).replace(".", ",") : "";
        }
        setPrices(pricesMap);
        setPrecosSalvos(pricesMap);
      }

      // 2. Materiais
      const { data: matData } = await supabase
        .from("MATERIAS_PRIMAS")
        .select("cd_materia, nm_item, ds_unidade_medida")
        .order("nm_item");
      if (matData) setMaterials(matData as Materia[]);

      setLoadingPrices(false);
    };
    fetchData();
  }, []);

  // Rendimento salvo do sabor inicial (localStorage só existe no cliente)
  useEffect(() => {
    const timer = setTimeout(() => setRecipeYield(readYield(BASE)), 0);
    return () => clearTimeout(timer);
  }, []);

  // Carregar Receita ao trocar aba (ignora a resposta de uma aba antiga)
  useEffect(() => {
    let vivo = true;
    supabase
      .from("FICHA_TECNICA")
      .select(`*, MATERIAS_PRIMAS ( nm_item, ds_unidade_medida )`)
      .eq("tp_sabor", selectedFlavor)
      .then(({ data }) => {
        if (vivo) setRecipeItems(doBanco(data));
      });
    return () => {
      vivo = false;
    };
  }, [selectedFlavor]);

  // --- AÇÕES DE PREÇO ---
  const handlePriceChange = (flavor: string, newVal: string) => {
    setPrices((prev) => ({ ...prev, [flavor]: newVal.replace(/[^\d.,]/g, "") }));
  };

  const savePrice = async (flavor: string) => {
    const valor = paraNumero(prices[flavor] ?? "");
    if (valor <= 0) {
      alert("Informe um preço maior que zero.");
      return;
    }
    setSavingPrice(flavor);
    const { error } = await supabase
      .from("TABELA_PRECOS")
      .upsert({ tp_sabor: flavor, vl_preco: valor });
    setSavingPrice(null);
    if (error) {
      alert(`Erro ao salvar o preço.\n${error.message}`);
      return;
    }
    const texto = valor.toFixed(2).replace(".", ",");
    setPrices((prev) => ({ ...prev, [flavor]: texto }));
    setPrecosSalvos((prev) => ({ ...prev, [flavor]: texto }));
    setPrecoOk(flavor);
    setTimeout(() => setPrecoOk((f) => (f === flavor ? null : f)), 1500);
  };

  // --- AÇÕES DE RECEITA ---
  const handleMaterialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedMaterialId(id);
    const material = materials.find((m) => m.cd_materia === id);
    setSelectedUnit(material ? material.ds_unidade_medida : "");
  };

  const handleAddIngredient = async () => {
    if (!selectedMaterialId || !amountInput) return;
    const digitado = paraNumero(amountInput);
    if (digitado <= 0 || recipeYield <= 0) {
      alert("Informe a quantidade e o rendimento.");
      return;
    }
    if (
      recipeItems.some((i) => i.cd_materia === selectedMaterialId) &&
      !confirm("Este insumo já está na receita. Adicionar de novo (soma as quantidades)?")
    )
      return;
    setAddingItem(true);

    // Guardamos o uso POR BROWNIE. kg/L são digitados em g/ml:
    // 140 g de 12 brownies → 0,140 kg ÷ 12 = 0,0117 kg por brownie
    const rawValue = isBigUnit(selectedUnit) ? digitado / 1000 : digitado;
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
      setRecipeItems(doBanco(data));
    } else {
      alert(`Erro ao adicionar.\n${error.message}`);
    }
    setAddingItem(false);
  };

  const handleRemoveItem = async (id: string) => {
    if (!confirm("Remover este ingrediente da receita?")) return;
    const antes = recipeItems;
    setRecipeItems((prev) => prev.filter((i) => i.cd_ficha !== id));
    const { error } = await supabase.from("FICHA_TECNICA").delete().eq("cd_ficha", id);
    if (error) {
      setRecipeItems(antes);
      alert(`Não foi possível remover.\n${error.message}`);
    }
  };

  const startEdit = (item: ItemReceita) => {
    const unit = item.MATERIAS_PRIMAS.ds_unidade_medida;
    const total = item.qt_uso_por_unidade * recipeYield;
    const shown = isBigUnit(unit) ? total * 1000 : total;
    setEditingId(item.cd_ficha);
    setEditValue(String(parseFloat(shown.toFixed(2))));
  };

  const handleSaveEdit = async (item: ItemReceita) => {
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
    const u = (unit || "").toLowerCase();
    if (u === "kg" && total < 1) {
      total *= 1000;
      label = "g";
    }
    if (u === "l" && total < 1) {
      total *= 1000;
      label = "ml";
    }
    return `${parseFloat(total.toFixed(2)).toLocaleString("pt-BR")} ${label}`;
  };

  // uso por brownie, em g/ml quando a unidade é kg/L
  const porBrownie = (valUnit: number, unit: string) => {
    const u = (unit || "").toLowerCase();
    const v = isBigUnit(u) ? valUnit * 1000 : valUnit;
    const label = u === "kg" ? "g" : u === "l" ? "ml" : unit;
    return `${parseFloat(v.toFixed(2)).toLocaleString("pt-BR")} ${label}`;
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
            {FLAVORS.map((flavor) => {
              const alterado = (prices[flavor] ?? "") !== (precosSalvos[flavor] ?? "");
              return (
                <div
                  key={flavor}
                  className={`rounded-xl p-4 flex items-center justify-between border transition-all ${
                    alterado ? "bg-amber-50 border-amber-200" : "bg-[#F3F4F6] border-transparent hover:border-purple-200"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      {FLAVOR_LABELS[flavor]}
                      {alterado && <span className="ml-2 normal-case text-amber-700">não salvo</span>}
                    </p>
                    <div className="flex items-center">
                      <span className="text-gray-400 mr-1 text-sm font-medium">R$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={prices[flavor] ?? ""}
                        disabled={loadingPrices}
                        onChange={(e) => handlePriceChange(flavor, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void savePrice(flavor);
                        }}
                        className="bg-transparent border-none p-0 text-xl font-bold text-gray-800 w-24 focus:ring-0 outline-none placeholder-gray-300"
                        placeholder={loadingPrices ? "…" : "0,00"}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => savePrice(flavor)}
                    disabled={savingPrice === flavor || !alterado}
                    title={alterado ? "Salvar preço" : "Salvo"}
                    className={`w-10 h-10 rounded-full shadow-sm flex items-center justify-center transition-all ${
                      precoOk === flavor
                        ? "bg-green-500 text-white scale-110"
                        : alterado
                          ? "bg-[#7C3AED] text-white hover:bg-[#6B21A8]"
                          : "bg-white text-gray-300"
                    }`}
                  >
                    {savingPrice === flavor ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : precoOk === flavor || !alterado ? (
                      <Check size={20} />
                    ) : (
                      <Save size={18} />
                    )}
                  </button>
                </div>
              );
            })}
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
            {RECIPE_TABS.map((flavor) => (
              <button
                key={flavor}
                onClick={() => {
                  setSelectedFlavor(flavor);
                  setRecipeYield(readYield(flavor));
                  setEditingId(null);
                }}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
                  selectedFlavor === flavor
                    ? "bg-[#7C3AED] text-white shadow-md shadow-purple-300 transform scale-105"
                    : "bg-white text-gray-600 hover:bg-gray-100"
                }`}
              >
                {isBase(flavor) ? BASE_LABELS[flavor] : FLAVOR_LABELS[flavor]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Coluna Esquerda: Formulário */}
            <div className="bg-white rounded-2xl p-6 shadow-sm h-fit sticky top-24 border border-purple-50">
              <h3 className="text-lg font-bold text-[#7C3AED] mb-6 flex items-center gap-2">
                <Plus size={20} />{" "}
                {isBase(selectedFlavor)
                  ? "Novo Ingrediente da Massa"
                  : "Novo Ingrediente do Recheio"}
              </h3>

              {/* Config Rendimento */}
              <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 flex justify-between items-center">
                <div>
                  <label className="block text-xs font-bold text-blue-600 uppercase">
                    Rendimento Base
                  </label>
                  <p className="text-[10px] text-blue-400">
                    Salvo para este sabor
                  </p>
                </div>
                <div className="flex items-center bg-white rounded-lg px-2 border border-blue-200">
                  <input
                    type="number"
                    value={recipeYield}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setRecipeYield(n);
                      saveYield(selectedFlavor, n);
                    }}
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
                      type="text"
                      inputMode="decimal"
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value.replace(/[^\d.,]/g, ""))}
                      placeholder="Ex: 500"
                      className="flex-1 min-w-0 bg-[#F3F4F6] border-none rounded-xl py-3 px-4 text-gray-700 font-medium focus:ring-2 focus:ring-[#7C3AED] outline-none"
                    />
                    <div className="w-20 flex items-center justify-center bg-[#F3F4F6] rounded-xl text-gray-500 text-sm font-bold border border-gray-200 uppercase">
                      {isBigUnit(selectedUnit)
                        ? selectedUnit.toLowerCase() === "kg"
                          ? "g"
                          : "ml"
                        : selectedUnit || "--"}
                    </div>
                  </div>
                  {isBigUnit(selectedUnit) && (
                    <p className="text-[10px] text-orange-500 mt-1 pl-1">
                      * O insumo está em {selectedUnit.toUpperCase()}: digite em{" "}
                      {selectedUnit.toLowerCase() === "kg" ? "gramas (g)" : "mililitros (ml)"}
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
                  {isBase(selectedFlavor)
                    ? `${BASE_LABELS[selectedFlavor]} (todos os recheios)`
                    : `Recheio: ${FLAVOR_LABELS[selectedFlavor]}`}
                </h3>
                <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wide">
                  {recipeItems.length} Ingredientes
                </span>
              </div>

              <div className="space-y-3">
                {recipeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-300">
                    <Cookie size={48} className="mb-2 opacity-50" />
                    <p>
                      {selectedFlavor === SEM_RECHEIO_KEY
                        ? "Sem recheio: usa só a massa base."
                        : "Nenhum ingrediente cadastrado."}
                    </p>
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
                            Por brownie:{" "}
                            {porBrownie(
                              item.qt_uso_por_unidade,
                              item.MATERIAS_PRIMAS.ds_unidade_medida,
                            )}
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

        {/* --- SEÇÃO 3: TESTE DA ROLETA --- */}
        <div className="mt-14">
          <RoletaTeste />
        </div>
      </main>
    </div>
  );
}
