import type { MetadataRoute } from "next";

// Permite instalar o sistema como app (ícone na tela inicial do tablet)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Saboor Brownie",
    short_name: "Saboor",
    description: "Vendas e eventos da Saboor Brownie",
    start_url: "/dashboard/dia-evento",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F3E8FF",
    theme_color: "#6B21A8",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
