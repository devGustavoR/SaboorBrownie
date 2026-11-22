// Pix "copia e cola" (BR Code estático do Banco Central) com o valor da compra.
// O QR gerado a partir deste texto é lido por qualquer app de banco.

export type TipoChave = "CPF" | "CNPJ" | "TELEFONE" | "EMAIL" | "ALEATORIA";

export const TIPOS_CHAVE: { id: TipoChave; label: string }[] = [
  { id: "TELEFONE", label: "Celular" },
  { id: "CPF", label: "CPF" },
  { id: "CNPJ", label: "CNPJ" },
  { id: "EMAIL", label: "Email" },
  { id: "ALEATORIA", label: "Aleatória" },
];

export interface ConfigPix {
  tipo?: TipoChave;
  chave: string;
  nome: string; // nome de quem recebe (como aparece no banco)
  cidade: string;
}

export const PIX_PADRAO: ConfigPix = {
  tipo: "TELEFONE",
  chave: "",
  nome: "SABOOR BROWNIE",
  cidade: "",
};

// campo EMV: id (2) + tamanho (2) + valor
const campo = (id: string, valor: string) =>
  `${id}${String(valor.length).padStart(2, "0")}${valor}`;

// O BR Code aceita só ASCII simples: tira acentos e caracteres especiais
const limpar = (v: string, max: number) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .@+\-_]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max);

// CRC16-CCITT (polinômio 0x1021, início 0xFFFF), exigido no fim do código
const crc16 = (texto: string) => {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

// Chave do jeito que o banco espera: telefone com +55, CPF/CNPJ só números
export const normalizarChave = (tipo: TipoChave, chave: string) => {
  const c = chave.trim();
  const digitos = c.replace(/\D/g, "");
  if (tipo === "EMAIL" || tipo === "ALEATORIA") return c.toLowerCase();
  if (tipo === "TELEFONE") {
    return digitos.startsWith("55") && digitos.length >= 12
      ? `+${digitos}`
      : `+55${digitos}`;
  }
  return digitos; // CPF / CNPJ
};

export const pixConfigurado = (p?: ConfigPix | null) =>
  !!p && p.chave.trim() !== "" && p.cidade.trim() !== "";

export const gerarPix = (p: ConfigPix, valor: number, txid = "***") => {
  const conta =
    campo("00", "br.gov.bcb.pix") +
    campo("01", normalizarChave(p.tipo ?? "ALEATORIA", p.chave));
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (valor > 0 ? campo("54", valor.toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", limpar(p.nome || "SABOOR BROWNIE", 25)) +
    campo("60", limpar(p.cidade, 15)) +
    campo("62", campo("05", txid.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***")) +
    "6304";
  return semCrc + crc16(semCrc);
};
