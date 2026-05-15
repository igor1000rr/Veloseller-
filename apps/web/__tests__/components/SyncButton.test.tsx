import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SyncButton from "@/app/connections/SyncButton";

beforeEach(() => { global.fetch = vi.fn(); global.alert = vi.fn(); });

describe("SyncButton", () => {
  it("для csv_upload показывает текст", () => {
    render(<SyncButton connectionId="c1" source="csv_upload" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/только через загрузку CSV/)).toBeInTheDocument();
  });

  it("для google_sheet — кнопка", () => {
    render(<SyncButton connectionId="c1" source="google_sheet" />);
    expect(screen.getByRole("button")).toHaveTextContent("Синхронизировать");
  });

  it("вызывает /api/connections/{id}/sync", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<SyncButton connectionId="conn-xyz" source="marketplace_api" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/connections/conn-xyz/sync", { method: "POST" });
    });
  });

  it("при ошибке — alert", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false, statusText: "Error",
      json: async () => ({ error: "Token expired" }),
    });
    const user = userEvent.setup();
    render(<SyncButton connectionId="c" source="feed" />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => {
      expect(global.alert).toHaveBeenCalledWith(expect.stringContaining("Token expired"));
    });
  });

  it("'Синхронизация…' и disabled во время запроса", async () => {
    (global.fetch as any).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<SyncButton connectionId="c" source="feed" />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("Синхронизация…");
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
