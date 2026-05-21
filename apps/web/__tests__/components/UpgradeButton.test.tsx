import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpgradeButton, ManageSubscriptionButton } from "@/app/billing/UpgradeButton";

beforeEach(() => {
  global.fetch = vi.fn();
  Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
});

describe("UpgradeButton (Robokassa)", () => {
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

  it("при клике POST'ит /api/robokassa/create-payment", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ url: "https://auth.robokassa.ru/Merchant/Index.aspx?..." }) });
    const user = userEvent.setup();
    render(<UpgradeButton plan="pro" isCurrent={false} label="Pro" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/robokassa/create-payment", expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ plan: "pro" }),
      }));
      expect(window.location.href).toBe("https://auth.robokassa.ru/Merchant/Index.aspx?...");
    });
  });

  it("если data.url пуст — показывает ошибку под кнопкой", async () => {
    (global.fetch as any).mockResolvedValue({ json: async () => ({ error: "Robokassa не настроена" }) });
    const user = userEvent.setup();
    render(<UpgradeButton plan="starter" isCurrent={false} label="Starter" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Robokassa не настроена")).toBeInTheDocument());
  });

  it("'Переходим на Робокассу…' пока запрос летит", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<UpgradeButton plan="growth" isCurrent={false} label="Growth" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Переходим на Робокассу…");
  });
});

describe("ManageSubscriptionButton (Robokassa)", () => {
  it("рендерит подсказку про ручное продление", () => {
    render(<ManageSubscriptionButton />);
    expect(screen.getByText(/Подписка продлевается вручную/)).toBeInTheDocument();
  });
});
