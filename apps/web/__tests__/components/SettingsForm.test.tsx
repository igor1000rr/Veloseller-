import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsForm from "@/app/dashboard/settings/SettingsForm";

beforeEach(() => { global.fetch = vi.fn(); });

describe("SettingsForm", () => {
  it("показывает initial values", () => {
    render(<SettingsForm telegramDeeplink={null}
      initial={{ display_name: "Игорь", timezone: "Europe/Minsk", telegram_chat_id: "123456", notify_email: true, notify_telegram: false }} />);
    expect(screen.getByDisplayValue("Игорь")).toBeInTheDocument();
    expect(screen.getByDisplayValue("123456")).toBeInTheDocument();
  });

  it("при submit POST'ит /api/notifications", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SettingsForm telegramDeeplink={null}
      initial={{ display_name: "John", timezone: "UTC", telegram_chat_id: null, notify_email: true, notify_telegram: true }} />);
    const nameInput = screen.getByDisplayValue("John");
    await user.clear(nameInput);
    await user.type(nameInput, "Jane");
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => {
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.display_name).toBe("Jane");
    });
  });

  it("при успехе — 'Сохранено'", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SettingsForm telegramDeeplink={null}
      initial={{ display_name: "A", timezone: "UTC", telegram_chat_id: null, notify_email: true, notify_telegram: true }} />);
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => expect(screen.getByText("Сохранено")).toBeInTheDocument());
  });

  it("при ошибке — 'Ошибка: ...'", async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, statusText: "Server", json: async () => ({ error: "Bad input" }) });
    const user = userEvent.setup();
    render(<SettingsForm telegramDeeplink={null}
      initial={{ display_name: "A", timezone: "UTC", telegram_chat_id: null, notify_email: true, notify_telegram: true }} />);
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => expect(screen.getByText(/Ошибка: Bad input/)).toBeInTheDocument());
  });

  it("пустое display_name отправляет null", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SettingsForm telegramDeeplink={null}
      initial={{ display_name: "", timezone: "UTC", telegram_chat_id: "", notify_email: true, notify_telegram: true }} />);
    await user.click(screen.getByRole("button", { name: /Сохранить/ }));
    await waitFor(() => {
      const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
      expect(body.display_name).toBeNull();
      expect(body.telegram_chat_id).toBeNull();
    });
  });
});
