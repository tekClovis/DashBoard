import type { LoginRequest, MeResponse, OkResponse, RegisterRequest, ResendRequest } from '@dashboard/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './client.js';

export type OAuthProvider = 'github' | 'google';

export function useRegister() {
  return useMutation({
    mutationFn: (body: RegisterRequest) =>
      apiFetch<OkResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<OkResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useConfirm(token: string | null) {
  return useQuery({
    queryKey: ['auth', 'confirm', token],
    queryFn: () => apiFetch<OkResponse>(`/auth/confirm?token=${encodeURIComponent(token!)}`),
    enabled: token !== null,
    retry: false,
  });
}

export function useResend() {
  return useMutation({
    mutationFn: (body: ResendRequest) =>
      apiFetch<OkResponse>('/auth/resend', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/auth/me'),
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
export function oauthStartUrl(provider: OAuthProvider, intent: 'login' | 'link' = 'login'): string {
  return `/api/oauth/${provider}/start?intent=${intent}`;
}

export function useUnlinkIdentity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: OAuthProvider) => apiFetch<OkResponse>(`/auth/identities/${provider}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<OkResponse>('/auth/logout', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<OkResponse>('/auth/logout-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
}
