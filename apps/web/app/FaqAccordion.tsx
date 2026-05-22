"use client";
import { useState } from "react";
import { Icons } from "./_components/Icons";
import { faqItems } from "@/lib/faq";

export default function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqItems.map((it, i) => (
        <button
          key={i}
          onClick={() => setOpen(open === i ? null : i)}
          className="w-full text-left py-5 md:py-6 px-1 group hover:bg-bg-soft/50 transition"
        >
          <div className="flex items-start justify-between gap-4 md:gap-6">
            <div className="flex-1">
              <span className="font-mono text-[10px] text-ink-hush tabular tracking-widest">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 font-display text-lg md:text-xl text-ink leading-tight font-medium">{it.q}</h3>
              <div className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] mt-3 opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <p className="overflow-hidden text-ink-muted leading-relaxed text-sm md:text-base">{it.a}</p>
              </div>
            </div>
            <span className={`shrink-0 size-8 md:size-9 rounded-full border border-line-2 flex items-center justify-center transition-transform ${open === i ? "rotate-45 bg-lime-deep border-lime-deep text-paper" : "text-ink-soft group-hover:border-lime-deep/50"}`}>
              <Icons.Plus />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
