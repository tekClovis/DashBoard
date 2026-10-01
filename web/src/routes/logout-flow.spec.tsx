import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocketProvider } from "@/realtime/SocketProvider.js";
import { RedirectIfAuthed } from "./RedirectIfAuthed.js";
import { RequireAuth } from "./RequireAuth.js";
import { ProfilePage } from "./ProfilePage.js";

const fakeSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn(), off: vi.fn() },
};
vi.mock("socket.io-client", () => ({ io: () => fakeSocket }));

const me = {
  id: "1",
  email: "u@example.com",
  role: "USER",
  emailVerifiedAt: null,
  hasPassword: true,
  identities: [],
};

afterEach(() => vi.restoreAllMocks());

describe("logout flow", () => {
  it("lands on /login and stays there (no redirect loop) after logout", async () => {
    let loggedOut = false;
    const json = (status: number, body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/auth/logout")) {
          loggedOut = true;
          return json(200, { ok: true });
        }
        if (url.includes("/auth/me"))
          return loggedOut ? json(401, { message: "no" }) : json(200, me);
        if (url.includes("/dashboards"))
          return json(200, {
            dashboards: [{ id: "d1", name: "D", position: 0 }],
          });
        return json(200, {});
      }),
    );

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/profile"]}>
          <Routes>
            <Route element={<RedirectIfAuthed />}>
              <Route path="/login" element={<div>login page</div>} />
            </Route>
            <Route element={<RequireAuth />}>
              <Route
                element={
                  <SocketProvider>
                    <Outlet />
                  </SocketProvider>
                }
              >
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/d/:id" element={<div>dashboard page</div>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByText("login page")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.queryByText("login page")).toBeTruthy();
    expect(screen.queryByText("dashboard page")).toBeNull();
    expect(queryClient.getQueryData(["dashboards"])).toBeUndefined();
    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });
});
