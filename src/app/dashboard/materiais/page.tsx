"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form States
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g"); // g, kg, ml, un

  const fetchMaterials = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("MATERIAS_PRIMAS")
      .select("*")
      .order("nm_item");
    if (data) setMaterials(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("MATERIAS_PRIMAS").insert([
      {
        nm_item: name,
        qt_estoque_atual: Number(qty),
        ds_unidade_medida: unit,
      },
    ]);

    if (!error) {
      setName("");
      setQty("");
      fetchMaterials();
    } else {
      console.error(error);
    }
  };

  return (
    <div className="flex flex-col w-full px-4 py-8 md:px-10 lg:px-20 xl:px-40 bg-brand-bg min-h-screen text-text-main">
      <div className="mx-auto max-w-[960px] w-full flex flex-col gap-8">
        <header>
          <h1 className="text-3xl md:text-4xl font-black leading-tight tracking-tight">
            Estoque de Insumos
          </h1>
          <p className="text-primary/70 text-base font-normal">
            Controle farinha, açúcar, embalagens e gás.
          </p>
        </header>

        {/* Formulário de Adição Rápida */}
        <div className="bg-white p-6 rounded-[24px] shadow-md border border-white/40">
          <h3 className="text-lg font-bold mb-4">Cadastrar Novo Insumo</h3>
          <form
            onSubmit={handleAddMaterial}
            className="flex flex-col md:flex-row gap-4 items-end"
          >
            <div className="flex-1 w-full">
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">
                Nome do Item
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border-gray-200 bg-[#f6f6f8] h-12 px-4"
                placeholder="Ex: Farinha de Trigo"
                required
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">
                Qtd Atual
              </label>
              <input
                type="number"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full rounded-xl border-gray-200 bg-[#f6f6f8] h-12 px-4"
                placeholder="0"
                required
              />
            </div>
            <div className="w-32">
              <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">
                Unidade
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-xl border-gray-200 bg-[#f6f6f8] h-12 px-4 cursor-pointer"
              >
                <option value="g">Gramas (g)</option>
                <option value="kg">Quilos (kg)</option>
                <option value="ml">Mililitros (ml)</option>
                <option value="un">Unidade (un)</option>
              </select>
            </div>
            <button className="h-12 px-6 bg-primary text-white rounded-xl font-bold hover:bg-[#23268a] transition-colors">
              Adicionar
            </button>
          </form>
        </div>

        {/* Lista de Materiais */}
        <div className="grid grid-cols-1 gap-3">
          {materials.map((item) => (
            <div
              key={item.cd_materia}
              className="flex items-center justify-between p-4 bg-white rounded-xl border border-transparent hover:border-primary/10 shadow-sm"
            >
              <div className="flex items-center gap-4">
                <div className="size-10 bg-primary/10 text-primary rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <div>
                  <p className="font-bold text-lg">{item.nm_item}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    Estoque Atual
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-primary">
                  {item.qt_estoque_atual}{" "}
                  <span className="text-sm font-medium text-gray-400">
                    {item.ds_unidade_medida}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
