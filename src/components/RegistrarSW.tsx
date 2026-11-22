"use client";

import { useEffect } from "react";

// Registra o service worker (só em produção, para não atrapalhar o dev)
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // sem service worker o sistema funciona igual, só não abre offline
    });
  }, []);
  return null;
}
