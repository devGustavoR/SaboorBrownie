import { Instagram } from "lucide-react";
import Image from "next/image";

const PADRAO = "@saboorbrownie";

// "Nos siga no Instagram" com o QR code do perfil (aparece em todo resultado da roleta)
export function SigaInstagram({
  instagram,
  grande = false,
}: {
  instagram?: string;
  grande?: boolean;
}) {
  const nome = instagram?.trim() || PADRAO;
  const arroba = nome.startsWith("@") ? nome : `@${nome}`;

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl bg-white/15 p-4 flex flex-col items-center gap-3 text-center">
      <p
        className={`font-extrabold flex items-center justify-center gap-2 leading-tight ${
          grande ? "text-xl" : "text-lg"
        }`}
      >
        <Instagram size={grande ? 24 : 20} className="shrink-0" /> Nos siga no
        Instagram!
      </p>
      <div
        className={`rounded-2xl bg-white p-2 shadow-xl ${
          grande ? "w-[min(70vw,260px)]" : "w-[min(70vw,220px)]"
        }`}
      >
        <Image
          src="/instagram-qr.png"
          alt={`QR code do Instagram ${arroba}`}
          width={600}
          height={600}
          className="w-full h-auto rounded-xl"
          priority
        />
      </div>
      <div>
        <p
          className={`font-extrabold text-amber-300 break-all ${
            grande ? "text-2xl" : "text-xl"
          }`}
        >
          {arroba}
        </p>
        <p className="text-sm text-purple-100">
          Aponte a câmera do celular para o código.
        </p>
      </div>
    </div>
  );
}
