import type {
  ForgotPasswordRequest,
  LoginRequest,
  MeResponse,
  OkResponse,
  RegisterRequest,
  ResendRequest,
  ResetPasswordRequest,
} from "@dashboard/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./client.js";

export type OAuthProvider = "github" | "google";

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) =>
      apiFetch<OkResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<OkResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useConfirm(token: string | null) {
  return useQuery({
    queryKey: ["auth", "confirm", token],
    queryFn: () =>
      apiFetch<OkResponse>(`/auth/confirm?token=${encodeURIComponent(token!)}`),
    enabled: token !== null,
    retry: false,
  });
}

export function useResend() {
  return useMutation({
    mutationFn: (body: ResendRequest) =>
      apiFetch<OkResponse>("/auth/resend", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (body: ForgotPasswordRequest) =>
      apiFetch<OkResponse>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (body: ResetPasswordRequest) =>
      apiFetch<OkResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

/**
 * Real redirect to GET /api/oauth/{provider}/start?intent={login|link} — see
 * server/src/auth/oauth. `link` requires an existing session cookie (checked server-side)
 * and binds the resulting identity to the current user via a completed OAuth handshake —
 * there is no client-supplied-id path any more (see identities.controller.ts).
 */
export function oauthStartUrl(
  provider: OAuthProvider,
  intent: "login" | "link" = "login",
): string {
  return `/api/oauth/${provider}/start?intent=${intent}`;
}

export function useUnlinkIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OAuthProvider) =>
      apiFetch<OkResponse>(`/auth/identities/${provider}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

/** Ends the session; clears the whole query cache so no user data (or stale `me`) survives into the next login. */
function useEndSession(path: "/auth/logout" | "/auth/logout-all") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<OkResponse>(path, { method: "POST" }),
    onSuccess: () => queryClient.clear(),
  });
}

export const useLogout = () => useEndSession("/auth/logout");
export const useLogoutAll = () => useEndSession("/auth/logout-all");
