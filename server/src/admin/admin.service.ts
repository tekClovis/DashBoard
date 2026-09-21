import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_SOCKET_DISCONNECTOR) private readonly sockets: UserSocketDisconnector,
  ) {}

  async list({ q, page, pageSize }: ListUsersQueryDto): Promise<AdminUsersResponse> {
    const where: Prisma.UserWhereInput = q ? { email: { contains: q, mode: 'insensitive' } } : {};
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

  async update(actor: RequestUser, id: string, dto: UpdateUserDto): Promise<AdminUserEntry> {
    if (dto.bannedAt === undefined && dto.role === undefined) throw new BadRequestException({ error: 'EMPTY_PATCH' });
    const bans = dto.bannedAt !== undefined && dto.bannedAt !== null;
    // Checked before any read/write so a rejected self-action mutates nothing.
    if (id === actor.id && (bans || dto.role === 'USER')) {
      throw new ForbiddenException({ error: 'CANNOT_MODIFY_SELF' });
    }

    const current = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!current) throw new NotFoundException({ error: 'USER_NOT_FOUND' });

    const roleChanges = dto.role !== undefined && dto.role !== current.role;
    const data: Prisma.UserUpdateInput = {};
    if (dto.bannedAt !== undefined) data.bannedAt = dto.bannedAt === null ? null : new Date(dto.bannedAt);
    if (roleChanges) data.role = dto.role;
    // Bumping tokenVersion invalidates every existing session cookie (JwtGuard compares `tv`).
    const killsSessions = bans || roleChanges;
    if (killsSessions) data.tokenVersion = { increment: 1 };

    let updated: UserRow;
    try {
      updated = await this.prisma.user.update({ where: { id }, data, select: USER_SELECT });
    } catch (err) {
      if (isNotFound(err)) throw new NotFoundException({ error: 'USER_NOT_FOUND' });
      throw err;
    }
    if (killsSessions) this.sockets.disconnectUser(id);
    return toEntry(updated);
  }

  async remove(actor: RequestUser, id: string): Promise<void> {
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
