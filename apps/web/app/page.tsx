import type { Metadata } from "next";
import ScrollToTopButton from "./_components/ScrollToTopButton";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { landingMetadata, landingJsonLd } from "./_landing/seo";
import LandingHeader from "./_landing/Header";
import LandingHero from "./_landing/Hero";
import LandingShowcase from "./_landing/Showcase";
import LandingStats from "./_landing/Stats";
import LandingFeatures from "./_landing/Features";
import LandingSegments from "./_landing/Segments";
import LandingStory from "./_landing/Story";
import LandingBottom from "./_landing/Bottom";
import LandingFooter from "./_landing/Footer";

// Лендинг — server component с проверкой сессии. Авто-обновление на каждый
// запрос гарантирует, что зашедший в свой аккаунт юзер увидит "В кабинет"
// вместо "Войти", и наоборот.
//
// Разметка и контент разнесены по app/_landing/* (Header/Hero/Showcase/Stats/
// Features/Segments/Story/Bottom/Footer + data/seo/ui): монолит 42КБ не пролезал
// в MCP-пуш, плюс секции теперь правятся независимо. Строки — словарь landing.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Главная имеет свой title без template (см. _landing/seo.ts).
export const metadata: Metadata = landingMetadata;

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAuthed = !!user;

  return (
    <main className="relative bg-paper-warm text-ink overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd) }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-noise opacity-100 mix-blend-multiply" />
      <div
        aria-hidden
        className="pointer-events-none fixed -top-40 -left-40 size-[700px] rounded-full blur-3xl opacity-50"
        style={{ background: "radial-gradient(closest-side, rgba(132,204,22,0.25), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -bottom-40 -right-40 size-[600px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(2,132,199,0.15), transparent 70%)" }}
      />

      <LandingHeader isAuthed={isAuthed} />
      <LandingHero isAuthed={isAuthed} />
      <LandingShowcase />
      <LandingStats />
      <LandingFeatures />
      <LandingSegments />
      <LandingStory />
      <LandingBottom isAuthed={isAuthed} />
      <LandingFooter isAuthed={isAuthed} />

      {/* Кнопка "вверх" — появляется после скролла */}
      <ScrollToTopButton />
    </main>
  );
}
