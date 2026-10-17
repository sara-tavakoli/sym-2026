import type { ReactNode } from "react";
import JourneyStepper from "@/components/JourneyStepper";

const BAND_IMG = "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?crop=entropy&cs=srgb&fm=jpg&w=1600&q=70";

export default function PageHeader({
  stage, eyebrow, title, intro, aside,
}: { stage?: string; eyebrow: string; title: string; intro?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-6 sm:pt-8 animate-fade-up">
      {stage && <JourneyStepper current={stage} />}
      <div data-testid="page-header-band" className="relative mt-4 overflow-hidden rounded-[28px] bg-eucalypt-deep">
        <img src={BAND_IMG} alt="" aria-hidden className="absolute inset-0 size-full object-cover object-[center_30%] opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-eucalypt-deep/85 via-eucalypt-deep/50 to-transparent" aria-hidden />
        <div className="relative p-4 sm:p-6 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl rounded-3xl bg-eucalypt-deep/35 backdrop-blur-md border border-white/25 p-5 sm:p-6 text-white">
            <p className="tracking-[0.15em] uppercase text-[11px] font-semibold text-[#FCD34D]">{eyebrow}</p>
            <h1 data-testid="page-title" className="mt-2 text-[28px] sm:text-[36px] leading-tight tracking-tight text-white">{title}</h1>
            {intro && <div className="mt-2 text-[15px] text-white/85 leading-relaxed">{intro}</div>}
          </div>
          {aside}
        </div>
      </div>
    </div>
  );
}
