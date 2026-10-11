"use client";

import { supabase } from "@/lib/supabase";
import {
  CalendarDays,
  Download,
  Plus,
  Receipt,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// --- Tipagem ---
interface EventItem {
  id: string;
  nome: string;
  qtd: number;
  unidade: string;
  preco: number; // preço por unidade
}

interface EventPlan {
  nomeEvento: string;
  unidadesProduzir: number;
  itens: EventItem[];
}

const STORAGE_KEY = "saboor:preparo-evento";
const UNIDADES = ["un", "kg", "g", "L", "ml", "pct", "cx"];

const newId = () => Math.random().toString(36).slice(2, 10);

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EventPrepPage() {
  const [nomeEvento, setNomeEvento] = useState("");
  const [unidadesProduzir, setUnidadesProduzir] = useState(0);
  const [itens, setItens] = useState<EventItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);

  // --- Carregar plano salvo ---
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const plan: EventPlan = JSON.parse(raw);
        setNomeEvento(plan.nomeEvento ?? "");
        setUnidadesProduzir(plan.unidadesProduzir ?? 0);
        setItens(plan.itens ?? []);
      }
    } catch {
      // plano corrompido: começa vazio
    }
    setLoaded(true);
  }, []);

  // --- Salvar automaticamente ---
  useEffect(() => {
    if (!loaded) return;
    const plan: EventPlan = { nomeEvento, unidadesProduzir, itens };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  }, [nomeEvento, unidadesProduzir, itens, loaded]);

  // --- Totais ---
  const total = useMemo(
    () => itens.reduce((acc, i) => acc + i.qtd * i.preco, 0),
    [itens],
  );
  const custoPorUnidade = unidadesProduzir > 0 ? total / unidadesProduzir : 0;
  const maiorItem = useMemo(
    () =>
      itens.reduce<EventItem | null>(
        (max, i) => (!max || i.qtd * i.preco > max.qtd * max.preco ? i : max),
        null,
      ),
    [itens],
  );

  // --- Ações ---
  const addItem = () =>
    setItens((prev) => [
      ...prev,
      { id: newId(), nome: "", qtd: 1, unidade: "un", preco: 0 },
    ]);

  const updateItem = (id: string, patch: Partial<EventItem>) =>
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id: string) =>
    setItens((prev) => prev.filter((i) => i.id !== id));

  const clearAll = () => {
    if (!confirm("Limpar todo o planejamento do evento?")) return;
    setNomeEvento("");
    setUnidadesProduzir(0);
    setItens([]);
  };

  // Traz os nomes das matérias-primas cadastradas (sem sobrescrever o que já existe)
  const importMaterials = async () => {
    setImporting(true);
    const { data, error } = await supabase
      .from("MATERIAS_PRIMAS")
      .select("nm_item, ds_unidade_medida")
      .order("nm_item");
    if (!error && data) {
      setItens((prev) => {
        const existentes = new Set(prev.map((i) => i.nome.toLowerCase()));
        const novos = data
          .filter((m) => !existentes.has(m.nm_item.toLowerCase()))
          .map<EventItem>((m) => ({
            id: newId(),
            nome: m.nm_item,
            qtd: 0,
            unidade: m.ds_unidade_medida || "un",
            preco: 0,
          }));
        return [...prev, ...novos];
      });
    } else {
      alert("Erro ao buscar matérias-primas.");
    }
    setImporting(false);
  };

  return (
    <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800">
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8">
        {/* Header */}
        <header className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Preparo para Evento
          </h2>
          <p className="text-gray-500">
            Lance quantidade e preço de cada matéria e veja quanto vai gastar.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* --- SIDEBAR (Resumo) --- */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100 space-y-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <CalendarDays className="text-[#7C3AED]" size={20} />
                Evento
              </h3>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Nome do evento
                </label>
                <input
                  value={nomeEvento}
                  onChange={(e) => setNomeEvento(e.target.value)}
                  placeholder="Ex: Feira de sábado"
                  className="mt-1 w-full px-4 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Brownies a produzir
                </label>
                <input
                  type="number"
                  min={0}
                  value={unidadesProduzir || ""}
                  onChange={(e) => setUnidadesProduzir(Number(e.target.value))}
                  placeholder="0"
                  className="mt-1 w-full px-4 py-2.5 bg-gray-50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                />
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#7C3AED] to-[#6B21A8] rounded-2xl p-6 text-white shadow-lg shadow-purple-500/30">
              <div className="flex items-center gap-2 text-purple-200 text-sm font-medium">
                <Wallet size={18} /> Gasto total previsto
              </div>
              <p className="text-4xl font-bold mt-2">{formatCurrency(total)}</p>
              <div className="mt-4 pt-4 border-t border-white/20 flex justify-between text-sm">
                <span className="text-purple-200">Custo por brownie</span>
                <span className="font-bold">
                  {unidadesProduzir > 0
                    ? formatCurrency(custoPorUnidade)
                    : "—"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
                <Receipt className="text-[#7C3AED] mb-2" size={24} />
                <p className="text-2xl font-bold text-gray-900">
                  {itens.length}
                </p>
                <p className="text-xs text-gray-500">Itens na lista</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {maiorItem && maiorItem.qtd * maiorItem.preco > 0
                    ? maiorItem.nome || "Sem nome"
                    : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Maior gasto</p>
              </div>
            </div>
          </aside>

          {/* --- LISTA DE ITENS --- */}
          <section className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 flex flex-col">
              <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row gap-3 justify-between">
                <h3 className="text-lg font-bold">Matérias do evento</h3>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={importMaterials}
                    disabled={importing}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <Download size={16} />
                    {importing ? "Importando..." : "Importar matérias"}
                  </button>
                  <button
                    onClick={addItem}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#7C3AED] rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-500/30 transition-all active:scale-95"
                  >
                    <Plus size={16} /> Adicionar item
                  </button>
                </div>
              </div>

              {/* Cabeçalho */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <div className="col-span-4">Item</div>
                <div className="col-span-2">Qtd</div>
                <div className="col-span-2">Unidade</div>
                <div className="col-span-2">Preço un.</div>
                <div className="col-span-2 text-right">Subtotal</div>
              </div>

              <div className="p-2 space-y-1">
                {itens.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    Nenhum item ainda. Adicione manualmente ou importe suas
                    matérias-primas.
                  </div>
                )}

                {itens.map((item) => {
                  const subtotal = item.qtd * item.preco;
                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-purple-50 rounded-xl transition-colors"
                    >
                      <input
                        value={item.nome}
                        onChange={(e) =>
                          updateItem(item.id, { nome: e.target.value })
                        }
                        placeholder="Nome do item"
                        className="col-span-12 md:col-span-4 px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      />
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.qtd || ""}
                        onChange={(e) =>
                          updateItem(item.id, { qtd: Number(e.target.value) })
                        }
                        placeholder="Qtd"
                        className="col-span-4 md:col-span-2 px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      />
                      <select
                        value={item.unidade}
                        onChange={(e) =>
                          updateItem(item.id, { unidade: e.target.value })
                        }
                        className="col-span-4 md:col-span-2 px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      >
                        {[
                          ...new Set([...UNIDADES, item.unidade].filter(Boolean)),
                        ].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.preco || ""}
                        onChange={(e) =>
                          updateItem(item.id, { preco: Number(e.target.value) })
                        }
                        placeholder="R$"
                        className="col-span-4 md:col-span-2 px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      />
                      <div className="col-span-10 md:col-span-1 text-right font-bold text-gray-900 text-sm">
                        {formatCurrency(subtotal)}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="col-span-2 md:col-span-1 justify-self-end p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé com total */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                >
                  Limpar tudo
                </button>
                <div className="text-right">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-3">
                    Total
                  </span>
                  <span className="text-xl font-bold text-[#6B21A8]">
                    {formatCurrency(total)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
