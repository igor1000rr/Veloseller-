import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReorderPanel } from "@/app/dashboard/skus/[id]/ReorderPanel";
import { saveUserNotes } from "@/app/dashboard/skus/actions";

// Server action мокаем: настоящий тянет next/cache и supabase server client.
vi.mock("@/app/dashboard/skus/actions", () => ({
  saveUserNotes: vi.fn(),
}));

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true });
  vi.mocked(saveUserNotes).mockReset();
  vi.mocked(saveUserNotes).mockResolvedValue({ ok: true });
});

type PanelProps = Parameters<typeof ReorderPanel>[0];

function renderPanel(over: Partial<PanelProps> = {}) {
  const props: PanelProps = {
    productId: "p1",
    adjustedVelocity: 2,
    currentStock: 100,
    leadTimeDays: 14,
    safetyDays: 7, // в расчёте не участвует с 04.06.2026, проп оставлен для совместимости
    initialNotes: null,
    ...over,
  };
  return render(<ReorderPanel {...props} />);
}

describe("ReorderPanel — формулы (правки Александра 04.06.2026)", () => {
  it("точка перезаказа = TVelo × срок поставки (safety не участвует)", () => {
    // 2 × 14 = 28 (раньше с safety было бы 42)
    renderPanel();
    const stat = screen.getByText("Точка перезаказа").parentElement;
    expect(stat).toHaveTextContent("28");
  });

  it("«Текущее наличие» показывает остаток", () => {
    renderPanel();
    const stat = screen.getByText("Текущее наличие").parentElement;
    expect(stat).toHaveTextContent("100");
  });

  it("до заказа = floor((остаток − точка) / TVelo)", () => {
    // (100 − 28) / 2 = 36
    renderPanel();
    const stat = screen.getByText("До заказа").parentElement;
    expect(stat).toHaveTextContent("36 дн");
  });

  it("товары в пути увеличивают «До заказа»", async () => {
    const user = userEvent.setup();
    renderPanel();
    const transitInput = screen.getByRole("spinbutton", { name: /Товары в пути/i });
    await user.clear(transitInput);
    await user.type(transitInput, "20");
    // (100 + 20 − 28) / 2 = 46
    const stat = screen.getByText("До заказа").parentElement;
    await waitFor(() => expect(stat).toHaveTextContent("46 дн"));
  });

  it("до заказа = '—' при TVelo = 0", () => {
    renderPanel({ adjustedVelocity: 0 });
    const stat = screen.getByText("До заказа").parentElement;
    expect(stat).toHaveTextContent("—");
  });

  it("остаток на точке перезаказа → «Пора заказывать»", () => {
    // stock = 28 = точка → 0 дн
    renderPanel({ currentStock: 28 });
    expect(screen.getByText(/Пора заказывать/)).toBeInTheDocument();
  });

  it("заказать сейчас = TVelo × «Закупить на» (30 по умолчанию)", () => {
    // 2 × 30 = 60
    renderPanel();
    const stat = screen.getByText("Заказать сейчас").parentElement;
    expect(stat).toHaveTextContent("60");
  });

  it("изменение срока поставки пересчитывает точку перезаказа", async () => {
    const user = userEvent.setup();
    renderPanel();
    const leadInput = screen.getByRole("spinbutton", { name: /Срок поставки/i });
    await user.clear(leadInput);
    await user.type(leadInput, "30");
    // 2 × 30 = 60
    const stat = screen.getByText("Точка перезаказа").parentElement;
    await waitFor(() => expect(stat).toHaveTextContent("60"));
  });

  it("изменение «Закупить на» пересчитывает количество", async () => {
    const user = userEvent.setup();
    renderPanel();
    const reorderInput = screen.getByRole("spinbutton", { name: /Закупить на/i });
    await user.clear(reorderInput);
    await user.type(reorderInput, "60");
    // 2 × 60 = 120
    const stat = screen.getByText("Заказать сейчас").parentElement;
    await waitFor(() => expect(stat).toHaveTextContent("120"));
  });
});

describe("ReorderPanel — «Сохранить в Заметки»", () => {
  it("PATCH'ит только lead_time_days и пишет сводку в заметки", async () => {
    const user = userEvent.setup();
    renderPanel({ productId: "abc-123", adjustedVelocity: 5, leadTimeDays: 10 });
    await user.click(screen.getByRole("button", { name: /Сохранить в Заметки/ }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/products/abc-123/reorder",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ lead_time_days: 10 }),
        })
      );
      // 5 × 30 = 150 шт на 30 дн, поставка 10 дн
      expect(saveUserNotes).toHaveBeenCalledWith(
        "abc-123",
        expect.stringContaining("закупка: 150 шт на 30 дн, поставка 10 дн")
      );
    });
  });

  it("сводка дописывается к существующим заметкам, не затирая их", async () => {
    const user = userEvent.setup();
    renderPanel({ initialNotes: "взять у поставщика X" });
    await user.click(screen.getByRole("button", { name: /Сохранить в Заметки/ }));
    await waitFor(() => {
      expect(saveUserNotes).toHaveBeenCalledWith(
        "p1",
        expect.stringContaining("взять у поставщика X\n")
      );
    });
  });

  it("товары в пути попадают в сводку", async () => {
    const user = userEvent.setup();
    renderPanel();
    const transitInput = screen.getByRole("spinbutton", { name: /Товары в пути/i });
    await user.clear(transitInput);
    await user.type(transitInput, "20");
    await user.click(screen.getByRole("button", { name: /Сохранить в Заметки/ }));
    await waitFor(() => {
      expect(saveUserNotes).toHaveBeenCalledWith("p1", expect.stringContaining("в пути 20 шт"));
    });
  });

  it("после сохранения показывается «сохранено в заметки»", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Сохранить в Заметки/ }));
    expect(await screen.findByText(/сохранено в заметки/)).toBeInTheDocument();
  });

  it("ошибка записи заметок показывает «ошибка»", async () => {
    vi.mocked(saveUserNotes).mockResolvedValue({ ok: false, error: "rls" });
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Сохранить в Заметки/ }));
    expect(await screen.findByText(/ошибка/)).toBeInTheDocument();
  });

  it("во время save кнопка disabled", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    expect(screen.getByRole("button", { name: /Сохранение/ })).toBeDisabled();
  });
});
