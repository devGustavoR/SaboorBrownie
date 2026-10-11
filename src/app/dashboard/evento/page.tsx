"use client";

import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  FolderOpen,
  Receipt,
  Save,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

// --- Tipagem ---
interface Materia {
  cd_materia: string;
  nm_item: string;
  ds_unidade_medida: string;
}

interface FichaRow {
  tp_sabor: string;
  cd_materia: string;
  qt_uso_por_unidade: number;
}

// tam = tamanho da embalagem na unidade da matéria (ex: 900 ml); preco = R$ da embalagem.
// Sem tam informado vale o padrão da matéria (1 kg, 1 un, ...) — ver defaultTam.
interface Preco {
  tam?: string;
  preco: string;
  // quantidade de embalagens a comprar, sobrescreve o cálculo automático
  qtdComprar?: string;
}

interface Draft {
  currentId: string | null;
  nomeEvento: string;
  qtdSabores: Record<string, string>;
  precos: Record<string, Preco>;
}

interface SavedBudget {
  id: string;
  nomeEvento: string;
  qtdSabores: Record<string, string>;
  precos: Record<string, Preco>;
  totalBrownies: number;
  total: number;
  salvoEm: string;
}

const DRAFT_KEY = "saboor:preparo-evento-v2";
const BUDGETS_KEY = "saboor:orcamentos-evento-v2";

const newId = () => Math.random().toString(36).slice(2, 10);

// Aceita "16,33" e "16.33"
const toNumber = (value: string | undefined) => {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const formatQty = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

// Embalagem padrão quando você não informa o tamanho: 1 kg / 1 un (caixa, pacote),
// salvo itens que vêm em embalagem maior.
const defaultTam = (m: Materia) => {
  const nome = m.nm_item.toLowerCase();
  if (nome.includes("óleo") || nome.includes("oleo")) return 900; // garrafa 900 ml
  if (nome.includes("ovo")) return 30; // placa com 30
  return 1;
};

const formatSabor = (sabor: string) =>
  sabor
    .toLowerCase()
    .split("_")
    .map((p) => (p === "de" ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function EventPrepPage() {
  // Dados do banco
  const [sabores, setSabores] = useState<string[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [ficha, setFicha] = useState<FichaRow[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [dbError, setDbError] = useState(false);

  // Plano do evento
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [nomeEvento, setNomeEvento] = useState("");
  const [qtdSabores, setQtdSabores] = useState<Record<string, string>>({});
  const [precos, setPrecos] = useState<Record<string, Preco>>({});

  const [saved, setSaved] = useState<SavedBudget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // --- Buscar sabores, matérias e ficha técnica ---
  useEffect(() => {
    const load = async () => {
      const [precosRes, fichaRes, materiasRes] = await Promise.all([
        supabase.from("TABELA_PRECOS").select("tp_sabor"),
        supabase
          .from("FICHA_TECNICA")
          .select("tp_sabor, cd_materia, qt_uso_por_unidade"),
        supabase
          .from("MATERIAS_PRIMAS")
          .select("cd_materia, nm_item, ds_unidade_medida"),
      ]);

      if (precosRes.error || fichaRes.error || materiasRes.error) {
        setDbError(true);
      } else {
        const fichaRows = (fichaRes.data ?? []).map((f) => ({
          tp_sabor: f.tp_sabor as string,
          cd_materia: f.cd_materia as string,
          qt_uso_por_unidade: Number(f.qt_uso_por_unidade),
        }));
        const nomes = new Set<string>([
          ...(precosRes.data ?? []).map((p) => p.tp_sabor as string),
          ...fichaRows.map((f) => f.tp_sabor),
        ]);
        setSabores([...nomes].sort());
        setFicha(fichaRows);
        setMaterias((materiasRes.data ?? []) as Materia[]);
      }
      setLoadingDb(false);
    };
    load();
  }, []);

  // --- Carregar rascunho e orçamentos salvos ---
  useEffect(() => {
    // adiado para depois da hidratação (localStorage só existe no cliente)
    const timer = setTimeout(() => {
      const draft = readJSON<Partial<Draft> | null>(DRAFT_KEY, null);
      if (draft) {
        setCurrentId(draft.currentId ?? null);
        setNomeEvento(draft.nomeEvento ?? "");
        setQtdSabores(draft.qtdSabores ?? {});
        const limpos: Record<string, Preco> = {};
        for (const [id, p] of Object.entries(draft.precos ?? {})) {
          limpos[id] = {
            preco: p.preco ?? "",
            ...(p.tam ? { tam: p.tam } : {}),
            ...(p.qtdComprar ? { qtdComprar: p.qtdComprar } : {}),
          };
        }
        setPrecos(limpos);
      }
      setSaved(readJSON<SavedBudget[]>(BUDGETS_KEY, []));
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // --- Rascunho salvo automaticamente ---
  useEffect(() => {
    if (!loaded) return;
    const draft: Draft = { currentId, nomeEvento, qtdSabores, precos };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage indisponível: segue sem rascunho
    }
  }, [currentId, nomeEvento, qtdSabores, precos, loaded]);

  // --- Cálculos ---
  const calc = useMemo(() => {
    const materiaMap = new Map(materias.map((m) => [m.cd_materia, m]));

    // Matérias que aparecem em alguma ficha técnica
    const usadas = new Map<string, Materia>();
    for (const f of ficha) {
      const m = materiaMap.get(f.cd_materia);
      if (m) usadas.set(m.cd_materia, m);
    }

    // Necessário de cada matéria = Σ (brownies do sabor × uso por unidade)
    const necessario = new Map<string, number>();
    for (const f of ficha) {
      const qtd = toNumber(qtdSabores[f.tp_sabor]);
      if (qtd <= 0) continue;
      necessario.set(
        f.cd_materia,
        (necessario.get(f.cd_materia) ?? 0) + qtd * f.qt_uso_por_unidade,
      );
    }

    // Tamanho da embalagem (informado ou padrão) e R$ por unidade de medida
    const tamDe = (m: Materia) => {
      const t = toNumber(precos[m.cd_materia]?.tam);
      return t > 0 ? t : defaultTam(m);
    };
    const precoUnit = (m: Materia) =>
      toNumber(precos[m.cd_materia]?.preco) / tamDe(m);

    const linhas = [...usadas.values()]
      .sort((a, b) => a.nm_item.localeCompare(b.nm_item))
      .map((m) => {
        const need = necessario.get(m.cd_materia) ?? 0;
        const tam = tamDe(m);
        const preco = toNumber(precos[m.cd_materia]?.preco);
        // sempre compra embalagem inteira (arredonda para cima)
        const pacotesAuto =
          need > 0 ? Math.ceil(Math.round((need / tam) * 1e6) / 1e6) : 0;
        const manual = toNumber(precos[m.cd_materia]?.qtdComprar);
        const pacotes = manual > 0 ? manual : pacotesAuto;
        const compra = pacotes * preco;
        const uso = need * precoUnit(m);
        return {
          materia: m,
          need,
          tam,
          preco,
          pacotes,
          pacotesAuto,
          manual: manual > 0,
          compra,
          uso,
        };
      });

    const totalBrownies = sabores.reduce(
      (acc, s) => acc + toNumber(qtdSabores[s]),
      0,
    );
    const totalCompra = linhas.reduce((acc, l) => acc + l.compra, 0);
    const totalUso = linhas.reduce((acc, l) => acc + l.uso, 0);

    // Custo (proporcional) de cada sabor
    const materiaPorId = new Map(materias.map((m) => [m.cd_materia, m]));
    const custoSabor: Record<string, number> = {};
    for (const s of sabores) {
      const porUnidade = ficha
        .filter((f) => f.tp_sabor === s)
        .reduce((acc, f) => {
          const m = materiaPorId.get(f.cd_materia);
          return m ? acc + f.qt_uso_por_unidade * precoUnit(m) : acc;
        }, 0);
      custoSabor[s] = porUnidade * toNumber(qtdSabores[s]);
    }

    const semFicha = sabores.filter(
      (s) =>
        toNumber(qtdSabores[s]) > 0 && !ficha.some((f) => f.tp_sabor === s),
    );
    const semPreco = linhas.filter((l) => l.need > 0 && l.preco <= 0);

    return {
      linhas,
      totalBrownies,
      totalCompra,
      totalUso,
      custoSabor,
      semFicha,
      semPreco,
    };
  }, [materias, ficha, sabores, qtdSabores, precos]);

  const custoPorBrownie =
    calc.totalBrownies > 0 ? calc.totalUso / calc.totalBrownies : 0;
  const maiorGasto = calc.linhas.reduce<(typeof calc.linhas)[number] | null>(
    (max, l) => (l.compra > 0 && (!max || l.compra > max.compra) ? l : max),
    null,
  );

  // --- Ações ---
  const setPreco = (id: string, patch: Partial<Preco>) =>
    setPrecos((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { preco: "" }), ...patch },
    }));

  const onlyNumber = (v: string) => v.replace(/[^\d.,]/g, "");

  const resetForm = () => {
    setCurrentId(null);
    setNomeEvento("");
    setQtdSabores({});
  };

  const clearAll = () => {
    if (!confirm("Limpar nome do evento e quantidades? Os preços ficam."))
      return;
    resetForm();
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
    if (calc.totalBrownies <= 0) {
      alert("Informe a quantidade de brownies antes de salvar.");
      return;
    }
    const id = currentId ?? newId();
    const budget: SavedBudget = {
      id,
      nomeEvento: nomeEvento.trim() || "Evento sem nome",
      qtdSabores,
      precos,
      totalBrownies: calc.totalBrownies,
      total: calc.totalCompra,
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
    setQtdSabores(b.qtdSabores);
    setPrecos(b.precos);
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
            Informe quantos brownies de cada sabor e o preço das matérias — a
            ficha técnica calcula o quanto você vai gastar.
          </p>
        </header>

        {dbError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            Erro ao carregar sabores e ficha técnica do banco.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* --- SIDEBAR --- */}
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
                  Brownies por sabor
                </label>
                <div className="mt-2 space-y-2">
                  {loadingDb && (
                    <p className="text-sm text-gray-400">Carregando...</p>
                  )}
                  {sabores.map((s) => (
                    <div key={s} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {formatSabor(s)}
                        </p>
                        {toNumber(qtdSabores[s]) > 0 && (
                          <p className="text-xs text-gray-400">
                            {formatCurrency(calc.custoSabor[s] ?? 0)}
                          </p>
                        )}
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={qtdSabores[s] ?? ""}
                        onChange={(e) =>
                          setQtdSabores((prev) => ({
                            ...prev,
                            [s]: e.target.value.replace(/[^\d]/g, ""),
                          }))
                        }
                        placeholder="0"
                        className={`w-24 text-right ${inputBase}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold text-gray-900">
                    {formatQty(calc.totalBrownies)} brownies
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#7C3AED] to-[#6B21A8] rounded-2xl p-6 text-white shadow-lg shadow-purple-500/30">
              <div className="flex items-center gap-2 text-purple-200 text-sm font-medium">
                <Wallet size={18} /> Gasto previsto (compra)
              </div>
              <p className="text-4xl font-bold mt-2">
                {formatCurrency(calc.totalCompra)}
              </p>
              <div className="mt-4 pt-4 border-t border-white/20 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-purple-200">
                    Custo do que será usado
                  </span>
                  <span className="font-bold">
                    {formatCurrency(calc.totalUso)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-200">Custo por brownie</span>
                  <span className="font-bold">
                    {calc.totalBrownies > 0
                      ? formatCurrency(custoPorBrownie)
                      : "—"}
                  </span>
                </div>
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
                  {calc.linhas.filter((l) => l.need > 0).length}
                </p>
                <p className="text-xs text-gray-500">Matérias necessárias</p>
              </div>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {maiorGasto ? maiorGasto.materia.nm_item.trim() : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-1">Maior gasto</p>
              </div>
            </div>
          </aside>

          {/* --- MATÉRIAS + SALVOS --- */}
          <section className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 flex flex-col">
              <div className="p-6 border-b border-gray-100">
                <h3 className="text-lg font-bold">Matérias do evento</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Quantidade calculada pela ficha técnica. Informe o preço da
                  embalagem que você compra e, se ela não for de 1 kg/un, o
                  tamanho (ex: óleo 900 ml, ovos 30 un). Sempre compra embalagem
                  inteira.
                </p>
              </div>

              {(calc.semFicha.length > 0 || calc.semPreco.length > 0) && (
                <div className="mx-6 mt-4 p-3 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-700 flex gap-2">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    {calc.semFicha.length > 0 && (
                      <p>
                        Sem ficha técnica:{" "}
                        {calc.semFicha.map(formatSabor).join(", ")} (não entram
                        no cálculo).
                      </p>
                    )}
                    {calc.semPreco.length > 0 && (
                      <p>
                        Sem preço:{" "}
                        {calc.semPreco
                          .map((l) => l.materia.nm_item.trim())
                          .join(", ")}
                        .
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Cabeçalho */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-3 mt-4 text-xs font-semibold text-gray-400 uppercase tracking-wider border-y border-gray-100 bg-gray-50/50">
                <div className="col-span-2">Matéria</div>
                <div className="col-span-2 text-right">Necessário</div>
                <div className="col-span-2">Tamanho da emb.</div>
                <div className="col-span-2">Preço emb.</div>
                <div className="col-span-2">Qtd a comprar</div>
                <div className="col-span-2 text-right">Gasto</div>
              </div>

              <div className="p-2 space-y-1">
                {!loadingDb && calc.linhas.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    Nenhuma matéria encontrada nas fichas técnicas.
                  </div>
                )}

                {calc.linhas.map((l) => {
                  const id = l.materia.cd_materia;
                  const un = l.materia.ds_unidade_medida;
                  return (
                    <div
                      key={id}
                      className={`grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-purple-50 rounded-xl transition-colors ${
                        l.need <= 0 ? "opacity-60" : ""
                      }`}
                    >
                      <div className="col-span-12 md:col-span-2 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">
                          {l.materia.nm_item.trim()}
                        </p>
                        <p className="text-xs text-gray-400 uppercase">{un}</p>
                      </div>
                      <div className="col-span-4 md:col-span-2 md:text-right text-sm font-medium text-gray-800">
                        {formatQty(l.need)}{" "}
                        <span className="text-xs text-gray-400">{un}</span>
                      </div>
                      <div className="col-span-4 md:col-span-2 relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={precos[id]?.tam ?? String(l.tam)}
                          onChange={(e) =>
                            setPreco(id, { tam: onlyNumber(e.target.value) })
                          }
                          placeholder="Tamanho"
                          title={`Quanto vem em cada embalagem (em ${un})`}
                          className={`w-full pr-9 ${inputBase}`}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                          {un}
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={precos[id]?.preco ?? ""}
                        onChange={(e) =>
                          setPreco(id, { preco: onlyNumber(e.target.value) })
                        }
                        placeholder="R$"
                        className={`col-span-4 md:col-span-2 ${inputBase}`}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={precos[id]?.qtdComprar ?? ""}
                        onChange={(e) =>
                          setPreco(id, {
                            qtdComprar: e.target.value.replace(/[^\d]/g, ""),
                          })
                        }
                        placeholder={`${l.pacotesAuto} (auto)`}
                        title="Deixe vazio para usar o cálculo automático"
                        className={`col-span-6 md:col-span-2 ${inputBase} ${
                          l.manual ? "ring-2 ring-purple-300 font-semibold" : ""
                        }`}
                      />
                      <div className="col-span-6 md:col-span-2 text-right font-bold text-gray-900 text-sm">
                        {formatCurrency(l.compra)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                <div className="flex gap-4">
                  <button
                    onClick={clearAll}
                    className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Limpar quantidades
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
                    {formatCurrency(calc.totalCompra)}
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
                        {formatQty(b.totalBrownies)} brownies ·{" "}
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
