"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, USERS } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string>(USERS[0].email);
  const [password, setPassword] = useState("");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSigning(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSigning(false);
    if (error) {
      // Message précis : identifiants invalides vs problème de config/réseau.
      const msg = /invalid login credentials/i.test(error.message)
        ? "Mot de passe incorrect"
        : `Connexion impossible : ${error.message}`;
      toast.error(msg);
      return;
    }
    router.replace("/dashboard");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
              <Home className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Budget 2026</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Choisis ton profil et entre le mot de passe
              </p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label>Profil</Label>
              <div className="grid grid-cols-2 gap-2">
                {USERS.map((user) => {
                  const selected = email === user.email;
                  return (
                    <button
                      key={user.email}
                      type="button"
                      onClick={() => setEmail(user.email)}
                      className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        selected
                          ? "border-indigo-500 bg-indigo-500/15 text-white"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {user.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="auth-password">Mot de passe</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" disabled={signing} className="w-full">
              {signing ? <Loader2 className="animate-spin" /> : <LogIn />}
              Se connecter
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
