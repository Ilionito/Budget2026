"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { cn, normalizeLabel, resolveColor } from "@/lib/utils";
import { AVATAR_COLORS, type Category } from "@/types";

/**
 * Dialog de création / édition d'une catégorie (emoji, nom, couleur).
 * Partagé entre le Budget et le Dashboard pour une logique unique.
 */
export function CategoryDialog({
  open,
  category,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  /** null = création, sinon édition de cette catégorie. */
  category: Category | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (category: Category, isNew: boolean) => void;
}) {
  const { categories } = useAppStore();
  const [emoji, setEmoji] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const icon = category?.icon?.trim() ?? "";
      setEmoji([...icon].length > 0 && [...icon].length <= 3 ? icon : "");
      setName(category?.label ?? "");
      setColor(resolveColor(category?.color ?? AVATAR_COLORS[0]));
    }
  }, [open, category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Indique un nom de catégorie");
      return;
    }
    // Le contrôle de doublon ne s'applique que si le nom change réellement :
    // modifier seulement la couleur ou l'emoji doit toujours passer.
    const renamed =
      !category || normalizeLabel(name) !== normalizeLabel(category.label);
    if (
      renamed &&
      categories.some(
        (c) =>
          c.id !== category?.id &&
          normalizeLabel(c.label) === normalizeLabel(name)
      )
    ) {
      toast.error("Cette catégorie existe déjà");
      return;
    }
    setSaving(true);
    // En édition, un champ emoji vide conserve l'icône existante.
    // La colonne icon est NOT NULL en base : repli sur "tag".
    const payload = {
      label: name.trim(),
      icon: emoji.trim() || category?.icon || "tag",
      color,
    };
    const { data, error } = category
      ? await supabase
          .from("categories")
          .update(payload)
          .eq("id", category.id)
          .select()
          .single()
      : await supabase
          .from("categories")
          .insert({ ...payload, is_default: false })
          .select()
          .single();
    setSaving(false);
    if (error || !data) {
      // PGRST116 = zéro ligne touchée : symptôme typique d'une policy RLS manquante.
      const detail =
        error?.code === "PGRST116"
          ? "aucune ligne modifiée (policy RLS UPDATE manquante sur categories ?)"
          : error?.message;
      toast.error(
        `${
          category
            ? "Impossible de modifier la catégorie"
            : "Impossible de créer la catégorie"
        }${detail ? ` : ${detail}` : ""}`
      );
      return;
    }
    toast.success(category ? "Catégorie modifiée" : "Catégorie créée");
    onOpenChange(false);
    onSaved(data as Category, !category);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {category ? "Modifier la catégorie" : "Nouvelle catégorie"}
            </DialogTitle>
            <DialogDescription>
              Un emoji, un nom et une couleur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="cat-emoji">Emoji</Label>
              <Input
                id="cat-emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="🛒"
                maxLength={4}
                className="text-center"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cat-name">Nom</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Courses, Chien…"
                required
                autoFocus
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-8 rounded-full outline-none transition-transform duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-white/60",
                    color === c &&
                      "ring-2 ring-white ring-offset-2 ring-offset-zinc-900"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? (
              <Loader2 className="animate-spin" />
            ) : category ? null : (
              <Plus />
            )}
            {category ? "Enregistrer" : "Créer la catégorie"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
