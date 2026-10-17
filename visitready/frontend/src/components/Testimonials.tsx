import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PEOPLE = [
  { id: "anh", name: "Mrs Anh", age: 45, tag: "Easy for every age", tone: "bg-[#FCD34D] text-eucalypt-deep", quote: "I brought my mum along to try it and she found her own GP in minutes. The big, clear steps make it easy for older adults to use." },
  { id: "robert", name: "Mr Robert", age: 67, tag: "Follow-ups sorted", tone: "bg-eucalypt text-white", quote: "Follow-up appointments used to be a source of worry. Now the date is set for me and I just tick things off." },
  { id: "chloe", name: "Miss Chloe", age: 19, tag: "First booking", tone: "bg-terracotta text-white", quote: "Booking my own appointment for the first time wasn't bad at all. I just typed how I felt and it showed me where to go." },
  { id: "mei", name: "Ms Mei", age: 52, tag: "Ready to talk", tone: "bg-[#DBEAFE] text-[#1E40AF]", quote: "Writing my questions into the brief meant I didn't forget anything in the room. My doctor had already read it." },
  { id: "tom", name: "Mr Tom", age: 34, tag: "Daily habits", tone: "bg-[#DCFCE7] text-[#166534]", quote: "Fourteen days of medicine felt long. Seeing each day turn green — and the little note at the end — kept me going." },
];

export default function Testimonials() {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <section data-testid="testimonials-section" className="mx-auto max-w-7xl px-4 sm:px-6 mt-16" aria-labelledby="voices-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="voices-heading" className="text-[28px] sm:text-[34px] tracking-tight text-ink">People like you, every step of the way.</h2>
          <p className="text-[13px] text-ink-muted">Illustrative stories from fictional demo users.</p>
        </div>
        <div className="flex gap-2">
          <button aria-label="Previous stories" data-testid="testimonials-prev" onClick={() => scroll(-1)} className="size-10 rounded-full border border-line bg-white grid place-items-center hover:border-eucalypt/50 transition-colors duration-200"><ChevronLeft className="size-4" /></button>
          <button aria-label="Next stories" data-testid="testimonials-next" onClick={() => scroll(1)} className="size-10 rounded-full border border-line bg-white grid place-items-center hover:border-eucalypt/50 transition-colors duration-200"><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div ref={ref} data-testid="testimonials-track" className="mt-6 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {PEOPLE.map((p) => (
          <figure
            key={p.id}
            data-testid={`testimonial-${p.id}`}
            className="snap-start shrink-0 w-[85%] sm:w-[48%] lg:w-[31.5%] rounded-3xl bg-white border border-line p-6 flex flex-col transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_20px_40px_-28px_rgba(23,46,39,0.5)]"
          >
            <span aria-hidden className="font-heading text-[64px] leading-[0.6] h-8 text-terracotta/80 select-none">“</span>
            <blockquote className="mt-3 font-heading text-lg leading-snug text-ink flex-1">{p.quote}<span aria-hidden className="ml-0.5 text-terracotta/80">”</span></blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <span className={cn("size-11 rounded-full grid place-items-center font-semibold", p.tone)}>{p.name.split(" ")[1][0]}</span>
              <span>
                <span className="block text-sm font-semibold text-ink">{p.name}, {p.age}</span>
                <span className="block text-xs text-ink-muted">{p.tag}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
