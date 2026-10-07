import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Role } from '../generated/prisma/enums.js';
import { SESSION_TTL_SEC } from './session.constants.js';

/** `sub`/`role`/`tv` (tokenVersion)/`jti` (per-token id, for logout revocation) claims — see docs/Architecture.md §8.3. */
export interface JwtPayload {
  sub: string;
  role: Role;
  tv: number;
  jti: string;
  /** Expiry as Unix seconds. */
  exp: number;
}

/**
 * Minimal HS256 JWT sign/verify, no external dependency. Session token only —
 * not a general-purpose JWT implementation.
 */
@Injectable()
export class JwtService {
  constructor(private readonly config: ConfigService) {}

  /** Signs the claims with a fresh `jti` and an expiry of {@link SESSION_TTL_SEC} from now. */
  sign(claims: Omit<JwtPayload, 'exp' | 'jti'>): string {
    const payload: JwtPayload = {
      ...claims,
      jti: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    };
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    return `${header}.${body}.${this.signSegment(`${header}.${body}`)}`;
  }

  /** Returns the payload, or null on a bad signature, malformed token, or expiry. */
  verify(token: string): JwtPayload | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const expected = this.signSegment(`${header}.${body}`);
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;

    let payload: JwtPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }

    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  }

  private signSegment(data: string): string {
    const secret = this.config.getOrThrow<string>('JWT_SECRET');
    return createHmac('sha256', secret).update(data).digest('base64url');
  }
}

function base64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}
