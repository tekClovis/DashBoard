// GET /api/youtube/channels/search?q= — see features/big-youtube-search/spec.md.

import { BadRequestException, Controller, Get, HttpException, Query, UseGuards } from '@nestjs/common';
import type { SearchResponse } from '@dashboard/shared';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { JwtGuard } from '../../auth/jwt.guard.js';
import type { RequestUser } from '../../auth/types.js';
import { TokenCipherService } from '../../connections/token-cipher.service.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import { FetchError } from '../../timer/fetch-error.js';
import { GoogleTokenRefresher } from './google-token-refresher.js';
import { fixedMessage, youtubeClient } from './youtube-api.js';
import { searchChannels } from './youtube-search.js';

const MIN_QUERY = 2;
const MAX_QUERY = 100;

/** HTTP status per failure; any code not listed is a 502. */
const STATUS: Partial<Record<FetchError['code'], number>> = {
  NOT_CONNECTED: 409,
  REAUTH_REQUIRED: 409,
  RATE_LIMITED: 429,
};

@Controller('youtube/channels')
@UseGuards(JwtGuard)
export class YoutubeSearchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: TokenCipherService,
    private readonly refresher: GoogleTokenRefresher,
  ) {}

  @Get('search')
  async search(@Query('q') q: unknown, @CurrentUser() user: RequestUser): Promise<SearchResponse> {
    const query = typeof q === 'string' ? q.trim() : '';
    if (query.length < MIN_QUERY || query.length > MAX_QUERY) throw new BadRequestException({ error: 'INVALID_QUERY' });

    const connection = await this.prisma.serviceConnection.findUnique({
      where: { userId_service: { userId: user.id, service: 'youtube' } },
    });
    if (!connection) throw new HttpException({ error: 'NOT_CONNECTED' }, 409);

    const get = youtubeClient(
      {
        userId: user.id,
        accessToken: connection.accessTokenEnc ? this.cipher.decrypt(connection.accessTokenEnc) : undefined,
        expiresAt: connection.expiresAt ?? undefined,
        externalAccountId: connection.externalAccountId,
      },
      (userId) => this.refresher.refresh(userId),
    );
    try {
      return { results: await searchChannels(get, query).catch(fixedMessage('YouTube returned an invalid response.')) };
    } catch (err) {
      const code = err instanceof FetchError ? err.code : 'UPSTREAM_ERROR';
      throw new HttpException({ error: code }, STATUS[code] ?? 502);
    }
  }
}
