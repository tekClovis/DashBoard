/** Kills a user's live realtime connections. Implemented by RealtimeGateway; injectable so admin stays decoupled. */
export interface UserSocketDisconnector {
  disconnectUser(userId: string): void;
}

/** Injection token for {@link UserSocketDisconnector}. */
export const USER_SOCKET_DISCONNECTOR = Symbol('USER_SOCKET_DISCONNECTOR');
