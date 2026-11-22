"use client";

import { useEffect, useState } from "react";

type WakeLock = { release: () => Promise<void>; released: boolean };
type NavegadorComWakeLock = Navigator & {
  wakeLock?: { request: (tipo: "screen") => Promise<WakeLock> };
};

// Mantém a tela acesa enquanto a página estiver aberta (o navegador solta o
// bloqueio quando a aba some; pedimos de novo quando ela volta)
export const useTelaAcesa = (ativo = true) => {
  const [suportado, setSuportado] = useState(false);
  const [acesa, setAcesa] = useState(false);

  useEffect(() => {
    const nav = navigator as NavegadorComWakeLock;
    if (!ativo || !nav.wakeLock) return;
    let lock: WakeLock | null = null;
    let vivo = true;

    const pedir = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = await nav.wakeLock!.request("screen");
        if (vivo) setAcesa(true);
      } catch {
        if (vivo) setAcesa(false);
      }
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) {
        void pedir();
      }
    };

    const t = setTimeout(() => {
      setSuportado(true);
      void pedir();
    }, 0);
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", aoVoltar);
      void lock?.release().catch(() => {});
    };
  }, [ativo]);

  return { suportado, acesa };
};

// Tela cheia (some a barra do navegador)
export const useTelaCheia = () => {
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const aoMudar = () => setCheia(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  const alternar = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // alguns navegadores (iPhone) não deixam: use "Adicionar à tela inicial"
    }
  };

  return { cheia, alternar };
};
