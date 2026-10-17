import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { journeyStages, useVisit } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export default function JourneyStepper({ current }: { current: string }) {
  const { data } = useVisit();
  const stages = journeyStages(data);
  return (
    <ol data-testid="journey-stepper" className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1">
      {stages.map((s, i) => {
        const active = s.key === current;
        return (
          <li key={s.key} className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Link
              to={s.path}
              data-testid={`stepper-${s.key}-link`}
              className={cn(
                "flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs sm:text-sm transition-[background-color,border-color,color] duration-200",
                active ? "border-eucalypt bg-white text-eucalypt font-semibold shadow-sm" : "border-transparent text-ink-muted hover:bg-white/70",
              )}
            >
              <span
                data-testid={`stepper-${s.key}-status`}
                data-done={s.done}
                className={cn(
                  "size-5 rounded-full grid place-items-center text-[10px] font-semibold",
                  s.done ? "bg-eucalypt text-white" : active ? "bg-terracotta text-white" : "bg-sand text-ink-muted",
                )}
              >
                {s.done ? <Check className="size-3" /> : i + 1}
              </span>
              {s.short}
            </Link>
            {i < stages.length - 1 && <span className="w-4 sm:w-8 h-px bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
