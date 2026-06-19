"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminSaveBilling,
  adminSaveTrial,
  adminSaveRadar,
  adminPasswordReset,
  adminResyncConnection,
  type ActionResult,
} from "./actions";

type Status = "idle" | "saving" | "saved" | "error";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  function run(
    fd: FormData,
    fn: (fd: FormData) => Promise<ActionResult>,
    onOk?: (link?: string) => void,
  ) {
    setStatus("saving");
    setError(null);
    start(async () => {
      const res = await fn(fd);
      if (res.ok) {
        setStatus("saved");
        onOk?.(res.link);
        router.refresh();
        setTimeout(() => setStatus("idle"), 1800);
      } else {
        setError(res.error || "ошибка");
        setStatus("error");
      }
    });
  }

  return { pending, status, error, run };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-3">{title}</div>
      {children}
    </div>
  );
}

function ErrLine({ status, error }: { status: Status; error: string | null }) {
  if (status !== "error" || !error) return null;
  return <p className="mt-2 text-[11px] text-rose font-mono break-words">err: {error}</p>;
}

const inputCls = "w-24 rounded-md border border-line bg-bg-soft px-2.5 py-1.5 text-sm font-mono tabular text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition";
const selectCls = "rounded-md border border-line bg-bg-soft px-2.5 py-1.5 text-sm text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition";

function btnCls(status: Status) {
  return `inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-60 ${
    status === "saved" ? "bg-lime-soft text-lime-deep border border-lime-deep/30"
    : status === "error" ? "bg-rose/10 text-rose border border-rose/30"
    : "bg-ink text-paper hover:bg-ink-soft"
  }`;
}

function BillingForm({ sellerId, plan, warehousesLimit, skuLimit, veloLimits }: {
  sellerId: string;
  plan: string;
  warehousesLimit: number;
  skuLimit: number;
  veloLimits: Record<string, { wh: number; sku: number }>;
}) {
  const { pending, status, error, run } = useAction();
  const [p, setP] = useState(["trial", "starter", "growth", "pro"].includes(plan) ? plan : "trial");
  const [wh, setWh] = useState(String(warehousesLimit));
  const [sku, setSku] = useState(String(skuLimit));
  const [days, setDays] = useState("30");

  function onPlanChange(next: string) {
    setP(next);
    const g = veloLimits[next];
    if (g) { setWh(String(g.wh)); setSku(String(g.sku)); }
  }
  function submit() {
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("plan", p);
    fd.set("warehousesLimit", wh);
    fd.set("skuLimit", sku);
    fd.set("extendDays", days || "0");
    run(fd, adminSaveBilling);
  }

  return (
    <Card title="План и лимиты">
      <div className="space-y-2.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">План</span>
          <select value={p} onChange={(e) => onPlanChange(e.target.value)} className={selectCls}>
            <option value="trial">trial</option>
            <option value="starter">starter</option>
            <option value="growth">growth</option>
            <option value="pro">pro</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">Складов</span>
          <input type="number" value={wh} onChange={(e) => setWh(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">SKU/склад</span>
          <input type="number" value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls} />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">Продлить, дней</span>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
        </label>
        <p className="text-[10px] text-ink-hush font-mono leading-relaxed">
          «Продлить» добавит дни к подписке и снимет флаг сбоя оплаты. 0 — срок не трогать.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={pending || status === "saving"} className={btnCls(status)}>
            {status === "saving" ? "..." : status === "saved" ? "✓ сохранено" : status === "error" ? "ошибка" : "Сохранить"}
          </button>
        </div>
        <ErrLine status={status} error={error} />
      </div>
    </Card>
  );
}

function TrialForm({ sellerId }: { sellerId: string }) {
  const { pending, status, error, run } = useAction();
  const [days, setDays] = useState("14");
  function submit() {
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("trialDays", days);
    run(fd, adminSaveTrial);
  }
  return (
    <Card title="Триал">
      <div className="space-y-2.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">Триал на дней (с сегодня)</span>
          <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
        </label>
        <p className="text-[10px] text-ink-hush font-mono">Поставит trial_ends_at = сегодня + N дней.</p>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={pending || status === "saving"} className={btnCls(status)}>
            {status === "saving" ? "..." : status === "saved" ? "✓" : status === "error" ? "ошибка" : "Применить"}
          </button>
        </div>
        <ErrLine status={status} error={error} />
      </div>
    </Card>
  );
}

function RadarForm({ sellerId, radarPlan, radarLimits }: {
  sellerId: string;
  radarPlan: string;
  radarLimits: Record<string, number>;
}) {
  const { pending, status, error, run } = useAction();
  const init = ["none", "start", "seller", "pro", "expert"].includes(radarPlan) ? radarPlan : "none";
  const [rp, setRp] = useState(init);
  const [days, setDays] = useState("30");
  function submit() {
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("radarPlan", rp);
    fd.set("radarDays", days || "0");
    run(fd, adminSaveRadar);
  }
  const limit = rp !== "none" ? radarLimits[rp] : 0;
  return (
    <Card title="Radar">
      <div className="space-y-2.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-ink-muted text-xs">Тариф</span>
          <select value={rp} onChange={(e) => setRp(e.target.value)} className={selectCls}>
            <option value="none">none</option>
            <option value="start">start</option>
            <option value="seller">seller</option>
            <option value="pro">pro</option>
            <option value="expert">expert</option>
          </select>
        </label>
        {rp !== "none" ? (
          <>
            <label className="flex items-center justify-between gap-3">
              <span className="text-ink-muted text-xs">Продлить, дней</span>
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className={inputCls} />
            </label>
            <p className="text-[10px] text-ink-hush font-mono">Лимит брендов: {limit}. radar_active_until += дни (0 → 30).</p>
          </>
        ) : (
          <p className="text-[10px] text-ink-hush font-mono">Отключит Radar (лимит 0, срок сброшен).</p>
        )}
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={pending || status === "saving"} className={btnCls(status)}>
            {status === "saving" ? "..." : status === "saved" ? "✓" : status === "error" ? "ошибка" : "Применить"}
          </button>
        </div>
        <ErrLine status={status} error={error} />
      </div>
    </Card>
  );
}

function PasswordForm({ sellerId, email }: { sellerId: string; email: string }) {
  const { pending, status, error, run } = useAction();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  function submit() {
    setLink(null);
    setCopied(false);
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("email", email);
    run(fd, adminPasswordReset, (l) => setLink(l ?? null));
  }
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard может быть недоступен */ }
  }
  return (
    <Card title="Сброс пароля">
      <div className="space-y-2.5">
        <p className="text-[11px] text-ink-muted">
          Сгенерирует ссылку восстановления для <span className="font-mono">{email}</span>. Передайте её селлеру — сам пароль она не меняет.
        </p>
        <div className="flex justify-end">
          <button type="button" onClick={submit} disabled={pending || status === "saving"}
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-60 ${status === "error" ? "bg-rose/10 text-rose border border-rose/30" : "bg-ink text-paper hover:bg-ink-soft"}`}>
            {status === "saving" ? "..." : status === "error" ? "ошибка" : "Сгенерировать ссылку"}
          </button>
        </div>
        {link && (
          <div className="mt-1 space-y-1.5">
            <textarea readOnly value={link} rows={3}
              className="w-full rounded-md border border-line bg-bg-soft px-2.5 py-1.5 text-[11px] font-mono text-ink-soft" />
            <button type="button" onClick={copy}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border border-line bg-paper hover:bg-bg-soft transition">
              {copied ? "скопировано ✓" : "копировать"}
            </button>
          </div>
        )}
        <ErrLine status={status} error={error} />
      </div>
    </Card>
  );
}

export function SellerAdminActions(props: {
  sellerId: string;
  email: string;
  plan: string;
  warehousesLimit: number;
  skuLimit: number;
  radarPlan: string;
  veloLimits: Record<string, { wh: number; sku: number }>;
  radarLimits: Record<string, number>;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
      <BillingForm sellerId={props.sellerId} plan={props.plan} warehousesLimit={props.warehousesLimit} skuLimit={props.skuLimit} veloLimits={props.veloLimits} />
      <TrialForm sellerId={props.sellerId} />
      <RadarForm sellerId={props.sellerId} radarPlan={props.radarPlan} radarLimits={props.radarLimits} />
      <PasswordForm sellerId={props.sellerId} email={props.email} />
    </div>
  );
}

export function AdminResyncButton({ connectionId, disabled }: { connectionId: string; disabled?: boolean }) {
  const { pending, status, error, run } = useAction();
  function submit() {
    const fd = new FormData();
    fd.set("connectionId", connectionId);
    run(fd, adminResyncConnection);
  }
  if (disabled) return <span className="font-mono text-[10px] text-ink-hush">—</span>;
  return (
    <button type="button" onClick={submit} disabled={pending || status === "saving"} title={error || undefined}
      className={`inline-flex items-center px-2 py-1 rounded-md text-[11px] font-semibold border transition disabled:opacity-60 ${
        status === "saved" ? "border-lime-deep/30 bg-lime-soft text-lime-deep"
        : status === "error" ? "border-rose/30 bg-rose/10 text-rose"
        : "border-line bg-paper text-ink hover:border-lime-deep/40"
      }`}>
      {status === "saving" ? "…" : status === "saved" ? "✓ запущен" : status === "error" ? "ошибка" : "↻ ресинк"}
    </button>
  );
}
