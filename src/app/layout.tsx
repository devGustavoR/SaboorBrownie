import "@/styles/globals.css";
import type { Metadata } from "next";
import { Work_Sans } from "next/font/google";

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans", // Nome exato usado no globals.css
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Saboor Brownie Dashboard",
  description: "Gerencie suas vendas de brownie",
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
      <body className={`${workSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
