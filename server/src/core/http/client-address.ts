import type { Request } from 'express';

/**
 * Return the socket peer address with any `::ffff:` IPv4-mapped prefix stripped.
 * Ignores proxy headers (no trust proxy); returns an empty string when the address is unknown.
 */
export function clientAddress(req: Request): string {
  const address = req.socket.remoteAddress ?? '';
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}
