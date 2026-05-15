"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="inline-flex items-center justify-center w-full md:w-auto px-3 py-1.5 text-sm text-ink-muted hover:text-ink hover:bg-bg-soft border border-line rounded-md transition"
    >
      Выйти
    </button>
  );
}
