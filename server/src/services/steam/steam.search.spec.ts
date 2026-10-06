import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchGames } from './steam.widgets.js';

const store = {
  total: 2,
  items: [
    { type: 'app', id: 620, name: 'Portal 2', tiny_image: 'https://cdn.example/620.jpg' },
    { type: 'app', id: 400, name: 'Portal' },
  ],
};

function stubStore(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchGames', () => {
  it('queries the store search and maps app id, name and image', async () => {
    const fetchMock = stubStore(200, store);

    const results = await searchGames(' portal ');

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.host).toBe('store.steampowered.com');
    expect(url.searchParams.get('term')).toBe('portal');
    expect(results).toEqual([
      { appId: 620, name: 'Portal 2', image: 'https://cdn.example/620.jpg' },
      { appId: 400, name: 'Portal', image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/400/capsule_184x69.jpg' },
    ]);
  });

  it('answers a short query with no results and no request', async () => {
    const fetchMock = stubStore(200, store);

    await expect(searchGames('p')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with UPSTREAM_ERROR when the store errors or answers garbage', async () => {
    stubStore(500, {});
    await expect(searchGames('portal')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    stubStore(200, { nope: true });
    await expect(searchGames('portal')).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });
});
