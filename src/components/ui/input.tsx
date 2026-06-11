import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-100 transition-colors duration-150 outline-none placeholder:text-zinc-600 focus-visible:border-indigo-500/60 focus-visible:ring-2 focus-visible:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:dark]",
        className
      )}
      {...props}
    />
  );
}

export { Input };
