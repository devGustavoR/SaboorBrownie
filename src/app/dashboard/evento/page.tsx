"use client";

import { supabase } from "@/lib/supabase";
import {
  CalendarDays,
  Check,
  Download,
  FolderOpen,
  Plus,
  Receipt,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// --- Tipagem ---
// qtd e preco ficam como texto (o que o usuário digitou) e só viram número no cálculo.
interface EventItem {
  id: string;
  nome: string;
  qtd: string;
  unidade: string;
  preco: string; // preço por unidade
}

interface Draft {
  currentId: string | null;
  nomeEvento: string;
  unidadesProduzir: string;
  itens: EventItem[];
}

interface SavedBudget {
  id: string;
  nomeEvento: string;
  unidadesProduzir: string;
  itens: EventItem[];
  total: number;
  salvoEm: string;
}

const DRAFT_KEY = "saboor:preparo-evento";
const BUDGETS_KEY = "saboor:orcamentos-evento";
const UNIDADES = ["un", "kg", "g", "L", "ml", "pct", "cx"];

const newId = () => Math.random().toString(36).slice(2, 10);

// Aceita "16,33" e "16.33"
const toNumber = (value: string | number) => {
  if (typeof value === "number") return value;
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const normalizeItem = (i: Partial<EventItem>): EventItem => ({
  id: i.id ?? newId(),
  nome: i.nome ?? "",
  qtd: i.qtd === undefined || Number(i.qtd) === 0 ? "" : String(i.qtd),
  unidade: i.unidade ?? "un",
  preco: i.preco === undefined || Number(i.preco) === 0 ? "" : String(i.preco),
});

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function EventPrepPage() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [nomeEvento, setNomeEvento] = useState("");
  const [unidadesProduzir, setUnidadesProduzir] = useState("");
  const [itens, setItens] = useState<EventItem[]>([]);
  const [saved, setSaved] = useState<SavedBudget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // --- Carregar rascunho e orçamentos salvos ---
  useEffect(() => {
    // adiado para depois da hidratação (localStorage só existe no cliente)
    const timer = setTimeout(() => {
      const draft = readJSON<Partial<Draft> | null>(DRAFT_KEY, null);
      if (draft) {
        setCurrentId(draft.currentId ?? null);
        setNomeEvento(draft.nomeEvento ?? "");
        setUnidadesProduzir(
          draft.unidadesProduzir && Number(draft.unidadesProduzir) !== 0
            ? String(draft.unidadesProduzir)
            : "",
        );
        setItens((draft.itens ?? []).map(normalizeItem));
      }
      setSaved(readJSON<SavedBudget[]>(BUDGETS_KEY, []));
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // --- Rascunho salvo automaticamente ---
  useEffect(() => {
    if (!loaded) return;
    const draft: Draft = { currentId, nomeEvento, unidadesProduzir, itens };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage indisponível: segue sem rascunho
    }
  }, [currentId, nomeEvento, unidadesProduzir, itens, loaded]);

  // --- Totais ---
  const total = useMemo(
    () =>
      itens.reduce((acc, i) => acc + toNumber(i.qtd) * toNumber(i.preco), 0),
    [itens],
  );
  const unidades = toNumber(unidadesProduzir);
  const custoPorUnidade = unidades > 0 ? total / unidades : 0;
  const maiorItem = useMemo(() => {
    let max: EventItem | null = null;
    let maxVal = 0;
    for (const i of itens) {
      const v = toNumber(i.qtd) * toNumber(i.preco);
      if (v > maxVal) {
        max = i;
        maxVal = v;
      }
    }
    return max;
  }, [itens]);

  // --- Ações da lista ---
  const addItem = () =>
    setItens((prev) => [
      ...prev,
      { id: newId(), nome: "", qtd: "", unidade: "un", preco: "" },
    ]);

  const updateItem = (id: string, patch: Partial<EventItem>) =>
    setItens((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const removeItem = (id: string) =>
    setItens((prev) => prev.filter((i) => i.id !== id));

  const resetForm = () => {
    setCurrentId(null);
    setNomeEvento("");
    setUnidadesProduzir("");
    setItens([]);
  };

  const clearAll = () => {
    if (!confirm("Limpar todo o planejamento do evento?")) return;
    resetForm();
  };

  // Traz os nomes das matérias-primas cadastradas (sem duplicar o que já existe)
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
            qtd: "",
            unidade: m.ds_unidade_medida || "un",
            preco: "",
          }));
        return [...prev, ...novos];
      });
    } else {
      alert("Erro ao buscar matérias-primas.");
    }
    setImporting(false);
  };

  // --- Orçamentos salvos ---
  const persistBudgets = (list: SavedBudget[]) => {
    setSaved(list);
    try {
      localStorage.setItem(BUDGETS_KEY, JSON.stringify(list));
    } catch {
      alert("Não foi possível salvar neste navegador.");
    }
  };

  const saveBudget = () => {
    if (itens.length === 0) {
      alert("Adicione ao menos um item antes de salvar.");
      return;
    }
    const id = currentId ?? newId();
    const budget: SavedBudget = {
      id,
      nomeEvento: nomeEvento.trim() || "Evento sem nome",
      unidadesProduzir,
      itens,
      total,
      salvoEm: new Date().toISOString(),
    };
    const exists = saved.some((b) => b.id === id);
    persistBudgets(
      exists
        ? saved.map((b) => (b.id === id ? budget : b))
        : [budget, ...saved],
    );
    setCurrentId(id);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const openBudget = (b: SavedBudget) => {
    setCurrentId(b.id);
    setNomeEvento(b.nomeEvento);
    setUnidadesProduzir(b.unidadesProduzir);
    setItens(b.itens.map(normalizeItem));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteBudget = (id: string) => {
    if (!confirm("Excluir este orçamento salvo?")) return;
    persistBudgets(saved.filter((b) => b.id !== id));
    if (currentId === id) setCurrentId(null);
  };

  const inputBase =
    "px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]";

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
                  className={`mt-1 w-full ${inputBase} py-2.5 rounded-xl`}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Brownies a produzir
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={unidadesProduzir}
                  onChange={(e) =>
                    setUnidadesProduzir(e.target.value.replace(/[^\d]/g, ""))
                  }
                  placeholder="0"
                  className={`mt-1 w-full ${inputBase} py-2.5 rounded-xl`}
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
                  {unidades > 0 ? formatCurrency(custoPorUnidade) : "—"}
                </span>
              </div>
              <button
                onClick={saveBudget}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-[#6B21A8] font-bold text-sm hover:bg-purple-50 transition-all active:scale-95"
              >
                {justSaved ? <Check size={18} /> : <Save size={18} />}
                {justSaved
                  ? "Orçamento salvo!"
                  : currentId
                    ? "Atualizar orçamento"
                    : "Salvar orçamento"}
              </button>
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
                  {maiorItem ? maiorItem.nome || "Sem nome" : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Maior gasto</p>
              </div>
            </div>
          </aside>

          {/* --- LISTA DE ITENS + SALVOS --- */}
          <section className="lg:col-span-8 space-y-8">
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
                  const subtotal = toNumber(item.qtd) * toNumber(item.preco);
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
                        className={`col-span-12 md:col-span-4 ${inputBase}`}
                      />
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.qtd}
                        onChange={(e) =>
                          updateItem(item.id, {
                            qtd: e.target.value.replace(/[^\d.,]/g, ""),
                          })
                        }
                        placeholder="Qtd"
                        className={`col-span-4 md:col-span-2 ${inputBase}`}
                      />
                      <select
                        value={item.unidade}
                        onChange={(e) =>
                          updateItem(item.id, { unidade: e.target.value })
                        }
                        className={`col-span-4 md:col-span-2 ${inputBase}`}
                      >
                        {[
                          ...new Set(
                            [...UNIDADES, item.unidade].filter(Boolean),
                          ),
                        ].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.preco}
                        onChange={(e) =>
                          updateItem(item.id, {
                            preco: e.target.value.replace(/[^\d.,]/g, ""),
                          })
                        }
                        placeholder="R$"
                        className={`col-span-4 md:col-span-2 ${inputBase}`}
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
                <div className="flex gap-4">
                  <button
                    onClick={clearAll}
                    className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Limpar tudo
                  </button>
                  {currentId && (
                    <button
                      onClick={resetForm}
                      className="text-sm text-gray-400 hover:text-[#7C3AED] transition-colors"
                    >
                      Novo orçamento
                    </button>
                  )}
                </div>
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

            {/* Orçamentos salvos */}
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <FolderOpen className="text-[#7C3AED]" size={20} />
                  Orçamentos salvos
                </h3>
              </div>
              <div className="p-2 space-y-1">
                {saved.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Nenhum orçamento salvo ainda.
                  </div>
                )}
                {saved.map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl transition-colors ${
                      b.id === currentId ? "bg-purple-50" : "hover:bg-purple-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        {b.nomeEvento}
                      </p>
                      <p className="text-xs text-gray-500">
                        {b.itens.length} itens ·{" "}
                        {new Date(b.salvoEm).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-[#6B21A8]">
                        {formatCurrency(b.total)}
                      </span>
                      <button
                        onClick={() => openBudget(b)}
                        className="px-3 py-1.5 text-xs font-semibold text-[#7C3AED] bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
                      >
                        Abrir
                      </button>
                      <button
                        onClick={() => deleteBudget(b.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
