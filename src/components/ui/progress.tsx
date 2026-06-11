import * as React from "react";
import { cn } from "@/lib/utils";

function Progress({
  value,
  className,
  indicatorClassName,
  indicatorStyle,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
  indicatorStyle?: React.CSSProperties;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-zinc-800",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full bg-indigo-500 transition-all duration-300",
          indicatorClassName
        )}
        style={{ width: `${clamped}%`, ...indicatorStyle }}
      />
    </div>
  );
}

export { Progress };
