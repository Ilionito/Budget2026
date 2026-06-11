import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium [&_svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-indigo-500/15 text-indigo-300",
        secondary: "border-transparent bg-zinc-800 text-zinc-400",
        outline: "border-zinc-700 text-zinc-400",
        amber: "border-transparent bg-amber-400/10 text-amber-400",
        emerald: "border-transparent bg-emerald-500/10 text-emerald-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
