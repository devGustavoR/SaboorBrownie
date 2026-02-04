"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

// Enum conforme seu SQL
const CATEGORIES = [
  {
    label: "Embalagem",
    value: "EMBALAGEM",
    icon: "inventory_2",
    color: "bg-purple-100 text-purple-600",
  },
  {
    label: "Gás & Energia",
    value: "GAS",
    icon: "propane_tank",
    color: "bg-blue-100 text-blue-600",
  },
  {
    label: "Ingredientes Extras",
    value: "INGREDIENTES_EXTRAS",
    icon: "grocery",
    color: "bg-orange-100 text-orange-600",
  },
  {
    label: "Marketing",
    value: "MARKETING",
    icon: "campaign",
    color: "bg-pink-100 text-pink-600",
  },
  {
    label: "Outros",
    value: "OUTROS",
    icon: "receipt_long",
    color: "bg-gray-100 text-gray-600",
  },
];

export default function ExpensesPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expenses, setExpenses] = useState<any[]>([]);

  // Form States
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]); // Default: Hoje

  // 1. Buscar despesas do Supabase
  const fetchExpenses = async () => {
    setLoading(true);
    // Nota: Usando aspas duplas pois sua tabela foi criada como "DESPESAS" (case sensitive no Postgres)
    const { data, error } = await supabase
      .from("DESPESAS")
      .select("*")
      .order("ts_despesa", { ascending: false });

    if (data) setExpenses(data);
    if (error) console.error("Erro ao buscar despesas:", error);
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      await fetchExpenses();
    };
    load();
  }, []);

  // 2. Salvar nova despesa
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase.from("DESPESAS").insert([
      {
        ds_descricao: description,
        vl_valor: parseFloat(value),
        tp_categoria: category,
        ts_despesa: new Date(date).toISOString(),
      },
    ]);

    if (!error) {
      // Limpar form e recarregar lista
      setDescription("");
      setValue("");
      setCategory("");
      fetchExpenses();
    } else {
      alert("Erro ao salvar despesa. Verifique o console.");
      console.error(error);
    }
    setSubmitting(false);
  };

  // Helper para pegar ícone da categoria
  const getCategoryConfig = (catValue: string) => {
    return CATEGORIES.find((c) => c.value === catValue) || CATEGORIES[4];
  };

  return (
    <div className="flex flex-col w-full px-4 py-8 md:px-10 lg:px-20 xl:px-40">
      <div className="mx-auto max-w-[960px] w-full flex flex-col gap-8">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-text-main text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
            Lançar Gastos
          </h1>
          <p className="text-primary/70 text-base font-medium">
            Registre as saídas e mantenha o controle financeiro em dia.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[24px] shadow-xl shadow-primary/5 p-6 md:p-8 border border-white/40">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Category Select */}
              <label className="flex flex-col flex-1 gap-2">
                <span className="text-text-main text-sm font-bold ml-1">
                  Categoria
                </span>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex w-full rounded-2xl border-0 bg-[#f6f6f8] h-14 px-4 pr-10 text-base font-medium focus:ring-2 focus:ring-primary/20 text-text-main cursor-pointer appearance-none transition-all hover:bg-gray-100"
                    required
                  >
                    <option value="" disabled>
                      Selecione...
                    </option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#585a8d]">
                    <span className="material-symbols-outlined">
                      expand_more
                    </span>
                  </div>
                </div>
              </label>

              {/* Description Input */}
              <label className="flex flex-col flex-1 gap-2">
                <span className="text-text-main text-sm font-bold ml-1">
                  Descrição
                </span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex w-full rounded-2xl border-0 bg-[#f6f6f8] h-14 px-4 text-base font-medium focus:ring-2 focus:ring-primary/20 text-text-main placeholder:text-gray-400 transition-all hover:bg-gray-100"
                  placeholder="Ex: Embalagens Kraft"
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Value Input */}
              <label className="flex flex-col flex-1 gap-2">
                <span className="text-text-main text-sm font-bold ml-1">
                  Valor (R$)
                </span>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#585a8d] font-bold">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="flex w-full rounded-2xl border-0 bg-[#f6f6f8] h-14 pl-10 pr-4 text-base font-medium focus:ring-2 focus:ring-primary/20 text-text-main placeholder:text-gray-400 transition-all hover:bg-gray-100"
                    placeholder="0,00"
                    required
                  />
                </div>
              </label>

              {/* Date Input */}
              <label className="flex flex-col flex-1 gap-2">
                <span className="text-text-main text-sm font-bold ml-1">
                  Data
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex w-full rounded-2xl border-0 bg-[#f6f6f8] h-14 px-4 text-base font-medium focus:ring-2 focus:ring-primary/20 text-[#585a8d] transition-all hover:bg-gray-100"
                  required
                />
              </label>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="cursor-pointer flex items-center justify-center rounded-2xl h-14 bg-primary hover:bg-[#242785] text-white gap-2 text-base font-bold px-10 transition-all shadow-lg shadow-primary/30 w-full md:w-auto active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="material-symbols-outlined animate-spin">
                    progress_activity
                  </span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">
                      save
                    </span>
                    Salvar Gasto
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Recent Expenses List */}
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-text-main text-xl font-bold leading-tight">
              Últimos Lançamentos
            </h3>
            <span className="text-primary text-sm font-bold bg-white px-3 py-1 rounded-full shadow-sm">
              Total: {expenses.length}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="text-center py-10 text-gray-400">
                Carregando gastos...
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-10 text-gray-400 bg-white/50 rounded-2xl border-dashed border-2 border-gray-200">
                Nenhum gasto registrado ainda.
              </div>
            ) : (
              expenses.map((expense) => {
                const config = getCategoryConfig(expense.tp_categoria);
                return (
                  <div
                    key={expense.cd_despesa}
                    className="flex items-center justify-between p-4 bg-white rounded-2xl border border-transparent hover:border-primary/10 shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`size-12 rounded-2xl flex items-center justify-center ${config.color}`}
                      >
                        <span className="material-symbols-outlined">
                          {config.icon}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <p className="text-text-main text-base font-bold leading-tight">
                          {config.label}
                        </p>
                        <p className="text-[#585a8d] text-sm font-medium">
                          {expense.ds_descricao}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-text-main text-base font-bold">
                        -{" "}
                        {expense.vl_valor.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </p>
                      <p className="text-[#585a8d] text-xs font-medium">
                        {new Date(expense.ts_despesa).toLocaleDateString(
                          "pt-BR",
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
