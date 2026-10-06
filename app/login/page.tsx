"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import LogoAppliq from "@/components/LogoAppliq";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro("E-mail ou senha inválidos.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF6F0] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <LogoAppliq tamanho={44} slogan />
          <p className="text-stone-600 text-sm mt-5">
            Entre com sua conta de acesso
          </p>
        </div>

        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
            />
          </div>
          <div>
            <label className="label">Senha</label>
            <input
              type="password"
              required
              className="input"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}

          <button type="submit" disabled={carregando} className="btn-primary w-full">
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

      </div>
    </div>
  );
}
