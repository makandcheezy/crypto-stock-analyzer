import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Brush
} from 'recharts';
import PerformanceComparison from './PerformanceComparison';

const YELLOW = '#EAB308';
const WHITE  = '#ffffff';

// helpers
const safePct = (a, b) => {
    const A = Number(a), B = Number(b);
    if (!Number.isFinite(A) || !Number.isFinite(B) || A <= 1e-6 || B <= 0) return '—';
    return ((A / B - 1) * 100).toFixed(2);
};
const pctImprove = (btree, bplus) => {
    const A = Number(btree), B = Number(bplus);
    if (!Number.isFinite(A) || !Number.isFinite(B) || A <= 0) return '—';
    return ((A / B - 1) * 100).toFixed(2);
};

function AppInner() {
    // state
    const [queryType, setQueryType] = useState('ticker');
    const [tickerInput, setTickerInput] = useState('');
    const [startDate, setStartDate] = useState('2024-01-15');
    const [endDate, setEndDate] = useState('2024-01-17');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [performanceMetrics, setPerformanceMetrics] = useState(null);
    const [perfData, setPerfData] = useState(null);
    const [totalRecords, setTotalRecords] = useState(null);

    // fetch perf snapshot
    const loadPerf = async () => {
        try {
            const r = await fetch(`http://127.0.0.1:8080/api/perf?ts=${Date.now()}`, { cache: 'no-store' });
            const ct = r.headers.get('content-type') || '';
            if (!r.ok || !ct.includes('application/json')) throw new Error('perf not json');
            setPerfData(await r.json());
        } catch (e) {
            console.log('Primary perf fetch failed:', e.message);
            try {
                const r2 = await fetch(`/performance_results.json?ts=${Date.now()}`, { cache: 'no-store' });
                const ct2 = r2.headers.get('content-type') || '';
                if (!r2.ok || !ct2.includes('application/json')) throw new Error('fallback not json');
                setPerfData(await r2.json());
            } catch (e2) {
                console.log('Fallback perf fetch failed:', e2.message);
                setPerfData(null);
            }
        }
    };
    useEffect(() => { loadPerf(); }, []);

    // run query
    const runQuery = async () => {
        setIsLoading(true);

        const query = {};
        if (queryType === 'ticker') {
            query.queryType = 'ticker';
            query.ticker = tickerInput;
        } else if (queryType === 'dateRange') {
            query.queryType = 'dateRange';
            query.startDate = startDate;
            query.endDate = endDate;
        } else if (queryType === 'priceRange') {
            query.queryType = 'priceRange';
            query.minPrice = minPrice === '' ? undefined : parseFloat(minPrice);
            query.maxPrice = maxPrice === '' ? undefined : parseFloat(maxPrice);
        }

        const t0 = performance.now();
        try {
            const res = await fetch(`http://127.0.0.1:8080/api/query?ts=${Date.now()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
            });
            const data = await res.json();

            const rows = Array.isArray(data.results) ? data.results : [];
            setResults(rows);
            setTotalRecords(data?.size ?? null);

            const live = data?.metrics;
            const useLive = live && (live.btree || live.bplustree);
            const clientQuerySec = (performance.now() - t0) / 1000;

            let btreeQuery, bplusQuery, scanQuery, btreeMem, bplusMem, btreeBuild, bplusBuild, rssMB;

            if (useLive) {
                btreeQuery = Number(live?.btree?.querySec);
                bplusQuery = Number(live?.bplustree?.querySec);
                scanQuery = Number(live?.scan?.querySec);
                btreeMem   = Number(live?.btree?.memoryMB);
                bplusMem   = Number(live?.bplustree?.memoryMB);
                btreeBuild = Number(live?.btree?.buildSec);
                bplusBuild = Number(live?.bplustree?.buildSec);
                rssMB      = Number(live?.rssMB);
            } else {
                let index = 'timestamp_index';
                if (queryType === 'priceRange') {
                    index = 'price_index';
                } else if (queryType === 'dateRange') {
                    index = 'timestamp_index';
                }
                const b  = (perfData?.[index]?.btree)     || {};
                const bp = (perfData?.[index]?.bplustree) || {};
                btreeQuery = Number.isFinite(Number(b.rangeQuery100)) ? Number(b.rangeQuery100) : clientQuerySec;
                bplusQuery = Number(bp.rangeQuery100);
                scanQuery = undefined;
                btreeMem   = Number(b.memory);
                bplusMem   = Number(bp.memory);
                btreeBuild = Number(b.buildTime);
                bplusBuild = Number(bp.buildTime);
                rssMB      = undefined;
            }

            setPerformanceMetrics({
                btree: {
                    query:  Number.isFinite(btreeQuery) ? btreeQuery.toFixed(6) : '—',
                    memory: Number.isFinite(btreeMem)   ? btreeMem.toFixed(2)   : '—',
                    build:  Number.isFinite(btreeBuild) ? btreeBuild.toFixed(4) : '—'
                },
                bplustree: {
                    query:  Number.isFinite(bplusQuery) ? bplusQuery.toFixed(6) : '—',
                    memory: Number.isFinite(bplusMem)   ? bplusMem.toFixed(2)   : '—',
                    build:  Number.isFinite(bplusBuild) ? bplusBuild.toFixed(4) : '—'
                },
                scan: {
                    query: Number.isFinite(scanQuery) ? (scanQuery * 1000).toFixed(3) : '—'
                },
                rssMB: Number.isFinite(rssMB) ? rssMB.toFixed(2) : '—',
                improvement: safePct(btreeQuery, bplusQuery),
                memoryImprovement: pctImprove(btreeMem, bplusMem),
                buildImprovement: pctImprove(btreeBuild, bplusBuild),
                recordsFound: rows.length
            });

            setTimeout(() => loadPerf(), 800);

        } catch (err) {
            console.log('Query error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // chart data
    const getChartData = () => {
        if (results.length === 0) return { type: 'none', data: [] };

        if (queryType === 'ticker') {
            const validResults = results
                .filter(r => r.price && !isNaN(r.price) && r.price > 0)
                .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
            if (validResults.length === 0) return { type: 'none', data: [] };

            const dateGroups = {};
            validResults.forEach(item => {
                const date = String(item.timestamp).split(' ')[0];
                if (!dateGroups[date]) dateGroups[date] = { prices: [], count: 0 };
                dateGroups[date].prices.push(parseFloat(item.price));
                dateGroups[date].count++;
            });

            const chartPoints = Object.entries(dateGroups).map(([date, d]) => {
                const ts = new Date(date + 'T00:00:00Z').getTime();
                return {
                    t: ts,
                    name: date,
                    price: parseFloat((d.prices.reduce((a, b) => a + b, 0) / d.count).toFixed(2))
                };
            }).sort((a, b) => a.t - b.t);

            const prices = chartPoints.map(p => p.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const range = maxPrice - minPrice;
            const pad = range > 0 ? range * 0.1 : maxPrice * 0.05;
            const yMin = Math.max(0, Math.floor(minPrice - pad));
            const yMax = Math.ceil(maxPrice + pad);
            const avg = prices.reduce((s, v) => s + v, 0) / prices.length;

            return { type: 'price', data: chartPoints, yDomain: [yMin, yMax], stats: { min: minPrice, max: maxPrice, avg } };
        }

        if (queryType === 'dateRange') {
            const stockCount = results.filter(r => r.type === 'STOCK').length;
            const cryptoCount = results.filter(r => r.type === 'CRYPTO').length;
            return { type: 'distribution', data: [{ name: 'Stocks', count: stockCount }, { name: 'Crypto', count: cryptoCount }] };
        }

        if (queryType === 'priceRange') {
            const symbolCounts = {};
            results.forEach(r => { if (r.symbol) symbolCounts[r.symbol] = (symbolCounts[r.symbol] || 0) + 1; });
            const topSymbols = Object.entries(symbolCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([symbol, count]) => ({ name: symbol, count: parseInt(count, 10) }));
            return { type: 'symbols', data: topSymbols };
        }

        return { type: 'none', data: [] };
    };

    const chartData = getChartData();

    // visual datasets
    const queryChartData = performanceMetrics ? [
        {
            name: 'Query Time (ms)',
            'B-Tree': (parseFloat(performanceMetrics.btree.query) || 0) * 1000,
            'B+ Tree': (parseFloat(performanceMetrics.bplustree.query) || 0) * 1000
        }
    ] : [];

    const buildChartData = performanceMetrics ? [
        {
            name: 'Build Time (s)',
            'B-Tree': parseFloat(performanceMetrics.btree.build) || 0,
            'B+ Tree': parseFloat(performanceMetrics.bplustree.build) || 0
        }
    ] : [];

    const memChartData = performanceMetrics ? [
        {
            name: 'Tree Memory (MB)',
            'B-Tree': parseFloat(performanceMetrics.btree.memory) || 0,
            'B+ Tree': parseFloat(performanceMetrics.bplustree.memory) || 0
        }
    ] : [];

    // render
    return (
        <div className="min-h-screen bg-black p-6" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
            <div className="max-w-7xl mx-auto">
                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 mb-6 border border-yellow-500/30">
                    <h1 className="text-3xl font-bold text-yellow-400 mb-2 tracking-tight">Crypto & Stock Market Data Analyzer</h1>
                    <div className="text-sm text-gray-400">
                        <div><span className="text-gray-500">Total Records:</span> <span className="font-semibold text-white">{totalRecords?.toLocaleString() || '—'}</span></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    <div className="lg:col-span-1">
                        <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30 sticky top-6">
                            <h2 className="text-lg font-bold text-yellow-400 mb-4">Query Settings</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-gray-300 mb-2 text-sm font-medium">Query Type</label>
                                    <select
                                        value={queryType}
                                        onChange={(e) => setQueryType(e.target.value)}
                                        className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                    >
                                        <option value="ticker">By Name/Symbol</option>
                                        <option value="dateRange">By Date Range</option>
                                        <option value="priceRange">By Price Range</option>
                                    </select>
                                </div>

                                {queryType === 'ticker' && (
                                    <div>
                                        <label className="block text-gray-300 mb-2 text-sm font-medium">Name or Symbol</label>
                                        <input
                                            type="text"
                                            value={tickerInput}
                                            onChange={(e) => setTickerInput(e.target.value)}
                                            placeholder="Microsoft, Bitcoin, Apple..."
                                            className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                        />
                                    </div>
                                )}

                                {queryType === 'dateRange' && (
                                    <>
                                        <div>
                                            <label className="block text-gray-300 mb-2 text-sm font-medium">Start Date</label>
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-gray-300 mb-2 text-sm font-medium">End Date</label>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                    </>
                                )}

                                {queryType === 'priceRange' && (
                                    <>
                                        <div>
                                            <label className="block text-gray-300 mb-2 text-sm font-medium">Min Price ($)</label>
                                            <input
                                                type="number"
                                                value={minPrice}
                                                onChange={(e) => setMinPrice(e.target.value)}
                                                placeholder="0"
                                                className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-gray-300 mb-2 text-sm font-medium">Max Price ($)</label>
                                            <input
                                                type="number"
                                                value={maxPrice}
                                                onChange={(e) => setMaxPrice(e.target.value)}
                                                placeholder="∞"
                                                className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                            />
                                        </div>
                                    </>
                                )}
                                <button
                                    onClick={runQuery}
                                    disabled={isLoading}
                                    className="w-full bg-yellow-500 hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-3 rounded-lg transition-colors"
                                >
                                    {isLoading ? 'Running...' : 'Run Query'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-3 space-y-6">
                        {results.length > 0 && (
                            <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                <h2 className="text-lg font-bold text-yellow-400 mb-4">Query Results ({results.length} records)</h2>
                                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-black">
                                        <tr className="text-gray-300 border-b border-yellow-500/30">
                                            <th className="p-2 text-left font-semibold">Timestamp</th>
                                            <th className="p-2 text-left font-semibold">Name</th>
                                            <th className="p-2 text-left font-semibold">Symbol</th>
                                            <th className="p-2 text-right font-semibold">Price</th>
                                            <th className="p-2 text-center font-semibold">Type</th>
                                        </tr>
                                        </thead>
                                        <tbody className="text-gray-400">
                                        {results.map((item, idx) => (
                                            <tr key={idx} className="border-b border-yellow-500/10 hover:bg-zinc-800/50">
                                                <td className="p-2">{item.timestamp}</td>
                                                <td className="p-2 text-white">{item.name}</td>
                                                <td className="p-2 font-mono text-yellow-400">{item.symbol || '—'}</td>
                                                <td className="p-2 text-right font-mono text-white">
                                                    {Number.isFinite(Number(item.price)) ? `$${Number(item.price).toLocaleString()}` : '—'}
                                                </td>
                                                <td className="p-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${item.type === 'CRYPTO'
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-gray-700 text-gray-300 border border-gray-600'}`}>
                              {item.type}
                            </span>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ticker price trend */}
                        {chartData.type === 'price' && (
                            <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                <h2 className="text-lg font-bold text-yellow-400 mb-4">Price Trend (Averaged by Day)</h2>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart data={chartData.data}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis
                                            dataKey="t"
                                            type="number"
                                            domain={['dataMin', 'dataMax']}
                                            stroke="#9CA3AF"
                                            tickFormatter={(ts) => {
                                                const d = new Date(ts);
                                                const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                                                const dd = String(d.getUTCDate()).padStart(2, '0');
                                                return `${mm}/${dd}`;
                                            }}
                                            allowDuplicatedCategory={false}
                                            minTickGap={20}
                                            tickCount={Math.min(6, chartData.data.length)}
                                        />
                                        <YAxis
                                            domain={chartData.yDomain}
                                            stroke="#9CA3AF"
                                            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                                        />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }}
                                            labelStyle={{ color: '#EAB308' }}
                                            formatter={(v) => `$${Number(v).toFixed(2)}`}
                                            labelFormatter={(ts) => {
                                                const d = new Date(ts);
                                                const yyyy = d.getUTCFullYear();
                                                const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
                                                const dd = String(d.getUTCDate()).padStart(2, '0');
                                                return `${mm}/${dd}/${yyyy}`;
                                            }}
                                        />
                                        <Legend />
                                        {chartData.stats && (
                                            <>
                                                <ReferenceLine y={chartData.stats.min} stroke="#64748B" strokeDasharray="4 4" />
                                                <ReferenceLine y={chartData.stats.avg} stroke="#94A3B8" strokeDasharray="2 6" />
                                                <ReferenceLine y={chartData.stats.max} stroke="#64748B" strokeDasharray="4 4" />
                                            </>
                                        )}
                                        <Line
                                            type="monotone"
                                            dataKey="price"
                                            dot={{ r: 2 }}
                                            activeDot={{ r: 4 }}
                                            strokeWidth={2}
                                            stroke={YELLOW}
                                        />
                                        <Brush dataKey="t" height={18} stroke={YELLOW} travellerWidth={8} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {performanceMetrics && (
                            <>
                                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                    <h2 className="text-lg font-bold text-yellow-400 mb-4">Performance (Live)</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                            <tr className="text-gray-300 border-b border-yellow-500/30">
                                                <th className="p-3 text-left font-semibold">Metric</th>
                                                <th className="p-3 text-right font-semibold">B-Tree</th>
                                                <th className="p-3 text-right font-semibold">B+ Tree</th>
                                                <th className="p-3 text-right font-semibold">Improvement</th>
                                            </tr>
                                            </thead>
                                            <tbody className="text-gray-400">
                                            <tr className="border-b border-yellow-500/10">
                                                <td className="p-3 text-white">Query Time</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.query}s</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.query}s</td>
                                                <td className="p-3 text-right font-mono text-yellow-400">{performanceMetrics.improvement}%</td>
                                            </tr>
                                            <tr className="border-b border-yellow-500/10">
                                                <td className="p-3 text-white">Tree Memory (approx)</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.memory} MB</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.memory} MB</td>
                                                <td className="p-3 text-right font-mono text-yellow-400">{performanceMetrics.memoryImprovement}%</td>
                                            </tr>
                                            <tr className="border-b border-yellow-500/10">
                                                <td className="p-3 text-white">Build Time</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.build}s</td>
                                                <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.build}s</td>
                                                <td className="p-3 text-right font-mono text-yellow-400">{performanceMetrics.buildImprovement}%</td>
                                            </tr>
                                            <tr className="border-t-2 border-yellow-500/20">
                                                <td className="p-3 text-white">Process Memory (RSS)</td>
                                                <td className="p-3 text-center font-mono text-gray-300" colSpan="2">
                                                    {performanceMetrics.rssMB} MB
                                                </td>
                                                <td className="p-3 text-right text-gray-500 text-xs">total</td>
                                            </tr>
                                            <tr>
                                                <td className="p-3 text-white">Sequential Scan</td>
                                                <td className="p-3 text-center font-mono text-gray-300" colSpan="2">
                                                    {performanceMetrics.scan?.query || '—'} ms
                                                </td>
                                                <td className="p-3 text-right text-gray-500 text-xs">no index</td>
                                            </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* query time chart */}
                                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                    <h2 className="text-lg font-bold text-yellow-400 mb-4">Query Time (milliseconds)</h2>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={queryChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="name" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }}
                                                labelStyle={{ color: '#EAB308' }}
                                                formatter={(v) => Number(v).toFixed(3) + ' ms'}
                                            />
                                            <Legend />
                                            <Bar dataKey="B-Tree" fill={YELLOW} />
                                            <Bar dataKey="B+ Tree" fill={WHITE} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* build time chart */}
                                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                    <h2 className="text-lg font-bold text-yellow-400 mb-4">Build Time (seconds)</h2>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={buildChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="name" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }}
                                                labelStyle={{ color: '#EAB308' }}
                                                formatter={(v) => Number(v).toFixed(6) + ' s'}
                                            />
                                            <Legend />
                                            <Bar dataKey="B-Tree" fill={YELLOW} />
                                            <Bar dataKey="B+ Tree" fill={WHITE} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* memory chart */}
                                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                    <h2 className="text-lg font-bold text-yellow-400 mb-4">Tree Memory (MB)</h2>
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={memChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                            <XAxis dataKey="name" stroke="#9CA3AF" />
                                            <YAxis stroke="#9CA3AF" />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }}
                                                labelStyle={{ color: '#EAB308' }}
                                                formatter={(v) => Number(v).toFixed(2) + ' MB'}
                                            />
                                            <Legend />
                                            <Bar dataKey="B-Tree" fill={YELLOW} />
                                            <Bar dataKey="B+ Tree" fill={WHITE} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </>
                        )}

                        <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                            <PerformanceComparison data={perfData} />
                            {perfData?.updatedAt && (
                                <div className="text-xs text-gray-500 mt-2">
                                    Snapshot last updated: <span className="text-gray-300">{perfData.updatedAt}</span>
                                </div>
                            )}
                        </div>

                        {chartData.type === 'distribution' && (
                            <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                <h2 className="text-lg font-bold text-yellow-400 mb-4">Record Distribution</h2>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={chartData.data}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="name" stroke="#9CA3AF" />
                                        <YAxis stroke="#9CA3AF" />
                                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }} labelStyle={{ color: '#EAB308' }} />
                                        <Legend />
                                        <Bar dataKey="count" fill={YELLOW} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {chartData.type === 'symbols' && (
                            <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                <h2 className="text-lg font-bold text-yellow-400 mb-4">Top Symbols in Range</h2>
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={chartData.data}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="name" stroke="#9CA3AF" />
                                        <YAxis stroke="#9CA3AF" />
                                        <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #EAB308' }} labelStyle={{ color: '#EAB308' }} />
                                        <Legend />
                                        <Bar dataKey="count" fill="#ffffff" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <div className="min-h-screen bg-black p-6">
            <AppInner />
        </div>
    );
}