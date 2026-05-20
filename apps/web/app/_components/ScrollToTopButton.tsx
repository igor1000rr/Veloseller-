"use client";
import { useEffect, useState } from "react";

/**
 * Кнопка "вверх" в правом нижнем углу.
 * Появляется после скролла > 600px, smooth scroll к top.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Наверх"
      className="fixed bottom-6 right-6 z-40 size-11 md:size-12 rounded-full bg-ink text-paper shadow-[0_10px_30px_-10px_rgba(10,10,8,0.4)] hover:bg-ink-soft transition flex items-center justify-center"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
