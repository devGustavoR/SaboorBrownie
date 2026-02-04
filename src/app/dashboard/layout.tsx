import { Navbar } from "@/components/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen w-full">
      {/* A Navbar fica aqui, protegida dentro do /dashboard */}
      <Navbar />

      <main className="flex-1 w-full bg-brand-bg">{children}</main>
    </div>
  );
}
