"use client";

import { useState, useTransition } from "react";
import { updateSystemSetting } from "./actions";
import type { SettingRow } from "@/lib/admin/system-settings";

export default function SettingsForm({ setting }: { setting: SettingRow }) {
  const valueType: "boolean" | "number" | "string" | "json" =
    typeof setting.value === "boolean" ? "boolean" :
    typeof setting.value === "number"  ? "number"  :
    typeof setting.value === "string"  ? "string"  : "json";

  const [value, setValue] = useState<any>(
    valueType === "json" ? JSON.stringify(setting.value, null, 2) : setting.value
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving"); setError(null);
    const fd = new FormData();
    fd.set("key", setting.key);
    fd.set("type", valueType);
    fd.set("value", valueType === "boolean" ? String(!!value) : String(value));
    startTransition(async () => {
      try {
        await updateSystemSetting(fd);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1500);
      } catch (err: any) {
        setError(err?.message || "failed");
        setStatus("error");
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-[11px] text-ink-soft bg-bg-soft border border-line px-1.5 py-0.5 rounded">
            {setting.key}
          </code>
          <TypeBadge type={valueType} />
        </div>
        {setting.description && (
          <p className="mt-1.5 text-sm text-ink-muted">{setting.description}</p>
        )}
        {status === "error" && error && (
          <p className="mt-1.5 text-xs text-rose font-mono">err: {error}</p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {valueType === "boolean" ? (
          <button
            type="button"
            onClick={() => setValue((v: boolean) => !v)}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition border ${
              value ? "bg-lime-deep border-lime-deep" : "bg-bg-soft border-line-2"
            }`}
          >
            <span className={`inline-block size-5 rounded-full bg-paper shadow transition ${value ? "translate-x-8" : "translate-x-1"}`} />
          </button>
        ) : valueType === "number" ? (
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 rounded-md border border-line bg-bg-soft px-3 py-1.5 text-sm font-mono tabular text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
          />
        ) : valueType === "json" ? (
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            className="w-full md:w-80 rounded-md border border-line bg-bg-soft px-3 py-1.5 text-xs font-mono text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full md:w-56 rounded-md border border-line bg-bg-soft px-3 py-1.5 text-sm text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition"
          />
        )}

        <button
          type="submit"
          disabled={pending || status === "saving"}
          className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold transition ${
            status === "saved" ? "bg-lime-soft text-lime-deep border border-lime-deep/30" :
            status === "error" ? "bg-rose/10 text-rose border border-rose/30" :
            "bg-ink text-paper hover:bg-ink-soft"
          } disabled:opacity-60`}
        >
          {status === "saving" ? "..." : status === "saved" ? "✓" : status === "error" ? "err" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}

function TypeBadge({ type }: { type: string }) {
  const c = type === "boolean" ? "text-azure border-azure/30 bg-azure/10"
          : type === "number"  ? "text-emerald border-emerald/30 bg-emerald/10"
          : type === "json"    ? "text-orange border-orange/30 bg-orange/10"
          :                       "text-lime-deep border-lime-deep/30 bg-lime-soft";
  return (
    <span className={`inline-block font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${c}`}>
      {type}
    </span>
  );
}
