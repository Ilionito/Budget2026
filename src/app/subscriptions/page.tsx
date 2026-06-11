"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import {
  CalendarClock,
  Loader2,
  Lock,
  Plus,
  Power,
  Repeat,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { CategoryIcon } from "@/components/shared/CategoryIcon";
import { PageHeader } from "@/components/shared/PageHeader";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import {
  cn,
  formatCurrency,
  formatShortDate,
  monthlyEquivalent,
} from "@/lib/utils";
import {
  FREQUENCIES,
  FREQUENCY_SUFFIX,
  type Frequency,
  type Subscription,
} from "@/types";

function SubscriptionRow({
  subscription,
  mine,
  onToggle,
  onDelete,
}: {
  subscription: Subscription;
  mine: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
}) {
  const { categories } = useAppStore();
  const category =
    categories.find((c) => c.id === subscription.category_id) ?? null;
  const frequencyLabel =
    FREQUENCIES.find((f) => f.value === subscription.frequency)?.label ??
    subscription.frequency;
  const monthly = monthlyEquivalent(
    Number(subscription.amount),
    subscription.frequency
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors duration-150 hover:bg-zinc-800/40",
        !subscription.is_active && "opacity-50"
      )}
    >
      <CategoryIcon category={category} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-zinc-200">
            {subscription.label}
          </p>
          {subscription.is_private && (
            <Lock className="size-3 shrink-0 text-zinc-600" aria-label="Privé" />
          )}
          {subscription.is_shared && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-medium text-indigo-300">
              <Users className="size-2.5" aria-hidden />
              Commun
            </span>
          )}
        </div>
        <p className="truncate text-xs text-zinc-600">
          {category?.label ?? "Sans catégorie"} · {frequencyLabel}
          {subscription.next_date
            ? ` · prochain le ${formatShortDate(subscription.next_date)}`
            : ""}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-zinc-200">
          {formatCurrency(Number(subscription.amount))}
          <span className="text-xs font-normal text-zinc-600">
            {FREQUENCY_SUFFIX[subscription.frequency]}
          </span>
        </p>
        {subscription.frequency !== "monthly" && (
          <p className="text-xs tabular-nums text-zinc-600">
            ≈ {formatCurrency(monthly)}/mois
          </p>
        )}
      </div>
      {mine && (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-zinc-600 hover:text-amber-400"
            onClick={onToggle}
            aria-label={subscription.is_active ? "Suspendre" : "Réactiver"}
          >
            <Power className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-zinc-600 hover:text-rose-400"
            onClick={onDelete}
            aria-label="Supprimer"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function AddSubscriptionDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { profile, categories } = useAppStore();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [categoryId, setCategoryId] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel("");
      setAmount("");
      setFrequency("monthly");
      setCategoryId("");
      setNextDate(format(new Date(), "yyyy-MM-dd"));
      setIsPrivate(false);
      setIsShared(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const parsed = Number.parseFloat(amount.replace(",", "."));
    if (!label.trim()) {
      toast.error("Indique un libellé");
      return;
    }
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Montant invalide");
      return;
    }
    if (!categoryId) {
      toast.error("Choisis une catégorie");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("subscriptions").insert({
      user_id: profile.id,
      label: label.trim(),
      amount: Math.round(parsed * 100) / 100,
      frequency,
      category_id: categoryId,
      next_date: nextDate || null,
      is_active: true,
      // Un abonnement commun est visible par les deux : on force le privé à faux.
      is_private: isShared ? false : isPrivate,
      is_shared: isShared,
    });
    setSaving(false);
    if (error) {
      toast.error("Impossible d'ajouter l'abonnement");
      return;
    }
    toast.success("Abonnement ajouté");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Nouvel abonnement</DialogTitle>
            <DialogDescription>
              Netflix, salle de sport, assurance…
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label htmlFor="sub-label">Libellé</Label>
            <Input
              id="sub-label"
              placeholder="Netflix"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sub-amount">
                {isShared ? "Montant — ta part (moitié) (€)" : "Montant (€)"}
              </Label>
              <Input
                id="sub-amount"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Fréquence</Label>
              <Select
                value={frequency}
                onValueChange={(value) => setFrequency(value as Frequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Catégorie</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sub-next">Prochaine échéance</Label>
              <DatePicker
                id="sub-next"
                value={nextDate}
                onChange={setNextDate}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Lock className="size-4 text-zinc-500" />
              <div>
                <p className="text-sm text-zinc-200">Abonnement privé</p>
                <p className="text-xs text-zinc-600">Visible uniquement par toi</p>
              </div>
            </div>
            <Switch
              checked={isPrivate}
              disabled={isShared}
              onCheckedChange={setIsPrivate}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <Users className="size-4 text-indigo-400" />
              <div>
                <p className="text-sm text-zinc-200">Abonnement commun</p>
                <p className="text-xs text-zinc-600">
                  Partagé en deux · saisis ta part (moitié)
                </p>
              </div>
            </div>
            <Switch
              checked={isShared}
              onCheckedChange={(checked) => {
                setIsShared(checked);
                if (checked) setIsPrivate(false);
              }}
            />
          </div>

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            Ajouter l&rsquo;abonnement
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubscriptionsContent() {
  const { profile, partner, dataVersion, ready, bumpDataVersion } =
    useAppStore();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .order("label");
    setSubscriptions((data as Subscription[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!ready || !profile) return;
    setLoading(true);
    load();
  }, [ready, profile, dataVersion, load]);

  const sharedActive = subscriptions.filter((s) => s.is_shared && s.is_active);
  const mineActive = subscriptions.filter(
    (s) => !s.is_shared && s.user_id === profile?.id && s.is_active
  );
  const mineSuspended = subscriptions.filter(
    (s) => !s.is_shared && s.user_id === profile?.id && !s.is_active
  );
  const partnerActive = subscriptions.filter(
    (s) => !s.is_shared && s.user_id !== profile?.id && s.is_active
  );

  // Chacun saisit sa propre part (moitié) d'un abonnement commun, comme une
  // entrée à part. On additionne donc simplement les montants saisis, sans
  // jamais doubler.
  // Total foyer : toutes les charges actives (les deux), au montant saisi.
  const householdMonthly = subscriptions
    .filter((s) => s.is_active)
    .reduce((sum, s) => sum + monthlyEquivalent(Number(s.amount), s.frequency), 0);
  // Mes charges : mes abonnements actifs (perso + ma part des communs).
  const myMonthly = subscriptions
    .filter((s) => s.is_active && s.user_id === profile?.id)
    .reduce((sum, s) => sum + monthlyEquivalent(Number(s.amount), s.frequency), 0);

  /** Retire du compte les échéances futures non pointées d'un abonnement. */
  async function removeFutureEntries(subscriptionId: string) {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    await supabase
      .from("ledger_entries")
      .delete()
      .eq("subscription_id", subscriptionId)
      .eq("is_checked", false)
      .gte("date", todayStr);
  }

  async function handleToggle(subscription: Subscription) {
    const reactivating = !subscription.is_active;
    if (!reactivating) {
      // Suspension : on enlève les échéances à venir non encore pointées.
      await removeFutureEntries(subscription.id);
    }
    const { error } = await supabase
      .from("subscriptions")
      // materialized_until remis à zéro : à la réactivation, le compte
      // regénère les échéances futures à la prochaine ouverture.
      .update({ is_active: reactivating, materialized_until: null })
      .eq("id", subscription.id);
    if (error) {
      toast.error("Impossible de modifier cet abonnement");
      return;
    }
    toast.success(reactivating ? "Abonnement réactivé" : "Abonnement suspendu");
    bumpDataVersion();
  }

  async function handleDelete(subscription: Subscription) {
    // D'abord les échéances futures non pointées, ensuite l'abonnement.
    // Les écritures passées / déjà pointées sont conservées (historique).
    await removeFutureEntries(subscription.id);
    const { error } = await supabase
      .from("subscriptions")
      .delete()
      .eq("id", subscription.id);
    if (error) {
      toast.error("Impossible de supprimer cet abonnement");
      return;
    }
    toast.success("Abonnement supprimé");
    bumpDataVersion();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Abonnements" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Abonnements"
        subtitle="Charges récurrentes du foyer"
        action={
          <Button onClick={() => setAddOpen(true)}>
            <Plus />
            Ajouter
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Total foyer / mois</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-white">
            {formatCurrency(householdMonthly)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Mes charges / mois</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-indigo-400">
            {formatCurrency(myMonthly)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Total annuel foyer</p>
          <p className="mt-2 text-xl font-semibold tabular-nums text-amber-400">
            {formatCurrency(householdMonthly * 12)}
          </p>
        </Card>
      </div>

      {sharedActive.length > 0 && (
        <Card>
          <CardTitle>Abonnements communs</CardTitle>
          <div className="mt-2">
            {sharedActive.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                mine
                onToggle={() => handleToggle(s)}
                onDelete={() => handleDelete(s)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Listes côte à côte sur grand écran pour limiter le scroll. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardTitle>Mes abonnements actifs</CardTitle>
        {mineActive.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Repeat className="size-6 text-zinc-700" />
            <p className="text-sm text-zinc-600">Aucun abonnement actif</p>
          </div>
        ) : (
          <div className="mt-2">
            {mineActive.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                mine
                onToggle={() => handleToggle(s)}
                onDelete={() => handleDelete(s)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>
          Abonnements de {partner?.display_name ?? "ton partenaire"}
        </CardTitle>
        {partnerActive.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarClock className="size-6 text-zinc-700" />
            <p className="text-sm text-zinc-600">
              Aucun abonnement partagé visible
            </p>
          </div>
        ) : (
          <div className="mt-2">
            {partnerActive.map((s) => (
              <SubscriptionRow key={s.id} subscription={s} mine={false} />
            ))}
          </div>
        )}
      </Card>

      {mineSuspended.length > 0 && (
        <Card>
          <CardTitle>Mes abonnements suspendus</CardTitle>
          <div className="mt-2">
            {mineSuspended.map((s) => (
              <SubscriptionRow
                key={s.id}
                subscription={s}
                mine
                onToggle={() => handleToggle(s)}
                onDelete={() => handleDelete(s)}
              />
            ))}
          </div>
        </Card>
      )}
      </div>

      <AddSubscriptionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={bumpDataVersion}
      />
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <AppShell fullWidth>
      <SubscriptionsContent />
    </AppShell>
  );
}
