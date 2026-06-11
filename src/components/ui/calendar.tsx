"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { fr } from "date-fns/locale";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={fr}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col space-y-4",
        month: "space-y-3",
        month_caption: "flex justify-center relative items-center h-8",
        caption_label: "text-sm font-semibold text-zinc-200 capitalize",
        nav: "absolute inset-x-0 flex items-center justify-between px-1",
        button_previous: cn(
          "inline-flex size-7 items-center justify-center rounded-lg border border-zinc-800 bg-transparent text-zinc-400",
          "hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        ),
        button_next: cn(
          "inline-flex size-7 items-center justify-center rounded-lg border border-zinc-800 bg-transparent text-zinc-400",
          "hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 text-center text-[0.7rem] font-medium text-zinc-600 uppercase",
        weeks: "space-y-1 mt-1",
        week: "flex w-full",
        day: "relative w-9 h-9 p-0 text-center text-sm",
        day_button: cn(
          "w-9 h-9 rounded-lg p-0 font-normal text-zinc-200 transition-colors",
          "hover:bg-zinc-800 hover:text-white",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        ),
        selected:
          "[&>button]:bg-indigo-500 [&>button]:text-[#fff] [&>button]:hover:bg-indigo-400 [&>button]:rounded-lg",
        today: "[&>button]:bg-zinc-800 [&>button]:text-zinc-100 [&>button]:font-semibold",
        outside: "[&>button]:text-zinc-700 [&>button]:opacity-40",
        disabled: "[&>button]:text-zinc-700 [&>button]:opacity-30 [&>button]:pointer-events-none",
        hidden: "invisible",
        range_start: "[&>button]:rounded-l-lg",
        range_end: "[&>button]:rounded-r-lg",
        range_middle:
          "[&>button]:rounded-none [&>button]:bg-indigo-500/20 [&>button]:text-indigo-200",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
