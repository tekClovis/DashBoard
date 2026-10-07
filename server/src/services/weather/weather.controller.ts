// GET /api/weather/search?q= — city candidates for the add-widget picker, backed by Open-Meteo geocoding.

import { BadGatewayException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { CitySearchResponse } from '@dashboard/shared';
import { JwtGuard } from '../../auth/jwt.guard.js';
import { FetchError } from '../../timer/fetch-error.js';
import { searchCities } from './open-meteo.js';

/** City search for the picker; upstream failures surface as 502 with the {@link FetchError} code. */
@Controller('weather')
@UseGuards(JwtGuard)
export class WeatherController {
  @Get('search')
  async search(@Query('q') q: string | undefined): Promise<CitySearchResponse> {
    try {
      return { results: await searchCities(q ?? '') };
    } catch (err) {
      if (err instanceof FetchError) throw new BadGatewayException({ error: err.code });
      throw err;
    }
  }
}
