import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AckButton from "@/app/dashboard/alerts/AckButton";

beforeEach(() => { global.fetch = vi.fn(); });

describe("AckButton", () => {
  // Надпись изменена с "Прочитано" на "Принять" (мобильная полировка).
  it("показывает 'Принять' по умолчанию", () => {
    render(<AckButton id="alert-1" />);
    expect(screen.getByRole("button")).toHaveTextContent("Принять");
  });

  it("вызывает API с правильным URL", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<AckButton id="alert-42" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/alerts/alert-42/ack", { method: "POST" });
    });
  });

  it("показывает '…' во время запроса", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<AckButton id="a" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("…");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("при ошибке — кнопка снова активна", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<AckButton id="a" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });
});
