import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocketProvider, useSocket } from './SocketProvider.js';

const handlers = new Map<string, () => void>();
const fakeSocket = {
  on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
  off: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: () => fakeSocket,
}));

function Probe() {
  const { connected } = useSocket();
  return <span>{connected ? 'connected' : 'connecting'}</span>;
}

describe('SocketProvider', () => {
  it('starts disconnected and flips to connected on the socket.io "connect" event', () => {
    render(
      <SocketProvider>
        <Probe />
      </SocketProvider>,
    );

    expect(screen.getByText('connecting')).toBeTruthy();

    act(() => handlers.get('connect')?.());

    expect(screen.getByText('connected')).toBeTruthy();
  });

  it('disconnects the underlying socket on unmount (i.e. on logout)', () => {
    const { unmount } = render(
      <SocketProvider>
        <Probe />
      </SocketProvider>,
    );

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalled();
  });
});
