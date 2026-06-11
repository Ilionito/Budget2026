"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? "/dashboard" : "/auth");
    });
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex animate-pulse flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-400">
          <Home className="size-5" />
        </div>
        <p className="text-sm text-zinc-600">Budget 2026</p>
      </div>
    </div>
  );
}
