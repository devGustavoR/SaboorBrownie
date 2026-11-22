"use client";

import { PixModal } from "@/components/dia-evento/PixModal";
import { RelatorioEvento } from "@/components/dia-evento/RelatorioEvento";
import { StatusSync } from "@/components/dia-evento/StatusSync";
import { RoletaWheel } from "@/components/RoletaWheel";
import { SigaInstagram } from "@/components/SigaInstagram";
import {
  baixarCsv,
  BASES,
  baseInfo,
  formatSabor,
  horaCurta,
  makeKey,
  money,
  nomeArquivo,
  nomeItem,
  PAGAMENTOS,
  parseKey,
  rotuloPagamento,
  subtotalDe,
  toNumber,
  uuid,
  type BaseId,
  type CupomAplicado,
  type Dia,
  type ItemDia,
  type Pagamento,
  type Plano,
  type Sorteio,
  type Venda,
} from "@/lib/diaEvento";
import { PIX_PADRAO, pixConfigurado, TIPOS_CHAVE, type ConfigPix, type TipoChave } from "@/lib/pix";
import {
  beneficioDe,
  BENEFICIOS,
  chanceDeGanhar,
  descontoCupom,
  descreverBeneficio,
  DURACAO_GIRO_MS,
  ehRoletaAntiga,
  faixasDe,
  gerarCodigoCupom,
  girosPara,
  MAX_GIROS,
  MIN_GIROS,
  montarFatias,
  normalizarCodigo,
  ROLETA_PADRAO,
  rotacaoPara,
  sortearFatia,
  type Beneficio,
  type Faixa,
  type Premio,
  type Roleta,
} from "@/lib/roleta";
import { supabase } from "@/lib/supabase";
import { enfileirar, exclusoesPendentes } from "@/lib/sync";
import { useTelaAcesa, useTelaCheia } from "@/lib/telaAcesa";
import {
  BarChart3,
  CalendarDays,
  Check,
  CloudDownload,
  Download,
  Gift,
  Loader2,
  Mail,
  Maximize,
  Minimize,
  Minus,
  PackageCheck,
  Plus,
  QrCode,
  ShoppingBag,
  SlidersHorizontal,
  Ticket,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface Guardado {
  selecionado: string | null;
  dias: Record<string, Dia>;
  roleta?: Roleta;
  taxaCredito?: string; // % de acréscimo cobrado no crédito
  taxaDebito?: string; // % de acréscimo cobrado no débito
  pix?: ConfigPix;
}

// Cupom encontrado no caixa (neste aparelho ou no banco), pronto para aplicar
interface CupomEncontrado {
  codigo: string;
  premio: string;
  email: string;
  beneficio: Beneficio;
  valor: number;
  ts: string;
}

// Tarifas do Mercado Pago repassadas ao cliente: crédito à vista 3,09%, débito 0,89%.
const TAXA_CREDITO_PADRAO = "3,09";
const TAXA_DEBITO_PADRAO = "0,89";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const NOTAS = [5, 10, 20, 50, 100];

const BUDGETS_KEY = "saboor:orcamentos-evento-v2";
const DRAFT_KEY = "saboor:preparo-evento-v2";
const DIA_KEY = "saboor:dia-evento-v1";
const PRECOS_KEY = "saboor:precos-cache"; // tabela de preços para usar sem internet
const SYNC_INICIAL_KEY = "saboor:sync-inicial-v1";
const BAIXO = 3; // estoque considerado "acabando"

// --- Helpers ---
const newId = uuid;

// Linhas do banco (Supabase) a partir do que fica no navegador
const linhaVenda = (evento: string, v: Venda) => ({
  cd_venda: v.id,
  cd_evento: evento,
  ts_venda: v.ts,
  ds_itens: v.itens,
  vl_subtotal: subtotalDe(v),
  vl_desconto_cupom: v.cupom?.desconto ?? 0,
  cd_cupom: v.cupom?.codigo ?? null,
  vl_total: v.total,
  vl_acrescimo: v.acrescimo ?? 0,
  tp_pagamento: v.pagamento,
  vl_recebido: v.recebido ?? null,
  ds_lancamentos: v.lancamentos ?? null,
  ts_atualizacao: new Date().toISOString(),
});

const linhaSorteio = (evento: string, s: Sorteio) => ({
  cd_sorteio: s.id,
  cd_venda: s.vendaId,
  cd_evento: evento,
  ds_email: s.email,
  nm_premio: s.premio,
  fl_vazio: s.vazio === true,
  cd_cupom: s.cupom ?? null,
  tp_beneficio: s.beneficio ?? null,
  vl_beneficio: s.valor ?? null,
  ts_sorteio: s.ts,
  ts_resgate: s.usadoTs ?? null,
  cd_venda_resgate: s.usadoEm ?? null,
});

const salvarVenda = (evento: string, v: Venda) =>
  enfileirar({
    tipo: "upsert",
    tabela: "EVENTO_VENDAS",
    chave: "cd_venda",
    linha: linhaVenda(evento, v),
  });

const salvarSorteio = (evento: string, s: Sorteio) =>
  enfileirar({
    tipo: "upsert",
    tabela: "ROLETA_SORTEIOS",
    chave: "cd_sorteio",
    linha: linhaSorteio(evento, s),
  });

const readJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const diaVazio = (): Dia => ({ ajustes: {}, precoDia: {}, vendas: [] });

export default function DiaEventoPage() {
  const [loaded, setLoaded] = useState(false);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [dias, setDias] = useState<Record<string, Dia>>({});
  const [precoPadrao, setPrecoPadrao] = useState<Record<string, number>>({});
  const [taxaCredito, setTaxaCredito] = useState(TAXA_CREDITO_PADRAO);
  const [taxaDebito, setTaxaDebito] = useState(TAXA_DEBITO_PADRAO);
  const [roleta, setRoleta] = useState<Roleta>(ROLETA_PADRAO);
  const [configRoleta, setConfigRoleta] = useState(false);
  const [pix, setPix] = useState<ConfigPix>(PIX_PADRAO);
  const [pixAberto, setPixAberto] = useState(false);
  const [relatorio, setRelatorio] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  // Cupom da roleta usado na venda em andamento
  const [cupomTexto, setCupomTexto] = useState("");
  const [cupomAberto, setCupomAberto] = useState(false);
  const [cupom, setCupom] = useState<CupomEncontrado | null>(null);
  const [cuponsAchados, setCuponsAchados] = useState<CupomEncontrado[]>([]);
  const [buscandoCupom, setBuscandoCupom] = useState(false);

  // tablet: tela sempre acesa nesta página e botão de tela cheia
  useTelaAcesa(true);
  const telaCheia = useTelaCheia();

  // Sorteio da venda recém-finalizada
  const [sorteio, setSorteio] = useState<{
    vendaId: string;
    etapa: "email" | "roleta" | "resultado";
    email: string;
    aceite: boolean;
    premio: string | null;
    cupom: string | null; // código do prêmio que acabou de sair
    rotacao: number;
    girando: boolean;
    giros: number; // quantos giros a compra deu (1 a 3)
    feitos: number; // quantos já foram girados
  } | null>(null);

  // Venda em andamento
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [pagamento, setPagamento] = useState<Pagamento>("DINHEIRO");
  const [recebido, setRecebido] = useState("");
  const [filtro, setFiltro] = useState<"TODAS" | BaseId>("TODAS");
  const [ajustando, setAjustando] = useState(false);
  const [novoItem, setNovoItem] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [vendaOk, setVendaOk] = useState(false);
  const comandaRef = useRef<HTMLDivElement>(null);

  // --- Carregar planos salvos, rascunho e estado do dia ---
  useEffect(() => {
    // adiado para depois da hidratação (localStorage só existe no cliente)
    const timer = setTimeout(() => {
      const lista: Plano[] = [];
      const draft = readJSON<Partial<Plano> | null>(DRAFT_KEY, null);
      const salvos = readJSON<
        (Plano & { legado?: unknown; totalBrownies?: number; total?: number })[]
      >(BUDGETS_KEY, []);
      for (const b of salvos) {
        if (b.legado) continue; // formato antigo não tem quantidade por sabor
        lista.push({
          id: b.id,
          nomeEvento: b.nomeEvento,
          qtdSabores: b.qtdSabores ?? {},
          valoresVenda: b.valoresVenda,
          descontoPct: b.descontoPct,
          descontoDestino: b.descontoDestino,
          custo: typeof b.total === "number" ? b.total : undefined,
        });
      }
      if (draft?.qtdSabores && Object.keys(draft.qtdSabores).length > 0) {
        lista.push({
          id: "rascunho",
          nomeEvento: `${draft.nomeEvento?.trim() || "Evento sem nome"} (rascunho)`,
          qtdSabores: draft.qtdSabores,
          valoresVenda: draft.valoresVenda,
          descontoPct: draft.descontoPct,
          descontoDestino: draft.descontoDestino,
        });
      }
      const guardado = readJSON<Guardado>(DIA_KEY, {
        selecionado: null,
        dias: {},
      });
      setPlanos(lista);
      setDias(guardado.dias ?? {});
      setTaxaCredito(guardado.taxaCredito ?? TAXA_CREDITO_PADRAO);
      setTaxaDebito(guardado.taxaDebito ?? TAXA_DEBITO_PADRAO);
      setPix({ ...PIX_PADRAO, ...guardado.pix });
      setPrecoPadrao(readJSON<Record<string, number>>(PRECOS_KEY, {}));

      // 1ª vez com o banco: manda o que já estava só neste aparelho
      try {
        if (!localStorage.getItem(SYNC_INICIAL_KEY)) {
          for (const [evento, d] of Object.entries(guardado.dias ?? {})) {
            for (const v of d.vendas ?? []) salvarVenda(evento, v);
            for (const s of d.sorteios ?? []) salvarSorteio(evento, s);
          }
          localStorage.setItem(SYNC_INICIAL_KEY, new Date().toISOString());
        }
      } catch {
        // sem storage: nada a enviar
      }
      setRoleta(
        guardado.roleta && !ehRoletaAntiga(guardado.roleta)
          ? guardado.roleta
          : ROLETA_PADRAO,
      );
      setSelecionado(
        lista.some((p) => p.id === guardado.selecionado)
          ? guardado.selecionado
          : (lista[0]?.id ?? null),
      );
      setLoaded(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // --- Preços padrão (tabela de preços; guardada para usar sem internet) ---
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("TABELA_PRECOS")
        .select("tp_sabor, vl_preco");
      if (error || !data || data.length === 0) return; // fica o cache
      const m: Record<string, number> = {};
      for (const p of data) {
        m[p.tp_sabor as string] = Number(p.vl_preco) || 0;
      }
      setPrecoPadrao(m);
      try {
        localStorage.setItem(PRECOS_KEY, JSON.stringify(m));
      } catch {
        // sem storage
      }
    };
    load();
  }, []);

  // --- Eventos salvos no banco que não existem neste aparelho ---
  useEffect(() => {
    if (!loaded) return;
    const load = async () => {
      const { data, error } = await supabase
        .from("EVENTOS")
        .select("cd_evento, nm_evento, ds_plano, ds_dia");
      if (error || !data) return;
      setPlanos((atual) => {
        const ids = new Set(atual.map((p) => p.id));
        const novos: Plano[] = data
          .filter((e) => !ids.has(e.cd_evento as string))
          .map((e) => ({
            ...((e.ds_plano ?? {}) as Partial<Plano>),
            qtdSabores: ((e.ds_plano as Partial<Plano>)?.qtdSabores ?? {}),
            id: e.cd_evento as string,
            nomeEvento: `${e.nm_evento as string} (do banco)`,
            doBanco: true,
          }));
        return novos.length > 0 ? [...atual, ...novos] : atual;
      });
      // aparelho sem nenhum evento: abre o primeiro que veio do banco
      if (data.length > 0) {
        setSelecionado((s) => s ?? (data[0].cd_evento as string));
      }
      // ajustes/preços do dia que só estão no banco
      setDias((atual) => {
        let mudou = false;
        const prox = { ...atual };
        for (const e of data) {
          const id = e.cd_evento as string;
          const remoto = (e.ds_dia ?? {}) as Partial<Dia>;
          if (!prox[id] && (remoto.ajustes || remoto.precoDia)) {
            prox[id] = {
              ajustes: remoto.ajustes ?? {},
              precoDia: remoto.precoDia ?? {},
              vendas: [],
            };
            mudou = true;
          }
        }
        return mudou ? prox : atual;
      });
    };
    load();
  }, [loaded]);

  // --- Salvar o dia automaticamente ---
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        DIA_KEY,
        JSON.stringify({
          selecionado,
          dias,
          taxaCredito,
          taxaDebito,
          roleta,
          pix,
        }),
      );
    } catch {
      // storage indisponível: o dia vale só nesta sessão
    }
  }, [loaded, selecionado, dias, taxaCredito, taxaDebito, roleta, pix]);

  const plano = planos.find((p) => p.id === selecionado) ?? null;
  const dia = (selecionado && dias[selecionado]) || diaVazio();

  // --- Plano e ajustes do dia também vão para o banco (para recuperar) ---
  const ajustesJson = JSON.stringify([dia.ajustes, dia.precoDia]);
  useEffect(() => {
    if (!loaded || !plano) return;
    const t = setTimeout(() => {
      const { doBanco, ...semFlag } = plano;
      void doBanco;
      const [ajustes, precoDia] = JSON.parse(ajustesJson) as [
        Dia["ajustes"],
        Dia["precoDia"],
      ];
      enfileirar({
        tipo: "upsert",
        tabela: "EVENTOS",
        chave: "cd_evento",
        linha: {
          cd_evento: plano.id,
          nm_evento: plano.nomeEvento.replace(/ \((rascunho|do banco)\)$/, ""),
          ds_plano: semFlag,
          ds_dia: { ajustes, precoDia },
          ts_atualizacao: new Date().toISOString(),
        },
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [loaded, plano, ajustesJson]);

  const atualizarDia = (fn: (d: Dia) => Dia) => {
    if (!selecionado) return;
    setDias((prev) => ({
      ...prev,
      [selecionado]: fn(prev[selecionado] ?? diaVazio()),
    }));
  };

  // --- Itens à venda (sabor × massa) ---
  const itens = useMemo((): ItemDia[] => {
    if (!plano) return [];
    const keys = new Set<string>();
    for (const [k, v] of Object.entries(plano.qtdSabores)) {
      if (toNumber(v) > 0) keys.add(k);
    }
    for (const k of Object.keys(dia.ajustes)) keys.add(k);
    for (const v of dia.vendas) for (const i of v.itens) keys.add(i.key);

    const vendidoPor: Record<string, number> = {};
    for (const v of dia.vendas) {
      for (const i of v.itens) {
        vendidoPor[i.key] = (vendidoPor[i.key] ?? 0) + i.qtd;
      }
    }

    return [...keys]
      .map((key) => {
        const { sabor, base } = parseKey(key);
        const planejado = toNumber(plano.qtdSabores[key]);
        const total = Math.max(planejado + (dia.ajustes[key] ?? 0), 0);
        const vendido = vendidoPor[key] ?? 0;
        const doDia = toNumber(dia.precoDia[key]);
        const doPlano = toNumber(plano.valoresVenda?.[key]);
        const preco =
          doDia > 0 ? doDia : doPlano > 0 ? doPlano : (precoPadrao[sabor] ?? 0);
        return {
          key,
          sabor,
          base,
          planejado,
          total,
          vendido,
          restante: Math.max(total - vendido, 0),
          preco,
        };
      })
      .sort(
        (a, b) =>
          formatSabor(a.sabor).localeCompare(formatSabor(b.sabor)) ||
          BASES.findIndex((x) => x.id === a.base) -
            BASES.findIndex((x) => x.id === b.base),
      );
  }, [plano, dia, precoPadrao]);

  const itemPorKey = useMemo(
    () => new Map(itens.map((i) => [i.key, i])),
    [itens],
  );

  // --- Totais do dia ---
  const resumo = useMemo(() => {
    const bruto = dia.vendas.reduce((acc, v) => acc + v.total, 0);
    const pct = Math.min(Math.max(toNumber(plano?.descontoPct), 0), 100);
    const desconto = (bruto * pct) / 100;
    // quanto entrou em cada forma de pagamento (já com o acréscimo do crédito)
    const porPagamento: Record<string, number> = {
      DINHEIRO: 0,
      PIX: 0,
      DEBITO: 0,
      CREDITO: 0,
    };
    for (const v of dia.vendas) {
      porPagamento[v.pagamento] =
        (porPagamento[v.pagamento] ?? 0) + v.total + (v.acrescimo ?? 0);
    }
    return {
      bruto,
      pct,
      desconto,
      liquido: bruto - desconto,
      vendidas: itens.reduce((acc, i) => acc + i.vendido, 0),
      total: itens.reduce((acc, i) => acc + i.total, 0),
      restantes: itens.reduce((acc, i) => acc + i.restante, 0),
      porPagamento,
    };
  }, [dia, itens, plano]);

  // --- Comanda ---
  const linhasCarrinho = Object.entries(carrinho)
    .filter(([, q]) => q > 0)
    .map(([key, qtd]) => {
      const it = itemPorKey.get(key);
      return { key, qtd, preco: it?.preco ?? 0, item: it };
    });
  const subtotalCarrinho = linhasCarrinho.reduce(
    (acc, l) => acc + l.qtd * l.preco,
    0,
  );
  const unidadesCarrinho = linhasCarrinho.reduce((acc, l) => acc + l.qtd, 0);
  // cupom da roleta abatido da comanda
  const descontoCarrinho = cupom
    ? descontoCupom(
        cupom.beneficio,
        cupom.valor,
        subtotalCarrinho,
        linhasCarrinho.filter((l) => l.preco > 0).map((l) => l.preco),
      )
    : 0;
  const totalCarrinho = Math.max(subtotalCarrinho - descontoCarrinho, 0);
  // Cartão: a taxa vira acréscimo para o cliente; Pix e dinheiro não têm
  const taxaAtual =
    pagamento === "CREDITO"
      ? taxaCredito
      : pagamento === "DEBITO"
        ? taxaDebito
        : "";
  const acrescimoCarrinho = taxaAtual
    ? Math.round(totalCarrinho * toNumber(taxaAtual)) / 100
    : 0;
  const totalCobrar = totalCarrinho + acrescimoCarrinho;
  const valorRecebido = toNumber(recebido);
  const troco = valorRecebido - totalCarrinho;
  const faltaReceber =
    pagamento === "DINHEIRO" && recebido !== "" && troco < -0.005;

  const mostrarAviso = (msg: string) => {
    setAviso(msg);
    setTimeout(() => setAviso(null), 2200);
  };

  const adicionar = (key: string) => {
    const it = itemPorKey.get(key);
    if (!it) return;
    const noCarrinho = carrinho[key] ?? 0;
    if (noCarrinho >= it.restante) {
      mostrarAviso(`Só restam ${it.restante} de ${formatSabor(it.sabor)}.`);
      return;
    }
    setCarrinho((prev) => ({ ...prev, [key]: noCarrinho + 1 }));
  };

  const remover = (key: string) =>
    setCarrinho((prev) => {
      const q = (prev[key] ?? 0) - 1;
      const { [key]: _removido, ...resto } = prev;
      void _removido;
      return q > 0 ? { ...resto, [key]: q } : resto;
    });

  const limparCupom = () => {
    setCupom(null);
    setCupomTexto("");
    setCuponsAchados([]);
    setCupomAberto(false);
  };

  const limparCarrinho = () => {
    setCarrinho({});
    setRecebido("");
    limparCupom();
  };

  // --- Cupons da roleta ---
  // todos os sorteios guardados neste aparelho (de todos os eventos)
  const sorteiosLocais = useMemo(
    () =>
      Object.entries(dias).flatMap(([evento, d]) =>
        (d.sorteios ?? []).map((s) => ({ evento, s })),
      ),
    [dias],
  );

  const deSorteio = (s: Sorteio): CupomEncontrado => {
    const b = s.beneficio
      ? { beneficio: s.beneficio, valor: s.valor ?? 0 }
      : beneficioDe(
          roleta.premios.find((p) => p.nome.trim() === s.premio) ?? {
            nome: s.premio,
          },
        );
    return {
      codigo: s.cupom ?? "",
      premio: s.premio,
      email: s.email,
      beneficio: b.beneficio,
      valor: b.valor,
      ts: s.ts,
    };
  };

  type LinhaSorteio = ReturnType<typeof linhaSorteio>;
  const deLinha = (l: LinhaSorteio): CupomEncontrado => ({
    codigo: l.cd_cupom ?? "",
    premio: l.nm_premio,
    email: l.ds_email,
    beneficio: (l.tp_beneficio as Beneficio | null) ?? beneficioDe({ nome: l.nm_premio }).beneficio,
    valor:
      l.vl_beneficio != null
        ? Number(l.vl_beneficio)
        : beneficioDe({ nome: l.nm_premio }).valor,
    ts: l.ts_sorteio,
  });

  const usarCupomAchado = (c: CupomEncontrado) => {
    setCupom(c);
    setCuponsAchados([]);
    setCupomTexto(c.codigo);
  };

  // Busca pelo código (SAB-XXXX) ou pelo email do cliente: primeiro neste
  // aparelho, depois no banco
  const buscarCupom = async () => {
    const texto = cupomTexto.trim();
    if (!texto) return;
    setCuponsAchados([]);
    const porEmail = texto.includes("@");
    const email = texto.toLowerCase();
    const codigo = normalizarCodigo(texto);

    const locais = sorteiosLocais
      .map((x) => x.s)
      .filter((s) => s.cupom && !s.vazio)
      .filter((s) => (porEmail ? s.email === email : s.cupom === codigo));

    if (!porEmail && locais.length > 0) {
      const s = locais[0];
      if (s.usadoEm) {
        mostrarAviso(
          `Cupom já usado em ${new Date(s.usadoTs ?? s.ts).toLocaleString("pt-BR")}.`,
        );
        return;
      }
      usarCupomAchado(deSorteio(s));
      return;
    }

    setBuscandoCupom(true);
    let remotos: CupomEncontrado[] = [];
    let usadoRemoto: string | null = null;
    try {
      const q = supabase
        .from("ROLETA_SORTEIOS")
        .select("*")
        .eq("fl_vazio", false)
        .not("cd_cupom", "is", null);
      const { data, error } = porEmail
        ? await q.eq("ds_email", email)
        : await q.eq("cd_cupom", codigo);
      if (!error && data) {
        const linhas = data as LinhaSorteio[];
        usadoRemoto =
          linhas.find((l) => l.ts_resgate)?.ts_resgate ?? null;
        remotos = linhas.filter((l) => !l.ts_resgate).map(deLinha);
      }
    } catch {
      // sem internet: fica só o que está neste aparelho
    }
    setBuscandoCupom(false);

    // o que já foi usado neste aparelho não volta, mesmo se o banco ainda não sabe
    const usadosAqui = new Set(
      sorteiosLocais.filter((x) => x.s.usadoEm).map((x) => x.s.cupom),
    );
    const todos = new Map<string, CupomEncontrado>();
    for (const s of locais) {
      if (!s.usadoEm) todos.set(s.cupom!, deSorteio(s));
    }
    for (const c of remotos) {
      if (!usadosAqui.has(c.codigo) && !todos.has(c.codigo)) {
        todos.set(c.codigo, c);
      }
    }
    const lista = [...todos.values()];

    if (lista.length === 0) {
      mostrarAviso(
        !porEmail && usadoRemoto
          ? `Cupom já usado em ${new Date(usadoRemoto).toLocaleString("pt-BR")}.`
          : porEmail
            ? "Nenhum cupom disponível para este email."
            : "Cupom não encontrado.",
      );
      return;
    }
    if (lista.length === 1) usarCupomAchado(lista[0]);
    else setCuponsAchados(lista);
  };

  // Marca (ou libera, com venda null) o cupom no aparelho e no banco
  const marcarCupom = (codigo: string, vendaId: string | null) => {
    const ts = vendaId ? new Date().toISOString() : undefined;
    setDias((prev) => {
      const prox: Record<string, Dia> = {};
      for (const [evento, d] of Object.entries(prev)) {
        const tem = (d.sorteios ?? []).some((s) => s.cupom === codigo);
        prox[evento] = tem
          ? {
              ...d,
              sorteios: (d.sorteios ?? []).map((s) =>
                s.cupom === codigo
                  ? { ...s, usadoEm: vendaId ?? undefined, usadoTs: ts }
                  : s,
              ),
            }
          : d;
      }
      return prox;
    });
    enfileirar({
      tipo: "update",
      tabela: "ROLETA_SORTEIOS",
      chave: "cd_cupom",
      valor: codigo,
      campos: { ts_resgate: ts ?? null, cd_venda_resgate: vendaId },
    });
  };

  // Brinde entregue sem compra
  const entregarBrinde = () => {
    if (!cupom) return;
    marcarCupom(cupom.codigo, `brinde-${newId()}`);
    mostrarAviso(`Brinde entregue: ${cupom.premio}`);
    limparCupom();
  };

  const finalizar = () => {
    if (linhasCarrinho.length === 0 || faltaReceber || !selecionado) return;
    const cupomVenda: CupomAplicado | undefined = cupom
      ? {
          codigo: cupom.codigo,
          premio: cupom.premio,
          beneficio: cupom.beneficio,
          desconto: descontoCarrinho,
        }
      : undefined;
    const venda: Venda = {
      id: newId(),
      ts: new Date().toISOString(),
      itens: linhasCarrinho.map((l) => ({
        key: l.key,
        qtd: l.qtd,
        preco: l.preco,
      })),
      subtotal: subtotalCarrinho,
      total: totalCarrinho,
      ...(acrescimoCarrinho > 0 ? { acrescimo: acrescimoCarrinho } : {}),
      pagamento,
      ...(pagamento === "DINHEIRO" && recebido !== ""
        ? { recebido: valorRecebido }
        : {}),
      ...(cupomVenda ? { cupom: cupomVenda } : {}),
    };
    atualizarDia((d) => ({ ...d, vendas: [venda, ...d.vendas] }));
    salvarVenda(selecionado, venda);
    if (cupomVenda) marcarCupom(cupomVenda.codigo, venda.id);
    limparCarrinho();
    setPixAberto(false);
    setVendaOk(true);
    setTimeout(() => setVendaOk(false), 1500);
    // depois de cada compra, o cliente pode participar do sorteio
    if (roleta.ativa && premiosDisponiveis.length > 0) {
      setSorteio({
        vendaId: venda.id,
        etapa: "email",
        email: "",
        aceite: false,
        premio: null,
        cupom: null,
        rotacao: 0,
        girando: false,
        // quanto maior a compra, mais giros (1 a 3, conforme as faixas)
        giros: girosPara(totalCarrinho, roleta),
        feitos: 0,
      });
    }
  };

  // --- Roleta ---
  const ganhosPorPremio = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of dia.sorteios ?? []) m[s.premio] = (m[s.premio] ?? 0) + 1;
    return m;
  }, [dia]);

  // Fatias proporcionais à chance (a roleta mostra as chances reais); prêmios
  // que esgotaram o limite saem da roleta
  const fatias = useMemo(
    () => montarFatias(roleta.premios, ganhosPorPremio),
    [roleta, ganhosPorPremio],
  );
  const premiosDisponiveis = fatias;

  const premioVazio = sorteio?.premio
    ? roleta.premios.find((p) => p.nome.trim() === sorteio.premio)?.vazio ===
      true
    : false;

  // chance de sair algum prêmio de verdade (fatias vazias não contam)
  const chanceGanhar = useMemo(() => chanceDeGanhar(roleta), [roleta]);

  const confirmarEmail = () => {
    if (!sorteio) return;
    if (!EMAIL_RE.test(sorteio.email.trim())) {
      mostrarAviso("Digite um email válido.");
      return;
    }
    if (!sorteio.aceite) {
      mostrarAviso("É preciso aceitar para participar.");
      return;
    }
    setSorteio({ ...sorteio, etapa: "roleta" });
  };

  const girar = () => {
    if (!sorteio || sorteio.girando || fatias.length === 0) return;
    // sorteia pelo peso e leva a roleta até a fatia sorteada
    const ganha = sortearFatia(fatias);
    const nova = rotacaoPara(ganha, sorteio.rotacao);
    const venda = sorteio.vendaId;
    const email = sorteio.email.trim().toLowerCase();
    const nome = ganha.nome.trim();
    const evento = selecionado;
    // prêmio de verdade vira um cupom com código para usar no caixa
    const b = ganha.vazio ? null : beneficioDe(ganha);
    const codigo = ganha.vazio ? null : gerarCodigoCupom();
    setSorteio({
      ...sorteio,
      rotacao: nova,
      girando: true,
      premio: nome,
      cupom: codigo,
      feitos: sorteio.feitos + 1,
    });
    setTimeout(() => {
      const registro: Sorteio = {
        id: newId(),
        vendaId: venda,
        ts: new Date().toISOString(),
        email,
        premio: nome,
        ...(ganha.vazio ? { vazio: true } : {}),
        ...(codigo && b
          ? { cupom: codigo, beneficio: b.beneficio, valor: b.valor }
          : {}),
      };
      atualizarDia((d) => ({
        ...d,
        sorteios: [registro, ...(d.sorteios ?? [])],
      }));
      if (evento) salvarSorteio(evento, registro);
      setSorteio((s) => (s ? { ...s, girando: false, etapa: "resultado" } : s));
    }, DURACAO_GIRO_MS);
  };

  // ainda há giros desta compra e prêmios na roleta
  const girosRestantes = sorteio
    ? Math.max(sorteio.giros - sorteio.feitos, 0)
    : 0;
  const novoGiro = () =>
    setSorteio((s) =>
      s ? { ...s, etapa: "roleta", premio: null, cupom: null } : s,
    );

  const baixarEmails = () =>
    baixarCsv(`sorteio-${nomeArquivo(plano?.nomeEvento ?? "evento")}.csv`, [
      ["data", "email", "premio", "cupom", "usado em"],
      ...(dia.sorteios ?? []).map((s) => [
        new Date(s.ts).toLocaleString("pt-BR"),
        s.email,
        s.premio,
        s.cupom ?? "",
        s.usadoTs ? new Date(s.usadoTs).toLocaleString("pt-BR") : "",
      ]),
    ]);

  const atualizarFaixa = (id: string, patch: Partial<Faixa>) =>
    setRoleta((r) => ({
      ...r,
      faixas: faixasDe(r).map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));

  const atualizarPremio = (id: string, patch: Partial<Premio>) =>
    setRoleta((r) => ({
      ...r,
      premios: r.premios.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

  // apaga as vendas no banco (e a baixa no estoque, se já foram lançadas)
  const apagarNoBanco = (vendas: Venda[]) => {
    if (vendas.length === 0) return;
    enfileirar({
      tipo: "delete",
      tabela: "EVENTO_VENDAS",
      chave: "cd_venda",
      valores: vendas.map((v) => v.id),
    });
    const lancadas = vendas.flatMap((v) => v.lancamentos ?? []);
    if (lancadas.length > 0) {
      enfileirar({
        tipo: "delete",
        tabela: "VENDAS",
        chave: "cd_venda",
        valores: lancadas,
      });
    }
    // cupons usados nessas vendas voltam a valer
    for (const v of vendas) if (v.cupom) marcarCupom(v.cupom.codigo, null);
  };

  const desfazerVenda = (id: string) => {
    const v = dia.vendas.find((x) => x.id === id);
    atualizarDia((d) => ({ ...d, vendas: d.vendas.filter((x) => x.id !== id) }));
    if (v) apagarNoBanco([v]);
  };

  const zerarDia = () => {
    if (
      !confirm(
        "Apagar todas as vendas e ajustes deste evento (aqui e no banco)? Isso não pode ser desfeito.",
      )
    )
      return;
    apagarNoBanco(dia.vendas);
    // os emails do sorteio são mantidos (são dados dos clientes)
    atualizarDia((d) => ({ ...diaVazio(), sorteios: d.sorteios }));
    limparCarrinho();
  };

  // --- Recuperar do banco (aparelho trocado ou navegador limpo) ---
  const recuperarDoBanco = async () => {
    if (!selecionado) return;
    setRecuperando(true);
    try {
      const { data: sessao } = await supabase.auth.getSession();
      if (!sessao.session) {
        mostrarAviso("Entre com seu login para buscar no banco.");
        return;
      }
      const [rv, rs] = await Promise.all([
        supabase.from("EVENTO_VENDAS").select("*").eq("cd_evento", selecionado),
        supabase.from("ROLETA_SORTEIOS").select("*").eq("cd_evento", selecionado),
      ]);
      if (rv.error || rs.error) {
        mostrarAviso(
          rv.error?.message.includes("permission") || rs.error?.message.includes("permission")
            ? "Entre com seu login para buscar no banco."
            : "Não foi possível falar com o banco.",
        );
        return;
      }
      const apagadas = exclusoesPendentes("EVENTO_VENDAS");
      const premios = new Map(
        (rs.data as LinhaSorteio[]).map((l) => [l.cd_cupom, l]),
      );
      const vendas: Venda[] = (rv.data ?? [])
        .filter((l) => !apagadas.has(l.cd_venda))
        .map((l) => {
          const p = l.cd_cupom ? premios.get(l.cd_cupom) : undefined;
          return {
            id: l.cd_venda,
            ts: l.ts_venda,
            itens: l.ds_itens,
            subtotal: Number(l.vl_subtotal),
            total: Number(l.vl_total),
            ...(Number(l.vl_acrescimo) > 0 ? { acrescimo: Number(l.vl_acrescimo) } : {}),
            pagamento: l.tp_pagamento as Pagamento,
            ...(l.vl_recebido != null ? { recebido: Number(l.vl_recebido) } : {}),
            ...(l.cd_cupom
              ? {
                  cupom: {
                    codigo: l.cd_cupom,
                    premio: p?.nm_premio ?? "",
                    beneficio: (p?.tp_beneficio as Beneficio) ?? "BRINDE",
                    desconto: Number(l.vl_desconto_cupom) || 0,
                  },
                }
              : {}),
            ...(l.ds_lancamentos ? { lancamentos: l.ds_lancamentos } : {}),
          };
        });
      const sorteios: Sorteio[] = (rs.data as LinhaSorteio[]).map((l) => ({
        id: l.cd_sorteio,
        vendaId: l.cd_venda ?? "",
        ts: l.ts_sorteio,
        email: l.ds_email,
        premio: l.nm_premio,
        ...(l.fl_vazio ? { vazio: true } : {}),
        ...(l.cd_cupom
          ? {
              cupom: l.cd_cupom,
              beneficio: (l.tp_beneficio as Beneficio) ?? undefined,
              valor: l.vl_beneficio != null ? Number(l.vl_beneficio) : undefined,
            }
          : {}),
        ...(l.ts_resgate
          ? { usadoTs: l.ts_resgate, usadoEm: l.cd_venda_resgate ?? "" }
          : {}),
      }));

      const idsV = new Set(dia.vendas.map((v) => v.id));
      const idsS = new Set((dia.sorteios ?? []).map((s) => s.id));
      const novasV = vendas.filter((v) => !idsV.has(v.id)).length;
      const novosS = sorteios.filter((s) => !idsS.has(s.id)).length;
      atualizarDia((d) => {
        const jaV = new Set(d.vendas.map((v) => v.id));
        const jaS = new Set((d.sorteios ?? []).map((s) => s.id));
        return {
          ...d,
          vendas: [...d.vendas, ...vendas.filter((v) => !jaV.has(v.id))].sort(
            (a, b) => b.ts.localeCompare(a.ts),
          ),
          sorteios: [
            ...(d.sorteios ?? []),
            ...sorteios.filter((s) => !jaS.has(s.id)),
          ].sort((a, b) => b.ts.localeCompare(a.ts)),
        };
      });
      mostrarAviso(
        novasV + novosS > 0
          ? `Recuperado: ${novasV} venda(s) e ${novosS} giro(s).`
          : "Este aparelho já tem tudo o que está no banco.",
      );
    } catch {
      mostrarAviso("Sem internet para buscar no banco.");
    } finally {
      setRecuperando(false);
    }
  };

  // --- Lançar as vendas no estoque (tabela VENDAS, por lote do sabor) ---
  const naoLancadas = dia.vendas.filter((v) => !v.lancamentos);
  const lancarNoEstoque = async () => {
    if (!selecionado || !plano || naoLancadas.length === 0) return;
    const unidades = naoLancadas.reduce(
      (a, v) => a + v.itens.reduce((x, i) => x + i.qtd, 0),
      0,
    );
    if (
      !confirm(
        `Lançar ${naoLancadas.length} venda(s) (${unidades} brownies) no estoque? Elas passam a contar no Início e nas Análises.`,
      )
    )
      return;
    setLancando(true);
    try {
      const sabores = [
        ...new Set(naoLancadas.flatMap((v) => v.itens.map((i) => parseKey(i.key).sabor))),
      ];
      const [rl, rv] = await Promise.all([
        supabase
          .from("LOTES")
          .select("cd_lote, tp_sabor, qt_produzida, ts_producao")
          .in("tp_sabor", sabores)
          .order("ts_producao", { ascending: true }),
        supabase.from("VENDAS").select("cd_lote").not("cd_lote", "is", null),
      ]);
      if (rl.error || rv.error) throw new Error(rl.error?.message ?? rv.error?.message);

      // quanto ainda resta em cada lote (produzido − já vendido)
      const vendidosLote: Record<string, number> = {};
      for (const v of rv.data ?? []) {
        vendidosLote[v.cd_lote] = (vendidosLote[v.cd_lote] ?? 0) + 1;
      }
      const lotes = (rl.data ?? []).map((l) => ({
        id: l.cd_lote as string,
        sabor: l.tp_sabor as string,
        resta: (l.qt_produzida as number) - (vendidosLote[l.cd_lote] ?? 0),
      }));
      const loteDe = (sabor: string) => {
        const doSabor = lotes.filter((l) => l.sabor === sabor);
        const l = doSabor.find((x) => x.resta > 0) ?? doSabor[doSabor.length - 1];
        if (l) l.resta -= 1;
        return l?.id ?? null;
      };

      const nome = plano.nomeEvento.replace(/ \((rascunho|do banco)\)$/, "");
      const porVenda = new Map<string, string[]>();
      const linhas: Record<string, unknown>[] = [];
      for (const v of [...naoLancadas].sort((a, b) => a.ts.localeCompare(b.ts))) {
        // o cupom reduz o preço de cada unidade na mesma proporção
        const fator = subtotalDe(v) > 0 ? v.total / subtotalDe(v) : 1;
        const ids: string[] = [];
        for (const it of v.itens) {
          for (let k = 0; k < it.qtd; k++) {
            const id = newId();
            ids.push(id);
            linhas.push({
              cd_venda: id,
              cd_lote: loteDe(parseKey(it.key).sabor),
              vl_preco_venda: Math.round(it.preco * fator * 100) / 100,
              nm_cliente: `Evento: ${nome}`,
              ts_venda: v.ts,
            });
          }
        }
        porVenda.set(v.id, ids);
      }
      const { error } = await supabase.from("VENDAS").insert(linhas);
      if (error) throw new Error(error.message);

      atualizarDia((d) => ({
        ...d,
        vendas: d.vendas.map((v) =>
          porVenda.has(v.id) ? { ...v, lancamentos: porVenda.get(v.id) } : v,
        ),
      }));
      for (const v of naoLancadas) {
        salvarVenda(selecionado, { ...v, lancamentos: porVenda.get(v.id) });
      }
      const semLote = linhas.filter((l) => !l.cd_lote).length;
      mostrarAviso(
        semLote > 0
          ? `Lançado! ${semLote} brownie(s) sem lote cadastrado do sabor.`
          : "Vendas lançadas no estoque!",
      );
    } catch (e) {
      alert(
        `Não foi possível lançar no estoque agora (precisa de internet).\n${
          e instanceof Error ? e.message : ""
        }`,
      );
    } finally {
      setLancando(false);
    }
  };

  // --- Ajuste de estoque ---
  const definirTotal = (key: string, valor: string) => {
    const it = itemPorKey.get(key);
    if (!it) return;
    const novo = Math.max(Math.floor(toNumber(valor)), 0);
    atualizarDia((d) => ({
      ...d,
      ajustes: { ...d.ajustes, [key]: novo - it.planejado },
    }));
  };

  const definirPreco = (key: string, valor: string) =>
    atualizarDia((d) => ({
      ...d,
      precoDia: { ...d.precoDia, [key]: valor.replace(/[^\d.,]/g, "") },
    }));

  const adicionarItem = () => {
    if (!novoItem) return;
    atualizarDia((d) => ({
      ...d,
      ajustes: { ...d.ajustes, [novoItem]: d.ajustes[novoItem] ?? 0 },
    }));
    setNovoItem("");
  };

  const opcoesNovoItem = useMemo(() => {
    const sabores = Object.keys(precoPadrao).filter(
      (s) => !s.startsWith("BASE"),
    );
    const existentes = new Set(itens.map((i) => i.key));
    const lista: { key: string; label: string }[] = [];
    for (const s of sabores) {
      for (const b of BASES) {
        const k = makeKey(s, b.id);
        if (!existentes.has(k)) {
          lista.push({ key: k, label: `${formatSabor(s)} · ${b.curto}` });
        }
      }
    }
    return lista.sort((a, b) => a.label.localeCompare(b.label));
  }, [precoPadrao, itens]);

  const itensVisiveis = itens.filter(
    (i) => filtro === "TODAS" || i.base === filtro,
  );

  // --- Sem planejamento ainda ---
  if (loaded && planos.length === 0) {
    return (
      <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800">
        <div className="max-w-2xl mx-auto p-8 text-center">
          <CalendarDays className="mx-auto text-[#7C3AED] mb-4" size={48} />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Dia do evento
          </h2>
          <p className="text-gray-500">
            Salve um orçamento na tela <b>Evento</b> (com a quantidade de cada
            sabor) e ele aparece aqui para você registrar as vendas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800 pb-28 lg:pb-10 select-none">
      <div className="max-w-[1600px] mx-auto w-full p-4 md:p-6 space-y-5">
        {/* Cabeçalho */}
        <header className="flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              Dia do evento
            </h2>
            <p className="text-sm text-gray-500">
              Toque no sabor para somar na comanda. O estoque baixa ao
              finalizar a venda.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusSync />
            <select
              value={selecionado ?? ""}
              onChange={(e) => {
                setSelecionado(e.target.value);
                limparCarrinho();
              }}
              className="px-4 py-3 rounded-xl bg-white border border-purple-100 text-sm font-semibold text-gray-800 max-w-[260px]"
            >
              {planos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nomeEvento}
                </option>
              ))}
            </select>
            <button
              onClick={() => setAjustando(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-purple-100 text-sm font-semibold text-[#6B21A8] hover:bg-purple-50 active:scale-95 transition"
            >
              <SlidersHorizontal size={18} /> Estoque e preços
            </button>
            <button
              onClick={() => setConfigRoleta(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-purple-100 text-sm font-semibold text-[#6B21A8] hover:bg-purple-50 active:scale-95 transition"
            >
              <Gift size={18} /> Roleta
              {!roleta.ativa && (
                <span className="text-[10px] font-bold uppercase text-gray-400">
                  off
                </span>
              )}
            </button>
            <button
              onClick={() => setRelatorio(true)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white border border-purple-100 text-sm font-semibold text-[#6B21A8] hover:bg-purple-50 active:scale-95 transition"
            >
              <BarChart3 size={18} /> Relatório
            </button>
            <button
              onClick={() => void telaCheia.alternar()}
              className="p-3 rounded-xl bg-white border border-purple-100 text-[#6B21A8] hover:bg-purple-50 active:scale-95 transition"
              title={telaCheia.cheia ? "Sair da tela cheia" : "Tela cheia (tablet)"}
              aria-label={telaCheia.cheia ? "Sair da tela cheia" : "Tela cheia"}
            >
              {telaCheia.cheia ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </header>

        {/* Números do dia */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-[#7C3AED] to-[#6B21A8] rounded-2xl p-4 text-white shadow-lg shadow-purple-500/20">
            <p className="text-xs uppercase tracking-wider text-purple-200 font-semibold">
              Vendido
            </p>
            <p className="text-2xl md:text-3xl font-bold mt-1">
              {money(resumo.bruto)}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-purple-100">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Unidades vendidas
            </p>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">
              {resumo.vendidas}
              <span className="text-base font-medium text-gray-400">
                {" "}
                / {resumo.total}
              </span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-purple-100">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              Restam
            </p>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">
              {resumo.restantes}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-purple-100">
            <p className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
              {resumo.pct > 0
                ? `${plano?.descontoDestino?.trim() || "Desconto"} (${resumo.pct}%)`
                : "Líquido"}
            </p>
            <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1">
              {resumo.pct > 0 ? money(resumo.desconto) : money(resumo.liquido)}
            </p>
            {resumo.pct > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                Fica com você: {money(resumo.liquido)}
              </p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* --- PRODUTOS --- */}
          <section className="lg:col-span-8 space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[{ id: "TODAS" as const, label: "Todas" }, ...BASES].map(
                (b) => (
                  <button
                    key={b.id}
                    onClick={() => setFiltro(b.id)}
                    className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                      filtro === b.id
                        ? "bg-[#7C3AED] text-white shadow-md shadow-purple-300"
                        : "bg-white text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {b.label}
                  </button>
                ),
              )}
            </div>

            {itensVisiveis.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 border border-purple-100">
                Nenhum item aqui. Use <b>Estoque e preços</b> para incluir
                sabores.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {itensVisiveis.map((it) => {
                  const noCarrinho = carrinho[it.key] ?? 0;
                  const livre = it.restante - noCarrinho;
                  const acabou = it.restante <= 0;
                  const pct =
                    it.total > 0 ? Math.min(it.vendido / it.total, 1) : 0;
                  return (
                    <button
                      key={it.key}
                      onClick={() => adicionar(it.key)}
                      disabled={acabou}
                      className={`relative text-left rounded-2xl p-4 min-h-[148px] flex flex-col justify-between border-2 transition-all active:scale-[0.97] ${
                        acabou
                          ? "bg-gray-100 border-transparent text-gray-400 cursor-not-allowed"
                          : noCarrinho > 0
                            ? "bg-purple-50 border-[#7C3AED] shadow-md"
                            : "bg-white border-transparent hover:border-purple-200 shadow-sm"
                      }`}
                    >
                      {noCarrinho > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-8 h-8 px-2 rounded-full bg-[#7C3AED] text-white text-sm font-bold flex items-center justify-center shadow-lg">
                          {noCarrinho}
                        </span>
                      )}
                      <div>
                        <span
                          className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                            acabou ? "bg-gray-200" : baseInfo(it.base).cor
                          }`}
                        >
                          {baseInfo(it.base).curto}
                        </span>
                        <p className="mt-1.5 text-lg font-bold leading-tight text-gray-900">
                          {formatSabor(it.sabor)}
                        </p>
                        <p className="text-sm font-semibold text-[#6B21A8]">
                          {it.preco > 0 ? money(it.preco) : "sem preço"}
                        </p>
                      </div>
                      <div>
                        <div className="flex items-end justify-between">
                          <span
                            className={`text-3xl font-extrabold leading-none ${
                              acabou
                                ? "text-gray-400"
                                : livre <= BAIXO
                                  ? "text-orange-500"
                                  : "text-gray-900"
                            }`}
                          >
                            {acabou ? "Esgotado" : livre}
                          </span>
                          {!acabou && (
                            <span className="text-xs text-gray-400">
                              restam
                            </span>
                          )}
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-[#7C3AED] transition-all"
                            style={{ width: `${pct * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* --- COMANDA --- */}
          <aside
            id="comanda"
            ref={comandaRef}
            className="lg:col-span-4 lg:sticky lg:top-24 self-start"
          >
            <div className="bg-white rounded-2xl shadow-sm border border-purple-100 overflow-hidden">
              <div className="p-5 flex items-center justify-between border-b border-gray-100">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <ShoppingBag className="text-[#7C3AED]" size={20} />
                  Comanda
                  {unidadesCarrinho > 0 && (
                    <span className="text-xs font-bold bg-purple-100 text-[#6B21A8] px-2 py-0.5 rounded-full">
                      {unidadesCarrinho}
                    </span>
                  )}
                </h3>
                {linhasCarrinho.length > 0 && (
                  <button
                    onClick={limparCarrinho}
                    className="text-sm text-gray-400 hover:text-red-600 px-2 py-1"
                  >
                    Limpar
                  </button>
                )}
              </div>

              <div className="p-3 max-h-[280px] overflow-y-auto space-y-1">
                {linhasCarrinho.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">
                    Toque nos sabores para montar a venda.
                  </p>
                )}
                {linhasCarrinho.map((l) => (
                  <div
                    key={l.key}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-purple-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {nomeItem(l.key)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {money(l.preco)} cada
                      </p>
                    </div>
                    <button
                      onClick={() => remover(l.key)}
                      className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:scale-90 transition"
                      aria-label="Tirar um"
                    >
                      <Minus size={18} />
                    </button>
                    <span className="w-6 text-center font-bold text-lg">
                      {l.qtd}
                    </span>
                    <button
                      onClick={() => adicionar(l.key)}
                      className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center text-[#6B21A8] active:scale-90 transition"
                      aria-label="Mais um"
                    >
                      <Plus size={18} />
                    </button>
                    <span className="w-20 text-right font-bold text-sm">
                      {money(l.qtd * l.preco)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-5 border-t border-gray-100 space-y-4">
                {/* Cupom da roleta */}
                {cupom ? (
                  <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm">
                    <div className="flex items-start gap-3">
                      <Ticket className="text-green-700 shrink-0 mt-0.5" size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-green-800">
                          {cupom.codigo} · {cupom.premio}
                        </p>
                        <p className="text-xs text-green-700 truncate">
                          {descreverBeneficio(cupom.beneficio, cupom.valor)} ·{" "}
                          {cupom.email}
                        </p>
                        {cupom.beneficio === "BROWNIE" && linhasCarrinho.length === 0 && (
                          <p className="text-xs text-green-700 mt-1">
                            Adicione o brownie na comanda: ele sai de graça.
                          </p>
                        )}
                        {cupom.beneficio === "BRINDE" && (
                          <button
                            onClick={entregarBrinde}
                            className="mt-2 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-bold active:scale-95"
                          >
                            Brinde entregue (sem compra)
                          </button>
                        )}
                      </div>
                      <button
                        onClick={limparCupom}
                        className="p-1.5 rounded-lg text-green-700 hover:bg-green-100"
                        aria-label="Tirar cupom"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                ) : cupomAberto ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={cupomTexto}
                        autoFocus
                        onChange={(e) => setCupomTexto(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void buscarCupom();
                        }}
                        placeholder="SAB-XXXX ou email do cliente"
                        className="flex-1 min-w-0 px-3 py-3 bg-gray-50 rounded-xl text-sm font-semibold uppercase placeholder:normal-case outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      />
                      <button
                        onClick={() => void buscarCupom()}
                        disabled={buscandoCupom || !cupomTexto.trim()}
                        className="px-4 rounded-xl bg-[#7C3AED] text-white text-sm font-bold disabled:opacity-40 flex items-center"
                      >
                        {buscandoCupom ? <Loader2 size={18} className="animate-spin" /> : "Aplicar"}
                      </button>
                      <button
                        onClick={limparCupom}
                        className="px-2 rounded-xl text-gray-400 hover:bg-gray-100"
                        aria-label="Cancelar cupom"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {cuponsAchados.length > 0 && (
                      <div className="rounded-xl border border-purple-100 divide-y divide-purple-50">
                        <p className="px-3 py-2 text-xs text-gray-500">
                          Cupons deste email. Qual usar?
                        </p>
                        {cuponsAchados.map((c) => (
                          <button
                            key={c.codigo}
                            onClick={() => usarCupomAchado(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-purple-50 text-sm"
                          >
                            <b>{c.codigo}</b> · {c.premio}
                            <span className="block text-xs text-gray-400">
                              {new Date(c.ts).toLocaleDateString("pt-BR")} ·{" "}
                              {descreverBeneficio(c.beneficio, c.valor)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => setCupomAberto(true)}
                    className="flex items-center gap-2 text-sm font-semibold text-[#6B21A8] hover:underline"
                  >
                    <Ticket size={16} /> Usar cupom da roleta
                  </button>
                )}

                {(taxaAtual !== "" || descontoCarrinho > 0) && subtotalCarrinho > 0 && (
                  <div className="rounded-xl bg-amber-50 text-amber-800 px-4 py-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="font-semibold">
                        {money(subtotalCarrinho)}
                      </span>
                    </div>
                    {descontoCarrinho > 0 && (
                      <div className="flex justify-between text-green-700">
                        <span>Cupom {cupom?.codigo}</span>
                        <span className="font-semibold">
                          − {money(descontoCarrinho)}
                        </span>
                      </div>
                    )}
                    {taxaAtual !== "" && (
                      <div className="flex justify-between">
                        <span>
                          Acréscimo do{" "}
                          {pagamento === "CREDITO" ? "crédito" : "débito"} (
                          {taxaAtual}%)
                        </span>
                        <span className="font-semibold">
                          + {money(acrescimoCarrinho)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-end justify-between">
                  <span className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                    {taxaAtual !== "" ? "Cobrar" : "Total"}
                  </span>
                  <span className="text-4xl font-extrabold text-[#6B21A8]">
                    {money(totalCobrar)}
                  </span>
                </div>
                {roleta.ativa && totalCarrinho > 0 && (
                  <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 bg-amber-50 rounded-xl px-4 py-2.5">
                    <Gift size={16} />
                    Esta compra dá {girosPara(totalCarrinho, roleta)}{" "}
                    {girosPara(totalCarrinho, roleta) === 1 ? "giro" : "giros"}{" "}
                    na roleta
                  </p>
                )}

                <div className="grid grid-cols-4 gap-2">
                  {PAGAMENTOS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPagamento(p.id)}
                      className={`py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all active:scale-95 ${
                        pagamento === p.id
                          ? "bg-[#7C3AED] text-white shadow-md shadow-purple-300"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      <p.icon size={20} />
                      {p.label}
                    </button>
                  ))}
                </div>

                {pagamento === "DINHEIRO" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={recebido}
                          onChange={(e) =>
                            setRecebido(e.target.value.replace(/[^\d.,]/g, ""))
                          }
                          placeholder="Valor recebido"
                          className="w-full pl-10 pr-3 py-3 bg-gray-50 rounded-xl text-lg font-bold outline-none focus:ring-2 focus:ring-[#7C3AED]"
                        />
                      </div>
                      <button
                        onClick={() =>
                          setRecebido(
                            String(totalCarrinho.toFixed(2)).replace(".", ","),
                          )
                        }
                        disabled={totalCarrinho <= 0}
                        className="px-4 py-3 rounded-xl bg-gray-100 text-sm font-semibold text-gray-600 disabled:opacity-40 active:scale-95"
                      >
                        Exato
                      </button>
                    </div>
                    <div className="flex gap-2">
                      {NOTAS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setRecebido(String(n))}
                          className="flex-1 py-2.5 rounded-xl bg-purple-50 text-[#6B21A8] text-sm font-bold active:scale-95"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {recebido !== "" && totalCarrinho > 0 && (
                      <div
                        className={`rounded-xl px-4 py-3 flex items-center justify-between ${
                          troco < -0.005
                            ? "bg-red-50 text-red-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        <span className="text-sm font-semibold">
                          {troco < -0.005 ? "Falta" : "Troco"}
                        </span>
                        <span className="text-2xl font-extrabold">
                          {money(Math.abs(troco))}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {pagamento === "PIX" && totalCarrinho > 0 && (
                  pixConfigurado(pix) ? (
                    <button
                      onClick={() => setPixAberto(true)}
                      className="w-full py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition"
                    >
                      <QrCode size={20} /> Mostrar QR do Pix
                    </button>
                  ) : (
                    <button
                      onClick={() => setAjustando(true)}
                      className="w-full text-xs text-teal-700 bg-teal-50 rounded-xl px-4 py-2.5 text-left"
                    >
                      Cadastre sua chave Pix em <b>Estoque e preços</b> para
                      mostrar o QR com o valor da compra.
                    </button>
                  )
                )}

                <button
                  onClick={finalizar}
                  disabled={linhasCarrinho.length === 0 || faltaReceber}
                  className={`w-full py-4 rounded-2xl text-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                    vendaOk
                      ? "bg-green-600 text-white"
                      : "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30"
                  }`}
                >
                  <Check size={22} />
                  {vendaOk ? "Venda registrada!" : "Finalizar venda"}
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* --- RESUMO E HISTÓRICO --- */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-purple-100">
            <div className="p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold">Por sabor</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-gray-400 text-left">
                    <th className="px-5 py-3 font-semibold">Item</th>
                    <th className="px-3 py-3 font-semibold text-right">
                      Vendido
                    </th>
                    <th className="px-3 py-3 font-semibold text-right">
                      Restam
                    </th>
                    <th className="px-5 py-3 font-semibold text-right">
                      Receita
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((i) => (
                    <tr key={i.key} className="border-t border-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {nomeItem(i.key)}
                      </td>
                      <td className="px-3 py-3 text-right">{i.vendido}</td>
                      <td
                        className={`px-3 py-3 text-right ${
                          i.restante <= BAIXO ? "text-orange-500 font-bold" : ""
                        }`}
                      >
                        {i.restante}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold">
                        {money(
                          dia.vendas.reduce(
                            (acc, v) =>
                              acc +
                              v.itens
                                .filter((x) => x.key === i.key)
                                .reduce((a, x) => a + x.qtd * x.preco, 0),
                            0,
                          ),
                        )}
                      </td>
                    </tr>
                  ))}
                  {itens.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-5 py-8 text-center text-gray-400"
                      >
                        Nada para mostrar ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-5 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              {PAGAMENTOS.map((p) => (
                <div key={p.id} className="bg-gray-50 rounded-xl py-3">
                  <p className="text-xs text-gray-400 flex items-center justify-center gap-1">
                    <p.icon size={14} /> {p.label}
                  </p>
                  <p className="font-bold text-gray-900">
                    {money(resumo.porPagamento[p.id] ?? 0)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-purple-100">
            <div className="p-5 border-b border-gray-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">
                  Vendas ({dia.vendas.length})
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => void recuperarDoBanco()}
                    disabled={recuperando}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#6B21A8] disabled:opacity-40"
                    title="Traz as vendas e os giros salvos no banco (outro aparelho ou navegador limpo)"
                  >
                    {recuperando ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CloudDownload size={14} />
                    )}
                    Recuperar do banco
                  </button>
                  {dia.vendas.length > 0 && (
                    <button
                      onClick={zerarDia}
                      className="text-xs text-gray-400 hover:text-red-600"
                    >
                      Zerar dia
                    </button>
                  )}
                </div>
              </div>
              {dia.vendas.length > 0 &&
                (naoLancadas.length > 0 ? (
                  <button
                    onClick={() => void lancarNoEstoque()}
                    disabled={lancando}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-50 text-[#6B21A8] text-sm font-semibold hover:bg-purple-100 disabled:opacity-50 active:scale-95"
                  >
                    {lancando ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <PackageCheck size={16} />
                    )}
                    Fechar o dia: lançar {naoLancadas.length}{" "}
                    {naoLancadas.length === 1 ? "venda" : "vendas"} no estoque
                  </button>
                ) : (
                  <p className="flex items-center justify-center gap-2 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-semibold">
                    <PackageCheck size={14} /> Todas as vendas já estão no
                    estoque
                  </p>
                ))}
            </div>
            <div className="p-2 max-h-[420px] overflow-y-auto space-y-1">
              {dia.vendas.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">
                  Nenhuma venda registrada.
                </p>
              )}
              {dia.vendas.map((v, idx) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-purple-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {v.itens
                        .map((i) => `${i.qtd}× ${nomeItem(i.key)}`)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-gray-400">
                      #{dia.vendas.length - idx} · {horaCurta(v.ts)} ·{" "}
                      {rotuloPagamento(v.pagamento)}
                      {v.acrescimo
                        ? ` · +${money(v.acrescimo)} de acréscimo`
                        : ""}
                      {v.recebido
                        ? ` · troco ${money(v.recebido - v.total)}`
                        : ""}
                      {v.cupom
                        ? ` · cupom ${v.cupom.codigo}${
                            v.cupom.desconto > 0
                              ? ` (−${money(v.cupom.desconto)})`
                              : ""
                          }`
                        : ""}
                      {v.lancamentos ? " · no estoque" : ""}
                    </p>
                  </div>
                  <span className="font-bold text-[#6B21A8]">
                    {money(v.total + (v.acrescimo ?? 0))}
                  </span>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          v.lancamentos
                            ? "Desfazer esta venda? Ela já foi lançada no estoque e será apagada de lá também."
                            : "Desfazer esta venda e devolver ao estoque?",
                        )
                      )
                        desfazerVenda(v.id);
                    }}
                    className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Desfazer venda"
                  >
                    {idx === 0 ? <Undo2 size={18} /> : <Trash2 size={18} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Emails do sorteio */}
          <div className="lg:col-span-12 bg-white rounded-2xl shadow-sm border border-purple-100">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Gift className="text-[#7C3AED]" size={20} />
                Sorteio ({(dia.sorteios ?? []).length})
              </h3>
              <button
                onClick={baixarEmails}
                disabled={(dia.sorteios ?? []).length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 text-[#6B21A8] text-sm font-semibold disabled:opacity-40 active:scale-95"
              >
                <Download size={16} /> Baixar emails (CSV)
              </button>
            </div>
            <div className="p-2 max-h-[320px] overflow-y-auto">
              {(dia.sorteios ?? []).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">
                  Ninguém participou do sorteio ainda.
                </p>
              )}
              {(dia.sorteios ?? []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-purple-50 text-sm"
                >
                  <span className="text-xs text-gray-400 w-12">
                    {horaCurta(s.ts)}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-medium">
                    {s.email}
                  </span>
                  <span
                    className={`font-semibold ${s.vazio ? "text-gray-400" : "text-[#6B21A8]"}`}
                  >
                    {s.premio}
                  </span>
                  {s.cupom && (
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-lg ${
                        s.usadoEm
                          ? "bg-gray-100 text-gray-400 line-through"
                          : "bg-green-100 text-green-700"
                      }`}
                      title={s.usadoEm ? "Cupom já usado" : "Cupom disponível"}
                    >
                      {s.cupom}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Barra fixa em tablet/celular (fica no fim do conteúdo) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-purple-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-gray-400">
            {unidadesCarrinho} {unidadesCarrinho === 1 ? "item" : "itens"}
          </p>
          <p className="text-2xl font-extrabold text-[#6B21A8] leading-none">
            {money(totalCobrar)}
          </p>
        </div>
        <button
          onClick={() =>
            comandaRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            })
          }
          className="px-6 py-3.5 rounded-xl bg-[#7C3AED] text-white font-bold active:scale-95"
        >
          Ver comanda
        </button>
      </div>

      {/* --- SORTEIO (tela cheia, depois de cada compra) --- */}
      {sorteio && (
        <div className="fixed inset-0 z-[90] bg-gradient-to-br from-[#6B21A8] via-[#7C3AED] to-[#9333EA] text-white flex flex-col items-center justify-center p-6 overflow-y-auto">
          {sorteio.etapa !== "resultado" && !sorteio.girando && (
            <button
              onClick={() => setSorteio(null)}
              className="absolute top-5 right-5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-semibold"
            >
              Pular sorteio
            </button>
          )}

          {sorteio.etapa === "email" && (
            <div className="w-full max-w-md text-center space-y-6">
              <Gift className="mx-auto" size={56} />
              <div>
                <h2 className="text-3xl font-extrabold">Compra feita!</h2>
                <p className="mt-2 text-purple-100 text-lg">
                  Cadastre seu email e gire a roleta para concorrer a prêmios.
                </p>
                <p className="mt-3 inline-block bg-amber-400 text-purple-950 font-extrabold px-5 py-2 rounded-full">
                  Você ganhou {sorteio.giros}{" "}
                  {sorteio.giros === 1 ? "giro" : "giros"}!
                </p>
              </div>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  size={22}
                />
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoFocus
                  value={sorteio.email}
                  onChange={(e) =>
                    setSorteio({ ...sorteio, email: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmarEmail();
                  }}
                  placeholder="seuemail@exemplo.com"
                  className="w-full pl-12 pr-4 py-4 rounded-2xl text-gray-900 text-lg outline-none focus:ring-4 focus:ring-white/40"
                />
              </div>
              <label className="flex items-start gap-3 text-left text-sm text-purple-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sorteio.aceite}
                  onChange={(e) =>
                    setSorteio({ ...sorteio, aceite: e.target.checked })
                  }
                  className="mt-0.5 w-6 h-6 shrink-0 accent-amber-400"
                />
                <span>
                  Aceito receber contato da Saboor Brownie neste email e
                  participar do sorteio.
                </span>
              </label>
              <button
                onClick={confirmarEmail}
                className="w-full py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xl font-extrabold active:scale-95 transition shadow-xl"
              >
                Ir para a roleta
              </button>
            </div>
          )}

          {sorteio.etapa !== "email" && (
            <div className="w-full max-w-lg text-center space-y-6">
              <h2 className="text-3xl font-extrabold">
                {sorteio.etapa === "resultado"
                  ? premioVazio
                    ? "Não foi dessa vez!"
                    : `Você ganhou: ${sorteio.premio}!`
                  : sorteio.giros > 1
                    ? `Gire a roleta! (giro ${sorteio.feitos + 1} de ${sorteio.giros})`
                    : "Gire a roleta!"}
              </h2>

              <RoletaWheel
                fatias={fatias}
                rotacao={sorteio.rotacao}
                girando={sorteio.girando}
                destacar={sorteio.etapa === "resultado"}
              />

              {sorteio.etapa === "roleta" && (
                <button
                  onClick={girar}
                  disabled={sorteio.girando}
                  className="w-full max-w-sm py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-2xl font-extrabold active:scale-95 transition shadow-xl disabled:opacity-60"
                >
                  {sorteio.girando ? "Girando..." : "GIRAR"}
                </button>
              )}

              {sorteio.etapa === "resultado" && (
                <div className="space-y-4">
                  <p className="text-purple-100">
                    {premioVazio
                      ? girosRestantes > 0
                        ? "Mas você ainda tem giros!"
                        : "Obrigado por participar! Na próxima compra você gira de novo."
                      : "Parabéns!"}{" "}
                    Registramos o email {sorteio.email.trim()}.
                  </p>
                  {!premioVazio && sorteio.cupom && (
                    <div className="mx-auto max-w-sm rounded-2xl bg-white text-[#3B0764] px-5 py-4 shadow-xl">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#7C3AED]">
                        Seu código do prêmio
                      </p>
                      <p className="text-4xl font-black tracking-wider my-1">
                        {sorteio.cupom}
                      </p>
                      <p className="text-sm text-gray-600">
                        Tire um print e mostre no caixa. Se perder, é só
                        informar seu email.
                      </p>
                    </div>
                  )}
                  <SigaInstagram instagram={roleta.instagram} grande />
                  {girosRestantes > 0 && fatias.length > 0 ? (
                    <>
                      <button
                        onClick={novoGiro}
                        className="w-full max-w-sm py-4 rounded-2xl bg-amber-400 hover:bg-amber-300 text-purple-950 text-xl font-extrabold active:scale-95 transition shadow-xl"
                      >
                        Girar de novo ({girosRestantes}{" "}
                        {girosRestantes === 1 ? "restante" : "restantes"})
                      </button>
                      <button
                        onClick={() => setSorteio(null)}
                        className="block mx-auto text-sm text-purple-200 underline py-2"
                      >
                        Parar por aqui
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setSorteio(null)}
                      className="w-full max-w-sm py-4 rounded-2xl bg-white text-[#6B21A8] text-xl font-extrabold active:scale-95 transition shadow-xl"
                    >
                      Concluir
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- CONFIGURAÇÃO DA ROLETA --- */}
      {configRoleta && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={() => setConfigRoleta(false)}
        >
          <div
            className="bg-white w-full md:max-w-2xl max-h-[90vh] rounded-t-3xl md:rounded-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 flex items-center justify-between border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold">Roleta do sorteio</h3>
                <p className="text-xs text-gray-500">
                  Aparece depois de cada venda. A chance de cada prêmio é o
                  peso dele dividido pela soma dos pesos.
                </p>
              </div>
              <button
                onClick={() => setConfigRoleta(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4">
              <label className="flex items-center justify-between gap-3 p-4 rounded-xl bg-purple-50 cursor-pointer">
                <span className="font-semibold text-sm">
                  Mostrar o sorteio depois de cada compra
                </span>
                <input
                  type="checkbox"
                  checked={roleta.ativa}
                  onChange={(e) =>
                    setRoleta((r) => ({ ...r, ativa: e.target.checked }))
                  }
                  className="w-6 h-6 accent-[#7C3AED]"
                />
              </label>

              <div className="rounded-xl bg-purple-50 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Instagram</p>
                  <p className="text-xs text-gray-500">
                    Aparece em todos os resultados, junto com o QR code:
                    &quot;Nos siga no Instagram&quot;.
                  </p>
                </div>
                <input
                  value={roleta.instagram ?? ""}
                  onChange={(e) =>
                    setRoleta((r) => ({ ...r, instagram: e.target.value }))
                  }
                  placeholder="@saboorbrownie"
                  className="w-40 shrink-0 px-3 py-2.5 bg-white rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-[#7C3AED]"
                />
              </div>

              {/* Giros por valor da compra */}
              <div className="rounded-xl bg-amber-50 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Giros por valor da compra
                  </p>
                  <p className="text-xs text-amber-700">
                    Quanto maior a compra, mais giros ({MIN_GIROS} a{" "}
                    {MAX_GIROS}). Vale a maior faixa atingida; abaixo de todas
                    as faixas o cliente tem {MIN_GIROS} giro. O valor é o dos
                    produtos, sem o acréscimo do cartão.
                  </p>
                </div>
                {faixasDe(roleta).map((f) => (
                  <div key={f.id} className="flex items-center gap-2">
                    <span className="text-sm text-amber-900 w-20 shrink-0">
                      A partir de
                    </span>
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        R$
                      </span>
                      <input
                        value={f.minimo}
                        inputMode="decimal"
                        onChange={(e) =>
                          atualizarFaixa(f.id, {
                            minimo: e.target.value.replace(/[^\d.,]/g, ""),
                          })
                        }
                        className="w-full pl-9 pr-3 py-2.5 bg-white rounded-lg text-right font-bold outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                    <select
                      value={f.giros}
                      onChange={(e) =>
                        atualizarFaixa(f.id, { giros: e.target.value })
                      }
                      className="px-3 py-2.5 bg-white rounded-lg font-bold text-sm"
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={String(n)}>
                          {n} {n === 1 ? "giro" : "giros"}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() =>
                        setRoleta((r) => ({
                          ...r,
                          faixas: faixasDe(r).filter((x) => x.id !== f.id),
                        }))
                      }
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                      aria-label="Remover faixa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setRoleta((r) => ({
                      ...r,
                      faixas: [
                        ...faixasDe(r),
                        { id: newId(), minimo: "", giros: "1" },
                      ],
                    }))
                  }
                  className="w-full py-2.5 rounded-lg border-2 border-dashed border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-100"
                >
                  + Adicionar faixa
                </button>
              </div>

              <div className="rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm flex items-center justify-between">
                <span>Chance de ganhar algo</span>
                <span className="font-extrabold text-lg">
                  {chanceGanhar.toFixed(0)}%
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 px-1 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                <div className="col-span-4">Prêmio</div>
                <div className="col-span-2 text-right">Peso</div>
                <div className="col-span-2 text-right">Chance</div>
                <div className="col-span-2 text-right">Limite</div>
                <div className="col-span-1 text-center" title="Fatia sem prêmio">
                  Vazio
                </div>
                <div className="col-span-1" />
              </div>
              {roleta.premios.map((p) => {
                const soma = roleta.premios.reduce(
                  (a, x) => a + Math.max(toNumber(x.peso), 0),
                  0,
                );
                const chance =
                  soma > 0 ? (Math.max(toNumber(p.peso), 0) / soma) * 100 : 0;
                const ganhos = ganhosPorPremio[p.nome.trim()] ?? 0;
                const ben = beneficioDe(p);
                return (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-center">
                    {!p.vazio && (
                      <div className="col-span-12 order-last flex items-center gap-2 -mt-1 mb-2 pl-1">
                        <span className="text-[11px] text-gray-400 shrink-0">
                          No caixa vale:
                        </span>
                        <select
                          value={ben.beneficio}
                          onChange={(e) =>
                            atualizarPremio(p.id, {
                              beneficio: e.target.value as Beneficio,
                              valor: p.valor ?? String(ben.valor || ""),
                            })
                          }
                          className="px-2 py-1.5 bg-gray-50 rounded-lg text-xs font-semibold"
                        >
                          {BENEFICIOS.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                        {(ben.beneficio === "PERCENT" || ben.beneficio === "VALOR") && (
                          <input
                            value={p.valor ?? String(ben.valor || "")}
                            inputMode="decimal"
                            onChange={(e) =>
                              atualizarPremio(p.id, {
                                beneficio: ben.beneficio,
                                valor: e.target.value.replace(/[^\d.,]/g, ""),
                              })
                            }
                            placeholder={ben.beneficio === "PERCENT" ? "%" : "R$"}
                            className="w-20 px-2 py-1.5 bg-gray-50 rounded-lg text-xs text-right font-semibold outline-none focus:ring-2 focus:ring-[#7C3AED]"
                          />
                        )}
                        <span className="text-[11px] text-gray-400 truncate">
                          {descreverBeneficio(ben.beneficio, ben.valor)}
                        </span>
                      </div>
                    )}
                    <div className="col-span-4">
                      <input
                        value={p.nome}
                        onChange={(e) =>
                          atualizarPremio(p.id, { nome: e.target.value })
                        }
                        placeholder="Nome do prêmio"
                        className="w-full px-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                      />
                      {ganhos > 0 && (
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {ganhos} já sorteado(s) neste evento
                        </p>
                      )}
                    </div>
                    <input
                      value={p.peso}
                      inputMode="decimal"
                      onChange={(e) =>
                        atualizarPremio(p.id, {
                          peso: e.target.value.replace(/[^\d.,]/g, ""),
                        })
                      }
                      className="col-span-2 px-2 py-2.5 bg-gray-50 rounded-lg text-right text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                    />
                    <div className="col-span-2 text-right text-sm font-semibold text-[#6B21A8]">
                      {chance.toFixed(0)}%
                    </div>
                    <input
                      value={p.limite}
                      inputMode="numeric"
                      placeholder="∞"
                      onChange={(e) =>
                        atualizarPremio(p.id, {
                          limite: e.target.value.replace(/[^\d]/g, ""),
                        })
                      }
                      className="col-span-2 px-2 py-2.5 bg-gray-50 rounded-lg text-right text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]"
                    />
                    <input
                      type="checkbox"
                      checked={p.vazio === true}
                      onChange={(e) =>
                        atualizarPremio(p.id, { vazio: e.target.checked })
                      }
                      className="col-span-1 justify-self-center w-5 h-5 accent-[#7C3AED]"
                      aria-label="Fatia sem prêmio"
                    />
                    <button
                      onClick={() =>
                        setRoleta((r) => ({
                          ...r,
                          premios: r.premios.filter((x) => x.id !== p.id),
                        }))
                      }
                      className="col-span-1 p-2 text-gray-400 hover:text-red-600 rounded-lg"
                      aria-label="Remover prêmio"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() =>
                  setRoleta((r) => ({
                    ...r,
                    premios: [
                      ...r.premios,
                      { id: newId(), nome: "", peso: "1", limite: "" },
                    ],
                  }))
                }
                className="w-full py-3 rounded-xl border-2 border-dashed border-purple-200 text-[#6B21A8] text-sm font-semibold hover:bg-purple-50"
              >
                + Adicionar prêmio
              </button>
              <p className="text-xs text-gray-400">
                Limite: quantas vezes o prêmio pode sair neste evento (vazio =
                sem limite). Quando acaba, ele sai da roleta sozinho. Marque
                &quot;Vazio&quot; nas fatias que não dão prêmio. Para baixar a chance de
                ganhar, aumente o peso das fatias vazias. Cada prêmio gera um
                código (SAB-XXXX) que o cliente usa no caixa uma única vez; o
                &quot;No caixa vale&quot; define o desconto aplicado.
              </p>
            </div>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setConfigRoleta(false)}
                className="w-full py-3.5 rounded-xl bg-[#7C3AED] text-white font-bold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pix com QR e valor */}
      {pixAberto && pixConfigurado(pix) && (
        <PixModal
          pix={pix}
          valor={totalCobrar}
          onFechar={() => setPixAberto(false)}
          onPago={finalizar}
        />
      )}

      {/* Relatório do evento */}
      {relatorio && plano && (
        <RelatorioEvento
          plano={plano}
          dia={dia}
          itens={itens}
          taxaCredito={taxaCredito}
          taxaDebito={taxaDebito}
          onFechar={() => setRelatorio(false)}
        />
      )}

      {/* Aviso rápido */}
      {aviso && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {aviso}
        </div>
      )}

      {/* --- AJUSTE DE ESTOQUE E PREÇOS --- */}
      {ajustando && (
        <div
          className="fixed inset-0 z-[70] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-6"
          onClick={() => setAjustando(false)}
        >
          <div
            className="bg-white w-full md:max-w-2xl max-h-[90vh] rounded-t-3xl md:rounded-3xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 flex items-center justify-between border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold">Estoque e preços do dia</h3>
                <p className="text-xs text-gray-500">
                  Mude o total que você vai vender ou o preço de hoje. O
                  orçamento original não é alterado.
                </p>
              </div>
              <button
                onClick={() => setAjustando(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            </div>

            <div className="overflow-y-auto p-3">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                <div className="col-span-5">Item</div>
                <div className="col-span-2 text-right">Planejado</div>
                <div className="col-span-3 text-right">Total hoje</div>
                <div className="col-span-2 text-right">Preço</div>
              </div>
              {itens.map((i) => (
                <div
                  key={i.key}
                  className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-xl hover:bg-purple-50"
                >
                  <div className="col-span-5 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {nomeItem(i.key)}
                    </p>
                    <p className="text-xs text-gray-400">
                      vendidos: {i.vendido}
                    </p>
                  </div>
                  <div className="col-span-2 text-right text-sm text-gray-500">
                    {i.planejado}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={String(i.total)}
                    onChange={(e) => definirTotal(i.key, e.target.value)}
                    className="col-span-3 px-3 py-2.5 bg-gray-50 rounded-lg text-right font-bold outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={dia.precoDia[i.key] ?? ""}
                    onChange={(e) => definirPreco(i.key, e.target.value)}
                    placeholder={String(i.preco).replace(".", ",")}
                    className="col-span-2 px-2 py-2.5 bg-gray-50 rounded-lg text-right outline-none focus:ring-2 focus:ring-[#7C3AED]"
                  />
                </div>
              ))}

              <div className="mt-4 mx-3 p-4 rounded-xl bg-amber-50 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    Acréscimo no cartão
                  </p>
                  <p className="text-xs text-amber-700">
                    Somado ao total quando o pagamento é no cartão. Pix e
                    dinheiro não têm acréscimo.
                  </p>
                </div>
                {[
                  {
                    label: "Crédito",
                    valor: taxaCredito,
                    set: setTaxaCredito,
                  },
                  { label: "Débito", valor: taxaDebito, set: setTaxaDebito },
                ].map((t) => (
                  <div
                    key={t.label}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm font-medium text-amber-900">
                      {t.label}
                    </span>
                    <div className="relative shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={t.valor}
                        onChange={(e) =>
                          t.set(e.target.value.replace(/[^\d.,]/g, ""))
                        }
                        className="w-24 pr-7 pl-3 py-2.5 bg-white rounded-lg text-right font-bold outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 mx-3 p-4 rounded-xl bg-teal-50 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-teal-900 flex items-center gap-2">
                    <QrCode size={16} /> Pix
                  </p>
                  <p className="text-xs text-teal-700">
                    Com a chave cadastrada, o Pix mostra um QR já com o valor da
                    compra para o cliente pagar.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={pix.tipo ?? "TELEFONE"}
                    onChange={(e) =>
                      setPix((p) => ({ ...p, tipo: e.target.value as TipoChave }))
                    }
                    className="col-span-1 px-2 py-2.5 bg-white rounded-lg text-sm font-semibold"
                  >
                    {TIPOS_CHAVE.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={pix.chave}
                    onChange={(e) => setPix((p) => ({ ...p, chave: e.target.value }))}
                    placeholder={
                      pix.tipo === "EMAIL"
                        ? "email@exemplo.com"
                        : pix.tipo === "TELEFONE"
                          ? "(11) 99999-9999"
                          : "Chave Pix"
                    }
                    className="col-span-2 px-3 py-2.5 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    value={pix.nome}
                    onChange={(e) => setPix((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Nome de quem recebe"
                    className="col-span-2 px-3 py-2.5 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <input
                    value={pix.cidade}
                    onChange={(e) => setPix((p) => ({ ...p, cidade: e.target.value }))}
                    placeholder="Cidade"
                    className="col-span-1 px-3 py-2.5 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <p className="text-[11px] text-teal-700">
                  Faça um Pix de teste de R$ 0,01 para conferir se cai na sua
                  conta antes do evento.
                </p>
              </div>

              <div className="mt-4 mx-3 p-4 rounded-xl bg-purple-50 flex gap-2">
                <select
                  value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-white text-sm"
                >
                  <option value="">Incluir outro sabor/massa...</option>
                  {opcoesNovoItem.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={adicionarItem}
                  disabled={!novoItem}
                  className="px-4 rounded-lg bg-[#7C3AED] text-white font-semibold disabled:opacity-40"
                >
                  Incluir
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setAjustando(false)}
                className="w-full py-3.5 rounded-xl bg-[#7C3AED] text-white font-bold"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
