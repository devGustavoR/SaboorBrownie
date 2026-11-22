"use client";

import { gerarPix, type ConfigPix } from "@/lib/pix";
import { Check, Copy, QrCode, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// QR do Pix em tela cheia, já com o valor, para o cliente pagar pelo app do banco
export function PixModal({
  pix,
  valor,
  onFechar,
  onPago,
}: {
  pix: ConfigPix;
  valor: number;
  onFechar: () => void;
  onPago: () => void;
}) {
  const codigo = useMemo(() => gerarPix(pix, valor), [pix, valor]);
  const [svg, setSvg] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    QRCode.toString(codigo, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#1E0A3C", light: "#FFFFFF" },
    })
      .then((s) => vivo && setSvg(s))
      .catch(() => vivo && setSvg(""));
    return () => {
      vivo = false;
    };
  }, [codigo]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sem permissão de área de transferência: o código continua na tela
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-gradient-to-br from-[#0F766E] to-[#134E4A] text-white flex flex-col items-center justify-center p-6 overflow-y-auto">
      <button
        onClick={onFechar}
        className="absolute top-5 right-5 p-3 rounded-xl bg-white/15 hover:bg-white/25"
        aria-label="Fechar"
      >
        <X size={22} />
      </button>

      <div className="w-full max-w-md text-center space-y-5">
        <p className="flex items-center justify-center gap-2 text-lg font-bold text-teal-100">
          <QrCode size={22} /> Pague com Pix
        </p>
        <p className="text-5xl font-extrabold">{money(valor)}</p>

        <div className="mx-auto w-[min(80vw,340px)] aspect-square rounded-3xl bg-white p-4 shadow-2xl">
          {svg ? (
            <div
              className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="w-full h-full animate-pulse rounded-2xl bg-gray-100" />
          )}
        </div>

        <p className="text-teal-100">
          Abra o app do banco, escolha <b>Pix &gt; Ler QR code</b> e aponte a
          câmera.
        </p>
        <p className="text-sm text-teal-200">
          Recebedor: <b>{pix.nome || "SABOOR BROWNIE"}</b>
        </p>

        <button
          onClick={copiar}
          className="mx-auto flex items-center gap-2 px-5 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-sm font-semibold"
        >
          {copiado ? <Check size={18} /> : <Copy size={18} />}
          {copiado ? "Copiado!" : "Copiar Pix copia e cola"}
        </button>

        <button
          onClick={onPago}
          className="w-full py-4 rounded-2xl bg-white text-teal-800 text-xl font-extrabold active:scale-95 transition shadow-xl"
        >
          Pix recebido, finalizar venda
        </button>
        <p className="text-xs text-teal-200">
          Confira no seu app se o Pix caiu antes de finalizar.
        </p>
      </div>
    </div>
  );
}
