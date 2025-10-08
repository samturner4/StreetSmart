export type HttpClient = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiDeps {
  baseUrl: string;
  httpClient?: HttpClient;
}

function makeUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export function createApi({ baseUrl, httpClient }: ApiDeps) {
  const client: HttpClient = httpClient ?? ((url, init) => fetch(url, init));
  return {
    async geocode(query: string) {
      const url = new URL(makeUrl(baseUrl, '/api/geocode'));
      url.searchParams.set('q', query);
      const res = await client(url.toString());
      if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
      return res.json();
    },
    async safeRoute(start: [number, number], end: [number, number]) {
      const url = makeUrl(baseUrl, '/api/safe-route');
      const res = await client(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end })
      });
      if (!res.ok) throw new Error(`safe-route failed: ${res.status}`);
      return res.json();
    },
  };
}
