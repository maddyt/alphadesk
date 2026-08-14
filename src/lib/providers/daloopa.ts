/**
 * Daloopa adapter.
 *
 * Daloopa exposes filings-traced fundamentals with a source id per datapoint, which is exactly
 * what this portal's lineage story wants: every figure can link back to the filing it came from.
 * Access is gated behind an authorised credential; until one is present this adapter reports
 * that clearly rather than silently degrading to a different data source.
 */
import type { DataProvider, ProviderCompany } from './types.ts';
import { ProviderError } from './types.ts';

export class DaloopaProvider implements DataProvider {
  readonly name = 'daloopa';
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? process.env.DALOOPA_API_KEY;
    this.baseUrl = baseUrl ?? process.env.DALOOPA_BASE_URL ?? 'https://mcp.daloopa.com/server/mcp';
  }

  private assertConfigured(ticker: string): void {
    if (!this.apiKey) {
      throw new ProviderError(
        this.name, ticker,
        'DALOOPA_API_KEY is not set. Authorise the Daloopa connector and set the key, or run with DATA_PROVIDER=fmp.',
      );
    }
  }

  async universe(spec: string): Promise<string[]> {
    return spec.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  /**
   * Intentionally unimplemented against live endpoints: the response contract could not be
   * verified without an authorised credential, and guessing at a schema is how silently wrong
   * numbers get into a valuation. Implement `discover_companies` -> series pulls here, mapping
   * each datapoint's fundamental_id into `raw` so citations survive into the deliverables.
   */
  async fetchCompany(ticker: string, _years: number): Promise<ProviderCompany> {
    this.assertConfigured(ticker);
    throw new ProviderError(
      this.name, ticker,
      'Daloopa ingestion is not implemented. The response schema was not verifiable at build time; '
      + 'map discover_companies + fundamentals here, preserving fundamental_id per datapoint for citations.',
    );
  }
}
