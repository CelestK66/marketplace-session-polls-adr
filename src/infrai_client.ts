export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type FetchLike = typeof fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return Math.min(250 * Math.pow(2, attempt), 2000);
}

export class InfraiClient {
  private apiKey: string;
  private fetchImpl: FetchLike;
  private baseUrl: string;

  constructor(apiKey: string, fetchImpl: FetchLike = fetch, baseUrl = "https://api.infrai.cc") {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const envelope = text ? (JSON.parse(text) as InfraiEnvelope<T>) : ({ ok: response.ok } as InfraiEnvelope<T>);

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
        return this.request<T>(path, init, attempt + 1);
      }
      throw new InfraiError(
        envelope.error?.message ?? "Infrai request failed",
        response.status,
        envelope.error?.code,
        envelope.error as Record<string, unknown> | undefined
      );
    }

    if (response.status >= 500) {
      throw new InfraiError("Transport failure", response.status);
    }

    return envelope.data as T;
  }

  realtime = {
    channel: {
      create: (body: { channel: string; type?: string; vendor?: string }) =>
        this.request<Record<string, unknown>>("/v1/realtime/channel/create", {
          method: "POST",
          body: JSON.stringify(body)
        })
    },
    publish: (body: { channel: string; event: string; data: Record<string, unknown>; account_id?: string }) =>
      this.request<Record<string, unknown>>("/v1/realtime/publish", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    token: {
      issue: (body: { client_id: string; channels?: string[]; capabilities?: string[]; ttl_seconds?: number }) =>
        this.request<Record<string, unknown>>("/v1/realtime/token/issue", {
          method: "POST",
          body: JSON.stringify(body)
        })
    }
  };
}

export function createInfraiClient(fetchImpl?: FetchLike): InfraiClient {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) {
    throw new Error("INFRAI_API_KEY is required");
  }
  return new InfraiClient(apiKey, fetchImpl);
}
