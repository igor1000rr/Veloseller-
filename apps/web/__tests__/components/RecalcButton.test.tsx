import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecalcButton from "@/app/dashboard/RecalcButton";

beforeEach(() => { global.fetch = vi.fn(); });

describe("RecalcButton", () => {
  it("отображает текст кнопки", () => {
    render(<RecalcButton />);
    expect(screen.getByRole("button")).toHaveTextContent("Пересчитать сейчас");
  });

  it("показывает 'Считаем…' и блокирует во время запроса", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Считаем…");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("при успехе показывает результат", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ metrics_written: 5, alerts_written: 2 }) });
    const user = userEvent.setup();
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Готово: 5 метрик, 2 алертов/)).toBeInTheDocument();
    });
  });

  it("при ошибке показывает сообщение", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, statusText: "Internal Error", json: async () => ({ error: "Database down" }) });
    const user = userEvent.setup();
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Ошибка: Database down/)).toBeInTheDocument();
    });
  });

  it("network exception → Error message", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network failed"));
    const user = userEvent.setup();
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Ошибка: Network failed/)).toBeInTheDocument();
    });
  });

  it("кнопка снова доступна после завершения", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ metrics_written: 0, alerts_written: 0 }) });
    const user = userEvent.setup();
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByRole("button")).not.toBeDisabled();
    });
  });
});
