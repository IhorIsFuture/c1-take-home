import { testEnvironment } from '../test-environment';

type HeadersWithSetCookie = Headers & {
  getSetCookie?: () => string[];
};

export interface TestHttpRequest {
  method?: string;
  json?: unknown;
  accessToken?: string;
  headers?: HeadersInit;
}

export interface TestHttpResponse<Body> {
  status: number;
  ok: boolean;
  headers: Headers;
  body: Body;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as HeadersWithSetCookie).getSetCookie;

  if (getSetCookie) return getSetCookie.call(headers);

  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

export class TestHttpClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly baseUrl = testEnvironment.baseUrl) {}

  async request<Body>(
    path: string,
    { method = 'GET', json, accessToken, headers: inputHeaders }: TestHttpRequest = {}
  ): Promise<TestHttpResponse<Body>> {
    const headers = new Headers(inputHeaders);
    headers.set('Accept', 'application/json');

    if (json !== undefined) headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);

    const cookie = this.cookieHeader;
    if (cookie) headers.set('Cookie', cookie);

    const response = await fetch(new URL(path, this.baseUrl), {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      redirect: 'manual'
    });

    this.captureCookies(response.headers);

    const responseText = await response.text();
    const body = (
      responseText && response.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(responseText)
        : responseText || undefined
    ) as Body;

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body
    };
  }

  getCookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  fork(): TestHttpClient {
    const client = new TestHttpClient(this.baseUrl);

    for (const [name, value] of this.cookies) client.setCookie(name, value);

    return client;
  }

  private get cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => name + '=' + value).join('; ');
  }

  private captureCookies(headers: Headers): void {
    for (const setCookieHeader of getSetCookieHeaders(headers)) {
      const [cookiePair, ...attributes] = setCookieHeader.split(';').map(value => value.trim());
      const separatorIndex = cookiePair.indexOf('=');

      if (separatorIndex < 1) continue;

      const name = cookiePair.slice(0, separatorIndex);
      const value = cookiePair.slice(separatorIndex + 1);
      const shouldRemove =
        !value ||
        attributes.some(attribute => attribute.toLowerCase() === 'max-age=0') ||
        attributes.some(attribute =>
          attribute.toLowerCase().startsWith('expires=thu, 01 jan 1970')
        );

      if (shouldRemove) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}
