declare module '@bentoguard/sdk' {
  export class BentoClient {
    constructor(config: { apiKey: string; agentId: string });
  }

  export function protect(
    client: BentoClient,
    request: {
      action: string;
      context: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }
  ): Promise<{
    verdict: string;
    reasoning?: string;
    strikeCount?: number;
    intentScore?: number;
  }>;
}
