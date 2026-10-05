import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SocketProvider, useSocket } from './SocketProvider.js';

type Handler = (...args: unknown[]) => void;
const handlers = new Map<string, Handler>();
const managerHandlers = new Map<string, Handler>();
const fakeSocket = {
  on: vi.fn((event: string, handler: Handler) => handlers.set(event, handler)),
  off: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  io: {
    on: vi.fn((event: string, handler: Handler) => managerHandlers.set(event, handler)),
    off: vi.fn(),
  },
};
const ioFactory = vi.fn((_opts?: unknown) => fakeSocket);

vi.mock('socket.io-client', () => ({
  io: (opts?: unknown) => ioFactory(opts),
}));

function Probe() {
  const { connected, connection, retry } = useSocket();
  const label =
    connection.status === 'reconnecting' ? `reconnecting ${connection.attempt}` : connection.status;
  return (
    <>
      <span>{connected ? 'connected' : 'connecting'}</span>
      <span data-testid="connection">{label}</span>
      <button type="button" onClick={retry}>
        retry
      </button>
    </>
  );
}

function renderProbe() {
  return render(
    <SocketProvider>
      <Probe />
    </SocketProvider>,
  );
}

describe('SocketProvider', () => {
  it('starts disconnected and flips to connected on the socket.io "connect" event', () => {
    renderProbe();

    expect(screen.getByText('connecting')).toBeTruthy();

    act(() => handlers.get('connect')?.());

    expect(screen.getByText('connected')).toBeTruthy();
  });

  it('bounds reconnection so the manager can give up and report offline', () => {
    renderProbe();

    expect(ioFactory).toHaveBeenCalledWith(expect.objectContaining({ withCredentials: true, reconnectionAttempts: 5 }));
  });

  it('goes live → reconnecting (attempt n) → offline → live', () => {
    renderProbe();
    const state = () => screen.getByTestId('connection').textContent;

    act(() => handlers.get('connect')?.());
    expect(state()).toBe('live');

    act(() => handlers.get('disconnect')?.('transport close'));
    expect(state()).toBe('reconnecting 0');
    expect(screen.getByText('connecting')).toBeTruthy();

    act(() => managerHandlers.get('reconnect_attempt')?.(1));
    expect(state()).toBe('reconnecting 1');
    act(() => managerHandlers.get('reconnect_attempt')?.(2));
    expect(state()).toBe('reconnecting 2');

    act(() => managerHandlers.get('reconnect_failed')?.());
    expect(state()).toBe('offline');

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(fakeSocket.connect).toHaveBeenCalled();
    expect(state()).toBe('reconnecting 0');

    act(() => handlers.get('connect')?.());
    expect(state()).toBe('live');
  });

  it('disconnects the underlying socket on unmount (i.e. on logout)', () => {
    const { unmount } = renderProbe();

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(fakeSocket.io.off).toHaveBeenCalledWith('reconnect_attempt', expect.any(Function));
    expect(fakeSocket.io.off).toHaveBeenCalledWith('reconnect_failed', expect.any(Function));
  });
});
