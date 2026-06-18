"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

export default function DeleteButton({
  connectionId,
  connectionName,
  variant = "compact",
}: {
  connectionId: string;
  connectionName: string;
  variant?: "compact" | "full";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? t("connections.delete.errStatus", { status: res.status }));
        return;
      }
      if (variant === "full") {
        router.push("/connections");
      } else {
        router.refresh();
      }
    } catch (e: any) {
      setError(e?.message || t("connections.delete.errNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        disabled={busy}
        className={
          variant === "full"
            ? "inline-flex items-center px-4 py-2 rounded-lg border border-rose/30 bg-rose/5 text-rose hover:bg-rose/10 text-sm font-mono uppercase tracking-wider transition"
            : "inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-line text-ink-hush hover:text-rose hover:border-rose/30 text-xs font-mono uppercase tracking-wider transition"
        }
        title={t("connections.delete.title")}
      >
        {t("connections.delete.label")}
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs text-rose font-mono">
        {t("connections.delete.confirm", { name: connectionName })}
      </span>
      <button
        onClick={doDelete}
        disabled={busy}
        className="px-3 py-1 rounded bg-rose text-paper text-xs font-mono uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition"
      >
        {busy ? t("connections.delete.busy") : t("connections.delete.yes")}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="px-3 py-1 rounded border border-line text-xs font-mono uppercase tracking-wider text-ink-muted hover:bg-bg-soft transition"
      >
        {t("connections.delete.cancel")}
      </button>
      {error && <span className="text-xs text-rose font-mono">{error}</span>}
    </div>
  );
}
