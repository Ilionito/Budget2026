import * as React from "react";
import { cn, getInitials, resolveColor } from "@/lib/utils";
import type { Profile } from "@/types";

const SIZES = {
  sm: "size-6 text-[9px]",
  md: "size-9 text-xs",
  lg: "size-16 text-xl",
} as const;

export function UserAvatar({
  profile,
  size = "md",
  className,
}: {
  profile: Profile | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const color = resolveColor(profile?.avatar_color);
  return (
    <div
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-[#fff]",
        SIZES[size],
        className
      )}
      style={{ backgroundColor: color }}
      title={profile?.display_name}
    >
      {getInitials(profile?.display_name ?? "?")}
    </div>
  );
}
