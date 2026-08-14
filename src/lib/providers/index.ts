import type { DataProvider } from './types.ts';
import { FmpProvider } from './fmp.ts';
import { DaloopaProvider } from './daloopa.ts';

export function getProvider(name = process.env.DATA_PROVIDER ?? 'fmp'): DataProvider {
  switch (name.toLowerCase()) {
    case 'fmp': return new FmpProvider(process.env.FMP_API_KEY ?? '');
    case 'daloopa': return new DaloopaProvider();
    default: throw new Error(`unknown DATA_PROVIDER "${name}" (expected fmp or daloopa)`);
  }
}
export * from './types.ts';
export { FmpProvider } from './fmp.ts';
export { DaloopaProvider } from './daloopa.ts';
