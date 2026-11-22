"use client";

import { num } from "@/lib/sabores";
import { supabase } from "@/lib/supabase";
import {
  AlertTriangle,
  ChefHat,
  Droplet,
  Egg,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Material {
  cd_materia: string;
  nm_item: string;
  qt_estoque_atual: number;
  ds_unidade_medida: string;
}

const UNIDADES = [
  { id: "un", label: "UN (unidade)" },
  { id: "kg", label: "KG (quilos)" },
  { id: "g", label: "G (gramas)" },
  { id: "l", label: "L (litros)" },
  { id: "ml", label: "ML (mililitros)" },
];

// "acabando" depende da unidade: 1 kg é pouco, 1 ml é nada
const LIMITE_BAIXO: Record<string, number> = { kg: 1, l: 1, g: 500, ml: 500, un: 5 };
const limiteDe = (u: string) => LIMITE_BAIXO[u.toLowerCase()] ?? 5;

const qtdFmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const iconeDe = (nome: string) => {
  const n = nome.toLowerCase();
  if (/leite|[aá]gua|[oó]leo|creme/.test(n)) return <Droplet size={20} />;
  if (n.includes("ovo")) return <Egg size={20} />;
  if (/embalage|saco|fita|caixa/.test(n)) return <Package size={20} />;
  return <ChefHat size={20} />;
};

export default function MaterialsPage() {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [usos, setUsos] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");

  const [modal, setModal] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState("un");

  const carregar = useCallback(async () => {
    const [rm, rf] = await Promise.all([
      supabase.from("MATERIAS_PRIMAS").select("cd_materia, nm_item, qt_estoque_atual, ds_unidade_medida").order("nm_item"),
      supabase.from("FICHA_TECNICA").select("cd_materia"),
    ]);
    setMateriais(
      (rm.data ?? []).map((m) => ({ ...m, qt_estoque_atual: num(m.qt_estoque_atual) })) as Material[],
    );
    const u: Record<string, number> = {};
    for (const f of rf.data ?? []) u[f.cd_materia] = (u[f.cd_materia] ?? 0) + 1;
    setUsos(u);
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const filtrados = useMemo(
    () => materiais.filter((m) => m.nm_item.toLowerCase().includes(busca.toLowerCase())),
    [materiais, busca],
  );
  const zerados = materiais.filter((m) => m.qt_estoque_atual <= 0);
  const baixos = materiais.filter(
    (m) => m.qt_estoque_atual > 0 && m.qt_estoque_atual < limiteDe(m.ds_unidade_medida),
  );

  const abrir = (m?: Material) => {
    setEditando(m?.cd_materia ?? null);
    setNome(m?.nm_item.trim() ?? "");
    setQtd(m ? String(m.qt_estoque_atual).replace(".", ",") : "");
    setUnidade(m?.ds_unidade_medida ?? "un");
    setModal(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = nome.trim();
    if (!nm) return;
    const repetido = materiais.some(
      (m) => m.cd_materia !== editando && m.nm_item.trim().toLowerCase() === nm.toLowerCase(),
    );
    if (repetido && !confirm(`Já existe um insumo chamado "${nm}". Salvar mesmo assim?`)) return;
    setSalvando(true);
    const payload = {
      nm_item: nm,
      qt_estoque_atual: num(qtd),
      ds_unidade_medida: unidade,
      ts_atualizacao: new Date().toISOString(),
    };
    const { error } = editando
      ? await supabase.from("MATERIAS_PRIMAS").update(payload).eq("cd_materia", editando)
      : await supabase.from("MATERIAS_PRIMAS").insert([payload]);
    setSalvando(false);
    if (error) {
      alert(`Erro ao salvar.\n${error.message}`);
      return;
    }
    setModal(false);
    void carregar();
  };

  const excluir = async (m: Material) => {
    const n = usos[m.cd_materia] ?? 0;
    if (n > 0) {
      alert(
        `"${m.nm_item.trim()}" está em ${n} ficha(s) técnica(s). Tire das receitas em Configurações antes de excluir.`,
      );
      return;
    }
    if (!confirm(`Excluir "${m.nm_item.trim()}"?`)) return;
    const { error } = await supabase.from("MATERIAS_PRIMAS").delete().eq("cd_materia", m.cd_materia);
    if (error) {
      alert(`Não foi possível excluir.\n${error.message}`);
      return;
    }
    void carregar();
  };

  const status = (m: Material) =>
    m.qt_estoque_atual <= 0
      ? { label: "Zerado", cor: "bg-red-100 text-red-700" }
      : m.qt_estoque_atual < limiteDe(m.ds_unidade_medida)
        ? { label: "Acabando", cor: "bg-orange-100 text-orange-700" }
        : { label: "OK", cor: "bg-green-100 text-green-700" };

  const unidadeEstranha = !UNIDADES.some((u) => u.id === unidade);

  return (
    <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800">
      <main className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Insumos</h2>
            <p className="text-gray-500">
              Ingredientes e embalagens usados nas fichas técnicas e nos
              orçamentos de evento.
            </p>
          </div>
          <button
            onClick={() => abrir()}
            className="flex items-center gap-2 bg-[#7C3AED] hover:bg-purple-700 text-white px-5 py-3 rounded-xl shadow-lg shadow-purple-500/30 font-semibold text-sm active:scale-95"
          >
            <Plus size={20} /> Novo insumo
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-4 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                { l: "Insumos", v: materiais.length, c: "text-gray-900" },
                { l: "Acabando", v: baixos.length, c: "text-orange-600" },
                { l: "Zerados", v: zerados.length, c: "text-red-600" },
              ].map((c) => (
                <div key={c.l} className="bg-white p-4 rounded-2xl shadow-sm border border-purple-100">
                  <p className={`text-2xl font-bold ${c.c}`}>{carregando ? "…" : c.v}</p>
                  <p className="text-xs text-gray-500">{c.l}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-orange-500" size={20} /> Para repor
              </h3>
              {!carregando && zerados.length === 0 && baixos.length === 0 && (
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
                  Nada acabando.
                </p>
              )}
              <div className="space-y-2">
                {[...zerados, ...baixos].slice(0, 8).map((m) => {
                  const st = status(m);
                  return (
                    <button
                      key={m.cd_materia}
                      onClick={() => abrir(m)}
                      className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-gray-50 hover:bg-purple-50 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm truncate">{m.nm_item.trim()}</span>
                        <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${st.cor}`}>
                          {st.label}
                        </span>
                      </span>
                      <span className="text-sm font-bold text-gray-700 shrink-0">
                        {qtdFmt(m.qt_estoque_atual)} {m.ds_unidade_medida}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-gray-400">
                Acabando: menos de 1 kg/L, 500 g/ml ou 5 unidades.
              </p>
            </div>
          </aside>

          <section className="lg:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 flex flex-col">
              <div className="p-5 border-b border-gray-100">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm focus:ring-2 focus:ring-[#7C3AED] outline-none"
                    placeholder="Buscar insumo..."
                  />
                </div>
              </div>

              <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <div className="col-span-6">Insumo</div>
                <div className="col-span-3 text-right">Em estoque</div>
                <div className="col-span-3 text-right">Ações</div>
              </div>

              <div className="p-2 space-y-1">
                {carregando && (
                  <div className="text-center py-10 text-gray-400">
                    <Loader2 className="animate-spin mx-auto" />
                  </div>
                )}
                {!carregando && filtrados.length === 0 && (
                  <p className="text-center py-10 text-gray-400">Nenhum insumo encontrado.</p>
                )}
                {filtrados.map((m) => {
                  const st = status(m);
                  const n = usos[m.cd_materia] ?? 0;
                  return (
                    <div
                      key={m.cd_materia}
                      className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-purple-50 rounded-xl transition-colors"
                    >
                      <div className="col-span-12 sm:col-span-6 flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                          {iconeDe(m.nm_item)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 text-sm truncate">{m.nm_item.trim()}</p>
                          <p className="text-xs text-gray-500">
                            {n > 0 ? `Em ${n} ficha${n > 1 ? "s" : ""} técnica${n > 1 ? "s" : ""}` : "Fora das receitas"}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-7 sm:col-span-3 sm:text-right">
                        <span className={`font-bold text-lg ${m.qt_estoque_atual <= 0 ? "text-red-500" : "text-gray-900"}`}>
                          {qtdFmt(m.qt_estoque_atual)}
                        </span>{" "}
                        <span className="text-xs text-gray-500 uppercase">{m.ds_unidade_medida}</span>
                        <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${st.cor}`}>{st.label}</span>
                      </div>
                      <div className="col-span-5 sm:col-span-3 flex justify-end gap-1">
                        <button
                          onClick={() => abrir(m)}
                          className="p-2 text-gray-400 hover:text-[#7C3AED] hover:bg-purple-100 rounded-lg"
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => excluir(m)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Excluir"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </main>

      {modal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setModal(false)}
        >
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#7C3AED] p-5 flex justify-between items-center text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Package size={20} /> {editando ? "Editar insumo" : "Novo insumo"}
              </h3>
              <button onClick={() => setModal(false)} className="text-white/80 hover:text-white" aria-label="Fechar">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={salvar} className="p-6 space-y-4">
              <label className="block space-y-2">
                <span className="text-xs font-bold uppercase text-gray-500">Nome</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Farinha de Trigo"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  required
                  autoFocus
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase text-gray-500">Em estoque</span>
                  <input
                    inputMode="decimal"
                    value={qtd}
                    onChange={(e) => setQtd(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-xs font-bold uppercase text-gray-500">Unidade</span>
                  <select
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  >
                    {unidadeEstranha && <option value={unidade}>{unidade.toUpperCase()}</option>}
                    {UNIDADES.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {editando && (usos[editando] ?? 0) > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Mudar a unidade muda o cálculo das fichas técnicas que usam
                  este insumo (kg e L são digitados em g e ml nas receitas).
                </p>
              )}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  className="flex-1 py-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-3 text-white bg-[#7C3AED] hover:bg-purple-700 rounded-xl font-bold disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {salvando && <Loader2 size={16} className="animate-spin" />} Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
