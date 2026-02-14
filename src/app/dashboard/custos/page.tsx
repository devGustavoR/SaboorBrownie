"use client";

import { supabase } from "@/lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";

// --- CONFIGURAÇÃO DO WORKER (Versão 3.11.174) ---
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
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
  Store,
  Trash2,
} from "lucide-react";

// --- CATEGORIAS ---
const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: any; color: string; badge: string }
> = {
  MATERIA_PRIMA: {
    label: "Matéria Prima",
    icon: ShoppingBasket,
    color: "bg-green-100 text-green-600",
    badge: "bg-green-100 text-green-800",
  },
  EMBALAGEM: {
    label: "Embalagem",
    icon: Package,
    color: "bg-purple-100 text-purple-600",
    badge: "bg-purple-100 text-purple-800",
  },
  GAS: {
    label: "Gás & Energia",
    icon: Flame,
    color: "bg-blue-100 text-blue-600",
    badge: "bg-blue-100 text-blue-800",
  },
  MARKETING: {
    label: "Marketing",
    icon: Megaphone,
    color: "bg-pink-100 text-pink-600",
    badge: "bg-pink-100 text-pink-800",
  },
  OUTROS: {
    label: "Outros",
    icon: FileIcon,
    color: "bg-gray-100 text-gray-600",
    badge: "bg-gray-100 text-gray-800",
  },
};

// --- TIPAGEM ---
interface ExpenseItem {
  desc: string;
  valor: number;
  cat: string;
  qty: number;
  unit: string;
}

export default function ExpensesPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);

  // PDF Parsing
  const [isScanning, setIsScanning] = useState(false);
  const [pdfName, setPdfName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form States
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [vendor, setVendor] = useState("");
  const [items, setItems] = useState<ExpenseItem[]>([]);

  // 1. Buscar Histórico
  const fetchExpenses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("DESPESAS")
      .select("*")
      .order("ts_despesa", { ascending: false });
    if (data) setExpenses(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  // 2. Upload e Leitura PDF
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsScanning(true);
    setPdfName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join("\n");
        fullText += pageText + "\n";
      }
      processPdfText(fullText);
    } catch (err) {
      console.error(err);
      alert("Erro ao ler PDF.");
      setPdfName("");
    } finally {
      setIsScanning(false);
    }
  };

  // 3. Parser Inteligente
  const processPdfText = (text: string) => {
    const newItems: ExpenseItem[] = [];
    const rawLines = text.split("\n");
    const lines = rawLines
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && l !== "1 of 1" && !l.includes("https://"));

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("CNPJ:")) {
        if (i > 0) {
          const vendorName = lines[i - 1]
            .replace("Consulta DANFE NFC-e", "")
            .trim();
          if (vendorName.length > 2) setVendor(vendorName);
        }
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        line.startsWith("(C") &&
        (line.includes("digo:") || line.includes("odigo:"))
      ) {
        const desc = lines[i - 1];
        let foundQty = 0;
        let foundUnit = "UN";
        let foundVal = 0;

        for (let j = 1; j <= 12; j++) {
          const nextLine = lines[i + j];
          if (!nextLine) continue;
          if (nextLine.includes("Qtde.:") || nextLine.includes("Qtd.:")) {
            let qtyStr = nextLine.replace(/[^\d,.]/g, "");
            if (!qtyStr)
              qtyStr = lines[i + j + 1]?.replace(/[^\d,.]/g, "") || "1";
            foundQty = parseFloat(qtyStr.replace(",", "."));
          }
          if (nextLine.includes("UN:")) {
            let unitStr = nextLine.split(":")[1]?.trim();
            if (!unitStr) unitStr = lines[i + j + 1]?.trim();
            if (unitStr) foundUnit = unitStr.toUpperCase();
          }
          if (nextLine.includes("Total") || nextLine.includes("Totai")) {
            let valLine = lines[i + j + 1];
            const hasNumberSameLine = nextLine.match(/[\d,.]+/);
            if (hasNumberSameLine && !nextLine.trim().endsWith("Total"))
              valLine = nextLine;
            if (valLine) {
              const valStr = valLine.replace(/[^\d,]/g, "").replace(",", ".");
              foundVal = parseFloat(valStr);
            }
          }
        }

        let cat = "MATERIA_PRIMA";
        const dLower = desc.toLowerCase();
        if (dLower.includes("sacola") || dLower.includes("embalagem"))
          cat = "EMBALAGEM";
        if (dLower.includes("gas") || dLower.includes("energia")) cat = "GAS";
        if (dLower.includes("frete")) cat = "OUTROS";

        if (desc && foundVal > 0) {
          newItems.push({
            desc: desc,
            valor: foundVal,
            cat: cat,
            qty: foundQty || 1,
            unit: foundUnit || "UN",
          });
        }
      }
    }

    if (newItems.length > 0) setItems([...items, ...newItems]);
    else alert("Nenhum item identificado. Verifique o PDF.");
  };

  // 4. Salvar (Despesas + Estoque)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const expensePromises = items.map((item) => {
        return supabase.from("DESPESAS").insert([
          {
            ds_descricao: `${vendor} - ${item.desc}`,
            vl_valor: item.valor,
            tp_categoria: item.cat,
            ts_despesa: new Date(date).toISOString(),
          },
        ]);
      });
      await Promise.all(expensePromises);

      for (const item of items) {
        if (item.cat === "MATERIA_PRIMA" || item.cat === "EMBALAGEM") {
          const { data: existing } = await supabase
            .from("MATERIAS_PRIMAS")
            .select("cd_material, qt_estoque_atual")
            .eq("nm_item", item.desc)
            .single();

          if (existing) {
            await supabase
              .from("MATERIAS_PRIMAS")
              .update({
                qt_estoque_atual: existing.qt_estoque_atual + item.qty,
              })
              .eq("cd_material", existing.cd_material);
          } else {
            await supabase.from("MATERIAS_PRIMAS").insert([
              {
                nm_item: item.desc,
                qt_estoque_atual: item.qty,
                ds_unidade_medida: item.unit,
              },
            ]);
          }
        }
      }

      setItems([]);
      setVendor("");
      setPdfName("");
      fetchExpenses();
      alert("Despesas salvas e Estoque atualizado!");
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar dados.");
    } finally {
      setSubmitting(false);
    }
  };

  // Helpers
  const addItemManual = () =>
    setItems([
      ...items,
      { desc: "", valor: 0, cat: "MATERIA_PRIMA", qty: 1, unit: "UN" },
    ]);
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items];
    // @ts-ignore
    newItems[index][field] = value;
    setItems(newItems);
  };
  const removeItem = (index: number) =>
    setItems(items.filter((_, i) => i !== index));
  const formatCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const getTotal = () =>
    items.reduce((acc, item) => acc + (Number(item.valor) || 0), 0);

  return (
    <div className="bg-[#F3E8FF] font-sans min-h-screen flex flex-col">
      <main className="flex-grow container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* --- Header --- */}
        <div className="flex flex-col lg:flex-row gap-8 mb-8">
          <div className="flex-1 space-y-8">
            <div className="mb-4">
              <h1 className="font-serif text-3xl text-gray-900 mb-2 font-bold">
                Lançar Novo Gasto
              </h1>
              <p className="text-gray-500 text-sm">
                Digitalize sua nota fiscal (PDF) para preenchimento automático.
              </p>
            </div>

            {/* --- CARD DE DIGITALIZAÇÃO (UPLOAD) --- */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-purple-100">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-purple-100 rounded-full text-[#6B21A8]">
                    <ScanLine size={32} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">
                      Digitalização Inteligente
                    </h3>
                    <p className="text-sm text-gray-500">
                      {isScanning
                        ? "Lendo arquivo..."
                        : pdfName
                          ? `Arquivo: ${pdfName}`
                          : "Extraia itens e valores via PDF"}
                    </p>
                  </div>
                </div>

                {/* Botão de Upload Escondido */}
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="w-full sm:w-auto bg-gradient-to-r from-[#6B21A8] to-purple-600 hover:from-purple-700 hover:to-purple-800 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-70"
                >
                  {isScanning ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <FileIcon size={20} />
                  )}
                  {isScanning ? "Lendo..." : "Enviar PDF da Nota"}
                </button>
              </div>
            </div>

            {/* --- CARD DE ITENS (FORMULÁRIO) --- */}
            <div className="bg-white rounded-2xl p-8 shadow-xl border border-purple-50">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Cabeçalho do Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-gray-100">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Fornecedor
                    </label>
                    <div className="relative">
                      <Store
                        className="absolute left-3 top-3 text-gray-400"
                        size={18}
                      />
                      <input
                        value={vendor}
                        onChange={(e) => setVendor(e.target.value)}
                        placeholder="Ex: Atacadão"
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-700 font-medium text-sm focus:ring-2 focus:ring-[#6B21A8]/50 outline-none"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Data
                    </label>
                    <div className="relative">
                      <Calendar
                        className="absolute left-3 top-3 text-gray-400"
                        size={18}
                      />
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-gray-700 font-medium text-sm focus:ring-2 focus:ring-[#6B21A8]/50 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Lista de Itens */}
                <div className="space-y-4">
                  {items.length === 0 && (
                    <div className="text-center py-8 text-gray-400 border-2 border-dashed border-gray-100 rounded-xl">
                      <p>
                        Nenhum item adicionado. Importe um PDF ou adicione
                        manualmente.
                      </p>
                    </div>
                  )}

                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="group bg-gray-50 p-4 rounded-xl border border-gray-100 hover:border-purple-200 transition-all grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                    >
                      {/* Descrição (5 cols) */}
                      <div className="sm:col-span-4 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-400">
                          Item
                        </label>
                        <input
                          value={item.desc}
                          onChange={(e) =>
                            updateItem(idx, "desc", e.target.value)
                          }
                          className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 font-medium focus:outline-none focus:border-purple-300"
                        />
                      </div>

                      {/* Qtd (2 cols) */}
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-400">
                          Qtd
                        </label>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={(e) =>
                            updateItem(idx, "qty", parseFloat(e.target.value))
                          }
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-sm text-center font-medium focus:outline-none focus:border-purple-300"
                        />
                      </div>

                      {/* Un (1 col) */}
                      <div className="sm:col-span-1 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-400">
                          Un
                        </label>
                        <input
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(idx, "unit", e.target.value)
                          }
                          className="w-full bg-white border border-gray-200 rounded-lg px-1 py-2 text-sm text-center uppercase font-medium focus:outline-none focus:border-purple-300"
                        />
                      </div>

                      {/* Cat (2 cols) */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[10px] font-bold uppercase text-gray-400">
                          Categoria
                        </label>
                        <select
                          value={item.cat}
                          onChange={(e) =>
                            updateItem(idx, "cat", e.target.value)
                          }
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-xs font-medium focus:outline-none focus:border-purple-300"
                        >
                          {Object.entries(CATEGORY_CONFIG).map(
                            ([key, conf]) => (
                              <option key={key} value={key}>
                                {conf.label}
                              </option>
                            ),
                          )}
                        </select>
                      </div>

                      {/* Valor (2 cols) */}
                      <div className="sm:col-span-2 space-y-1 relative">
                        <label className="text-[10px] font-bold uppercase text-gray-400 block text-right">
                          Valor
                        </label>
                        <span className="absolute left-2 bottom-2 text-xs text-gray-400">
                          R$
                        </span>
                        <input
                          type="number"
                          value={item.valor}
                          onChange={(e) =>
                            updateItem(idx, "valor", parseFloat(e.target.value))
                          }
                          className="w-full bg-white border border-gray-200 rounded-lg pl-6 pr-2 py-2 text-sm text-right font-bold text-gray-900 focus:outline-none focus:border-purple-300"
                        />
                      </div>

                      {/* Delete */}
                      <div className="sm:col-span-12 flex justify-end -mt-2">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 p-1"
                        >
                          <Trash2 size={12} /> Remover
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addItemManual}
                    className="w-full py-3 rounded-xl border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50 hover:border-[#6B21A8] hover:text-[#6B21A8] font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus size={18} /> Adicionar Item Manualmente
                  </button>
                </div>

                {/* Footer do Form (Totais e Botões) */}
                <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-center sm:text-left">
                    <p className="text-xs text-gray-400 uppercase font-bold">
                      Total da Compra
                    </p>
                    <p className="text-2xl font-bold text-[#6B21A8]">
                      {formatCurrency(getTotal())}
                    </p>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setItems([]);
                        setVendor("");
                        setPdfName("");
                      }}
                      className="flex-1 sm:flex-none px-6 py-3 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium transition-colors"
                    >
                      Limpar
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || items.length === 0}
                      className="flex-1 sm:flex-none bg-[#6B21A8] hover:bg-purple-700 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-purple-500/30 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                      {submitting ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Save size={18} />
                      )}
                      Confirmar Lançamento
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* --- SIDEBAR LATERAL (ITENS EXTRAÍDOS) --- */}
          <div className="lg:w-96 flex flex-col">
            <div className="bg-white rounded-2xl shadow-xl border border-purple-50 h-full flex flex-col relative overflow-hidden">
              <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-transparent">
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-serif font-bold text-lg text-gray-900 flex items-center gap-2">
                    <Receipt className="text-[#6B21A8]" size={20} /> Resumo
                  </h3>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-md font-bold uppercase tracking-wide">
                    {items.length} Itens
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Itens identificados no PDF
                </p>
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[500px] lg:max-h-none custom-scrollbar">
                {items.length === 0 ? (
                  <div className="text-center py-10 text-gray-300">
                    <ShoppingBasket
                      className="mx-auto mb-2 opacity-20"
                      size={40}
                    />
                    <p className="text-xs">A lista está vazia</p>
                  </div>
                ) : (
                  items.map((item, idx) => (
                    <div
                      key={idx}
                      className="bg-white p-3 rounded-xl border border-gray-100 hover:border-purple-200 transition-all shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-semibold text-gray-800 truncate max-w-[150px]">
                          {item.desc}
                        </span>
                        <span className="text-sm font-bold text-[#6B21A8]">
                          {formatCurrency(item.valor)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>
                          Qtd: {item.qty} {item.unit}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${CATEGORY_CONFIG[item.cat]?.color.replace("text-", "bg-opacity-20 text-")}`}
                        >
                          {CATEGORY_CONFIG[item.cat]?.label}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 bg-gray-50 border-t border-gray-100">
                <div className="flex items-start gap-2 text-xs text-gray-500">
                  <AlertCircle
                    size={14}
                    className="shrink-0 mt-0.5 text-blue-500"
                  />
                  <p>
                    Ao confirmar, itens de "Matéria Prima" e "Embalagem" serão
                    somados ao estoque automaticamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- HISTÓRICO DE GASTOS (TABELA) --- */}
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-purple-50 mt-8">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
            <div>
              <h2 className="font-serif font-bold text-2xl text-gray-900">
                Histórico de Gastos
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Últimas movimentações financeiras registradas
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <input
                  className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-[#6B21A8]/50 focus:border-[#6B21A8] transition-all text-gray-600 w-48 outline-none"
                  placeholder="Buscar..."
                  type="text"
                />
                <Search
                  className="absolute left-3 top-2.5 text-gray-400"
                  size={16}
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="pb-4 pl-4 font-bold text-xs text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="pb-4 font-bold text-xs text-gray-500 uppercase tracking-wider">
                    Descrição / Loja
                  </th>
                  <th className="pb-4 font-bold text-xs text-gray-500 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="pb-4 pr-4 text-right font-bold text-xs text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="pb-4 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : (
                  expenses.map((expense) => {
                    const conf =
                      CATEGORY_CONFIG[expense.tp_categoria] ||
                      CATEGORY_CONFIG["OUTROS"];
                    const Icon = conf.icon;
                    return (
                      <tr
                        key={expense.cd_despesa}
                        className="group hover:bg-purple-50/50 transition-colors"
                      >
                        <td className="py-4 pl-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">
                              {new Date(expense.ts_despesa).toLocaleDateString(
                                "pt-BR",
                              )}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(expense.ts_despesa).toLocaleTimeString(
                                "pt-BR",
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full ${conf.color} flex items-center justify-center shrink-0`}
                            >
                              <Icon size={16} />
                            </div>
                            <span className="text-sm text-gray-700 font-medium truncate max-w-[200px]">
                              {expense.ds_descricao}
                            </span>
                          </div>
                        </td>
                        <td className="py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${conf.badge}`}
                          >
                            {conf.label}
                          </span>
                        </td>
                        <td className="py-4 pr-4 text-right">
                          <span className="text-sm font-bold text-gray-900">
                            - {formatCurrency(expense.vl_valor)}
                          </span>
                        </td>
                        {/* <td className="py-4 pr-4 text-right">
                          <button className="text-gray-400 hover:text-[#6B21A8] transition-colors">
                            <MoreVertical size={16} />
                          </button>
                        </td> */}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-6 mt-2">
            <p className="text-sm text-gray-500">
              Mostrando <span className="font-medium">{expenses.length}</span>{" "}
              resultados
            </p>
            <div className="flex gap-2">
              <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400 disabled:opacity-50">
                <ChevronLeft size={16} />
              </button>
              <button className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-400 disabled:opacity-50">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-purple-100 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          © 2026 Saboor Brownie System. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
