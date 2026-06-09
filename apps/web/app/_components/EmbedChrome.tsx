"use client";
import { useEffect } from "react";

// Правка 10 (#2): когда карточка открыта в Drawer через iframe (?embed=1),
// ставим data-embed на <html> — CSS прячет шапку кабинета, остаётся только
// контент карточки. В обычном окне (без флага) ничего не делаем.
export default function EmbedChrome() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("embed") !== "1") return;
    const el = document.documentElement;
    el.setAttribute("data-embed", "1");
    return () => el.removeAttribute("data-embed");
  }, []);
  return null;
}
