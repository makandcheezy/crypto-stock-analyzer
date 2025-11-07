import React from 'react';

const num = (x, d = 6) => (Number.isFinite(Number(x)) ? Number(x).toFixed(d) : '—');
const pct = (x, d = 2) => {
    if (!Number.isFinite(x)) return '—';
    if (!isFinite(x)) return '—';
    return `${x.toFixed(d)}%`;
};

const improvement = (btree, bplus) => {
    const a = Number(btree);
    const b = Number(bplus);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 1e-6 || b <= 0) return NaN;
    return (a / b - 1) * 100; 
};

export default function PerformanceComparison({ data }) {
    const t_b  = data?.timestamp_index?.btree     || {};
    const t_bp = data?.timestamp_index?.bplustree || {};
    const p_b  = data?.price_index?.btree         || {};
    const p_bp = data?.price_index?.bplustree     || {};

    const Row = ({ label, a, b, decimals = 6 }) => (
        <tr className="odd:bg-zinc-900/40">
            <td className="py-2 pr-4 text-gray-200">{label}</td>
            <td className="py-2 pr-4 font-mono text-white text-right">{num(a, decimals)}</td>
            <td className="py-2 pr-4 font-mono text-white text-right">{num(b, decimals)}</td>
            <td className="py-2 pr-4 font-mono text-yellow-400 text-right">
                {pct(improvement(a, b))}
            </td>
        </tr>
    );

    return (
        <div className="p-4 text-gray-200">
            {!data && (
                <div className="text-yellow-400 mb-2">
                    Waiting for performance data…
                </div>
            )}

            <h2 className="text-xl font-semibold mb-3 text-yellow-400">Performance Comparison</h2>

            <div className="overflow-x-auto rounded-2xl">
                <table className="min-w-full text-sm text-gray-200">
                    <thead>
                    <tr className="text-left border-b border-neutral-700 text-gray-300">
                        <th className="py-2 pr-4">Metric</th>
                        <th className="py-2 pr-4 text-right">B-Tree</th>
                        <th className="py-2 pr-4 text-right">B+ Tree</th>
                        <th className="py-2 pr-4 text-right">Improvement</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                    <Row label="Query Time (Timestamp, 100)"    a={t_b.rangeQuery100}    b={t_bp.rangeQuery100} />
                    <Row label="Query Time (Timestamp, 1000)"   a={t_b.rangeQuery1000}   b={t_bp.rangeQuery1000} />
                    <Row label="Query Time (Timestamp, 10000)"  a={t_b.rangeQuery10000}  b={t_bp.rangeQuery10000} />
                    <Row label="Exact Lookup (Timestamp)"       a={t_b.exactLookup}      b={t_bp.exactLookup} />
                    <Row label="Memory Usage (Timestamp)"       a={t_b.memory}           b={t_bp.memory} decimals={2} />
                    <Row label="Build Time (Timestamp)"         a={t_b.buildTime}        b={t_bp.buildTime} />
                    <Row label="Query Time (Price, 100)"        a={p_b.rangeQuery100}    b={p_bp.rangeQuery100} />
                    <Row label="Query Time (Price, 1000)"       a={p_b.rangeQuery1000}   b={p_bp.rangeQuery1000} />
                    <Row label="Query Time (Price, 10000)"      a={p_b.rangeQuery10000}  b={p_bp.rangeQuery10000} />
                    </tbody>
                </table>
            </div>
        </div>
    );
}
