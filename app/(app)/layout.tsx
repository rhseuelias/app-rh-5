import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import Sidebar from "@/components/Sidebar";
import { obterPapelUsuarioLogado } from "@/lib/permissoes";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const papel = await obterPapelUsuarioLogado();

  return (
    <div className="flex min-h-screen bg-[#faf7f3]">
      <Sidebar papel={papel} />
      <main className="flex-1 min-w-0 p-6 md:p-10 max-w-7xl mx-auto w-full print:p-0 print:max-w-none">{children}</main>
    </div>
  );
}
