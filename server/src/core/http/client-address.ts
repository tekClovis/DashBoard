import type { Request } from 'express';

/** req.socket.remoteAddress, with the ::ffff: IPv4-mapped prefix stripped. No trust proxy. */
export function clientAddress(req: Request): string {
  const address = req.socket.remoteAddress ?? '';
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
}
