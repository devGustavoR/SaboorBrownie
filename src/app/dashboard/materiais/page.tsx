"use client";

import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ChefHat,
  Droplet,
  Egg,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// --- Tipagem ---
interface Material {
  cd_materia: number;
  nm_item: string;
  qt_estoque_atual: number;
  ds_unidade_medida: string;
}

export default function MaterialsPage() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // States do Modal (Adicionar/Editar)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // States do Formulário
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("un");

  // --- 1. Buscar Materiais ---
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

  // --- 2. Lógica de Estatísticas e Filtros ---
  const filteredMaterials = useMemo(() => {
    return materials.filter((m) =>
      m.nm_item.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [materials, searchTerm]);

  // Itens com estoque baixo (menor que 5 - regra de exemplo)
  const lowStockItems = materials.filter(
    (m) => m.qt_estoque_atual > 0 && m.qt_estoque_atual < 5,
  );
  // Itens zerados
  const outOfStockItems = materials.filter((m) => m.qt_estoque_atual <= 0);

  // Valor total fictício (apenas visual, já que a tabela MATERIAS não tem preço unitário no schema original)
  // Se quiser real, precisaria adicionar coluna 'vl_unitario' na tabela
  const totalStockValue = materials.length * 150; // Exemplo

  // --- 3. CRUD (Criar, Editar, Deletar) ---
  const openModal = (material?: Material) => {
    if (material) {
      setEditingId(material.cd_materia);
      setName(material.nm_item);
      setQty(String(material.qt_estoque_atual));
      setUnit(material.ds_unidade_medida);
    } else {
      setEditingId(null);
      setName("");
      setQty("");
      setUnit("un");
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const payload = {
      nm_item: name,
      qt_estoque_atual: Number(qty),
      ds_unidade_medida: unit,
    };

    let error;

    if (editingId) {
      // Editar
      const { error: updateError } = await supabase
        .from("MATERIAS_PRIMAS")
        .update(payload)
        .eq("cd_materia", editingId);
      error = updateError;
    } else {
      // Criar
      const { error: insertError } = await supabase
        .from("MATERIAS_PRIMAS")
        .insert([payload]);
      error = insertError;
    }

    if (!error) {
      fetchMaterials();
      setIsModalOpen(false);
    } else {
      alert("Erro ao salvar. Verifique o console.");
      console.error(error);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este item?")) return;

    const { error } = await supabase
      .from("MATERIAS_PRIMAS")
      .delete()
      .eq("cd_materia", id);

    if (!error) {
      fetchMaterials();
    } else {
      alert("Erro ao deletar.");
    }
  };

  // Helper para ícones dinâmicos baseados no nome
  const getItemIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("leite") || n.includes("agua") || n.includes("oleo"))
      return <Droplet size={20} />;
    if (n.includes("ovo")) return <Egg size={20} />;
    if (n.includes("embalagem") || n.includes("saco") || n.includes("fita"))
      return <Package size={20} />;
    return <ChefHat size={20} />;
  };

  // Helper para cores de status
  const getStatusConfig = (qty: number) => {
    if (qty <= 0)
      return {
        label: "Zerado",
        color: "bg-red-100 text-red-700",
        dot: "bg-red-500",
      };
    if (qty < 5)
      return {
        label: "Baixo",
        color: "bg-orange-100 text-orange-700",
        dot: "bg-orange-500",
      };
    return {
      label: "Normal",
      color: "bg-green-100 text-green-700",
      dot: "bg-green-500",
    };
  };

  return (
    <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800">
      <main className="max-w-7xl mx-auto w-full p-6 lg:p-8">
        {/* Header da Página */}
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Estoque de Insumos
            </h2>
            <p className="text-gray-500">
              Gerencie ingredientes, monitore níveis e controle validade.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-white p-2 pr-2 pl-4 rounded-xl shadow-sm border border-purple-100">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Ação Rápida
              </span>
              <span className="text-sm font-medium text-gray-700">
                Adicionar novo item
              </span>
            </div>
            <button
              onClick={() => openModal()}
              className="bg-[#7C3AED] hover:bg-purple-700 text-white p-3 rounded-lg shadow-lg shadow-purple-500/30 transition-all active:scale-95"
            >
              <Plus size={24} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* --- SIDEBAR (Alertas e Stats) --- */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Card de Alertas */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-orange-500" size={20} />
                Alertas de Estoque
              </h3>

              <div className="space-y-4">
                {outOfStockItems.length === 0 && lowStockItems.length === 0 && (
                  <div className="text-center py-4 text-green-600 bg-green-50 rounded-xl border border-green-100">
                    <p className="text-sm font-medium">Estoque saudável! 🎉</p>
                  </div>
                )}

                {/* Itens Zerados */}
                {outOfStockItems.slice(0, 3).map((item) => (
                  <div
                    key={item.cd_materia}
                    className="group relative overflow-hidden bg-red-50 p-4 rounded-xl border border-red-100 transition-all hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shadow-sm">
                          <Package className="text-red-500" size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">
                            {item.nm_item}
                          </p>
                          <p className="text-xs text-red-600 font-medium">
                            Estoque Zerado
                          </p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-red-600">
                        0{" "}
                        <span className="text-xs font-normal text-gray-500">
                          {item.ds_unidade_medida}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => openModal(item)}
                      className="mt-3 w-full py-1.5 text-xs font-semibold text-red-700 bg-white rounded border border-red-200 hover:bg-red-50 transition-colors"
                    >
                      Repor Agora
                    </button>
                  </div>
                ))}

                {/* Itens Baixos */}
                {lowStockItems.slice(0, 3).map((item) => (
                  <div
                    key={item.cd_materia}
                    className="group relative overflow-hidden bg-orange-50 p-4 rounded-xl border border-orange-100 transition-all hover:shadow-md"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shadow-sm">
                          <Package className="text-orange-500" size={16} />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">
                            {item.nm_item}
                          </p>
                          <p className="text-xs text-orange-600 font-medium">
                            Baixo Estoque
                          </p>
                        </div>
                      </div>
                      <span className="text-xl font-bold text-orange-600">
                        {item.qt_estoque_atual}{" "}
                        <span className="text-xs font-normal text-gray-500">
                          {item.ds_unidade_medida}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cards de Métricas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
                <Package className="text-[#7C3AED] mb-2" size={24} />
                <p className="text-2xl font-bold text-gray-900">
                  {materials.length}
                </p>
                <p className="text-xs text-gray-500">Itens Totais</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
                <TrendingUp className="text-green-500 mb-2" size={24} />
                <p className="text-2xl font-bold text-gray-900">Ativo</p>
                <p className="text-xs text-gray-500">Status Geral</p>
              </div>
            </div>
          </aside>

          {/* --- TABELA PRINCIPAL --- */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 flex flex-col h-full min-h-[600px]">
              {/* Barra de Ferramentas */}
              <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
                <div className="relative w-full sm:w-96">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#7C3AED] placeholder-gray-400 transition-all outline-none"
                    placeholder="Buscar por nome do item..."
                    type="text"
                  />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  {/* <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <Filter size={18} /> Filtros
                  </button>
                  <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                    <ArrowUpDown size={18} /> Ordenar
                  </button> */}
                </div>
              </div>

              {/* Cabeçalho da Tabela */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <div className="col-span-5 md:col-span-5">Nome do Item</div>
                <div className="col-span-3 text-right">Qtd Atual</div>
                <div className="col-span-2 hidden md:block text-center">
                  Unidade
                </div>
                <div className="col-span-4 md:col-span-2 text-right">Ações</div>
              </div>

              {/* Lista (Scrollable) */}
              <div className="flex-1 overflow-y-auto max-h-[600px] p-2 space-y-1">
                {loading ? (
                  <div className="text-center py-10 text-gray-400">
                    Carregando estoque...
                  </div>
                ) : (
                  filteredMaterials.map((item) => {
                    const status = getStatusConfig(item.qt_estoque_atual);
                    return (
                      <div
                        key={item.cd_materia}
                        className="group grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-purple-50 rounded-xl transition-colors border border-transparent hover:border-purple-100"
                      >
                        {/* Nome */}
                        <div className="col-span-5 md:col-span-5 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                            {getItemIcon(item.nm_item)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 text-sm truncate">
                              {item.nm_item}
                            </p>
                            <p className="text-xs text-gray-500 hidden sm:block">
                              Matéria Prima
                            </p>
                          </div>
                        </div>

                        {/* Quantidade */}
                        <div className="col-span-3 text-right">
                          <p
                            className={`font-bold text-lg ${item.qt_estoque_atual <= 0 ? "text-red-500" : "text-gray-900"}`}
                          >
                            {item.qt_estoque_atual}
                          </p>
                        </div>

                        {/* Unidade */}
                        <div className="col-span-2 hidden md:block text-center">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-md uppercase">
                            {item.ds_unidade_medida}
                          </span>
                        </div>

                        {/* Status / Ações */}
                        <div className="col-span-4 md:col-span-2 flex justify-end items-center gap-2">
                          <button
                            onClick={() => openModal(item)}
                            className="p-2 text-gray-400 hover:text-[#7C3AED] hover:bg-purple-100 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.cd_materia)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* FAB Mobile */}
      <button
        onClick={() => openModal()}
        className="lg:hidden fixed bottom-6 right-6 w-14 h-14 bg-[#7C3AED] text-white rounded-full shadow-lg shadow-purple-500/40 flex items-center justify-center z-50 active:scale-95 transition-transform"
      >
        <Plus size={28} />
      </button>

      {/* --- MODAL ADICIONAR / EDITAR --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-[#7C3AED] p-6 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Package size={20} />
                {editingId ? "Editar Insumo" : "Novo Insumo"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-white/80 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-500">
                  Nome do Item
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Farinha de Trigo"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-[#7C3AED] outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500">
                    Qtd Atual
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-[#7C3AED] outline-none"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-gray-500">
                    Unidade
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-700 focus:ring-2 focus:ring-[#7C3AED] outline-none"
                  >
                    <option value="un">UN (Unidade)</option>
                    <option value="kg">KG (Quilos)</option>
                    <option value="g">G (Gramas)</option>
                    <option value="l">L (Litros)</option>
                    <option value="ml">ML (Mililitros)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 text-white bg-[#7C3AED] hover:bg-purple-700 rounded-xl font-bold shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-70"
                >
                  {isSubmitting ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
