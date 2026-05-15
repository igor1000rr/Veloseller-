import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });

describe("SettingsForm — handleSubmit extra", () => {
  it("ok → 'Сохранено' + correct payload", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as any);
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "Igor", timezone: "Europe/Moscow", notify_email: true, notify_telegram: false, telegram_chat_id: null }}
      telegramDeeplink={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/i }));
    await waitFor(() => expect(screen.getByText(/Сохранено/i)).toBeInTheDocument());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body);
    expect(body.display_name).toBe("Igor");
    expect(body.notify_email).toBe(true);
    expect(body.notify_telegram).toBe(false);
  });

  it("ошибка — текст ошибки с message", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, statusText: "Bad",
      json: async () => ({ error: "permission denied" }),
    } as any);
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "I", timezone: "UTC", notify_email: true, notify_telegram: true, telegram_chat_id: "" }}
      telegramDeeplink={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/i }));
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
  });

  it("ошибка без JSON — statusText", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false, statusText: "Internal Server Error",
      json: async () => { throw new Error("not json"); },
    } as any);
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "I", timezone: "UTC", notify_email: true, notify_telegram: true, telegram_chat_id: "" }}
      telegramDeeplink={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/i }));
    await waitFor(() => expect(screen.getByText(/Internal Server Error/i)).toBeInTheDocument());
  });

  it("Telegram deeplink показывается", async () => {
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "I", timezone: "UTC", notify_email: true, notify_telegram: true, telegram_chat_id: null }}
      telegramDeeplink="https://t.me/myBot?start=seller-1" />);
    const link = screen.getByRole("link", { name: /Подключить Telegram/i });
    expect(link).toHaveAttribute("href", "https://t.me/myBot?start=seller-1");
  });

  it("fallback @userinfobot когда deeplink=null", async () => {
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "I", timezone: "UTC", notify_email: true, notify_telegram: true, telegram_chat_id: null }}
      telegramDeeplink={null} />);
    expect(screen.getByText(/userinfobot/)).toBeInTheDocument();
  });

  it("null для пустых display_name/chat_id", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    const SettingsForm = (await import("@/app/dashboard/settings/SettingsForm")).default;
    render(<SettingsForm
      initial={{ display_name: "", timezone: "UTC", notify_email: true, notify_telegram: true, telegram_chat_id: "" }}
      telegramDeeplink={null} />);
    fireEvent.click(screen.getByRole("button", { name: /Сохранить/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body);
    expect(body.display_name).toBeNull();
    expect(body.telegram_chat_id).toBeNull();
  });
});
