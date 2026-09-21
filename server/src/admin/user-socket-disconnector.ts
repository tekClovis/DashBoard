/** Kills a user's live realtime connections. Implemented by RealtimeGateway; injectable so admin stays decoupled. */
export interface UserSocketDisconnector {
  disconnectUser(userId: string): void;
}

export const USER_SOCKET_DISCONNECTOR = Symbol('USER_SOCKET_DISCONNECTOR');
