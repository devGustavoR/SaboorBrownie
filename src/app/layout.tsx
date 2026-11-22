import { RegistrarSW } from "@/components/RegistrarSW";
import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";
import { Work_Sans } from "next/font/google";

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans", // Nome exato usado no globals.css
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Saboor Brownie Dashboard",
  description: "Gerencie suas vendas de brownie",
  applicationName: "Saboor Brownie",
  appleWebApp: { capable: true, title: "Saboor", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#6B21A8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-br">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={`${workSans.variable} antialiased`}>
        {children}
        <RegistrarSW />
      </body>
    </html>
  );
}
