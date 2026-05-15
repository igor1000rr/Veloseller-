import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signOutMock = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signOut: signOutMock } }),
}));

import LogoutButton from "@/app/dashboard/LogoutButton";

beforeEach(() => { signOutMock.mockReset(); });

describe("LogoutButton", () => {
  it("рендерит иконку выхода", () => {
    render(<LogoutButton />);
    expect(screen.getByRole("button", { name: /Выйти/i })).toBeInTheDocument();
  });

  it("при клике вызывает signOut", async () => {
    signOutMock.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LogoutButton />);
    await user.click(screen.getByRole("button"));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
  });
});
