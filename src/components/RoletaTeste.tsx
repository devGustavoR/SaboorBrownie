"use client";

import { RoletaWheel } from "@/components/RoletaWheel";
import {
  chanceDeGanhar,
  DURACAO_GIRO_MS,
  faixasDe,
  girosPara,
  lerRoleta,
  montarFatias,
  ROLETA_PADRAO,
  rotacaoPara,
  sortearFatia,
  type Roleta,
} from "@/lib/roleta";
import { SigaInstagram } from "@/components/SigaInstagram";
import { Gift, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

interface Resultado {
  nome: string;
  vazio: boolean;
}

// Teste da roleta: gira à vontade e simula milhares de giros para conferir as
// chances. Nada aqui é registrado (sem email, sem limite de prêmio consumido).
export function RoletaTeste() {
  const [roleta, setRoleta] = useState<Roleta>(ROLETA_PADRAO);
  const [rotacao, setRotacao] = useState(0);
  const [girando, setGirando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [historico, setHistorico] = useState<Resultado[]>([]);
  const [simulacao, setSimulacao] = useState<{
    giros: number;
    contagem: Record<string, number>;
  } | null>(null);
  const [valorCompra, setValorCompra] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage só existe no cliente
  useEffect(() => {
    const t = setTimeout(() => setRoleta(lerRoleta()), 0);
    return () => {
      clearTimeout(t);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Sem limites: o teste ignora quantos prêmios já saíram no evento
  const fatias = useMemo(() => montarFatias(roleta.premios), [roleta]);
  const chanceGanhar = useMemo(() => chanceDeGanhar(roleta), [roleta]);

  // Chance esperada por nome de prêmio (fatias com o mesmo nome se somam)
  const esperado = useMemo(() => {
    const soma = fatias.reduce((a, f) => a + f.pesoNum, 0);
    const porNome = new Map<string, { chance: number; vazio: boolean }>();
    for (const f of fatias) {
      const nome = f.nome.trim();
      const atual = porNome.get(nome);
      porNome.set(nome, {
        chance: (atual?.chance ?? 0) + (soma > 0 ? (f.pesoNum / soma) * 100 : 0),
        vazio: f.vazio === true,
      });
    }
    return [...porNome.entries()].map(([nome, v]) => ({ nome, ...v }));
  }, [fatias]);

  const girar = () => {
    if (girando || fatias.length === 0) return;
    setResultado(null);
    const ganha = sortearFatia(fatias);
    setRotacao((r) => rotacaoPara(ganha, r));
    setGirando(true);
    timer.current = setTimeout(() => {
      const res = { nome: ganha.nome.trim(), vazio: ganha.vazio === true };
      setResultado(res);
      setHistorico((h) => [res, ...h].slice(0, 12));
      setGirando(false);
    }, DURACAO_GIRO_MS);
  };

  const simular = (giros: number) => {
    if (fatias.length === 0) return;
    const contagem: Record<string, number> = {};
    for (let i = 0; i < giros; i++) {
      const nome = sortearFatia(fatias).nome.trim();
      contagem[nome] = (contagem[nome] ?? 0) + 1;
    }
    setSimulacao({ giros, contagem });
  };

  const vitorias = historico.filter((h) => !h.vazio).length;

  return (
    <section>
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg text-[#7C3AED]">
          <Gift size={20} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Teste da Roleta</h2>
          <p className="text-sm text-gray-500">
            Gire para ver como fica e simule milhares de giros para conferir as
            chances. Nada aqui é registrado.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Roleta */}
        <div className="bg-gradient-to-br from-[#6B21A8] via-[#7C3AED] to-[#9333EA] rounded-2xl p-6 md:p-8 shadow-sm text-white text-center space-y-5">
          {fatias.length === 0 ? (
            <p className="py-16 text-purple-100">
              Nenhum prêmio com chance maior que zero. Cadastre os prêmios em{" "}
              <b>Dia do Evento &gt; Roleta</b>.
            </p>
          ) : (
            <>
              <RoletaWheel
                fatias={fatias}
                rotacao={rotacao}
                girando={girando}
                destacar={resultado !== null && !girando}
                className="w-[min(80vw,400px)]"
              />
              <div className="min-h-[3.5rem] flex flex-col items-center justify-center gap-3">
                {girando ? (
                  <p className="text-xl font-bold flex items-center gap-2">
                    <Loader2 className="animate-spin" size={22} /> Girando...
                  </p>
                ) : resultado ? (
                  <>
                    <p className="text-2xl font-extrabold">
                      {resultado.vazio
                        ? "Não foi dessa vez!"
                        : `Ganhou: ${resultado.nome}!`}
                    </p>
                    <SigaInstagram instagram={roleta.instagram} />
                  </>
                ) : (
                  <p className="text-purple-100">Toque em girar para testar.</p>
                )}
              </div>
              <button
                onClick={girar}
                disabled={girando}
                className="w-full max-w-xs py-3.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xl font-extrabold active:scale-95 transition shadow-xl disabled:opacity-60 flex items-center justify-center gap-2 mx-auto"
              >
                <RotateCw size={22} /> Girar teste
              </button>
            </>
          )}
        </div>

        {/* Chances e simulação */}
        <div className="bg-white rounded-2xl p-6 md:p-8 shadow-sm border border-purple-50 space-y-6">
          <div className="flex items-center justify-between rounded-xl bg-green-50 text-green-800 px-4 py-3">
            <span className="text-sm font-semibold">Chance de ganhar algo</span>
            <span className="text-2xl font-extrabold">
              {chanceGanhar.toFixed(1)}%
            </span>
          </div>

          {/* Giros por valor da compra */}
          <div className="rounded-xl bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">
              Giros por valor da compra
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[...faixasDe(roleta)]
                .sort(
                  (a, b) =>
                    (parseFloat(a.minimo.replace(",", ".")) || 0) -
                    (parseFloat(b.minimo.replace(",", ".")) || 0),
                )
                .map((f) => (
                  <span
                    key={f.id}
                    className="px-3 py-1 rounded-full bg-white text-xs font-semibold text-amber-900"
                  >
                    a partir de R$ {f.minimo || "0"} → {f.giros}{" "}
                    {f.giros === "1" ? "giro" : "giros"}
                  </span>
                ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                  R$
                </span>
                <input
                  value={valorCompra}
                  inputMode="decimal"
                  onChange={(e) =>
                    setValorCompra(e.target.value.replace(/[^\d.,]/g, ""))
                  }
                  placeholder="Valor de uma compra"
                  className="w-full pl-9 pr-3 py-2.5 bg-white rounded-lg text-right font-bold outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <span className="text-sm font-extrabold text-amber-900 whitespace-nowrap">
                {valorCompra === ""
                  ? "—"
                  : (() => {
                      const g = girosPara(
                        parseFloat(valorCompra.replace(",", ".")) || 0,
                        roleta,
                      );
                      return `${g} ${g === 1 ? "giro" : "giros"}`;
                    })()}
              </span>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-12 gap-2 text-[11px] uppercase tracking-wider text-gray-400 font-semibold pb-2 border-b border-gray-100">
              <div className="col-span-6">Prêmio</div>
              <div className="col-span-3 text-right">Esperado</div>
              <div className="col-span-3 text-right">Simulado</div>
            </div>
            {esperado.map((e) => {
              const obtido = simulacao
                ? ((simulacao.contagem[e.nome] ?? 0) / simulacao.giros) * 100
                : null;
              return (
                <div
                  key={e.nome}
                  className="grid grid-cols-12 gap-2 py-2.5 text-sm border-b border-gray-50 items-center"
                >
                  <div
                    className={`col-span-6 truncate ${
                      e.vazio ? "text-gray-400" : "font-semibold text-gray-900"
                    }`}
                  >
                    {e.nome}
                  </div>
                  <div className="col-span-3 text-right text-gray-600">
                    {e.chance.toFixed(1)}%
                  </div>
                  <div className="col-span-3 text-right font-semibold text-[#6B21A8]">
                    {obtido === null ? "—" : `${obtido.toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {[100, 1000, 10000].map((n) => (
                <button
                  key={n}
                  onClick={() => simular(n)}
                  disabled={fatias.length === 0}
                  className="px-4 py-2.5 rounded-xl bg-purple-50 text-[#6B21A8] text-sm font-semibold hover:bg-purple-100 active:scale-95 disabled:opacity-40"
                >
                  Simular {n.toLocaleString("pt-BR")} giros
                </button>
              ))}
            </div>
            {simulacao && (
              <p className="text-xs text-gray-400">
                Com poucos giros o resultado oscila; quanto mais giros, mais
                perto do esperado.
              </p>
            )}
          </div>

          {historico.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Últimos giros ({vitorias} com prêmio de {historico.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {historico.map((h, i) => (
                  <span
                    key={i}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      h.vazio
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-100 text-amber-800 font-bold"
                    }`}
                  >
                    {h.nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Os prêmios e as chances são os mesmos do Dia do Evento. Para
            alterá-los, use o botão <b>Roleta</b> em{" "}
            <Link
              href="/dashboard/dia-evento"
              className="text-[#7C3AED] underline"
            >
              Dia do Evento
            </Link>
            . O teste ignora o limite de cada prêmio.
          </p>
        </div>
      </div>
    </section>
  );
}
