"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS, type Transaction } from "@/types";

function csvEscape(value: string): string {
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function SettingsContent() {
  const router = useRouter();
  const { profile, partner, categories, setProfile, reset } = useAppStore();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [color, setColor] = useState(profile?.avatar_color ?? AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name);
      setColor(profile.avatar_color);
    }
  }, [profile]);

  async function handleSave() {
    if (!profile) return;
    if (!name.trim()) {
      toast.error("Indique un nom d'affichage");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name.trim(), avatar_color: color })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Impossible d'enregistrer le profil");
      return;
    }
    setProfile({ ...profile, display_name: name.trim(), avatar_color: color });
    toast.success("Profil mis à jour");
  }

  async function handleExport() {
    setExporting(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false });
    setExporting(false);
    if (error || !data) {
      toast.error("Export impossible");
      return;
    }
    const transactions = data as Transaction[];
    const header = ["Date", "Libellé", "Montant", "Catégorie", "Personne", "Privé", "Note"];
    const lines = transactions.map((tx) => {
      const category =
        categories.find((c) => c.id === tx.category_id)?.label ?? "";
      const person =
        tx.user_id === profile?.id
          ? profile?.display_name ?? ""
          : partner?.display_name ?? "";
      return [
        tx.date,
        csvEscape(tx.label),
        String(tx.amount).replace(".", ","),
        csvEscape(category),
        csvEscape(person),
        tx.is_private ? "Oui" : "Non",
        csvEscape(tx.note ?? ""),
      ].join(";");
    });
    const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "budget-2026-transactions.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success(
      `${transactions.length} transaction${transactions.length > 1 ? "s" : ""} exportée${transactions.length > 1 ? "s" : ""}`
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    reset();
    router.replace("/auth");
  }

  const preview = profile
    ? { ...profile, display_name: name || profile.display_name, avatar_color: color }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Réglages" subtitle="Profil, export et session" />

      <Card>
        <CardTitle>Mon profil</CardTitle>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            <UserAvatar profile={preview} size="lg" />
            <p className="text-xs text-zinc-600">Aperçu</p>
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid max-w-sm gap-1.5">
              <Label htmlFor="profile-name">Nom d&rsquo;affichage</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ton prénom"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Couleur de l&rsquo;avatar</Label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-8 rounded-full outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white/60",
                      color === c &&
                        "ring-2 ring-white ring-offset-2 ring-offset-zinc-950"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Couleur ${c}`}
                  />
                ))}
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Partenaire</CardTitle>
        {partner ? (
          <div className="mt-4 flex items-center gap-3">
            <UserAvatar profile={partner} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-200">
                {partner.display_name}
              </p>
              <p className="truncate text-xs text-zinc-600">{partner.email}</p>
            </div>
            <Badge variant="secondary">Lecture seule</Badge>
          </div>
        ) : (
          <p className="mt-4 text-sm text-zinc-600">
            Ton partenaire ne s&rsquo;est pas encore connecté.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>Export</CardTitle>
        <p className="mt-2 text-sm text-zinc-500">
          Télécharge toutes les transactions visibles au format CSV (date,
          libellé, montant, catégorie, personne, privé, note).
        </p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          Exporter en CSV
        </Button>
      </Card>

      <Card>
        <CardTitle>Session</CardTitle>
        <p className="mt-2 text-sm text-zinc-500">
          Connecté en tant que{" "}
          <span className="text-zinc-300">{profile?.email}</span>
        </p>
        <Button variant="destructive" className="mt-4" onClick={handleSignOut}>
          <LogOut />
          Se déconnecter
        </Button>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsContent />
    </AppShell>
  );
}
