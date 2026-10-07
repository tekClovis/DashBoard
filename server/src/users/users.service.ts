import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { USER_SOCKET_DISCONNECTOR, type UserSocketDisconnector } from '../admin/user-socket-disconnector.js';
import type { RequestUser } from '../auth/types.js';
import { PrismaService } from '../core/prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_SOCKET_DISCONNECTOR) private readonly sockets: UserSocketDisconnector,
  ) {}

  /** Existing `onDelete: Cascade` relations remove everything the user owns. */
  async deleteSelf(user: RequestUser): Promise<void> {
    // Serializable so two admins deleting themselves concurrently can't both pass the check.
    await this.prisma.$transaction(
      async (tx) => {
        if (user.role === 'ADMIN') {
          const others = await tx.user.count({ where: { role: 'ADMIN', bannedAt: null, id: { not: user.id } } });
          if (others === 0) throw new ConflictException({ error: 'LAST_ADMIN' });
        }
        await tx.user.delete({ where: { id: user.id } });
      },
      { isolationLevel: 'Serializable' },
    );
    this.sockets.disconnectUser(user.id);
  }
}
