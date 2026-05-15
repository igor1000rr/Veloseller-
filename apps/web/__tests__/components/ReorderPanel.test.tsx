import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReorderPanel } from "@/app/dashboard/skus/[id]/ReorderPanel";

beforeEach(() => { global.fetch = vi.fn(); });

describe("ReorderPanel formulas (Rule 1.6)", () => {
  it("safety stock = velocity × safety_days", () => {
    // velocity=2, safety=7 → 14
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const stat = screen.getByText("Safety stock").parentElement;
    expect(stat).toHaveTextContent("14");
  });

  it("reorder point = velocity × lead_time + safety_stock", () => {
    // 2*14 + 14 = 42
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const stat = screen.getByText("Reorder point").parentElement;
    expect(stat).toHaveTextContent("42");
  });

  it("days until reorder = floor((stock - reorder_point) / velocity)", () => {
    // (100-42)/2 = 29
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const stat = screen.getByText("До заказа").parentElement;
    expect(stat).toHaveTextContent("29 дн");
  });

  it("days = 0 при stock == reorder_point — warning 'Пора заказывать'", () => {
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={42} leadTimeDays={14} safetyDays={7} />);
    expect(screen.getByText(/Пора заказывать/)).toBeInTheDocument();
  });

  it("days = '—' при velocity = 0", () => {
    render(<ReorderPanel productId="p1" adjustedVelocity={0} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const stat = screen.getByText("До заказа").parentElement;
    expect(stat).toHaveTextContent("—");
  });

  it("recommended qty = velocity × reorderFor (30 default)", () => {
    // 2 * 30 = 60
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const stat = screen.getByText("Заказать сейчас").parentElement;
    expect(stat).toHaveTextContent("60");
  });

  it("изменение lead_time пересчитывает reorder_point", async () => {
    const user = userEvent.setup();
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const leadInput = screen.getByRole("spinbutton", { name: /Lead time/i });
    await user.clear(leadInput);
    await user.type(leadInput, "30");
    // 2*30 + 14 = 74
    const stat = screen.getByText("Reorder point").parentElement;
    await waitFor(() => expect(stat).toHaveTextContent("74"));
  });

  it("изменение reorderFor пересчитывает recommended qty", async () => {
    const user = userEvent.setup();
    render(<ReorderPanel productId="p1" adjustedVelocity={2} currentStock={100} leadTimeDays={14} safetyDays={7} />);
    const reorderInput = screen.getByRole("spinbutton", { name: /Закупить на/i });
    await user.clear(reorderInput);
    await user.type(reorderInput, "60");
    // 2 * 60 = 120
    const stat = screen.getByText("Заказать сейчас").parentElement;
    await waitFor(() => expect(stat).toHaveTextContent("120"));
  });

  it("кнопка 'Сохранить' PATCH'ит /api/products/{id}/reorder", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ReorderPanel productId="abc-123" adjustedVelocity={5} currentStock={100} leadTimeDays={10} safetyDays={3} />);
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/products/abc-123/reorder",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ lead_time_days: 10, safety_days: 3 }),
        })
      );
    });
  });

  it("во время save кнопка disabled", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<ReorderPanel productId="p1" adjustedVelocity={1} currentStock={50} leadTimeDays={7} safetyDays={7} />);
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(screen.getByRole("button", { name: /Сохранение/ })).toBeDisabled();
  });
});
