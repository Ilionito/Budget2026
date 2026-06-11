"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Loader2, MailCheck, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase, ALLOWED_EMAILS } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace("/dashboard");
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!ALLOWED_EMAILS.includes(normalized)) {
      toast.error("Adresse email non autorisée");
      return;
    }
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setSending(false);
    if (error) {
      toast.error("Impossible d'envoyer le lien. Réessaie dans un instant.");
      return;
    }
    setSentTo(normalized);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-8">
        {sentTo ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
              <MailCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                Vérifie ta boîte mail
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Un lien de connexion a été envoyé à{" "}
                <span className="font-medium text-zinc-300">{sentTo}</span>.
                Clique dessus pour accéder à Budget 2026.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setSentTo(null)}
            >
              Utiliser une autre adresse
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
                <Home className="size-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Budget 2026</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  Connecte-toi avec ton adresse autorisée
                </p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="auth-email">Adresse email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  placeholder="prenom@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={sending} className="w-full">
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
                Recevoir le lien de connexion
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
