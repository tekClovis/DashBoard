import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUserEntry, AdminUsersResponse } from '@dashboard/shared';
import type { RequestUser } from '../auth/types.js';
import { PrismaService } from '../core/prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';
import { USER_SOCKET_DISCONNECTOR, type UserSocketDisconnector } from './user-socket-disconnector.js';

const USER_SELECT = { id: true, email: true, role: true, bannedAt: true, createdAt: true } as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

const toEntry = (u: UserRow): AdminUserEntry => ({
  ...u,
  bannedAt: u.bannedAt?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

const isNotFound = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2025';

const isSerializationFailure = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2034';

/**
 * UUIDs are case-insensitive in Postgres and ParseUUIDPipe, but the self-guard and the socket room name
 * compare strings — canonicalise once (DB ids are lowercase) so every later use sees the same form.
 */
export const normalizeId = (id: string): string => id.toLowerCase();

/** Prisma `contains` doesn't escape LIKE wildcards; make search literal. */
export const escapeLike = (s: string): string => s.replace(/[\\%_]/g, '\\$&');

/** Admin-side user management: listing, ban/role changes and deletion. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_SOCKET_DISCONNECTOR) private readonly sockets: UserSocketDisconnector,
  ) {}

  /** List users by email search, oldest first; `q` is matched literally and case-insensitively. */
  async list({ q, page, pageSize }: ListUsersQueryDto): Promise<AdminUsersResponse> {
    const where: Prisma.UserWhereInput = q ? { email: { contains: escapeLike(q), mode: 'insensitive' } } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users: rows.map(toEntry), total, page, pageSize };
  }

  /**
   * Ban/unban a user and/or change their role.
   * Ban or an actual role change bumps `tokenVersion` and disconnects the user's sockets.
   * @throws {@link BadRequestException} when neither `bannedAt` nor `role` is given.
   * @throws {@link ForbiddenException} when the actor bans or demotes themselves.
   * @throws {@link NotFoundException} when the user does not exist.
   * @throws {@link ConflictException} with `LAST_ADMIN` when it would leave no active admin, or `CONCURRENT_UPDATE` on a serialization failure.
   */
  async update(actor: RequestUser, rawId: string, dto: UpdateUserDto): Promise<AdminUserEntry> {
    const id = normalizeId(rawId);
    if (dto.bannedAt === undefined && dto.role === undefined) throw new BadRequestException({ error: 'EMPTY_PATCH' });
    const bans = dto.bannedAt !== undefined && dto.bannedAt !== null;
    // Checked before any read/write so a rejected self-action mutates nothing.
    if (id === actor.id && (bans || dto.role === 'USER')) {
      throw new ForbiddenException({ error: 'CANNOT_MODIFY_SELF' });
    }

    let updated: UserRow;
    let killsSessions: boolean;
    try {
      // Serializable so two concurrent demotes of the only two admins can't both pass the count.
      ({ updated, killsSessions } = await this.prisma.$transaction(
        async (tx) => {
          const current = await tx.user.findUnique({ where: { id }, select: { role: true, bannedAt: true } });
          if (!current) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

          const roleChanges = dto.role !== undefined && dto.role !== current.role;
          const leavesAdmins = current.role === 'ADMIN' && current.bannedAt === null && (bans || dto.role === 'USER');
          if (leavesAdmins) {
            const others = await tx.user.count({ where: { role: 'ADMIN', bannedAt: null, id: { not: id } } });
            if (others === 0) throw new ConflictException({ error: 'LAST_ADMIN' });
          }

          const data: Prisma.UserUpdateInput = {};
          if (dto.bannedAt !== undefined) data.bannedAt = dto.bannedAt === null ? null : new Date(dto.bannedAt);
          if (roleChanges) data.role = dto.role;
          // Bumping tokenVersion invalidates every existing session cookie (JwtGuard compares `tv`).
          const kills = bans || roleChanges;
          if (kills) data.tokenVersion = { increment: 1 };

          return { updated: await tx.user.update({ where: { id }, data, select: USER_SELECT }), killsSessions: kills };
        },
        { isolationLevel: 'Serializable' },
      ));
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
      if (isSerializationFailure(err)) throw new ConflictException({ error: 'CONCURRENT_UPDATE' });
      throw err;
    }
    if (killsSessions) this.sockets.disconnectUser(id);
    return toEntry(updated);
  }

  /**
   * Delete a user and disconnect their sockets.
   * @throws {@link ForbiddenException} when the actor targets themselves.
   * @throws {@link NotFoundException} when the user does not exist.
   */
  async remove(actor: RequestUser, rawId: string): Promise<void> {
    const id = normalizeId(rawId);
    if (id === actor.id) throw new ForbiddenException({ error: 'CANNOT_MODIFY_SELF' });
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
      throw err;
    }
    this.sockets.disconnectUser(id);
  }
}
