import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpgradeButton, ManageSubscriptionButton } from "@/app/billing/UpgradeButton";

beforeEach(() => {
  global.fetch = vi.fn();
  global.alert = vi.fn();
  Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
});

describe("UpgradeButton", () => {
  it("isCurrent=true → disabled 'Используется'", () => {
    render(<UpgradeButton plan="growth" isCurrent={true} label="Growth" />);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Используется");
  });

  it("isCurrent=false → label", () => {
    render(<UpgradeButton plan="growth" isCurrent={false} label="Перейти на Growth" />);
    expect(screen.getByRole("button")).toHaveTextContent("Перейти на Growth");
  });

  it("при клике POST'ит /api/stripe/checkout", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ url: "https://checkout.stripe.com/abc" }) });
    const user = userEvent.setup();
    render(<UpgradeButton plan="pro" isCurrent={false} label="Pro" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/stripe/checkout", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
      }));
      expect(window.location.href).toBe("https://checkout.stripe.com/abc");
    });
  });

  it("если data.url пуст — alert", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ error: "Stripe not configured" }) });
    const user = userEvent.setup();
    render(<UpgradeButton plan="starter" isCurrent={false} label="Starter" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith("Stripe not configured"));
  });

  it("'Открываем Stripe…' пока запрос летит", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<UpgradeButton plan="growth" isCurrent={false} label="Growth" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Открываем Stripe…");
  });
});

describe("ManageSubscriptionButton", () => {
  it("рендерит 'Управление подпиской'", () => {
    render(<ManageSubscriptionButton />);
    expect(screen.getByRole("button")).toHaveTextContent("Управление подпиской");
  });

  it("клик → POST /api/stripe/portal → редирект", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ url: "https://billing.stripe.com/portal/xyz" }) });
    const user = userEvent.setup();
    render(<ManageSubscriptionButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/stripe/portal", { method: "POST" });
      expect(window.location.href).toBe("https://billing.stripe.com/portal/xyz");
    });
  });

  it("ошибка → alert", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ error: "No customer" }) });
    const user = userEvent.setup();
    render(<ManageSubscriptionButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(global.alert).toHaveBeenCalledWith("No customer"));
  });
});
