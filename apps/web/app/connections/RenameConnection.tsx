"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

/**
 * Инлайн-переименование склада. Карандаш рядом с названием → поле ввода.
 * Enter — сохранить, Esc — отмена. PATCH /api/connections/[id] { name }.
 */
export default function RenameConnection({
  connectionId,
  currentName,
}: {
  connectionId: string;
  currentName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function cancel() {
    setEditing(false);
    setName(currentName);
    setErr(null);
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) {
      cancel();
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error || t("connections.rename.errSave"));
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setErr(t("connections.rename.errNetwork"));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span>{currentName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={t("connections.rename.title")}
          aria-label={t("connections.rename.title")}
          className="inline-flex items-center justify-center size-7 rounded-md border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 transition text-sm align-middle"
        >
          ✎
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        maxLength={100}
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        className="px-2 py-1 rounded-md border border-line bg-paper text-ink text-xl sm:text-2xl font-display font-medium tracking-tight outline-none focus:border-lime-deep/50 min-w-[200px] max-w-full"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-ink text-paper text-sm font-semibold hover:bg-ink-soft disabled:opacity-50 transition"
      >
        {saving ? "…" : t("connections.rename.save")}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={saving}
        className="inline-flex items-center px-3 py-1.5 rounded-lg border border-line bg-paper text-ink-muted text-sm hover:text-ink transition"
      >
        {t("connections.rename.cancel")}
      </button>
      {err && <span className="text-rose text-xs w-full">{err}</span>}
    </span>
  );
}
