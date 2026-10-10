// GET /api/steam/search?q= — game candidates for the add-widget picker, backed by the Steam store search.

import { BadGatewayException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { GameSearchResponse } from '@dashboard/shared';
import { JwtGuard } from '../../auth/jwt.guard.js';
import { FetchError } from '../../timer/fetch-error.js';
import { searchGames } from './steam.widgets.js';

/** Steam game search for the picker; upstream failures surface as 502 with the {@link FetchError} code. */
@Controller('steam')
@UseGuards(JwtGuard)
export class SteamController {
  @Get('search')
  async search(@Query('q') q: string | undefined): Promise<GameSearchResponse> {
    try {
      return { results: await searchGames(q ?? '') };
    } catch (err) {
      if (err instanceof FetchError) throw new BadGatewayException({ error: err.code });
      throw err;
    }
  }
}
