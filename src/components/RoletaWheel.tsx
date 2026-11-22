"use client";

import { DURACAO_GIRO_MS, type Fatia } from "@/lib/roleta";
import {
  BadgePercent,
  Cookie,
  Gift,
  Heart,
  Star,
  Ticket,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";

// --- Desenho ---
const R = 95; // raio das fatias (viewBox de -108 a 108)
const DURACAO_ANIM = DURACAO_GIRO_MS - 200; // termina antes de quem usa mostrar o resultado
const SOM_KEY = "saboor:roleta-som";

// Prêmios em cores vivas; fatias sem prêmio em roxo escuro (o prêmio se destaca)
const CORES_PREMIO = [
  "#F59E0B",
  "#EC4899",
  "#10B981",
  "#3B82F6",
  "#F97316",
  "#06B6D4",
];
const CORES_VAZIO = ["#5B21B6", "#4C1D95"];
const CORES_CONFETE = [
  "#FBBF24",
  "#EC4899",
  "#A78BFA",
  "#34D399",
  "#60A5FA",
  "#FFFFFF",
];
const LUZES = 24;

// Ícone (traço) de cada fatia, escolhido pelo nome do prêmio
const icone = (f: Fatia): LucideIcon => {
  if (f.vazio) return Heart;
  const n = f.nome.toLowerCase();
  if (/brownie|bombom|cake|doce/.test(n)) return Cookie;
  if (/cupom|voucher|%/.test(n)) return Ticket;
  if (/desconto|r\$|off/.test(n)) return BadgePercent;
  if (/brinde|surpresa|presente/.test(n)) return Gift;
  return Star;
};

// texto escuro em fundo claro, branco em fundo escuro
const corTexto = (hex: string) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#3B0764" : "#FFFFFF";
};

// Quebra o nome em linhas (sem cortar)
const quebrar = (nome: string, max: number): string[] => {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of nome.trim().split(/\s+/)) {
    if (atual && `${atual} ${palavra}`.length > max) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = atual ? `${atual} ${palavra}` : palavra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
};

const rad = (g: number) => (g * Math.PI) / 180;
const px = (g: number, r: number) => r * Math.sin(rad(g));
const py = (g: number, r: number) => -r * Math.cos(rad(g));
const caminhoFatia = (f: Fatia) =>
  `M0 0 L${px(f.inicio, R)} ${py(f.inicio, R)} A${R} ${R} 0 ${
    f.fim - f.inicio > 180 ? 1 : 0
  } 1 ${px(f.fim, R)} ${py(f.fim, R)} Z`;

const norm = (g: number) => ((g % 360) + 360) % 360;
// fatia embaixo do ponteiro (topo) com a roleta girada `rot` graus
const indiceEm = (fatias: Fatia[], rot: number) => {
  const a = norm(-rot);
  const i = fatias.findIndex((f) => a >= f.inicio && a < f.fim);
  return i >= 0 ? i : fatias.length - 1;
};
// desacelera suave até parar
const easing = (t: number) => 1 - Math.pow(1 - t, 4);

interface Confete {
  id: number;
  x: number;
  y: number;
  r: number;
  cor: string;
  d: number;
  w: number;
}

// Roleta do sorteio. Quem usa troca `rotacao` (graus) e liga `girando`: a
// roleta anima até lá e, se `destacar`, realça a fatia em que parou.
export function RoletaWheel({
  fatias,
  rotacao,
  girando,
  destacar = false,
  className = "w-[min(88vw,68vh,500px)]",
}: {
  fatias: Fatia[];
  rotacao: number;
  girando: boolean;
  destacar?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const rodaRef = useRef<HTMLDivElement>(null);
  const anguloRef = useRef(rotacao);
  const alvoRef = useRef(rotacao);
  const rafRef = useRef<number | null>(null);
  const ultimoIdx = useRef(-1);
  const fatiasRef = useRef(fatias);
  const somRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  const [rodando, setRodando] = useState(false);
  const [final, setFinal] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [som, setSom] = useState(true);
  const [confetes, setConfetes] = useState<Confete[]>([]);

  useEffect(() => {
    fatiasRef.current = fatias;
  }, [fatias]);

  // preferência de som fica salva neste navegador
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const ligado = localStorage.getItem(SOM_KEY) !== "0";
        somRef.current = ligado;
        setSom(ligado);
      } catch {
        // sem storage: som ligado
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const alternarSom = () => {
    const novo = !som;
    somRef.current = novo;
    setSom(novo);
    try {
      localStorage.setItem(SOM_KEY, novo ? "1" : "0");
    } catch {
      // sem storage: vale só nesta sessão
    }
  };

  // --- Som (Web Audio, sem arquivos) ---
  const audio = () => {
    if (!somRef.current) return null;
    try {
      audioRef.current ??= new AudioContext();
      return audioRef.current;
    } catch {
      return null;
    }
  };
  const nota = (
    freq: number,
    inicio: number,
    dur: number,
    vol: number,
    tipo: OscillatorType = "triangle",
  ) => {
    const ctx = audio();
    if (!ctx) return;
    const t = ctx.currentTime + inicio;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };
  const clique = () => nota(1400, 0, 0.04, 0.05);
  const somVitoria = () =>
    [523, 659, 784, 1047].forEach((f, i) => nota(f, i * 0.11, 0.35, 0.08));
  const somVazio = () => {
    nota(392, 0, 0.25, 0.06, "sine");
    nota(311, 0.18, 0.4, 0.06, "sine");
  };

  const festa = () => {
    const pecas = Array.from({ length: 48 }, (_, i) => ({
      id: Date.now() + i,
      x: 50 + (Math.random() - 0.5) * 130,
      y: 50 + (Math.random() - 0.5) * 130,
      r: Math.random() * 720 - 360,
      cor: CORES_CONFETE[i % CORES_CONFETE.length],
      d: 0.9 + Math.random() * 0.9,
      w: 4 + Math.random() * 5,
    }));
    setConfetes(pecas);
    setTimeout(() => setConfetes([]), 2200);
  };

  const aplicar = (a: number) => {
    if (rodaRef.current) rodaRef.current.style.transform = `rotate(${a}deg)`;
  };

  // --- Giro quadro a quadro ---
  useEffect(() => {
    if (!girando || rotacao === alvoRef.current) {
      if (!girando && rafRef.current === null) {
        anguloRef.current = rotacao;
        alvoRef.current = rotacao;
        aplicar(rotacao);
      }
      return;
    }
    alvoRef.current = rotacao;
    const de = anguloRef.current;
    const dist = rotacao - de;
    const reduzir =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const dur = reduzir ? 1200 : DURACAO_ANIM;
    let inicio: number | null = null;

    const quadro = (agora: number) => {
      if (inicio === null) {
        inicio = agora;
        setRodando(true);
        setFinal(null);
      }
      const t = Math.min((agora - inicio) / dur, 1);
      const a = de + dist * easing(t);
      anguloRef.current = a;
      aplicar(a);
      const lista = fatiasRef.current;
      const idx = indiceEm(lista, a);
      if (idx !== ultimoIdx.current) {
        ultimoIdx.current = idx;
        if (t < 1) {
          setTick((k) => k + 1);
          clique();
        }
      }
      if (t < 1) {
        rafRef.current = requestAnimationFrame(quadro);
        return;
      }
      rafRef.current = null;
      setRodando(false);
      setFinal(idx);
      if (lista[idx] && !lista[idx].vazio) {
        festa();
        somVitoria();
      } else {
        somVazio();
      }
    };
    rafRef.current = requestAnimationFrame(quadro);
    // o giro não é cancelado quando `girando` volta a false: ele termina sozinho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotacao, girando]);

  // para a animação só ao sair da tela
  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.close().catch(() => {});
    },
    [],
  );

  const realce = destacar && !rodando && final !== null && fatias[final];
  const n = fatias.length;
  const coresDe = (() => {
    let p = 0;
    let v = 0;
    return fatias.map((f) =>
      f.vazio
        ? CORES_VAZIO[v++ % CORES_VAZIO.length]
        : CORES_PREMIO[p++ % CORES_PREMIO.length],
    );
  })();
  const piscar = rodando ? 0.28 : 1.6;

  return (
    <div className={`relative mx-auto aspect-square select-none ${className}`}>
      <style>{`
        @keyframes rw-pisca { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @keyframes rw-tick {
          0% { transform: translateX(-50%) rotate(0deg) }
          35% { transform: translateX(-50%) rotate(-26deg) }
          100% { transform: translateX(-50%) rotate(0deg) }
        }
        @keyframes rw-pulso { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
        @keyframes rw-confete {
          0% { left: 50%; top: 50%; opacity: 1; transform: rotate(0deg) }
          75% { opacity: 1 }
          100% { left: var(--x); top: var(--y); opacity: 0; transform: rotate(var(--r)) }
        }
        .rw-luz { animation-name: rw-pisca; animation-iteration-count: infinite; animation-timing-function: ease-in-out }
        .rw-pulso { animation: rw-pulso 1s ease-in-out infinite }
        .rw-confete { position: absolute; left: 50%; top: 50%; border-radius: 1px; pointer-events: none; z-index: 30;
          animation-name: rw-confete; animation-timing-function: cubic-bezier(.15,.7,.3,1); animation-fill-mode: forwards }
        @media (prefers-reduced-motion: reduce) { .rw-luz, .rw-pulso { animation: none } }
      `}</style>

      {/* Aro dourado com lâmpadas (parado) */}
      <svg
        viewBox="-108 -108 216 216"
        className="absolute inset-0 w-full h-full drop-shadow-[0_18px_30px_rgba(30,0,60,0.45)]"
        aria-hidden
      >
        <defs>
          <linearGradient id={`aro-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="35%" stopColor="#FBBF24" />
            <stop offset="70%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
        </defs>
        <circle r="106" fill={`url(#aro-${uid})`} />
        <circle r="97" fill="#2E1065" />
        {Array.from({ length: LUZES }, (_, i) => {
          const g = (i * 360) / LUZES;
          return (
            <g
              key={i}
              className="rw-luz"
              style={{
                animationDuration: `${piscar}s`,
                animationDelay: i % 2 ? `-${piscar / 2}s` : "0s",
              }}
            >
              <circle
                cx={px(g, 101.5)}
                cy={py(g, 101.5)}
                r="3.4"
                fill="rgba(254,243,199,0.35)"
              />
              <circle cx={px(g, 101.5)} cy={py(g, 101.5)} r="2" fill="#FFFBEB" />
            </g>
          );
        })}
      </svg>

      {/* Fatias (giram) */}
      <div
        ref={rodaRef}
        className="absolute inset-0 will-change-transform"
        style={{ transform: `rotate(${anguloRef.current}deg)` }}
      >
        <svg viewBox="-108 -108 216 216" className="w-full h-full">
          {n === 1 ? (
            <circle r={R} fill={coresDe[0]} />
          ) : (
            fatias.map((f, i) => (
              <path
                key={f.id}
                d={caminhoFatia(f)}
                fill={coresDe[i]}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.7"
              />
            ))
          )}

          {fatias.map((f, i) => {
            let fs = n <= 6 ? 9 : n <= 8 ? 8 : n <= 12 ? 7 : 6;
            const caber = (tam: number) => Math.floor(54 / (tam * 0.58));
            let linhas = quebrar(f.nome, caber(fs));
            if (linhas.length > 2 && fs > 5.5) {
              fs -= 1;
              linhas = quebrar(f.nome, caber(fs));
            }
            const cor = corTexto(coresDe[i]);
            const Icone = icone(f);
            const ic = n <= 8 ? 7 : 6; // tamanho do ícone
            return (
              <g key={`t-${f.id}`} transform={`rotate(${f.meio - 90})`}>
                <text
                  x="74"
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={fs}
                  fontWeight="800"
                  fill={cor}
                  stroke={cor === "#FFFFFF" ? "rgba(30,0,60,0.35)" : "none"}
                  strokeWidth="0.6"
                  strokeLinejoin="round"
                  style={{ paintOrder: "stroke" }}
                >
                  {linhas.map((l, j) => (
                    <tspan
                      key={j}
                      x="74"
                      dy={j === 0 ? `${-(linhas.length - 1) * 0.55}em` : "1.1em"}
                    >
                      {l}
                    </tspan>
                  ))}
                </text>
                {/* medalhão com o ícone, de pé quando a fatia está no topo */}
                <g transform="translate(84.5 0) rotate(90)">
                  {f.vazio ? (
                    <circle
                      r={ic * 0.85}
                      fill="rgba(255,255,255,0.1)"
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth="0.5"
                    />
                  ) : (
                    <circle
                      r={ic * 0.85}
                      fill="#FFFFFF"
                      stroke="rgba(255,255,255,0.5)"
                      strokeWidth="1.2"
                    />
                  )}
                  <Icone
                    x={-ic / 2}
                    y={-ic / 2}
                    size={ic}
                    strokeWidth={2.4}
                    color={f.vazio ? "rgba(255,255,255,0.75)" : coresDe[i]}
                    fill={f.vazio ? "rgba(255,255,255,0.75)" : "none"}
                    aria-hidden
                  />
                </g>
              </g>
            );
          })}

          {/* resultado: escurece as outras fatias e acende a sorteada */}
          {realce && (
            <>
              {fatias.map((f, i) =>
                i === final ? null : (
                  <path
                    key={`d-${f.id}`}
                    d={n === 1 ? "" : caminhoFatia(f)}
                    fill="#12002B"
                    opacity="0.55"
                  />
                ),
              )}
              {n > 1 && (
                <path
                  d={caminhoFatia(realce)}
                  fill="none"
                  stroke="#FEF3C7"
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  className="rw-pulso"
                />
              )}
            </>
          )}
        </svg>
      </div>

      {/* Brilho e centro (parados) */}
      <svg
        viewBox="-108 -108 216 216"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden
      >
        <defs>
          <radialGradient id={`brilho-${uid}`} cx="0.4" cy="0.35" r="0.75">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.3" />
          </radialGradient>
          <linearGradient id={`centro-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="50%" stopColor="#FBBF24" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <circle r={R} fill={`url(#brilho-${uid})`} />
        <circle r="19" fill={`url(#centro-${uid})`} />
        <circle r="15.5" fill="#3B0764" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="4.6"
          fontWeight="900"
          letterSpacing="0.6"
          fill="#FDE68A"
        >
          SABOOR
        </text>
      </svg>

      {/* Ponteiro: bate a cada fatia que passa */}
      <div
        key={tick}
        className="absolute z-20 w-[11%] pointer-events-none"
        style={{
          top: "-4.5%",
          left: "50%",
          transform: "translateX(-50%)",
          transformOrigin: "50% 30%",
          animation: tick > 0 && rodando ? "rw-tick 140ms ease-out" : undefined,
        }}
      >
        <svg viewBox="0 0 40 56" className="w-full drop-shadow-lg" aria-hidden>
          <defs>
            <linearGradient id={`ponteiro-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FB7185" />
              <stop offset="100%" stopColor="#BE123C" />
            </linearGradient>
          </defs>
          <path
            d="M20 54 L5.5 24 A16 16 0 1 1 34.5 24 Z"
            fill={`url(#ponteiro-${uid})`}
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <circle cx="20" cy="18" r="6" fill="#FDE68A" stroke="#FFFFFF" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Confete quando sai prêmio */}
      {confetes.map((c) => (
        <span
          key={c.id}
          className="rw-confete"
          style={
            {
              "--x": `${c.x}%`,
              "--y": `${c.y}%`,
              "--r": `${c.r}deg`,
              background: c.cor,
              width: c.w,
              height: c.w * 0.45,
              animationDuration: `${c.d}s`,
            } as CSSProperties
          }
        />
      ))}

      {/* Som liga/desliga */}
      <button
        type="button"
        onClick={alternarSom}
        className="absolute -bottom-1 -right-1 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur text-white flex items-center justify-center transition"
        aria-label={som ? "Desligar som da roleta" : "Ligar som da roleta"}
        title={som ? "Som ligado" : "Som desligado"}
      >
        {som ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </div>
  );
}
