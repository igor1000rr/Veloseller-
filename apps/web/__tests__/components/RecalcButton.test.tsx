import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecalcButton from "@/app/dashboard/RecalcButton";

// next/navigation мок
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  global.fetch = vi.fn();
  mockRefresh.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

/**
 * По умолчанию мокаем status=idle (первый fetch при mount).
 * Остальные fetch мокаются по каждому тесту индивидуально через mockImplementation.
 */
function mockStatusIdle() {
  return { ok: true, json: async () => ({ status: "idle", started_at: null, result: null, error: null }) };
}
function mockStatusRunning() {
  return { ok: true, json: async () => ({ status: "running", started_at: "2026-05-19T09:00:00Z" }) };
}
function mockStatusDone(result = { metrics_written: 5, alerts_written: 2 }) {
  return { ok: true, json: async () => ({ status: "done", result }) };
}
function mockStartedAsync() {
  return { ok: true, json: async () => ({ started: true, status: "running", message: "Расчёт запущен в фоне" }) };
}

describe("RecalcButton", () => {
  it("отображает исходный текст когда status=idle", async () => {
    (global.fetch as any).mockResolvedValue(mockStatusIdle());
    render(<RecalcButton />);
    // До первого poll button виден с дефолтным текстом
    expect(screen.getByRole("button")).toHaveTextContent("Пересчитать сейчас");
  });

  it("при клике вызывает /api/jobs/recalc и показывает сообщение запуска", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/jobs/recalc") return Promise.resolve(mockStartedAsync());
      return Promise.resolve(mockStatusIdle());
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/jobs/recalc", { method: "POST" });
    });
    await waitFor(() => {
      expect(screen.getByText(/Расчёт запущен в фоне/)).toBeInTheDocument();
    });
  });

  it("когда polling видит status=running — кнопка disabled и показывает «Расчёт идёт…»", async () => {
    (global.fetch as any).mockResolvedValue(mockStatusRunning());
    render(<RecalcButton />);
    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent("Расчёт идёт…");
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  it("когда polling видит status=done — показывает «Готово: ...» и вызывает router.refresh", async () => {
    // Первый poll = running, второй (через 8с) = done.
    // Это показывает переход running→done, при котором триггерится router.refresh.
    let callCount = 0;
    (global.fetch as any).mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(callCount === 1 ? mockStatusRunning() : mockStatusDone());
    });
    render(<RecalcButton />);
    // Продвигаем таймер на 8с чтобы второй poll сработал
    await act(async () => { await vi.advanceTimersByTimeAsync(8500); });
    // Не проверяем промежуточный "Расчёт идёт" — фейк-таймеры могут пролететь
    // сквозь него мгновенно. Проверяем важный конечный эффект: msg + router.refresh.
    await waitFor(() => {
      expect(screen.getByText(/Готово: 5 метрик, 2 алертов/)).toBeInTheDocument();
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("при HTTP-ошибке от /api/jobs/recalc показывает модал", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/jobs/recalc") {
        return Promise.resolve({ ok: false, statusText: "Server Error", json: async () => ({ error: "Database down" }) });
      }
      return Promise.resolve(mockStatusIdle());
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Database down/)).toBeInTheDocument();
    });
  });

  it("network exception → модал", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/jobs/recalc") return Promise.reject(new Error("Failed to fetch"));
      return Promise.resolve(mockStatusIdle());
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<RecalcButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(screen.getByText(/Не удалось связаться с сервером/i)).toBeInTheDocument();
    });
  });
});
