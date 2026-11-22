"use client";

import {
  baixarCsv,
  horaCurta,
  money,
  nomeArquivo,
  nomeItem,
  PAGAMENTOS,
  rotuloPagamento,
  subtotalDe,
  toNumber,
  type Dia,
  type ItemDia,
  type Plano,
} from "@/lib/diaEvento";
import { BarChart3, Download, X } from "lucide-react";
import { useMemo } from "react";

// Relatório do evento: o planejado contra o que vendeu, horários e lucro real
export function RelatorioEvento({
  plano,
  dia,
  itens,
  taxaCredito,
  taxaDebito,
  onFechar,
}: {
  plano: Plano;
  dia: Dia;
  itens: ItemDia[];
  taxaCredito: string;
  taxaDebito: string;
  onFechar: () => void;
}) {
  const r = useMemo(() => {
    const vendas = [...dia.vendas].sort((a, b) => a.ts.localeCompare(b.ts));

    // quando cada item esgotou (venda que zerou o estoque)
    const totalPor = new Map(itens.map((i) => [i.key, i.total]));
    const acumulado: Record<string, number> = {};
    const esgotou: Record<string, string> = {};
    for (const v of vendas) {
      for (const it of v.itens) {
        acumulado[it.key] = (acumulado[it.key] ?? 0) + it.qtd;
        const tot = totalPor.get(it.key) ?? 0;
        if (!esgotou[it.key] && tot > 0 && acumulado[it.key] >= tot) {
          esgotou[it.key] = v.ts;
        }
      }
    }

    // vendas por hora
    const porHora = new Map<number, { valor: number; unidades: number }>();
    for (const v of vendas) {
      const h = new Date(v.ts).getHours();
      const atual = porHora.get(h) ?? { valor: 0, unidades: 0 };
      atual.valor += v.total;
      atual.unidades += v.itens.reduce((a, i) => a + i.qtd, 0);
      porHora.set(h, atual);
    }
    const horas = [...porHora.entries()].sort((a, b) => a[0] - b[0]);
    const maxHora = Math.max(...horas.map(([, x]) => x.valor), 0);
    const pico = horas.reduce<[number, { valor: number }] | null>(
      (m, h) => (!m || h[1].valor > m[1].valor ? h : m),
      null,
    );

    // dinheiro
    const produtos = vendas.reduce((a, v) => a + subtotalDe(v), 0);
    const cupons = vendas.reduce((a, v) => a + (v.cupom?.desconto ?? 0), 0);
    const receita = vendas.reduce((a, v) => a + v.total, 0);
    const acrescimos = vendas.reduce((a, v) => a + (v.acrescimo ?? 0), 0);
    const taxaPct = (p: string) =>
      p === "CREDITO" ? toNumber(taxaCredito) : p === "DEBITO" ? toNumber(taxaDebito) : 0;
    // a maquininha cobra a taxa sobre o valor passado no cartão
    const taxasCartao = vendas.reduce(
      (a, v) => a + ((v.total + (v.acrescimo ?? 0)) * taxaPct(v.pagamento)) / 100,
      0,
    );
    const pct = Math.min(Math.max(toNumber(plano.descontoPct), 0), 100);
    const repasse = (receita * pct) / 100;
    const custo = plano.custo ?? 0;
    const lucro = receita + acrescimos - taxasCartao - repasse - custo;

    const porPagamento = PAGAMENTOS.map((p) => {
      const vs = vendas.filter((v) => v.pagamento === p.id);
      return {
        ...p,
        qtd: vs.length,
        valor: vs.reduce((a, v) => a + v.total + (v.acrescimo ?? 0), 0),
      };
    });

    const unidades = itens.reduce((a, i) => a + i.vendido, 0);
    const levadas = itens.reduce((a, i) => a + i.total, 0);
    const planejadas = itens.reduce((a, i) => a + i.planejado, 0);

    const sorteios = dia.sorteios ?? [];
    const participantes = new Set(sorteios.map((s) => s.email)).size;
    const premios = sorteios.filter((s) => !s.vazio && s.cupom);
    const usados = premios.filter((s) => s.usadoEm).length;

    return {
      vendas,
      esgotou,
      horas,
      maxHora,
      pico,
      produtos,
      cupons,
      receita,
      acrescimos,
      taxasCartao,
      pct,
      repasse,
      custo,
      lucro,
      porPagamento,
      unidades,
      levadas,
      planejadas,
      ticket: vendas.length > 0 ? receita / vendas.length : 0,
      participantes,
      sorteios: sorteios.length,
      premios: premios.length,
      usados,
    };
  }, [dia, itens, plano, taxaCredito, taxaDebito]);

  const ordenados = [...itens].sort(
    (a, b) => b.vendido - a.vendido || a.key.localeCompare(b.key),
  );

  const baixarVendas = () =>
    baixarCsv(`vendas-${nomeArquivo(plano.nomeEvento)}.csv`, [
      ["data", "hora", "itens", "subtotal", "cupom", "desconto cupom", "total", "acrescimo", "pagamento"],
      ...r.vendas.map((v) => [
        new Date(v.ts).toLocaleDateString("pt-BR"),
        horaCurta(v.ts),
        v.itens.map((i) => `${i.qtd}x ${nomeItem(i.key)}`).join(", "),
        subtotalDe(v),
        v.cupom?.codigo ?? "",
        v.cupom?.desconto ?? 0,
        v.total,
        v.acrescimo ?? 0,
        rotuloPagamento(v.pagamento),
      ]),
    ]);

  const linhaDinheiro = (label: string, valor: number, sinal: "+" | "-" | "", destaque = false) => (
    <div
      className={`flex justify-between py-2 ${
        destaque ? "border-t border-gray-200 mt-1 pt-3 text-lg font-extrabold" : "text-sm"
      }`}
    >
      <span className={destaque ? "" : "text-gray-600"}>{label}</span>
      <span
        className={
          destaque
            ? valor >= 0
              ? "text-green-700"
              : "text-red-600"
            : sinal === "-"
              ? "text-red-600 font-semibold"
              : "font-semibold"
        }
      >
        {sinal === "-" ? "− " : sinal === "+" ? "+ " : ""}
        {money(Math.abs(valor))}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] bg-[#F3E8FF] overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#7C3AED] font-bold flex items-center gap-1.5">
              <BarChart3 size={14} /> Relatório do evento
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              {plano.nomeEvento}
            </h2>
            {r.vendas.length > 0 && (
              <p className="text-sm text-gray-500">
                {new Date(r.vendas[0].ts).toLocaleDateString("pt-BR")} · primeira
                venda {horaCurta(r.vendas[0].ts)} · última{" "}
                {horaCurta(r.vendas[r.vendas.length - 1].ts)}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={baixarVendas}
              disabled={r.vendas.length === 0}
              className="hidden sm:flex items-center gap-2 px-4 py-3 rounded-xl bg-white text-[#6B21A8] text-sm font-semibold disabled:opacity-40"
            >
              <Download size={16} /> Vendas (CSV)
            </button>
            <button
              onClick={onFechar}
              className="p-3 rounded-xl bg-white hover:bg-gray-50"
              aria-label="Fechar relatório"
            >
              <X size={22} />
            </button>
          </div>
        </header>

        {/* Números principais */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { l: "Receita", v: money(r.receita), d: `${r.vendas.length} vendas` },
            {
              l: "Unidades vendidas",
              v: `${r.unidades} / ${r.levadas}`,
              d: r.levadas > 0 ? `${Math.round((r.unidades / r.levadas) * 100)}% do que levou` : "",
            },
            { l: "Ticket médio", v: money(r.ticket), d: "por venda" },
            {
              l: "Lucro real",
              v: money(r.lucro),
              d: r.custo > 0 ? "já tirando custos e repasses" : "sem custo de compras",
              forte: true,
            },
          ].map((c) => (
            <div
              key={c.l}
              className={`rounded-2xl p-4 ${
                c.forte
                  ? "bg-gradient-to-br from-[#7C3AED] to-[#6B21A8] text-white shadow-lg"
                  : "bg-white border border-purple-100"
              }`}
            >
              <p className={`text-xs uppercase tracking-wider font-semibold ${c.forte ? "text-purple-200" : "text-gray-400"}`}>
                {c.l}
              </p>
              <p className="text-2xl md:text-3xl font-bold mt-1">{c.v}</p>
              <p className={`text-xs mt-0.5 ${c.forte ? "text-purple-200" : "text-gray-500"}`}>{c.d}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Planejado x vendido */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-purple-100 overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold">Planejado × vendido</h3>
              <p className="text-xs text-gray-500">
                O que sobrou ou esgotou ajuda a ajustar a próxima feira.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-400 text-left">
                    <th className="px-5 py-3 font-semibold">Item</th>
                    <th className="px-2 py-3 font-semibold text-right">Planejado</th>
                    <th className="px-2 py-3 font-semibold text-right">Levou</th>
                    <th className="px-2 py-3 font-semibold text-right">Vendeu</th>
                    <th className="px-2 py-3 font-semibold text-right">Sobrou</th>
                    <th className="px-5 py-3 font-semibold text-right">Esgotou</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((i) => {
                    const pct = i.total > 0 ? i.vendido / i.total : 0;
                    return (
                      <tr key={i.key} className="border-t border-gray-50">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-900">{nomeItem(i.key)}</p>
                          <div className="mt-1 h-1.5 w-full max-w-[140px] rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full ${pct >= 1 ? "bg-green-500" : pct >= 0.6 ? "bg-[#7C3AED]" : "bg-orange-400"}`}
                              style={{ width: `${Math.min(pct, 1) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right text-gray-500">{i.planejado}</td>
                        <td className="px-2 py-3 text-right">{i.total}</td>
                        <td className="px-2 py-3 text-right font-bold">{i.vendido}</td>
                        <td className={`px-2 py-3 text-right ${i.restante > 0 ? "text-orange-600 font-semibold" : "text-gray-400"}`}>
                          {i.restante}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {r.esgotou[i.key] ? (
                            <span className="text-green-700 font-semibold">
                              {horaCurta(r.esgotou[i.key])}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-gray-500 border-t border-gray-100">
              Planejado no orçamento: {r.planejadas} · levado: {r.levadas} ·
              vendido: {r.unidades}
            </p>
          </section>

          {/* Dinheiro */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-purple-100 p-5">
            <h3 className="text-lg font-bold mb-2">De onde vem o lucro</h3>
            {linhaDinheiro("Produtos vendidos", r.produtos, "")}
            {r.cupons > 0 && linhaDinheiro("Cupons da roleta", r.cupons, "-")}
            {r.acrescimos > 0 && linhaDinheiro("Acréscimo do cartão (pago pelo cliente)", r.acrescimos, "+")}
            {r.taxasCartao > 0 && linhaDinheiro("Taxa da maquininha (estimada)", r.taxasCartao, "-")}
            {r.pct > 0 &&
              linhaDinheiro(
                `${plano.descontoDestino?.trim() || "Repasse"} (${r.pct}%)`,
                r.repasse,
                "-",
              )}
            {r.custo > 0
              ? linhaDinheiro("Compras dos ingredientes (orçamento)", r.custo, "-")
              : (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 my-1">
                  Sem custo de compras: salve o orçamento na tela Evento para
                  descontar os ingredientes.
                </p>
              )}
            {linhaDinheiro("Lucro real", r.lucro, "", true)}

            <div className="grid grid-cols-2 gap-2 mt-4">
              {r.porPagamento.map((p) => (
                <div key={p.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <p.icon size={13} /> {p.label} · {p.qtd}
                  </p>
                  <p className="font-bold text-gray-900">{money(p.valor)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Por hora */}
          <section className="lg:col-span-7 bg-white rounded-2xl border border-purple-100 p-5">
            <div className="flex items-baseline justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold">Vendas por hora</h3>
              {r.pico && (
                <p className="text-sm text-gray-500">
                  Pico: <b className="text-[#6B21A8]">{r.pico[0]}h</b> ({money(r.pico[1].valor)})
                </p>
              )}
            </div>
            {r.horas.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Nenhuma venda ainda.</p>
            ) : (
              <div className="space-y-2">
                {r.horas.map(([h, x]) => (
                  <div key={h} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-gray-500 tabular-nums">{h}h</span>
                    <div className="flex-1 h-7 rounded-lg bg-purple-50 overflow-hidden">
                      <div
                        className="h-full rounded-lg bg-[#7C3AED]"
                        style={{ width: `${r.maxHora > 0 ? (x.valor / r.maxHora) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-semibold tabular-nums">{money(x.valor)}</span>
                    <span className="w-12 text-right text-gray-400 tabular-nums">{x.unidades} un</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Roleta */}
          <section className="lg:col-span-5 bg-white rounded-2xl border border-purple-100 p-5">
            <h3 className="text-lg font-bold mb-3">Roleta</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: "Giros", v: r.sorteios },
                { l: "Emails (únicos)", v: r.participantes },
                { l: "Prêmios saídos", v: r.premios },
                { l: "Cupons já usados", v: r.usados },
              ].map((c) => (
                <div key={c.l} className="bg-gray-50 rounded-xl px-3 py-3">
                  <p className="text-xs text-gray-400">{c.l}</p>
                  <p className="text-xl font-bold text-gray-900">{c.v}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <button
          onClick={baixarVendas}
          disabled={r.vendas.length === 0}
          className="sm:hidden w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-[#6B21A8] text-sm font-semibold disabled:opacity-40"
        >
          <Download size={16} /> Baixar vendas (CSV)
        </button>
      </div>
    </div>
  );
}
