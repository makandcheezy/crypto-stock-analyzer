// src/App.js
import React, { useState } from 'react';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import PerformanceComparison from './PerformanceComparison';

function AppInner() {
    const [queryType, setQueryType] = useState('ticker');
    const [tickerInput, setTickerInput] = useState('');
    const [startDate, setStartDate] = useState('2024-01-15');
    const [endDate, setEndDate] = useState('2024-01-17');
    const [minPrice, setMinPrice] = useState('');
    const [maxPrice, setMaxPrice] = useState('');
    const [indexType, setIndexType] = useState('timestamp');

    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [performanceMetrics, setPerformanceMetrics] = useState(null);
    const [perfData, setPerfData] = useState(null);
    const [totalRecords, setTotalRecords] = useState(null);

    const loadPerf = async () => {
        try {
            const r = await fetch(`http://127.0.0.1:8080/api/perf?ts=${Date.now()}`, { cache: 'no-store' });
            const ct = r.headers.get('content-type') || '';
            if (!r.ok || !ct.includes('application/json')) throw new Error('perf not json');
            setPerfData(await r.json());
        } catch {
            try {
                const r2 = await fetch(`/performance_results.json?ts=${Date.now()}`, { cache: 'no-store' });
                const ct2 = r2.headers.get('content-type') || '';
                if (!r2.ok || !ct2.includes('application/json')) throw new Error('fallback not json');
                setPerfData(await r2.json());
            } catch {
                setPerfData(null);
            }
        }
    };

    React.useEffect(() => { loadPerf(); }, []);

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

        // client-side timer as a fallback if backend doesn't return metrics
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

            // 1) Prefer live metrics from backend if present
            const live = data?.metrics;
            const useLive = live && (live.btree || live.bplustree);

            // 2) Otherwise use client-side measured query time
            const clientQuerySec = (performance.now() - t0) / 1000;

            let btreeQuery = null, bplusQuery = null, btreeMem = null, bplusMem = null, btreeBuild = null, bplusBuild = null;

            if (useLive) {
                btreeQuery = Number(live?.btree?.querySec);
                bplusQuery = Number(live?.bplustree?.querySec);
                btreeMem   = Number(live?.btree?.memoryMB);
                bplusMem   = Number(live?.bplustree?.memoryMB);
                btreeBuild = Number(live?.btree?.buildSec);
                bplusBuild = Number(live?.bplustree?.buildSec);
            } else {
                // 3) Fall back to perfData file (static) if available
                const index = indexType === 'timestamp' ? 'timestamp_index' : 'price_index';
                const b  = (perfData?.[index]?.btree)     || {};
                const bp = (perfData?.[index]?.bplustree) || {};

                // use clientQuerySec for B-Tree query if we don't have live metrics
                btreeQuery = Number.isFinite(Number(b.rangeQuery100)) ? Number(b.rangeQuery100) : clientQuerySec;
                bplusQuery = Number(bp.rangeQuery100);
                btreeMem   = Number(b.memory);
                bplusMem   = Number(bp.memory);
                btreeBuild = Number(b.buildTime);
                bplusBuild = Number(bp.buildTime);
            }

            const improvement = (Number.isFinite(btreeQuery) && btreeQuery !== 0 && Number.isFinite(bplusQuery))
                ? (((btreeQuery - bplusQuery) / btreeQuery) * 100)
                : (Number.isFinite(btreeQuery) && !Number.isFinite(bplusQuery))
                    ? 0 // if only btree is known, show 0% instead of stale 100%
                    : NaN;

            setPerformanceMetrics({
                btree: {
                    query:  Number.isFinite(btreeQuery) ? btreeQuery.toFixed(4) : '—',
                    memory: Number.isFinite(btreeMem)   ? btreeMem.toFixed(4)   : '—',
                    build:  Number.isFinite(btreeBuild) ? btreeBuild.toFixed(4) : '—'
                },
                bplustree: {
                    query:  Number.isFinite(bplusQuery) ? bplusQuery.toFixed(4) : '—',
                    memory: Number.isFinite(bplusMem)   ? bplusMem.toFixed(4)   : '—',
                    build:  Number.isFinite(bplusBuild) ? bplusBuild.toFixed(4) : '—'
                },
                improvement: Number.isFinite(improvement) ? improvement.toFixed(1) : '—',
                recordsFound: rows.length
            });
            setTimeout(() => {
                fetch('http://127.0.0.1:8080/api/perf?ts=' + Date.now(), { cache: 'no-store' })
                    .then(r => (r.ok ? r.json() : Promise.reject('perf fetch not ok')))
                    .then(data => setPerfData(data))
                    .catch(err => console.log('perf refresh error:', err));
            }, 800);

            // pull fresh perf blob after each query (no cache)
            loadPerf();
        } catch (err) {
            console.log('Error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const performanceChartData = performanceMetrics ? [
        {
            name: 'Query Time',
            'B-Tree':  parseFloat(performanceMetrics.btree.query)     * 1000 || 0,
            'B+ Tree': parseFloat(performanceMetrics.bplustree.query) * 1000 || 0
        },
        {
            name: 'Build Time',
            'B-Tree':  parseFloat(performanceMetrics.btree.build)     || 0,
            'B+ Tree': parseFloat(performanceMetrics.bplustree.build) || 0
        },
    ] : [];

    const getChartData = () => {
        if (results.length === 0) return { type: 'none', data: [] };
        const uniqueSymbols = [...new Set(results.map(r => r.symbol))];

        if (queryType === 'ticker' && uniqueSymbols.length === 1) {
            const validResults = results
                .filter(r => r.price && !isNaN(r.price) && r.price > 0)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (validResults.length === 0) return { type: 'none', data: [] };

            const dateGroups = {};
            validResults.forEach(item => {
                const date = String(item.timestamp).split(' ')[0];
                if (!dateGroups[date]) dateGroups[date] = { prices: [], count: 0 };
                dateGroups[date].prices.push(parseFloat(item.price));
                dateGroups[date].count++;
            });

            const chartPoints = Object.entries(dateGroups).map(([date, d]) => ({
                name: date,
                price: parseFloat((d.prices.reduce((a, b) => a + b, 0) / d.count).toFixed(2))
            }));

            const prices = chartPoints.map(p => p.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const range = maxPrice - minPrice;
            const pad = range > 0 ? range * 0.1 : maxPrice * 0.05;
            const yMin = Math.max(0, Math.floor(minPrice - pad));
            const yMax = Math.ceil(maxPrice + pad);

            return { type: 'price', data: chartPoints, yDomain: [yMin, yMax] };
        } else if (queryType === 'dateRange') {
            const stockCount = results.filter(r => r.type === 'STOCK').length;
            const cryptoCount = results.filter(r => r.type === 'CRYPTO').length;
            return { type: 'distribution', data: [{ name: 'Stocks', count: stockCount }, { name: 'Crypto', count: cryptoCount }] };
        } else if (queryType === 'priceRange') {
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

    return (
        <div className="min-h-screen bg-black p-6" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
            <div className="max-w-7xl mx-auto">
                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 mb-6 border border-yellow-500/30">
                    <h1 className="text-3xl font-bold text-yellow-400 mb-2 tracking-tight">Crypto & Stock Market Data Analyzer</h1>
                    <div className="text-sm text-gray-400">
                        <div><span className="text-gray-500">Total Records:</span> <span className="font-semibold text-white">{totalRecords}</span></div>
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

                                <div>
                                    <label className="block text-gray-300 mb-2 text-sm font-medium">Index Type</label>
                                    <select
                                        value={indexType}
                                        onChange={(e) => setIndexType(e.target.value)}
                                        className="w-full bg-black text-white border border-yellow-500/50 rounded-lg p-2 text-sm focus:outline-none focus:border-yellow-500"
                                    >
                                        <option value="timestamp">Timestamp Index</option>
                                        <option value="price">Price Index</option>
                                    </select>
                                </div>

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
                                            <th className="p-2 text-right font-semibold">Volume</th>
                                            <th className="p-2 text-center font-semibold">Type</th>
                                        </tr>
                                        </thead>
                                        <tbody className="text-gray-400">
                                        {results.map((item, idx) => (
                                            <tr key={idx} className="border-b border-yellow-500/10 hover:bg-zinc-800/50">
                                                <td className="p-2">{item.timestamp}</td>
                                                <td className="p-2 text-white">{item.name}</td>
                                                <td className="p-2 font-mono text-yellow-400">{item.symbol}</td>
                                                <td className="p-2 text-right font-mono text-white">
                                                    {Number.isFinite(Number(item.price)) ? `$${Number(item.price).toLocaleString()}` : '—'}
                                                </td>
                                                <td className="p-2 text-right">
                                                    {Number.isFinite(Number(item.volume)) ? `${(Number(item.volume) / 1_000_000).toFixed(1)}M` : '—'}
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

                        {performanceMetrics && (
                            <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                <h2 className="text-lg font-bold text-yellow-400 mb-4">Performance Comparison</h2>
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
                                            <td className="p-3 text-right font-semibold text-yellow-400">{performanceMetrics.improvement}%</td>
                                        </tr>
                                        <tr className="border-b border-yellow-500/10">
                                            <td className="p-3 text-white">Memory Usage</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.memory} MB</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.memory} MB</td>
                                            <td className="p-3 text-right text-gray-400">
                                                {(Number(performanceMetrics.bplustree.memory) && Number(performanceMetrics.btree.memory))
                                                    ? (((parseFloat(performanceMetrics.bplustree.memory) - parseFloat(performanceMetrics.btree.memory)) / parseFloat(performanceMetrics.btree.memory) * 100).toFixed(1))
                                                    : '—'}%
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-white">Build Time</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.build}s</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.build}s</td>
                                            <td className="p-3 text-right text-gray-400">
                                                {(Number(performanceMetrics.bplustree.build) && Number(performanceMetrics.btree.build))
                                                    ? (((parseFloat(performanceMetrics.bplustree.build) - parseFloat(performanceMetrics.btree.build)) / parseFloat(performanceMetrics.btree.build) * 100).toFixed(1))
                                                    : '—'}%
                                            </td>
                                        </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                            <PerformanceComparison data={perfData} />
                        </div>

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
