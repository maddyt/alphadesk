import type { ValuationFlag } from '@/lib/engine/types';

export function Flags({ flags }: { flags: ValuationFlag[] }) {
  if (!flags.length) {
    return <div className="card text-[13px] text-pos">No sanity flags — the three methods agree and no structural check failed.</div>;
  }
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.code + f.message}
             className={`card border-l-4 text-[13px] ${f.severity === 'warn' ? 'border-l-gold bg-gold/5' : 'border-l-steel'}`}>
          <span className={`chip mr-2 ${f.severity === 'warn' ? 'bg-gold' : 'bg-steel'}`}>{f.code.replace(/_/g, ' ')}</span>
          {f.message}
        </div>
      ))}
    </div>
  );
}
