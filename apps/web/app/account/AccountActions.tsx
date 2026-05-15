"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleExport = async () => {
    setBusy("export");
    setError(null);
    try {
      const res = await fetch("/api/account/export");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `veloseller-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || "Не удалось экспортировать данные");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (confirmText !== "DELETE-MY-ACCOUNT") {
      setError('Введите фразу "DELETE-MY-ACCOUNT" для подтверждения');
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE-MY-ACCOUNT" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      // После удаления редирект на главную
      router.push("/?deleted=true");
    } catch (e: any) {
      setError(e.message || "Не удалось удалить аккаунт");
      setBusy(null);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-line bg-paper p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-2">
          Экспорт данных
        </h2>
        <p className="text-sm text-ink-muted mb-4">
          Скачать все ваши данные в JSON по GDPR Article 20 (data portability).
        </p>
        <button
          onClick={handleExport}
          disabled={busy !== null}
          className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-ink bg-ink text-paper rounded hover:opacity-90 disabled:opacity-50"
        >
          {busy === "export" ? "Готовлю JSON..." : "Скачать JSON"}
        </button>
      </div>

      <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose font-semibold mb-2">
          Опасная зона — удаление аккаунта
        </h2>
        <p className="text-sm text-ink-muted mb-4">
          Необратимо удалит все ваши данные: профиль, продукты, метрики, история. Действие невозможно отменить.
        </p>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-rose text-rose rounded hover:bg-rose hover:text-paper"
          >
            Удалить аккаунт
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Для подтверждения введите фразу <code className="font-mono bg-bg-soft px-1">DELETE-MY-ACCOUNT</code>:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE-MY-ACCOUNT"
              className="w-full px-3 py-2 border border-line rounded font-mono text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={busy !== null || confirmText !== "DELETE-MY-ACCOUNT"}
                className="px-4 py-2 text-sm font-mono uppercase tracking-wider bg-rose text-paper rounded hover:opacity-90 disabled:opacity-50"
              >
                {busy === "delete" ? "Удаляю..." : "Подтвердить удаление"}
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setConfirmText(""); setError(null); }}
                className="px-4 py-2 text-sm font-mono uppercase tracking-wider border border-line rounded hover:bg-bg-soft"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-rose">{error}</p>
        )}
      </div>
    </section>
  );
}
