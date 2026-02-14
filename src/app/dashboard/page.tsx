"use client";

import { supabase } from "@/lib/supabase";
import {
  CheckCircle,
  Package,
  Plus,
  ShoppingCart,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useState } from "react";

// --- Configuração Visual e de Metadados ---
const FLAVOR_METADATA: Record<
  string,
  { label: string; desc: string; color: string }
> = {
  TRADICIONAL: {
    label: "Tradicional",
    desc: "Clássico de chocolate nobre",
    color: "bg-amber-100 text-amber-800",
  },
  NINHO: {
    label: "Ninho",
    desc: "Creme de leite ninho",
    color: "bg-yellow-100 text-yellow-800",
  },
  BRIGADEIRO: {
    label: "Brigadeiro",
    desc: "Cobertura cremosa intensa",
    color: "bg-amber-200 text-amber-900",
  },
  DOCE_DE_LEITE: {
    label: "Doce de Leite",
    desc: "Clássico argentino",
    color: "bg-orange-100 text-orange-800",
  },
  MISTO: {
    label: "Misto",
    desc: "Dois sabores em um",
    color: "bg-purple-100 text-purple-800",
  },
  SEM_RECHEIO: {
    label: "Sem Recheio",
    desc: "Simples e puro",
    color: "bg-gray-100 text-gray-600",
  },
};

export default function DashboardPage() {
  // --- States de Lógica ---
  const [loading, setLoading] = useState(true);
  const [processingSale, setProcessingSale] = useState(false);
  const [profit, setProfit] = useState(0);
  const [salesCount, setSalesCount] = useState(0);
  const [products, setProducts] = useState<any[]>([]);

  // --- Lógica de Negócios ---
  const fetchData = async () => {
    setLoading(true);

    // 1. Buscar Preços Configurados
    const { data: precos } = await supabase.from("TABELA_PRECOS").select("*");
    if (precos) setProducts(precos);

    // 2. Buscar Vendas (Faturamento)
    const { data: vendas } = await supabase
      .from("VENDAS")
      .select("vl_preco_venda");

    // 3. Buscar Despesas
    const { data: despesas } = await supabase
      .from("DESPESAS")
      .select("vl_valor");

    if (vendas && despesas) {
      const totalVendas = vendas.reduce(
        (acc, curr) => acc + (curr.vl_preco_venda || 0),
        0,
      );
      const totalDespesas = despesas.reduce(
        (acc, curr) => acc + (curr.vl_valor || 0),
        0,
      );
      const lucroLiquido = totalVendas - totalDespesas;

      setProfit(lucroLiquido);
      setSalesCount(vendas.length);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSale = async (flavor: string, price: number) => {
    setProcessingSale(true);

    // 1. Tenta achar lote ATIVO (FIFO)
    const { data: lotes } = await supabase
      .from("LOTES")
      .select("cd_lote")
      .eq("tp_sabor", flavor)
      .order("ts_producao", { ascending: true });

    let loteId = null;
    if (lotes && lotes.length > 0) {
      loteId = lotes[0].cd_lote;
    }

    // 2. Vende
    const { error } = await supabase
      .from("VENDAS")
      .insert([{ vl_preco_venda: price, cd_lote: loteId }]);

    if (!error) {
      fetchData();
    } else {
      alert("Erro ao registrar venda.");
      console.error(error);
    }
    setProcessingSale(false);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#F3E8FF] text-gray-800">
      {/* --- MAIN CONTENT --- */}
      <main className="flex-grow container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header Texto */}
        <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <h1 className="font-serif text-4xl text-gray-900 mb-2">
            Bom dia,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6B21A8] to-purple-500 font-bold">
              Chef!
            </span>
          </h1>
          <p className="text-gray-500">
            Aqui está o resumo das vendas de hoje.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* --- COLUNA ESQUERDA: Status & Ações Rápidas (5 cols) --- */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Card de Lucro (Gradient) - Mantive o roxo pois é a cor da marca, mas o resto é claro */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6B21A8] via-purple-800 to-indigo-900 shadow-2xl shadow-purple-900/40 text-white min-h-[360px] flex flex-col justify-between p-8 group transition-all duration-500 hover:shadow-purple-700/50 hover:-translate-y-1">
              {/* Decorative Circles */}
              <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-white opacity-5 group-hover:scale-110 transition-transform duration-700"></div>
              <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 rounded-full bg-purple-400 opacity-10 group-hover:scale-110 transition-transform duration-700 delay-100"></div>

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <span className="uppercase tracking-wider text-xs font-semibold text-purple-200">
                    Saldo de Caixa
                  </span>
                  <div className="bg-white/20 backdrop-blur-sm p-1.5 rounded-lg">
                    <TrendingUp size={16} className="text-white" />
                  </div>
                </div>

                <h2 className="font-serif text-5xl lg:text-6xl font-bold mb-4 tracking-tight">
                  {loading ? "..." : formatCurrency(profit)}
                </h2>

                <div className="inline-flex items-center bg-white/10 backdrop-blur-md rounded-full px-3 py-1 text-sm text-purple-100 border border-white/10">
                  <CheckCircle size={14} className="mr-1.5" />
                  {salesCount} vendas realizadas hoje
                </div>
              </div>

              {/* Mini Gráfico Decorativo */}
              <div className="relative z-10 mt-6">
                <div className="flex justify-between items-end mb-2 text-purple-200 text-xs uppercase font-medium">
                  <span>Performance</span>
                  <span>Atualizado agora</span>
                </div>
                <div className="flex items-end space-x-2 h-20">
                  <div className="w-full bg-white/10 rounded-t-sm h-[40%]"></div>
                  <div className="w-full bg-white/10 rounded-t-sm h-[60%]"></div>
                  <div className="w-full bg-white/10 rounded-t-sm h-[30%]"></div>
                  <div className="w-full bg-white/10 rounded-t-sm h-[80%]"></div>
                  <div className="w-full bg-white/30 rounded-t-sm h-full shadow-[0_0_15px_rgba(255,255,255,0.3)]"></div>
                </div>
              </div>
            </div>

            {/* Botões de Ação Rápida */}
            <div className="grid grid-cols-2 gap-4">
              <button className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col justify-center items-center text-center hover:border-[#6B21A8]/30 hover:shadow-md transition-all group">
                <div className="bg-green-100 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                  <ShoppingCart size={24} className="text-green-600" />
                </div>
                <span className="text-sm font-medium text-gray-500 group-hover:text-[#6B21A8] transition-colors">
                  Relatório Detalhado
                </span>
              </button>
              <button className="bg-white p-6 rounded-2xl shadow-sm border border-purple-100 flex flex-col justify-center items-center text-center hover:border-[#6B21A8]/30 hover:shadow-md transition-all group">
                <div className="bg-blue-100 p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
                  <Package size={24} className="text-blue-600" />
                </div>
                <span className="text-sm font-medium text-gray-500 group-hover:text-[#6B21A8] transition-colors">
                  Atualizar Estoque
                </span>
              </button>
            </div>
          </div>

          {/* --- COLUNA DIREITA: Lista de Produtos (7 cols) --- */}
          <div className="lg:col-span-7">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 font-serif">
                Ponto de Venda (PDV)
              </h3>
              <a
                href="#"
                className="text-sm text-[#6B21A8] hover:underline font-medium"
              >
                Gerenciar Produtos
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Loading State */}
              {loading &&
                products.length === 0 &&
                [1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-32 rounded-2xl bg-white/50 animate-pulse border border-white"
                  ></div>
                ))}

              {/* Empty State */}
              {!loading && products.length === 0 && (
                <div className="col-span-2 text-center py-10 text-gray-400 border-2 border-dashed border-gray-300 rounded-2xl bg-white/30">
                  Nenhum produto configurado na tabela TABELA_PRECOS.
                </div>
              )}

              {/* Product List */}
              {products.map((prod) => {
                const meta = FLAVOR_METADATA[prod.tp_sabor] || {
                  label: prod.tp_sabor,
                  desc: "Sabor especial",
                  color: "bg-gray-100 text-gray-600",
                };

                return (
                  <div
                    key={prod.tp_sabor}
                    className="group bg-white rounded-2xl p-4 shadow-sm hover:shadow-lg border border-transparent hover:border-[#6B21A8]/20 transition-all duration-300 flex items-center gap-4 hover:-translate-y-1"
                  >
                    {/* Placeholder de Imagem Dinâmico */}
                    <div
                      className={`relative w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden shadow-inner flex items-center justify-center ${meta.color}`}
                    >
                      <UtensilsCrossed size={32} className="opacity-40" />
                    </div>

                    <div className="flex-grow">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-gray-900 text-lg font-serif leading-tight">
                            {meta.label}
                          </h4>
                          <p className="text-xs text-gray-500 mb-2 mt-0.5">
                            {meta.desc}
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-between items-end mt-2">
                        <span className="text-lg font-bold text-[#6B21A8]">
                          {formatCurrency(prod.vl_preco)}
                        </span>

                        <button
                          onClick={() =>
                            handleSale(prod.tp_sabor, prod.vl_preco)
                          }
                          disabled={processingSale}
                          className="w-8 h-8 rounded-full bg-gray-100 hover:bg-[#6B21A8] hover:text-white flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-90"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      {/* --- FOOTER --- */}
      <footer className="mt-auto border-t border-purple-100 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-400">
          © 2026 Saboor Brownie System. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
