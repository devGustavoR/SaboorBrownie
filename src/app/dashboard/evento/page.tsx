"use client";

import { StatusSync } from "@/components/dia-evento/StatusSync";
import { uuid } from "@/lib/diaEvento";
import { supabase } from "@/lib/supabase";
import { enfileirar, exclusoesPendentes } from "@/lib/sync";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  FilePlus2,
  FolderOpen,
  Pencil,
  Receipt,
  Save,
  Store,
  Trash2,
  Wallet,
} from "lucide-react";
import Link from "next/link";
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
  // preço de venda por brownie neste evento (vazio = usa o da tabela de preços)
  valoresVenda?: Record<string, string>;
  // % da receita repassado (ex: 10% para a igreja) e para quem vai
  descontoPct?: string;
  descontoDestino?: string;
}

interface SavedBudget {
  id: string;
  nomeEvento: string;
  qtdSabores: Record<string, string>;
  precos: Record<string, Preco>;
  valoresVenda?: Record<string, string>;
  descontoPct?: string;
  descontoDestino?: string;
  totalBrownies: number;
  total: number;
  salvoEm: string;
  // orçamento do formato antigo (lista livre de itens): só consulta
  legado?: LegacyItem[];
}

interface LegacyItem {
  nome: string;
  qtd: string;
  unidade: string;
  preco: string;
}

// tp_sabor da receita da massa, compartilhada por todos os sabores
const BASE = "BASE";
const BASE_CAKE = "BASE_CAKE";
const BASE_BOMBOM = "BASE_BOMBOM";

// Massas disponíveis: cada recheio (sabor) pode ser feito em qualquer uma.
// A quantidade do brownie fica na chave do sabor (compatível com orçamentos
// antigos); as demais ficam em "SABOR:CAKE", "SABOR:BOMBOM".
type BaseId = "BROWNIE" | "CAKE" | "BOMBOM";
const BASES: { id: BaseId; ficha: string; label: string; curto: string }[] = [
  { id: "BROWNIE", ficha: BASE, label: "Brownie", curto: "Brownie" },
  { id: "CAKE", ficha: BASE_CAKE, label: "Cake Brownie", curto: "Cake" },
  { id: "BOMBOM", ficha: BASE_BOMBOM, label: "Bombom Brownie", curto: "Bombom" },
];
const chave = (sabor: string, base: BaseId) =>
  base === "BROWNIE" ? sabor : `${sabor}:${base}`;
const baseDe = (id: BaseId) => BASES.find((b) => b.id === id)!;

const DRAFT_KEY = "saboor:preparo-evento-v2";
const BUDGETS_KEY = "saboor:orcamentos-evento-v2";
const OLD_BUDGETS_KEY = "saboor:orcamentos-evento"; // formato antes da ficha técnica

interface OldBudget {
  id?: string;
  nomeEvento?: string;
  unidadesProduzir?: string;
  itens?: Partial<LegacyItem>[];
  total?: number;
  salvoEm?: string;
}

// Converte os orçamentos do formato antigo; a chave antiga não é apagada.
const importOldBudgets = (current: SavedBudget[]): SavedBudget[] => {
  const old = readJSON<OldBudget[]>(OLD_BUDGETS_KEY, []);
  if (!Array.isArray(old)) return current;
  const ids = new Set(current.map((b) => b.id));
  const converted: SavedBudget[] = [];
  for (const o of old) {
    const id = o.id ? `old-${o.id}` : newId();
    if (ids.has(id)) continue;
    converted.push({
      id,
      nomeEvento: o.nomeEvento || "Evento sem nome",
      qtdSabores: {},
      precos: {},
      totalBrownies: Number(o.unidadesProduzir) || 0,
      total: Number(o.total) || 0,
      salvoEm: o.salvoEm ?? new Date().toISOString(),
      legado: (o.itens ?? []).map((i) => ({
        nome: i.nome ?? "",
        qtd: String(i.qtd ?? ""),
        unidade: i.unidade ?? "un",
        preco: String(i.preco ?? ""),
      })),
    });
  }
  return converted.length ? [...current, ...converted] : current;
};

const newId = uuid;

// Orçamentos também ficam no banco (para não depender de um só navegador)
const salvarNoBanco = (b: SavedBudget) =>
  enfileirar({
    tipo: "upsert",
    tabela: "ORCAMENTOS",
    chave: "cd_orcamento",
    linha: {
      cd_orcamento: b.id,
      nm_evento: b.nomeEvento,
      ds_dados: b,
      ts_salvo: b.salvoEm,
      ts_atualizacao: new Date().toISOString(),
    },
  });

const apagarNoBanco = (id: string) =>
  enfileirar({
    tipo: "delete",
    tabela: "ORCAMENTOS",
    chave: "cd_orcamento",
    valores: [id],
  });

// Junta os orçamentos do navegador com os do banco (vale o salvo por último)
const juntar = (
  locais: SavedBudget[],
  remotos: SavedBudget[],
): SavedBudget[] => {
  const m = new Map(locais.map((b) => [b.id, b]));
  for (const r of remotos) {
    const l = m.get(r.id);
    if (!l || r.salvoEm > l.salvoEm) m.set(r.id, r);
  }
  return [...m.values()].sort((a, b) => b.salvoEm.localeCompare(a.salvoEm));
};

// Comparação sem campos vazios e sem depender da ordem das chaves
const ordenado = <T,>(o: Record<string, T>, vazio: (v: T) => boolean) =>
  Object.entries(o)
    .filter(([, v]) => !vazio(v))
    .sort(([a], [b]) => a.localeCompare(b));
const assinatura = (x: {
  nomeEvento: string;
  qtdSabores: Record<string, string>;
  precos: Record<string, Preco>;
  valoresVenda?: Record<string, string>;
  descontoPct?: string;
  descontoDestino?: string;
}) =>
  JSON.stringify([
    x.nomeEvento.trim() || "Evento sem nome",
    ordenado(x.qtdSabores, (v) => !(Number(v) > 0)),
    ordenado(x.precos, (p) => !p.preco && !p.tam && !p.qtdComprar).map(
      ([k, p]) => [k, p.preco ?? "", p.tam ?? "", p.qtdComprar ?? ""],
    ),
    ordenado(x.valoresVenda ?? {}, (v) => !v),
    x.descontoPct ?? "",
    (x.descontoDestino ?? "").trim(),
  ]);

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
  sabor === "MARACUJA"
    ? "Maracujá"
    : sabor
    .toLowerCase()
    .split("_")
    .map((p) => (p === "de" ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");

// Sem Recheio e Tradicional viraram o mesmo sabor: soma as quantidades antigas
const unirSemRecheio = (q: Record<string, string>): Record<string, string> => {
  if (!("SEM_RECHEIO" in q)) return q;
  const { SEM_RECHEIO, ...resto } = q;
  const soma = (Number(resto.TRADICIONAL) || 0) + (Number(SEM_RECHEIO) || 0);
  return { ...resto, ...(soma > 0 ? { TRADICIONAL: String(soma) } : {}) };
};

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
  const [valoresVenda, setValoresVenda] = useState<Record<string, string>>({});
  const [precoPadrao, setPrecoPadrao] = useState<Record<string, number>>({});
  const [descontoPct, setDescontoPct] = useState("");
  const [descontoDestino, setDescontoDestino] = useState("");
  // massa exibida na lista de sabores (a quantidade de cada uma é guardada à parte)
  const [baseAtiva, setBaseAtiva] = useState<BaseId>("BROWNIE");

  const [saved, setSaved] = useState<SavedBudget[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // --- Buscar sabores, matérias e ficha técnica ---
  useEffect(() => {
    const load = async () => {
      const [precosRes, fichaRes, materiasRes] = await Promise.all([
        supabase.from("TABELA_PRECOS").select("tp_sabor, vl_preco"),
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
        // "BASE" é a massa compartilhada, não é um sabor vendável
        const nomes = new Set<string>(
          [
            ...(precosRes.data ?? []).map((p) => p.tp_sabor as string),
            ...fichaRows.map((f) => f.tp_sabor),
          ].filter((s) => !BASES.some((b) => b.ficha === s)),
        );
        const padrao: Record<string, number> = {};
        for (const p of precosRes.data ?? []) {
          padrao[p.tp_sabor as string] = Number(p.vl_preco) || 0;
        }
        setPrecoPadrao(padrao);
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
        setQtdSabores(unirSemRecheio(draft.qtdSabores ?? {}));
        setValoresVenda(draft.valoresVenda ?? {});
        setDescontoPct(draft.descontoPct ?? "");
        setDescontoDestino(draft.descontoDestino ?? "");
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
      const atuais = readJSON<SavedBudget[]>(BUDGETS_KEY, []);
      const todos = importOldBudgets(atuais);
      setSaved(juntar(todos, []));
      setLoaded(true);

      // Depois junta com o banco: traz os de outros aparelhos e manda os daqui
      void (async () => {
        let remotos: SavedBudget[] | null = null;
        try {
          const { data, error } = await supabase
            .from("ORCAMENTOS")
            .select("cd_orcamento, ds_dados");
          if (!error && data) {
            const apagados = exclusoesPendentes("ORCAMENTOS");
            remotos = data
              .filter((r) => !apagados.has(r.cd_orcamento as string))
              .map((r) => r.ds_dados as SavedBudget)
              .filter((b) => b && b.id && b.salvoEm);
          }
        } catch {
          // sem internet: fica com os deste navegador
        }
        const noBanco = new Map((remotos ?? []).map((b) => [b.id, b]));
        for (const b of todos) {
          const r = noBanco.get(b.id);
          if (!r || b.salvoEm > r.salvoEm) salvarNoBanco(b);
        }
        if (remotos && remotos.length > 0) {
          const r = remotos;
          setSaved((prev) => juntar(prev, r));
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // --- Orçamentos guardados também neste navegador ---
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(BUDGETS_KEY, JSON.stringify(saved));
    } catch {
      // sem storage: ficam só no banco
    }
  }, [loaded, saved]);

  // --- Rascunho salvo automaticamente ---
  useEffect(() => {
    if (!loaded) return;
    const draft: Draft = {
      currentId,
      nomeEvento,
      qtdSabores,
      precos,
      valoresVenda,
      descontoPct,
      descontoDestino,
    };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage indisponível: segue sem rascunho
    }
  }, [
    currentId,
    nomeEvento,
    qtdSabores,
    precos,
    valoresVenda,
    descontoPct,
    descontoDestino,
    loaded,
  ]);

  // --- Cálculos ---
  const calc = useMemo(() => {
    const materiaMap = new Map(materias.map((m) => [m.cd_materia, m]));

    // Receita = massa escolhida (brownie ou cake) + recheio do sabor
    const baseRowsDe = (b: BaseId) =>
      ficha.filter((f) => f.tp_sabor === baseDe(b).ficha);
    const fichaDe = (s: string, b: BaseId) => [
      ...baseRowsDe(b),
      ...ficha.filter((f) => f.tp_sabor === s),
    ];
    const qtdDe = (s: string, b: BaseId) => toNumber(qtdSabores[chave(s, b)]);

    // Matérias listadas: sempre as da massa do brownie; as do cake e as dos
    // recheios só aparecem quando há quantidade no evento
    const usadas = new Map<string, Materia>();
    const incluir = (rows: FichaRow[]) => {
      for (const f of rows) {
        const m = materiaMap.get(f.cd_materia);
        if (m) usadas.set(m.cd_materia, m);
      }
    };
    incluir(baseRowsDe("BROWNIE"));
    for (const s of sabores) {
      for (const b of BASES) {
        if (qtdDe(s, b.id) > 0) incluir(fichaDe(s, b.id));
      }
    }

    // Necessário de cada matéria = Σ (brownies do sabor × uso por unidade)
    const necessario = new Map<string, number>();
    for (const s of sabores) {
      for (const b of BASES) {
        const qtd = qtdDe(s, b.id);
        if (qtd <= 0) continue;
        for (const f of fichaDe(s, b.id)) {
          necessario.set(
            f.cd_materia,
            (necessario.get(f.cd_materia) ?? 0) + qtd * f.qt_uso_por_unidade,
          );
        }
      }
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

    const totalPorBase: Record<BaseId, number> = {
      BROWNIE: 0,
      CAKE: 0,
      BOMBOM: 0,
    };
    for (const s of sabores) {
      for (const b of BASES) totalPorBase[b.id] += qtdDe(s, b.id);
    }
    const totalBrownies = BASES.reduce((acc, b) => acc + totalPorBase[b.id], 0);
    const totalCompra = linhas.reduce((acc, l) => acc + l.compra, 0);
    const totalUso = linhas.reduce((acc, l) => acc + l.uso, 0);

    // Custo (proporcional) de cada sabor
    const materiaPorId = new Map(materias.map((m) => [m.cd_materia, m]));
    const custoSabor: Record<string, number> = {};
    const semFicha: string[] = [];
    for (const s of sabores) {
      for (const b of BASES) {
        const porUnidade = fichaDe(s, b.id).reduce((acc, f) => {
          const m = materiaPorId.get(f.cd_materia);
          return m ? acc + f.qt_uso_por_unidade * precoUnit(m) : acc;
        }, 0);
        custoSabor[chave(s, b.id)] = porUnidade * qtdDe(s, b.id);
        if (qtdDe(s, b.id) > 0 && fichaDe(s, b.id).length === 0) {
          semFicha.push(chave(s, b.id));
        }
      }
    }

    // Massa escolhida no evento, mas ainda sem ingredientes cadastrados
    const massasSemIngrediente = BASES.filter(
      (b) => totalPorBase[b.id] > 0 && baseRowsDe(b.id).length === 0,
    ).map((b) => b.label);
    const semPreco = linhas.filter((l) => l.need > 0 && l.preco <= 0);

    // Preço de venda: o digitado neste evento ou, se vazio, o da tabela de
    // preços do sabor (o cake usa o mesmo, a não ser que seja informado)
    const precoVenda = (s: string, b: BaseId) => {
      const v = toNumber(valoresVenda[chave(s, b)]);
      return v > 0 ? v : (precoPadrao[s] ?? 0);
    };
    let receita = 0;
    for (const s of sabores) {
      for (const b of BASES) receita += qtdDe(s, b.id) * precoVenda(s, b.id);
    }

    // Desconto repassado (ex: 10% para a igreja) sai da receita antes do lucro
    const pct = Math.min(Math.max(toNumber(descontoPct), 0), 100);
    const desconto = (receita * pct) / 100;
    const receitaLiquida = receita - desconto;

    return {
      precoVenda,
      receita,
      desconto,
      receitaLiquida,
      lucro: receitaLiquida - totalCompra,
      linhas,
      totalBrownies,
      totalPorBase,
      massasSemIngrediente,
      totalCompra,
      totalUso,
      custoSabor,
      semFicha,
      semPreco,
    };
  }, [
    materias,
    ficha,
    sabores,
    qtdSabores,
    precos,
    valoresVenda,
    precoPadrao,
    descontoPct,
  ]);

  const custoPorBrownie =
    calc.totalBrownies > 0 ? calc.totalUso / calc.totalBrownies : 0;
  const margem = calc.receita > 0 ? (calc.lucro / calc.receita) * 100 : 0;

  // orçamento aberto e se há alterações ainda não salvas
  const aberto = saved.find((b) => b.id === currentId) ?? null;
  const formAtual = {
    nomeEvento,
    qtdSabores,
    precos,
    valoresVenda,
    descontoPct,
    descontoDestino,
  };
  const alterado = aberto
    ? assinatura(aberto) !== assinatura(formAtual)
    : calc.totalBrownies > 0 || nomeEvento.trim() !== "";
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
    setValoresVenda({});
    setDescontoPct("");
    setDescontoDestino("");
  };

  const clearAll = () => {
    if (!confirm("Limpar nome do evento e quantidades? Os preços ficam."))
      return;
    resetForm();
  };

  const novoOrcamento = () => {
    if (
      alterado &&
      !confirm("Começar um orçamento novo? As alterações não salvas se perdem.")
    )
      return;
    resetForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // --- Orçamentos salvos ---
  const persistBudgets = (list: SavedBudget[]) => setSaved(list);

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
      valoresVenda,
      descontoPct,
      descontoDestino,
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
    salvarNoBanco(budget);
    setCurrentId(id);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  const openBudget = (b: SavedBudget) => {
    if (
      alterado &&
      b.id !== currentId &&
      !confirm(`Abrir "${b.nomeEvento}"? As alterações não salvas se perdem.`)
    )
      return;
    setCurrentId(b.id);
    setNomeEvento(b.nomeEvento);
    setQtdSabores(unirSemRecheio(b.qtdSabores));
    setValoresVenda(b.valoresVenda ?? {});
    setDescontoPct(b.descontoPct ?? "");
    setDescontoDestino(b.descontoDestino ?? "");
    setPrecos(b.precos);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteBudget = (id: string) => {
    if (!confirm("Excluir este orçamento salvo?")) return;
    persistBudgets(saved.filter((b) => b.id !== id));
    apagarNoBanco(id);
    if (currentId === id) setCurrentId(null);
  };

  const inputBase =
    "px-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#7C3AED]";

  return (
    <div className="min-h-screen bg-[#F3E8FF] font-sans text-gray-800">
      <div className="max-w-7xl mx-auto w-full p-6 lg:p-8">
        {/* Header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Preparo para Evento
            </h2>
            <p className="text-gray-500">
              Informe quantos brownies de cada sabor e o preço das matérias. A
              ficha técnica calcula quanto você vai gastar e lucrar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusSync />
            <button
              onClick={novoOrcamento}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-purple-100 text-sm font-semibold text-[#6B21A8] hover:bg-purple-50 active:scale-95 transition"
            >
              <FilePlus2 size={18} /> Novo orçamento
            </button>
            <Link
              href="/dashboard/dia-evento"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7C3AED] text-white text-sm font-semibold hover:bg-[#6B21A8] active:scale-95 transition"
            >
              <Store size={18} /> Dia do Evento
            </Link>
          </div>
        </header>

        {/* O que está sendo editado */}
        {loaded && (
          <div
            className={`mb-6 flex flex-wrap items-center gap-3 rounded-2xl px-5 py-3 text-sm ${
              alterado
                ? "bg-amber-50 border border-amber-200 text-amber-900"
                : "bg-white border border-purple-100 text-gray-600"
            }`}
          >
            <Pencil size={16} className="shrink-0" />
            <span className="flex-1 min-w-0">
              {aberto ? (
                <>
                  Editando <b>{aberto.nomeEvento}</b>
                  {alterado
                    ? " · alterações não salvas"
                    : ` · salvo em ${new Date(aberto.salvoEm).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}`}
                </>
              ) : alterado ? (
                <>Orçamento novo, ainda não salvo</>
              ) : (
                <>Comece pelo nome do evento e a quantidade de cada sabor.</>
              )}
            </span>
            {alterado && (
              <button
                onClick={saveBudget}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400 text-amber-950 font-bold text-xs hover:bg-amber-300 active:scale-95"
              >
                <Save size={14} /> {aberto ? "Salvar alterações" : "Salvar"}
              </button>
            )}
          </div>
        )}

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
                {/* Massa: escolhe em qual base cada recheio será feito */}
                <div className="mt-2 grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
                  {BASES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBaseAtiva(b.id)}
                      className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                        baseAtiva === b.id
                          ? "bg-white text-[#6B21A8] shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {b.curto}
                      <span className="ml-1 text-gray-400 font-medium">
                        ({formatQty(calc.totalPorBase[b.id])})
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {loadingDb && (
                    <p className="text-sm text-gray-400">Carregando...</p>
                  )}
                  {!loadingDb && sabores.length > 0 && (
                    <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      <span className="flex-1">Recheio</span>
                      <span className="w-20 text-right">Preço un.</span>
                      <span className="w-16 text-right">Qtd</span>
                    </div>
                  )}
                  {sabores.map((s) => {
                    const k = chave(s, baseAtiva);
                    const outras = BASES.filter(
                      (b) =>
                        b.id !== baseAtiva &&
                        toNumber(qtdSabores[chave(s, b.id)]) > 0,
                    )
                      .map(
                        (b) =>
                          `${formatQty(toNumber(qtdSabores[chave(s, b.id)]))} ${b.curto}`,
                      )
                      .join(" · ");
                    return (
                    <div key={s} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {formatSabor(s)}
                        </p>
                        {toNumber(qtdSabores[k]) > 0 && (
                          <p className="text-xs text-gray-400">
                            {formatCurrency(calc.custoSabor[k] ?? 0)}
                          </p>
                        )}
                        {outras && (
                          <p className="text-[11px] text-[#7C3AED]">
                            Também: {outras}
                          </p>
                        )}
                      </div>
                      <div
                        className="relative"
                        title="Preço de venda de cada brownie neste evento"
                      >
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                          R$
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={valoresVenda[k] ?? ""}
                          onChange={(e) =>
                            setValoresVenda((prev) => ({
                              ...prev,
                              [k]: onlyNumber(e.target.value),
                            }))
                          }
                          placeholder={
                            precoPadrao[s]
                              ? String(precoPadrao[s]).replace(".", ",")
                              : "0"
                          }
                          className={`w-20 pl-7 text-right ${inputBase}`}
                        />
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={qtdSabores[k] ?? ""}
                        onChange={(e) =>
                          setQtdSabores((prev) => ({
                            ...prev,
                            [k]: e.target.value.replace(/[^\d]/g, ""),
                          }))
                        }
                        placeholder="0"
                        className={`w-16 text-right ${inputBase}`}
                      />
                    </div>
                    );
                  })}
                  <p className="text-[11px] text-gray-400">
                    Escolha a massa acima e informe o preço de venda (R$) e a
                    quantidade de cada recheio nela. Vazio usa o preço da
                    tabela de preços.
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Desconto sobre a receita
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="text"
                      value={descontoDestino}
                      onChange={(e) => setDescontoDestino(e.target.value)}
                      placeholder="Para quem? Ex: Igreja"
                      className={`flex-1 min-w-0 ${inputBase}`}
                    />
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={descontoPct}
                        onChange={(e) =>
                          setDescontoPct(onlyNumber(e.target.value))
                        }
                        placeholder="0"
                        className={`w-20 pr-7 text-right ${inputBase}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                        %
                      </span>
                    </div>
                  </div>
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
                  <span className="text-purple-200">Receita prevista</span>
                  <span className="font-bold">
                    {formatCurrency(calc.receita)}
                  </span>
                </div>
                {calc.desconto > 0 && (
                  <div className="flex justify-between">
                    <span className="text-purple-200">
                      Desconto ({descontoPct.trim()}%
                      {descontoDestino.trim()
                        ? ` — ${descontoDestino.trim()}`
                        : ""}
                      )
                    </span>
                    <span className="font-bold">
                      − {formatCurrency(calc.desconto)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-purple-200">Lucro previsto</span>
                  <span
                    className={`font-bold ${calc.lucro < 0 ? "text-red-200" : ""}`}
                  >
                    {formatCurrency(calc.lucro)}
                    {calc.receita > 0 && (
                      <span className="ml-1.5 text-xs font-semibold text-purple-200">
                        ({margem.toFixed(0)}%)
                      </span>
                    )}
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
                  : aberto
                    ? alterado
                      ? "Salvar alterações"
                      : "Orçamento salvo"
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

              {(calc.semFicha.length > 0 ||
                calc.semPreco.length > 0 ||
                calc.massasSemIngrediente.length > 0) && (
                <div className="mx-6 mt-4 p-3 rounded-xl bg-orange-50 border border-orange-100 text-sm text-orange-700 flex gap-2">
                  <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                  <div>
                    {calc.massasSemIngrediente.length > 0 && (
                      <p>
                        Massa sem ingredientes:{" "}
                        {calc.massasSemIngrediente.join(", ")} (cadastre em
                        Configurações &gt; Fichas Técnicas).
                      </p>
                    )}
                    {calc.semFicha.length > 0 && (
                      <p>
                        Sem ficha técnica:{" "}
                        {calc.semFicha
                          .map((k) => {
                            const [sabor, base] = k.split(":");
                            const b = BASES.find((x) => x.id === base);
                            return b
                              ? `${formatSabor(sabor)} (${b.curto})`
                              : formatSabor(k);
                          })
                          .join(", ")}{" "}
                        (não entram no cálculo).
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
                        <span className="md:hidden block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Necessário
                        </span>
                        {formatQty(l.need)}{" "}
                        <span className="text-xs text-gray-400">{un}</span>
                      </div>
                      <label className="col-span-4 md:col-span-2 block">
                        <span className="md:hidden block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Embalagem
                        </span>
                        <span className="relative block">
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
                        </span>
                      </label>
                      <label className="col-span-4 md:col-span-2 block">
                        <span className="md:hidden block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Preço emb.
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={precos[id]?.preco ?? ""}
                          onChange={(e) =>
                            setPreco(id, { preco: onlyNumber(e.target.value) })
                          }
                          placeholder="R$"
                          className={`w-full ${inputBase} ${
                            l.need > 0 && l.preco <= 0 ? "ring-2 ring-orange-300" : ""
                          }`}
                        />
                      </label>
                      <label className="col-span-6 md:col-span-2 block">
                        <span className="md:hidden block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                          Qtd a comprar
                        </span>
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
                          className={`w-full ${inputBase} ${
                            l.manual ? "ring-2 ring-purple-300 font-semibold" : ""
                          }`}
                        />
                      </label>
                      <div className="col-span-6 md:col-span-2 text-right font-bold text-gray-900 text-sm self-end md:self-center pb-2 md:pb-0">
                        {formatCurrency(l.compra)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rodapé */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                <button
                  onClick={clearAll}
                  className="text-sm text-gray-400 hover:text-red-600 transition-colors"
                >
                  Limpar quantidades
                </button>
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
                <p className="text-xs text-gray-500 mt-1">
                  Ficam no banco: aparecem em qualquer aparelho em que você
                  estiver logado.
                </p>
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
                        {b.legado && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                            Antigo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatQty(b.totalBrownies)} brownies ·{" "}
                        {new Date(b.salvoEm).toLocaleDateString("pt-BR")}
                      </p>
                      {b.legado && b.legado.length > 0 && (
                        <details className="mt-1 text-xs text-gray-500">
                          <summary className="cursor-pointer text-[#7C3AED]">
                            Ver itens ({b.legado.length})
                          </summary>
                          <ul className="mt-1 space-y-0.5">
                            {b.legado.map((i, idx) => (
                              <li key={idx}>
                                {i.nome}: {i.qtd} {i.unidade} ×{" "}
                                {formatCurrency(toNumber(i.preco))}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-bold text-[#6B21A8]">
                        {formatCurrency(b.total)}
                      </span>
                      {!b.legado &&
                        (b.id === currentId ? (
                          <span className="px-3 py-1.5 text-xs font-semibold text-gray-500">
                            Aberto
                          </span>
                        ) : (
                          <button
                            onClick={() => openBudget(b)}
                            className="px-3 py-1.5 text-xs font-semibold text-[#7C3AED] bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
                          >
                            Abrir
                          </button>
                        ))}
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
