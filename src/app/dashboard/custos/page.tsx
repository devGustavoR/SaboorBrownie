"use client";

import { dinheiro, num } from "@/lib/sabores";
import { supabase } from "@/lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
import {
  AlertCircle,
  Calendar,
  FileText as FileIcon,
  Flame,
  Loader2,
  Megaphone,
  Package,
  Plus,
  Receipt,
  Save,
  ScanLine,
  Search,
  ShoppingBasket,
  Sparkles,
  Store,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Worker do leitor de PDF (mesma versão do pacote instalado)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

const CATEGORIAS: Record<string, { label: string; icon: LucideIcon; cor: string; badge: string }> = {
  MATERIA_PRIMA: { label: "Matéria-prima", icon: ShoppingBasket, cor: "bg-green-100 text-green-600", badge: "bg-green-100 text-green-800" },
  EMBALAGEM: { label: "Embalagem", icon: Package, cor: "bg-purple-100 text-purple-600", badge: "bg-purple-100 text-purple-800" },
  INGREDIENTES_EXTRAS: { label: "Ingredientes extras", icon: Sparkles, cor: "bg-teal-100 text-teal-600", badge: "bg-teal-100 text-teal-800" },
  GAS: { label: "Gás e energia", icon: Flame, cor: "bg-blue-100 text-blue-600", badge: "bg-blue-100 text-blue-800" },
  MARKETING: { label: "Marketing", icon: Megaphone, cor: "bg-pink-100 text-pink-600", badge: "bg-pink-100 text-pink-800" },
  OUTROS: { label: "Outros", icon: FileIcon, cor: "bg-gray-100 text-gray-600", badge: "bg-gray-100 text-gray-800" },
};
const catDe = (c: string) => CATEGORIAS[c] ?? CATEGORIAS.OUTROS;

interface Item {
  desc: string;
  qtd: string;
  unidade: string;
  cat: string;
  valor: string;
  insumo: string; // cd_materia ("" = não soma no estoque)
  somar: string; // quanto somar ao estoque, na unidade do insumo
}

interface Insumo {
  cd_materia: string;
  nm_item: string;
  ds_unidade_medida: string;
  qt_estoque_atual: number;
}

interface Despesa {
  cd_despesa: string;
  ds_descricao: string;
  vl_valor: number;
  tp_categoria: string;
  ts_despesa: string;
}

const hojeInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Liga o item da nota a um insumo pelo nome ("LEITE COND 395G" → Leite Condensado)
const sugerirInsumo = (desc: string, insumos: Insumo[]) => {
  const tokens = semAcento(desc).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  let melhor: Insumo | null = null;
  let pontos = 0;
  for (const i of insumos) {
    const palavras = semAcento(i.nm_item).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && p !== "de");
    if (palavras.length === 0) continue;
    const casa = palavras.every((p) =>
      tokens.some((t) => t.startsWith(p.slice(0, 4)) || p.startsWith(t.slice(0, 4))),
    );
    if (casa && palavras.length > pontos) {
      melhor = i;
      pontos = palavras.length;
    }
  }
  return melhor;
};

// Peso/volume escrito na descrição ("395G", "1KG", "900ML") convertido para a
// unidade do insumo; sem isso, soma a quantidade de unidades
const FATOR: Record<string, { tipo: "m" | "v"; f: number }> = {
  kg: { tipo: "m", f: 1000 },
  g: { tipo: "m", f: 1 },
  l: { tipo: "v", f: 1000 },
  ml: { tipo: "v", f: 1 },
};
const quantoSomar = (item: Pick<Item, "desc" | "qtd">, insumo: Insumo | null) => {
  if (!insumo) return "";
  const qtd = num(item.qtd) || 1;
  const un = insumo.ds_unidade_medida.toLowerCase();
  if (un === "un") return String(qtd);
  const alvo = FATOR[un];
  const m = item.desc.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/);
  if (!alvo || !m) return "";
  const origem = FATOR[m[2]];
  if (origem.tipo !== alvo.tipo) return "";
  const total = (qtd * num(m[1]) * origem.f) / alvo.f;
  return String(Math.round(total * 1000) / 1000).replace(".", ",");
};

const categoriaPorNome = (desc: string) => {
  const d = desc.toLowerCase();
  if (/sacola|embalage|caixa|forminha|saco|fita|etiqueta/.test(d)) return "EMBALAGEM";
  if (/\bgas\b|g[aá]s |energia|botij/.test(d)) return "GAS";
  if (/frete|taxa/.test(d)) return "OUTROS";
  return "MATERIA_PRIMA";
};

const POR_PAGINA = 30;

export default function ExpensesPage() {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [pdfNome, setPdfNome] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState(hojeInput());
  const [fornecedor, setFornecedor] = useState("");
  const [itens, setItens] = useState<Item[]>([]);

  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);

  const carregar = useCallback(async () => {
    const [rd, ri] = await Promise.all([
      supabase.from("DESPESAS").select("cd_despesa, ds_descricao, vl_valor, tp_categoria, ts_despesa").order("ts_despesa", { ascending: false }),
      supabase.from("MATERIAS_PRIMAS").select("cd_materia, nm_item, ds_unidade_medida, qt_estoque_atual").order("nm_item"),
    ]);
    setDespesas(((rd.data ?? []) as Despesa[]).map((d) => ({ ...d, vl_valor: num(d.vl_valor) })));
    setInsumos(((ri.data ?? []) as Insumo[]).map((i) => ({ ...i, qt_estoque_atual: num(i.qt_estoque_atual) })));
    setCarregando(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 0);
    return () => clearTimeout(t);
  }, [carregar]);

  const novoItem = (desc: string, qtd: number, unidade: string, valor: number): Item => {
    const cat = categoriaPorNome(desc);
    const ins = cat === "MATERIA_PRIMA" || cat === "EMBALAGEM" ? sugerirInsumo(desc, insumos) : null;
    const base = { desc, qtd: String(qtd).replace(".", ","), unidade, cat, valor: valor ? String(valor).replace(".", ",") : "" };
    return { ...base, insumo: ins?.cd_materia ?? "", somar: quantoSomar(base, ins) };
  };

  // --- Leitura do PDF da nota (NFC-e) ---
  const lerPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLendo(true);
    setPdfNome(file.name);
    try {
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      let texto = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const conteudo = await page.getTextContent();
        texto += conteudo.items.map((it) => ("str" in it ? it.str : "")).join("\n") + "\n";
      }
      interpretar(texto);
    } catch (err) {
      console.error(err);
      alert("Não foi possível ler o PDF.");
      setPdfNome("");
    } finally {
      setLendo(false);
    }
  };

  const interpretar = (texto: string) => {
    const linhas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "1 of 1" && !l.includes("https://"));

    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].includes("CNPJ:")) {
        const nome = (linhas[i - 1] ?? "").replace("Consulta DANFE NFC-e", "").trim();
        if (nome.length > 2) setFornecedor(nome);
        break;
      }
    }

    const novos: Item[] = [];
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!(l.startsWith("(C") && (l.includes("digo:") || l.includes("odigo:")))) continue;
      const desc = linhas[i - 1];
      let qtd = 0;
      let unidade = "UN";
      let valor = 0;
      for (let j = 1; j <= 12; j++) {
        const prox = linhas[i + j];
        if (!prox) continue;
        if (prox.includes("Qtde.:") || prox.includes("Qtd.:")) {
          let s = prox.replace(/[^\d,.]/g, "");
          if (!s) s = linhas[i + j + 1]?.replace(/[^\d,.]/g, "") || "1";
          qtd = num(s);
        }
        if (prox.includes("UN:")) {
          const u = prox.split(":")[1]?.trim() || linhas[i + j + 1]?.trim();
          if (u) unidade = u.toUpperCase();
        }
        if (prox.includes("Total") || prox.includes("Totai")) {
          let linhaValor = linhas[i + j + 1];
          if (/[\d,.]+/.test(prox) && !prox.trim().endsWith("Total")) linhaValor = prox;
          if (linhaValor) valor = num(linhaValor.replace(/[^\d,]/g, ""));
        }
      }
      if (desc && valor > 0) novos.push(novoItem(desc, qtd || 1, unidade, valor));
    }

    if (novos.length > 0) setItens((prev) => [...prev, ...novos]);
    else alert("Nenhum item encontrado. Confira se é o PDF da NFC-e.");
  };

  // --- Itens ---
  const atualizar = (idx: number, patch: Partial<Item>) =>
    setItens((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const novo = { ...it, ...patch };
        // trocou o insumo ou a quantidade: recalcula quanto somar
        if ("insumo" in patch || "qtd" in patch) {
          novo.somar = quantoSomar(novo, insumos.find((x) => x.cd_materia === novo.insumo) ?? null);
        }
        return novo;
      }),
    );

  const total = itens.reduce((a, i) => a + num(i.valor), 0);
  const limpar = () => {
    setItens([]);
    setFornecedor("");
    setPdfNome("");
  };

  // --- Salvar: despesas + soma no estoque dos insumos ligados ---
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const validos = itens.filter((i) => i.desc.trim() && num(i.valor) > 0);
    if (validos.length === 0) {
      alert("Informe descrição e valor dos itens.");
      return;
    }
    setSalvando(true);
    const ts = new Date(`${data}T12:00:00`).toISOString();
    const prefixo = fornecedor.trim() ? `${fornecedor.trim()} - ` : "";
    const { error } = await supabase.from("DESPESAS").insert(
      validos.map((i) => ({
        ds_descricao: `${prefixo}${i.desc.trim()}`,
        vl_valor: num(i.valor),
        tp_categoria: i.cat,
        ts_despesa: ts,
      })),
    );
    if (error) {
      setSalvando(false);
      alert(`Erro ao salvar as despesas. Nada foi lançado.\n${error.message}`);
      return;
    }

    // soma por insumo (dois itens do mesmo insumo viram uma atualização)
    const somas = new Map<string, number>();
    for (const i of validos) {
      if (i.insumo && num(i.somar) > 0) somas.set(i.insumo, (somas.get(i.insumo) ?? 0) + num(i.somar));
    }
    const falhas: string[] = [];
    for (const [id, qtd] of somas) {
      const { data: atual } = await supabase
        .from("MATERIAS_PRIMAS")
        .select("qt_estoque_atual, nm_item")
        .eq("cd_materia", id)
        .maybeSingle();
      const { error: e2 } = await supabase
        .from("MATERIAS_PRIMAS")
        .update({ qt_estoque_atual: num(atual?.qt_estoque_atual) + qtd, ts_atualizacao: new Date().toISOString() })
        .eq("cd_materia", id);
      if (e2) falhas.push(atual?.nm_item ?? id);
    }
    setSalvando(false);
    limpar();
    void carregar();
    alert(
      falhas.length > 0
        ? `Despesas salvas, mas o estoque não foi atualizado para: ${falhas.join(", ")}.`
        : `Lançado! ${validos.length} despesa(s)${somas.size > 0 ? ` e ${somas.size} insumo(s) somado(s) ao estoque` : ""}.`,
    );
  };

  const excluirDespesa = async (d: Despesa) => {
    if (!confirm(`Excluir "${d.ds_descricao}" (${dinheiro(d.vl_valor)})?\nO estoque dos insumos não é alterado.`)) return;
    const { error } = await supabase.from("DESPESAS").delete().eq("cd_despesa", d.cd_despesa);
    if (error) {
      alert(`Não foi possível excluir.\n${error.message}`);
      return;
    }
    setDespesas((prev) => prev.filter((x) => x.cd_despesa !== d.cd_despesa));
  };

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return q
      ? despesas.filter((d) => semAcento(`${d.ds_descricao} ${catDe(d.tp_categoria).label}`).includes(q))
      : despesas;
  }, [despesas, busca]);
  const totalFiltrado = filtradas.reduce((a, d) => a + d.vl_valor, 0);

  const porCategoria = Object.entries(
    itens.reduce<Record<string, number>>((m, i) => ({ ...m, [i.cat]: (m[i.cat] ?? 0) + num(i.valor) }), {}),
  );

  const campo = "w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100";

  return (
    <div className="bg-[#F3E8FF] font-sans min-h-screen">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="font-serif text-3xl text-gray-900 mb-2 font-bold">Custos</h1>
          <p className="text-gray-500 text-sm">
            Lance as compras pela nota fiscal (PDF da NFC-e) ou à mão. Itens
            ligados a um insumo somam no estoque.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-6 min-w-0">
            {/* Upload */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-purple-100 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-purple-100 rounded-full text-[#6B21A8]">
                  <ScanLine size={28} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Ler nota fiscal</h3>
                  <p className="text-sm text-gray-500">
                    {lendo ? "Lendo arquivo..." : pdfNome ? `Arquivo: ${pdfNome}` : "Preenche itens e valores pelo PDF"}
                  </p>
                </div>
              </div>
              <input type="file" ref={arquivoRef} className="hidden" accept="application/pdf" onChange={lerPdf} />
              <button
                onClick={() => arquivoRef.current?.click()}
                disabled={lendo || carregando}
                className="w-full sm:w-auto bg-gradient-to-r from-[#6B21A8] to-purple-600 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {lendo ? <Loader2 className="animate-spin" size={20} /> : <FileIcon size={20} />}
                {lendo ? "Lendo..." : "Enviar PDF da nota"}
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={salvar} className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-purple-100 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-gray-100">
                <label className="space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-gray-500">Fornecedor</span>
                  <span className="relative block">
                    <Store className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      value={fornecedor}
                      onChange={(e) => setFornecedor(e.target.value)}
                      placeholder="Ex: Assaí"
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6B21A8]/40"
                    />
                  </span>
                </label>
                <label className="space-y-2">
                  <span className="block text-xs font-bold uppercase tracking-wider text-gray-500">Data da compra</span>
                  <span className="relative block">
                    <Calendar className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="date"
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#6B21A8]/40"
                    />
                  </span>
                </label>
              </div>

              <div className="space-y-3">
                {itens.length === 0 && (
                  <p className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                    Nenhum item. Envie o PDF da nota ou adicione à mão.
                  </p>
                )}
                {itens.map((it, idx) => {
                  const ins = insumos.find((x) => x.cd_materia === it.insumo);
                  const estoque = it.cat === "MATERIA_PRIMA" || it.cat === "EMBALAGEM";
                  return (
                    <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-2 sm:grid-cols-12 gap-3 items-end">
                      <label className="col-span-2 sm:col-span-5 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-gray-400">Item</span>
                        <input value={it.desc} onChange={(e) => atualizar(idx, { desc: e.target.value })} className={campo} />
                      </label>
                      <label className="sm:col-span-2 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-gray-400">Qtd</span>
                        <input
                          inputMode="decimal"
                          value={it.qtd}
                          onChange={(e) => atualizar(idx, { qtd: e.target.value.replace(/[^\d.,]/g, "") })}
                          className={`${campo} text-center`}
                        />
                      </label>
                      <label className="sm:col-span-2 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-gray-400">Categoria</span>
                        <select value={it.cat} onChange={(e) => atualizar(idx, { cat: e.target.value })} className={`${campo} text-xs`}>
                          {Object.entries(CATEGORIAS).map(([k, c]) => (
                            <option key={k} value={k}>{c.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="col-span-2 sm:col-span-3 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-gray-400 block text-right">Valor total (R$)</span>
                        <input
                          inputMode="decimal"
                          value={it.valor}
                          onChange={(e) => atualizar(idx, { valor: e.target.value.replace(/[^\d.,]/g, "") })}
                          placeholder="0,00"
                          className={`${campo} text-right font-bold`}
                        />
                      </label>

                      {estoque && (
                        <div className="col-span-2 sm:col-span-12 flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-gray-500">Somar no estoque de</span>
                          <select
                            value={it.insumo}
                            onChange={(e) => atualizar(idx, { insumo: e.target.value })}
                            className="px-2 py-1.5 bg-white border border-gray-200 rounded-lg font-semibold"
                          >
                            <option value="">— não somar —</option>
                            {insumos.map((i) => (
                              <option key={i.cd_materia} value={i.cd_materia}>{i.nm_item.trim()}</option>
                            ))}
                          </select>
                          {ins && (
                            <>
                              <input
                                inputMode="decimal"
                                value={it.somar}
                                onChange={(e) => atualizar(idx, { somar: e.target.value.replace(/[^\d.,]/g, "") })}
                                placeholder="qtd"
                                className="w-20 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-right font-semibold"
                              />
                              <span className="text-gray-500 uppercase">{ins.ds_unidade_medida}</span>
                              <span className="text-gray-400">
                                (tem {num(ins.qt_estoque_atual).toLocaleString("pt-BR")} {ins.ds_unidade_medida})
                              </span>
                            </>
                          )}
                        </div>
                      )}

                      <div className="col-span-2 sm:col-span-12 flex justify-end -mt-1">
                        <button
                          type="button"
                          onClick={() => setItens((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 p-1"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setItens((prev) => [...prev, novoItem("", 1, "UN", 0)])}
                  className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-[#6B21A8] hover:text-[#6B21A8] font-medium flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Adicionar item à mão
                </button>
              </div>

              <div className="pt-5 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase font-bold">Total da compra</p>
                  <p className="text-2xl font-bold text-[#6B21A8]">{dinheiro(total)}</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={limpar}
                    className="flex-1 sm:flex-none px-6 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
                  >
                    Limpar
                  </button>
                  <button
                    type="submit"
                    disabled={salvando || itens.length === 0}
                    className="flex-1 sm:flex-none bg-[#6B21A8] hover:bg-purple-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {salvando ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Lançar
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Resumo */}
          <aside className="lg:w-80 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 lg:sticky lg:top-24">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Receipt className="text-[#6B21A8]" size={20} /> Resumo
                </h3>
                <span className="px-2 py-1 bg-purple-100 text-[#6B21A8] text-xs rounded-md font-bold">
                  {itens.length} {itens.length === 1 ? "item" : "itens"}
                </span>
              </div>
              <div className="p-5 space-y-2">
                {porCategoria.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nada lançado ainda.</p>}
                {porCategoria.map(([c, v]) => {
                  const conf = catDe(c);
                  return (
                    <div key={c} className="flex items-center justify-between text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${conf.badge}`}>{conf.label}</span>
                      <span className="font-bold">{dinheiro(v)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex gap-2 text-xs text-gray-500">
                <AlertCircle size={14} className="shrink-0 mt-0.5 text-blue-500" />
                <p>
                  Matéria-prima e embalagem podem somar no estoque de um insumo.
                  O sistema sugere o insumo pelo nome e calcula a quantidade
                  quando a nota traz o peso (ex: 395G); confira antes de lançar.
                </p>
              </div>
            </div>
          </aside>
        </div>

        {/* Histórico */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-purple-100">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
            <div>
              <h2 className="font-serif font-bold text-2xl text-gray-900">Histórico de gastos</h2>
              <p className="text-sm text-gray-500 mt-1">
                {filtradas.length} lançamento(s) · {dinheiro(totalFiltrado)}
              </p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setLimite(POR_PAGINA);
                }}
                className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:ring-2 focus:ring-[#6B21A8]/40 w-full sm:w-64"
                placeholder="Buscar loja, item ou categoria"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="pb-3 pl-2 font-bold">Data</th>
                  <th className="pb-3 font-bold">Descrição</th>
                  <th className="pb-3 font-bold hidden md:table-cell">Categoria</th>
                  <th className="pb-3 pr-2 text-right font-bold">Valor</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carregando ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">Carregando...</td>
                  </tr>
                ) : filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      {busca ? "Nada encontrado." : "Nenhum gasto lançado ainda."}
                    </td>
                  </tr>
                ) : (
                  filtradas.slice(0, limite).map((d) => {
                    const conf = catDe(d.tp_categoria);
                    return (
                      <tr key={d.cd_despesa} className="hover:bg-purple-50/50">
                        <td className="py-3 pl-2 text-sm font-medium text-gray-900 whitespace-nowrap">
                          {new Date(d.ts_despesa).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-8 h-8 rounded-full ${conf.cor} flex items-center justify-center shrink-0`}>
                              <conf.icon size={16} />
                            </span>
                            <span className="text-sm text-gray-700 font-medium truncate max-w-[180px] sm:max-w-[320px]">
                              {d.ds_descricao}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 hidden md:table-cell">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${conf.badge}`}>{conf.label}</span>
                        </td>
                        <td className="py-3 pr-2 text-right text-sm font-bold text-gray-900 whitespace-nowrap">
                          − {dinheiro(d.vl_valor)}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => excluirDespesa(d)}
                            className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg"
                            title="Excluir"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {filtradas.length > limite && (
            <button
              onClick={() => setLimite((l) => l + POR_PAGINA)}
              className="mt-4 w-full py-3 rounded-xl bg-purple-50 text-[#6B21A8] text-sm font-semibold hover:bg-purple-100"
            >
              Mostrar mais ({filtradas.length - limite} restantes)
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
