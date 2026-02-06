"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

const FLAVORS = [
  "TRADICIONAL",
  "NINHO",
  "BRIGADEIRO",
  "DOCE_DE_LEITE",
  "MISTO",
  "SEM_RECHEIO",
];

// Mapeamento para nomes bonitos
const FLAVOR_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  NINHO: "Ninho",
  BRIGADEIRO: "Brigadeiro",
  DOCE_DE_LEITE: "Doce de Leite",
  MISTO: "Misto",
  SEM_RECHEIO: "Sem Recheio",
};

export default function SettingsPage() {
  // Estados Gerais
  const [prices, setPrices] = useState<Record<string, number>>({}); // Armazena preços de todos os sabores
  const [loadingPrices, setLoadingPrices] = useState(true);

  // Estados da Receita (Mantido igual)
  const [selectedFlavor, setSelectedFlavor] = useState("TRADICIONAL");
  const [materials, setMaterials] = useState<any[]>([]);
  const [recipeItems, setRecipeItems] = useState<any[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [recipeYield, setRecipeYield] = useState(12);

  // --- CARREGAMENTO DE DADOS ---

  // 1. Carregar TODOS os preços de uma vez
  const fetchPrices = async () => {
    setLoadingPrices(true);
    const { data } = await supabase.from("TABELA_PRECOS").select("*");

    if (data) {
      const pricesMap: Record<string, number> = {};
      data.forEach((item: any) => {
        pricesMap[item.tp_sabor] = item.vl_preco;
      });
      setPrices(pricesMap);
    }
    setLoadingPrices(false);
  };

  // 2. Carregar Materiais (para o select)
  useEffect(() => {
    const loadMaterials = async () => {
      const { data } = await supabase
        .from("MATERIAS_PRIMAS")
        .select("*")
        .order("nm_item");
      if (data) setMaterials(data);
    };
    loadMaterials();
    fetchPrices();
  }, []);

  // 3. Carregar Receita quando troca a aba
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

  // --- FUNÇÕES DE PREÇO ---

  // Atualiza o estado local enquanto você digita
  const handlePriceChange = (flavor: string, newVal: string) => {
    setPrices((prev) => ({
      ...prev,
      [flavor]: Number(newVal),
    }));
  };

  // Salva no banco quando clica no botão
  const savePrice = async (flavor: string) => {
    const priceToSave = prices[flavor] || 0;

    const { error } = await supabase
      .from("TABELA_PRECOS")
      .upsert({ tp_sabor: flavor, vl_preco: priceToSave });

    if (!error) {
      alert(
        `Preço do ${FLAVOR_LABELS[flavor]} atualizado para R$ ${priceToSave.toFixed(2)}`,
      );
    } else {
      console.error(error);
      alert("Erro ao salvar.");
    }
  };

  // --- FUNÇÕES DA RECEITA (Mantidas) ---

  const handleMaterialChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedMaterialId(id);
    const material = materials.find((m) => m.cd_materia === id);
    setSelectedUnit(material ? material.ds_unidade_medida : "");
  };

  const getInputUnitLabel = (dbUnit: string) => {
    if (dbUnit === "kg") return "g (gramas)";
    if (dbUnit === "L" || dbUnit === "l") return "ml (mililitros)";
    return dbUnit;
  };

  const calculateValueToSave = (
    val: number,
    dbUnit: string,
    yieldQty: number,
  ) => {
    let value = val;
    if (dbUnit === "kg" || dbUnit === "L" || dbUnit === "l")
      value = value / 1000;
    return value / yieldQty;
  };

  const formatDisplayValue = (
    valUnitario: number,
    dbUnit: string,
    yieldQty: number,
  ) => {
    const value = valUnitario * yieldQty;
    if (dbUnit === "kg") return `${Math.round(value * 1000)} g`;
    if (dbUnit === "L" || dbUnit === "l")
      return `${Math.round(value * 1000)} ml`;
    return `${Number(value.toFixed(2))} ${dbUnit}`;
  };

  const handleAddToRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId || !amountInput) return;
    const finalValue = calculateValueToSave(
      Number(amountInput),
      selectedUnit,
      recipeYield,
    );
    const { error } = await supabase.from("FICHA_TECNICA").insert([
      {
        tp_sabor: selectedFlavor,
        cd_materia: selectedMaterialId,
        qt_uso_por_unidade: finalValue,
      },
    ]);
    if (!error) {
      setAmountInput("");
      const { data } = await supabase
        .from("FICHA_TECNICA")
        .select(`*, MATERIAS_PRIMAS ( nm_item, ds_unidade_medida )`)
        .eq("tp_sabor", selectedFlavor);
      if (data) setRecipeItems(data);
    } else {
      alert("Erro ao adicionar.");
    }
  };

  const handleRemoveItem = async (id: string) => {
    await supabase.from("FICHA_TECNICA").delete().eq("cd_ficha", id);
    setRecipeItems((prev) => prev.filter((i) => i.cd_ficha !== id));
  };

  return (
    <div className="flex flex-col w-full px-4 py-8 md:px-10 lg:px-20 xl:px-40 bg-brand-bg min-h-screen text-[#101019]">
      <div className="mx-auto max-w-[960px] w-full flex flex-col gap-10">
        <header>
          <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
            Configuração Geral
          </h1>
          <p className="text-primary/70 text-base font-normal">
            Gerencie preços de venda e fichas técnicas.
          </p>
        </header>

        {/* --- SEÇÃO 1: TABELA DE PREÇOS (EDITÁVEL) --- */}
        <section className="bg-white p-6 md:p-8 rounded-[24px] shadow-sm border border-white/40">
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary text-3xl">
              payments
            </span>
            <h2 className="text-2xl font-bold text-text-main">
              Tabela de Preços
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FLAVORS.map((flavor) => (
              <div
                key={flavor}
                className="flex items-center justify-between p-3 bg-[#f6f6f8] rounded-xl border border-transparent hover:border-primary/20 transition-all"
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-gray-400 uppercase">
                    {FLAVOR_LABELS[flavor]}
                  </span>
                  <div className="flex items-center">
                    <span className="text-gray-500 font-medium mr-1">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="bg-transparent font-bold text-lg text-primary w-20 outline-none border-b border-gray-300 focus:border-primary transition-colors"
                      value={prices[flavor] || ""}
                      onChange={(e) =>
                        handlePriceChange(flavor, e.target.value)
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <button
                  onClick={() => savePrice(flavor)}
                  className="size-10 flex items-center justify-center bg-white text-green-600 rounded-full shadow-sm hover:bg-green-50 active:scale-95 transition-all"
                  title="Salvar Preço"
                >
                  <span className="material-symbols-outlined">save</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* --- SEÇÃO 2: FICHA TÉCNICA (COM ABAS) --- */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <span className="material-symbols-outlined text-primary text-3xl">
              menu_book
            </span>
            <h2 className="text-2xl font-bold text-text-main">
              Fichas Técnicas
            </h2>
          </div>

          {/* Seletor de Sabor */}
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {FLAVORS.map((flavor) => (
              <button
                key={flavor}
                onClick={() => setSelectedFlavor(flavor)}
                className={`px-6 py-3 rounded-full text-sm font-bold transition-all whitespace-nowrap shadow-sm ${
                  selectedFlavor === flavor
                    ? "bg-primary text-white ring-4 ring-primary/10"
                    : "bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {FLAVOR_LABELS[flavor]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-2">
            {/* Coluna Esquerda: Adicionar Ingrediente */}
            <div className="md:col-span-1">
              <div className="bg-white p-6 rounded-[24px] shadow-sm sticky top-24 border border-white/40">
                <h3 className="font-bold mb-4 text-primary">
                  Novo Ingrediente
                </h3>

                {/* Rendimento */}
                <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100">
                  <label className="text-[10px] font-bold text-blue-500 uppercase">
                    Rendimento (Tabuleiro)
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      value={recipeYield}
                      onChange={(e) => setRecipeYield(Number(e.target.value))}
                      className="w-16 h-8 rounded-lg border-blue-200 text-center font-bold text-blue-700 text-sm"
                    />
                    <span className="text-xs text-blue-600 font-medium">
                      unidades
                    </span>
                  </div>
                </div>

                <form
                  onSubmit={handleAddToRecipe}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">
                      Item
                    </label>
                    <div className="relative">
                      <select
                        value={selectedMaterialId}
                        onChange={handleMaterialChange}
                        className="w-full h-12 bg-[#f6f6f8] rounded-xl px-3 mt-1 cursor-pointer appearance-none outline-none text-sm font-medium"
                        required
                      >
                        <option value="">Selecione...</option>
                        {materials.map((m) => (
                          <option key={m.cd_materia} value={m.cd_materia}>
                            {m.nm_item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase ml-1">
                      Qtd Total ({recipeYield} brownies)
                    </label>
                    <div className="relative mt-1">
                      <input
                        type="number"
                        step="0.0001"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-full h-12 bg-[#f6f6f8] rounded-xl pl-4 pr-16 outline-none text-sm font-medium"
                        placeholder="Ex: 4"
                        required
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center px-4 bg-gray-100 rounded-r-xl border-l border-gray-200 text-gray-500 text-xs font-bold">
                        {selectedUnit ? getInputUnitLabel(selectedUnit) : "--"}
                      </div>
                    </div>
                    {selectedUnit === "kg" && (
                      <p className="text-[10px] text-orange-500 mt-1 ml-1 font-medium">
                        * Digite em gramas (g).
                      </p>
                    )}
                  </div>
                  <button className="h-12 w-full bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold shadow-lg shadow-green-600/20 transition-all active:scale-95">
                    Adicionar
                  </button>
                </form>
              </div>
            </div>

            {/* Coluna Direita: Lista */}
            <div className="md:col-span-2">
              <div className="bg-white p-6 rounded-[24px] shadow-sm min-h-[300px] border border-white/40">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-lg text-[#101019]">
                    Receita: {FLAVOR_LABELS[selectedFlavor]}
                  </h3>
                  <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-bold">
                    Base: {recipeYield} un
                  </span>
                </div>

                {recipeItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">
                      receipt_long
                    </span>
                    <p>Vazia.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {recipeItems.map((item) => (
                      <div
                        key={item.cd_ficha}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-primary/20 transition-all group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="size-10 bg-white rounded-full flex items-center justify-center text-gray-400 shadow-sm group-hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[20px]">
                              {item.MATERIAS_PRIMAS.ds_unidade_medida === "un"
                                ? "inventory_2"
                                : "egg_alt"}
                            </span>
                          </div>
                          <div>
                            <p className="font-bold text-[#101019]">
                              {item.MATERIAS_PRIMAS.nm_item}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <p className="font-bold text-primary text-lg">
                            {formatDisplayValue(
                              item.qt_uso_por_unidade,
                              item.MATERIAS_PRIMAS.ds_unidade_medida,
                              recipeYield,
                            )}
                          </p>
                          <button
                            onClick={() => handleRemoveItem(item.cd_ficha)}
                            className="size-8 flex items-center justify-center rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              delete
                            </span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
