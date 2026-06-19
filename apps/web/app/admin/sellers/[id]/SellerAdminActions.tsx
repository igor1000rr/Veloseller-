"use client";

import { useState, useTransition } from "react";
import {
  adminSaveBilling, adminSaveTrial, adminSaveRadar, adminPasswordReset,
  type ActionResult,
} from "./actions";

// Сетка лимитов для подстановки в форме (совпадает с lib/robokassa.ts).
const WH: Record<string, number> = { starter: 2, growth: 5, pro: 15 };
const SKU: Record<string, number> = { starter: 1000, growth: 2000, pro: 10000 };
const RADAR_BRANDS: Record<string, number> = { trial: 3, start: 3, seller: 10, pro: 30, expert: 100 };

const inputCls = "w-full rounded-md border border-line bg-bg-soft px-3 py-1.5 text-sm text-ink focus:bg-paper focus:border-lime-deep focus:outline-none transition";
const labelCls = "font-mono text-[10px] uppercase tracking-[0.15em] text-ink-hush";
const btnCls = "inline-flex items-center justify-center rounded-md bg-ink text-paper px-4 py-2 text-sm font-semibold hover:bg-ink-soft transition disabled:opacity-60";

export default function SellerAdminActions(props: {
  sellerId: string;
  plan: string;
  warehousesLimit: number;
  skuLimit: number;
  subscriptionExpiresAt: string | null;
  radarPlan: string;
  radarBrandsLimit: number;
  radarActiveUntil: string | null;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="size-1 rounded-full bg-orange" />
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">Управление аккаунтом</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BillingForm
          sellerId={props.sellerId}
          plan={props.plan}
          warehousesLimit={props.warehousesLimit}
          skuLimit={props.skuLimit}
          subscriptionExpiresAt={props.subscriptionExpiresAt}
        />
        <div className="space-y-4">
          <TrialForm sellerId={props.sellerId} />
          <RadarForm
            sellerId={props.sellerId}
            radarPlan={props.radarPlan}
            radarBrandsLimit={props.radarBrandsLimit}
            radarActiveUntil={props.radarActiveUntil}
          />
          <PasswordResetForm sellerId={props.sellerId} />
        </div>
      </div>
    </section>
  );
}

function useAction() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionResult | null>(null);
  const run = (fn: (fd: FormData) => Promise<ActionResult>, fd: FormData) =>
    start(async () => {
      try { setRes(await fn(fd)); }
      catch (e: any) { setRes({ ok: false, message: e?.message || "ошибка" }); }
    });
  return { pending, res, run };
}

function ResultBanner({ res }: { res: ActionResult | null }) {
  if (!res) return null;
  return (
    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${res.ok ? "border-lime-deep/30 bg-lime-soft text-lime-deep" : "border-rose/30 bg-rose/10 text-rose"}`}>
      <div className="font-medium">{res.message}</div>
      {res.link && (
        <div className="mt-2">
          <input readOnly value={res.link} onFocus={e => e.currentTarget.select()}
            className="w-full rounded border border-line bg-paper px-2 py-1 font-mono text-[10px] text-ink" />
          <p className="mt-1 text-ink-hush">Скопируй и передай селлеру — ссылка одноразовая.</p>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <h3 className="font-display text-base font-medium text-ink mb-3">{title}</h3>
      {children}
    </div>
  );
}

function BillingForm(props: {
  sellerId: string; plan: string; warehousesLimit: number; skuLimit: number; subscriptionExpiresAt: string | null;
}) {
  const { pending, res, run } = useAction();
  const initialPlan = ["starter", "growth", "pro"].includes(props.plan) ? props.plan : props.plan === "trial" ? "trial" : "starter";
  const [plan, setPlan] = useState(initialPlan);
  const [wh, setWh] = useState(String(props.warehousesLimit));
  const [sku, setSku] = useState(String(props.skuLimit));
  const [months, setMonths] = useState("1");

  function onPlanChange(v: string) {
    setPlan(v);
    if (v in WH) { setWh(String(WH[v])); setSku(String(SKU[v])); }
    if (v === "trial") { setWh("15"); setSku("10000"); }
  }

  const isPaid = plan !== "trial";
  const exp = props.subscriptionExpiresAt ? new Date(props.subscriptionExpiresAt) : null;
  const expActive = exp ? exp.getTime() > Date.now() : false;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("sellerId", props.sellerId);
    fd.set("plan", plan);
    if (isPaid) { fd.set("warehouses", wh); fd.set("sku", sku); fd.set("months", months); }
    run(adminSaveBilling, fd);
  }

  return (
    <Card title="Тариф и лимиты">
      <div className="mb-3 font-mono text-[11px] text-ink-hush">
        Подписка:{" "}
        {exp
          ? <span className={expActive ? "text-lime-deep" : "text-rose"}>{exp.toLocaleDateString("ru-RU")} {expActive ? "(активна)" : "(истекла)"}</span>
          : <span className="text-ink-muted">нет (триал)</span>}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>План</label>
          <select value={plan} onChange={e => onPlanChange(e.target.value)} className={inputCls}>
            <option value="trial">Trial (откат)</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="pro">Pro</option>
          </select>
        </div>
        {isPaid && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Складов</label>
                <input type="number" min="0" value={wh} onChange={e => setWh(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>SKU/склад</label>
                <input type="number" min="0" value={sku} onChange={e => setSku(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Подписка, +месяцев (0 — не менять срок)</label>
              <input type="number" min="0" value={months} onChange={e => setMonths(e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        <button type="submit" disabled={pending} className={btnCls}>{pending ? "..." : "Сохранить тариф"}</button>
      </form>
      <ResultBanner res={res} />
    </Card>
  );
}

function TrialForm({ sellerId }: { sellerId: string }) {
  const { pending, res, run } = useAction();
  const [days, setDays] = useState("14");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("days", days);
    run(adminSaveTrial, fd);
  }
  return (
    <Card title="Триал">
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="flex-1">
          <label className={labelCls}>Дней от сегодня</label>
          <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)} className={inputCls} />
        </div>
        <button type="submit" disabled={pending} className={btnCls}>{pending ? "..." : "Применить"}</button>
      </form>
      <ResultBanner res={res} />
    </Card>
  );
}

function RadarForm({ sellerId, radarPlan, radarBrandsLimit, radarActiveUntil }: {
  sellerId: string; radarPlan: string; radarBrandsLimit: number; radarActiveUntil: string | null;
}) {
  const { pending, res, run } = useAction();
  const [plan, setPlan] = useState(radarPlan || "none");
  const [brands, setBrands] = useState(String(radarBrandsLimit ?? 0));
  const [days, setDays] = useState("30");
  function onPlanChange(v: string) {
    setPlan(v);
    if (v in RADAR_BRANDS) setBrands(String(RADAR_BRANDS[v]));
    if (v === "none") setBrands("0");
    if (v === "trial") setDays("14");
  }
  const isOn = plan !== "none";
  const until = radarActiveUntil ? new Date(radarActiveUntil) : null;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    fd.set("radarPlan", plan);
    if (isOn) { fd.set("radarBrands", brands); fd.set("radarDays", days); }
    run(adminSaveRadar, fd);
  }
  return (
    <Card title="Radar">
      <div className="mb-3 font-mono text-[11px] text-ink-hush">
        Сейчас:{" "}
        {radarPlan && radarPlan !== "none"
          ? <span className="text-ink">{radarPlan} · до {until ? until.toLocaleDateString("ru-RU") : "—"}</span>
          : <span className="text-ink-muted">выключен</span>}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={labelCls}>План Radar</label>
          <select value={plan} onChange={e => onPlanChange(e.target.value)} className={inputCls}>
            <option value="none">Выключен</option>
            <option value="trial">Trial</option>
            <option value="start">Start</option>
            <option value="seller">Seller</option>
            <option value="pro">Pro</option>
            <option value="expert">Expert</option>
          </select>
        </div>
        {isOn && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Брендов</label>
              <input type="number" min="0" value={brands} onChange={e => setBrands(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Дней</label>
              <input type="number" min="1" value={days} onChange={e => setDays(e.target.value)} className={inputCls} />
            </div>
          </div>
        )}
        <button type="submit" disabled={pending} className={btnCls}>{pending ? "..." : "Сохранить Radar"}</button>
      </form>
      <ResultBanner res={res} />
    </Card>
  );
}

function PasswordResetForm({ sellerId }: { sellerId: string }) {
  const { pending, res, run } = useAction();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("sellerId", sellerId);
    run(adminPasswordReset, fd);
  }
  return (
    <Card title="Сброс пароля">
      <form onSubmit={submit}>
        <p className="text-xs text-ink-muted mb-3">Сгенерирует одноразовую ссылку восстановления. Письмо не отправляется — передай ссылку селлеру вручную.</p>
        <button type="submit" disabled={pending} className={btnCls}>{pending ? "..." : "Сгенерировать ссылку"}</button>
      </form>
      <ResultBanner res={res} />
    </Card>
  );
}
