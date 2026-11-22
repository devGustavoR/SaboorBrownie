// Roleta do sorteio: dados e lógica compartilhados entre a tela "Dia do Evento"
// (sorteio de verdade) e "Configurações" (tela de teste).

// Prêmio da roleta. peso = chance relativa; limite vazio = sem limite;
// vazio = fatia sem prêmio ("tente na próxima")
export interface Premio {
  id: string;
  nome: string;
  peso: string;
  limite: string;
  vazio?: boolean;
  // o que o cupom do prêmio vale no caixa (sem isso, é deduzido pelo nome)
  beneficio?: Beneficio;
  valor?: string; // % (PERCENT) ou R$ (VALOR)
}

// PERCENT: % de desconto na compra · VALOR: R$ de desconto · BROWNIE: um
// brownie grátis (o mais barato da comanda) · BRINDE: entrega de um brinde
export type Beneficio = "PERCENT" | "VALOR" | "BROWNIE" | "BRINDE";

export const BENEFICIOS: { id: Beneficio; label: string }[] = [
  { id: "PERCENT", label: "% de desconto" },
  { id: "VALOR", label: "R$ de desconto" },
  { id: "BROWNIE", label: "Brownie grátis" },
  { id: "BRINDE", label: "Brinde" },
];

// Faixa de giros: a partir de `minimo` (R$ da compra) o cliente ganha `giros`
export interface Faixa {
  id: string;
  minimo: string;
  giros: string;
}

export interface Roleta {
  ativa: boolean;
  premios: Premio[];
  faixas?: Faixa[];
  // @ do Instagram mostrado no resultado de todos os giros ("Nos siga no Instagram")
  instagram?: string;
}

export const MIN_GIROS = 1;
export const MAX_GIROS = 3;

// Faixas de exemplo (edite em "Roleta" no Dia do Evento)
export const FAIXAS_PADRAO: Faixa[] = [
  { id: "f1", minimo: "0", giros: "1" },
  { id: "f2", minimo: "20", giros: "2" },
  { id: "f3", minimo: "40", giros: "3" },
];

// Fatia desenhada na roleta (ângulos em graus, no sentido horário a partir do topo)
export interface Fatia extends Premio {
  pesoNum: number;
  cor: string;
  inicio: number;
  fim: number;
  meio: number;
}

// A configuração da roleta fica junto do estado do dia, neste navegador
export const DIA_KEY = "saboor:dia-evento-v1";

export const CORES_ROLETA = [
  "#7C3AED",
  "#F59E0B",
  "#EC4899",
  "#10B981",
  "#3B82F6",
  "#EF4444",
  "#8B5CF6",
  "#14B8A6",
];

const num = (v: string | number | undefined) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// Prêmios de exemplo: edite em "Roleta" (tela Dia do Evento) para os brindes reais
// (chance de ganhar algo ≈ 14%; o resto são fatias "Tente na próxima")
const vazia = (n: number): Premio => ({
  id: `v${n}`,
  nome: "Tente na próxima",
  peso: "29",
  limite: "",
  vazio: true,
});

export const ROLETA_PADRAO: Roleta = {
  ativa: true,
  faixas: FAIXAS_PADRAO,
  premios: [
    { id: "p1", nome: "Brownie grátis", peso: "1", limite: "2", beneficio: "BROWNIE" },
    vazia(1),
    { id: "p2", nome: "Cupom 10% na próxima", peso: "3", limite: "", beneficio: "PERCENT", valor: "10" },
    { id: "p3", nome: "Desconto de R$ 2", peso: "3", limite: "", beneficio: "VALOR", valor: "2" },
    vazia(2),
    { id: "p4", nome: "Brinde surpresa", peso: "3", limite: "", beneficio: "BRINDE" },
    { id: "p5", nome: "Cupom 5% na próxima", peso: "4", limite: "", beneficio: "PERCENT", valor: "5" },
    vazia(3),
  ],
};

// Benefício do prêmio: o escolhido na configuração ou, se não tiver, deduzido
// do nome ("10%" → 10% de desconto, "R$ 2" → R$ 2, "brownie grátis" → brownie)
export const beneficioDe = (
  p: Pick<Premio, "nome" | "beneficio" | "valor">,
): { beneficio: Beneficio; valor: number } => {
  if (p.beneficio) return { beneficio: p.beneficio, valor: num(p.valor) };
  const nome = p.nome.toLowerCase();
  const pct = nome.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) return { beneficio: "PERCENT", valor: num(pct[1]) };
  const rs = nome.match(/r\$\s*(\d+(?:[.,]\d+)?)/);
  if (rs) return { beneficio: "VALOR", valor: num(rs[1]) };
  if (/brownie|bombom|cake/.test(nome) && /gr[aá]tis/.test(nome)) {
    return { beneficio: "BROWNIE", valor: 0 };
  }
  return { beneficio: "BRINDE", valor: 0 };
};

export const descreverBeneficio = (b: Beneficio, valor: number) =>
  b === "PERCENT"
    ? `${String(valor).replace(".", ",")}% de desconto`
    : b === "VALOR"
      ? `${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} de desconto`
      : b === "BROWNIE"
        ? "1 brownie grátis"
        : "Brinde";

// Desconto (R$) que o cupom dá numa comanda com estes preços unitários
export const descontoCupom = (
  b: Beneficio,
  valor: number,
  subtotal: number,
  precosUnitarios: number[],
) => {
  const d =
    b === "PERCENT"
      ? (subtotal * Math.min(Math.max(valor, 0), 100)) / 100
      : b === "VALOR"
        ? valor
        : b === "BROWNIE"
          ? precosUnitarios.length > 0
            ? Math.min(...precosUnitarios)
            : 0
          : 0;
  return Math.round(Math.min(Math.max(d, 0), subtotal) * 100) / 100;
};

// Código do cupom: SAB-XXXX (sem letras/números que confundem, como 0/O e 1/I)
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const gerarCodigoCupom = () => {
  const a = new Uint32Array(4);
  crypto.getRandomValues(a);
  return `SAB-${[...a].map((n) => ALFABETO[n % ALFABETO.length]).join("")}`;
};

export const normalizarCodigo = (v: string) => {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.startsWith("SAB") && s.length > 3 ? `SAB-${s.slice(3)}` : s;
};

// roletas de exemplo de versões anteriores (se não foram editadas): são
// trocadas pela atual
export const ehRoletaAntiga = (r: Roleta) => {
  const ids = r.premios.map((p) => p.id).join();
  const pesos = r.premios.map((p) => p.peso).join();
  // 1ª versão: 3 prêmios
  if (ids === "p1,p2,p3" && r.premios[2].nome === "Tente na próxima") {
    return true;
  }
  // 2ª versão: 5 prêmios e 5 fatias vazias de peso 17
  return (
    ids === "p1,v1,p2,v2,p3,v3,p4,v4,p5,v5" &&
    pesos === "1,17,3,17,3,17,3,17,4,17"
  );
};

export const faixasDe = (r: Roleta): Faixa[] => r.faixas ?? FAIXAS_PADRAO;

// Quantos giros uma compra de `total` (R$) dá: vale a faixa de maior mínimo
// atingido; sempre entre 1 e 3 (compra abaixo de todas as faixas dá 1 giro)
export const girosPara = (total: number, r: Roleta): number => {
  let melhor: { minimo: number; giros: number } | null = null;
  for (const f of faixasDe(r)) {
    const minimo = num(f.minimo);
    const giros = Math.floor(num(f.giros));
    if (total + 1e-9 >= minimo && (!melhor || minimo >= melhor.minimo)) {
      melhor = { minimo, giros };
    }
  }
  return Math.min(MAX_GIROS, Math.max(MIN_GIROS, melhor?.giros ?? MIN_GIROS));
};

// Sorteio justo: aleatório do navegador (crypto)
export const aleatorio = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
};

// Chance (%) de cada prêmio e de sair algum prêmio de verdade (fatias vazias não contam)
export const chanceDeGanhar = (r: Roleta) => {
  const soma = r.premios.reduce((a, p) => a + Math.max(num(p.peso), 0), 0);
  const reais = r.premios
    .filter((p) => !p.vazio)
    .reduce((a, p) => a + Math.max(num(p.peso), 0), 0);
  return soma > 0 ? (reais / soma) * 100 : 0;
};

// Monta as fatias: só entram prêmios com chance > 0 e que não esgotaram o
// limite (ganhos = quantas vezes cada nome já saiu). Todas as fatias têm o mesmo
// tamanho no desenho; a chance real de cada uma continua sendo o peso.
export const montarFatias = (
  premios: Premio[],
  ganhos: Record<string, number> = {},
): Fatia[] => {
  const ativos = premios
    .map((p, idx) => ({
      ...p,
      pesoNum: num(p.peso),
      cor: CORES_ROLETA[idx % CORES_ROLETA.length],
    }))
    .filter((p) => {
      if (p.pesoNum <= 0 || !p.nome.trim()) return false;
      const lim = Math.floor(num(p.limite));
      return lim <= 0 || (ganhos[p.nome.trim()] ?? 0) < lim;
    });
  const tam = ativos.length > 0 ? 360 / ativos.length : 0;
  return ativos.map((p, i) => ({
    ...p,
    inicio: i * tam,
    fim: (i + 1) * tam,
    meio: i * tam + tam / 2,
  }));
};

// Sorteia uma fatia pelo peso
export const sortearFatia = (fatias: Fatia[]): Fatia => {
  const soma = fatias.reduce((a, f) => a + f.pesoNum, 0);
  let alvo = aleatorio() * soma;
  for (const f of fatias) {
    if (alvo < f.pesoNum) return f;
    alvo -= f.pesoNum;
  }
  return fatias[fatias.length - 1];
};

// Nova rotação (graus) que para com a fatia sorteada embaixo do ponteiro (no topo)
export const rotacaoPara = (fatia: Fatia, rotacaoAtual: number) => {
  const dentro = fatia.inicio + (fatia.fim - fatia.inicio) * (0.15 + aleatorio() * 0.7);
  const base = rotacaoAtual - (rotacaoAtual % 360);
  return base + 360 * 6 + (360 - dentro);
};

export const DURACAO_GIRO_MS = 5400;

// Lê a roleta salva pela tela Dia do Evento (ou a padrão)
export const lerRoleta = (): Roleta => {
  try {
    const raw = localStorage.getItem(DIA_KEY);
    const r = (raw ? JSON.parse(raw) : null)?.roleta as Roleta | undefined;
    return r && Array.isArray(r.premios) && !ehRoletaAntiga(r)
      ? r
      : ROLETA_PADRAO;
  } catch {
    return ROLETA_PADRAO;
  }
};
