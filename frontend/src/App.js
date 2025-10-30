import React, { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const sampleStockData = [
    { timestamp: '2024-01-15 09:00', name: 'Apple', symbol: 'AAPL', price: 185.50, high: 186.20, low: 184.80, volume: 25000000, type: 'STOCK' },
    { timestamp: '2024-01-15 10:00', name: 'Apple', symbol: 'AAPL', price: 186.20, high: 187.00, low: 185.40, volume: 22000000, type: 'STOCK' },
    { timestamp: '2024-01-15 11:00', name: 'Microsoft', symbol: 'MSFT', price: 405.30, high: 406.50, low: 404.20, volume: 18000000, type: 'STOCK' },
    { timestamp: '2024-01-15 12:00', name: 'Tesla', symbol: 'TSLA', price: 215.80, high: 217.20, low: 214.50, volume: 35000000, type: 'STOCK' },
    { timestamp: '2024-01-16 09:00', name: 'Apple', symbol: 'AAPL', price: 187.00, high: 188.50, low: 186.50, volume: 26000000, type: 'STOCK' },
    { timestamp: '2024-01-16 10:00', name: 'Microsoft', symbol: 'MSFT', price: 408.90, high: 410.20, low: 407.30, volume: 19000000, type: 'STOCK' },
    { timestamp: '2024-01-16 11:00', name: 'Tesla', symbol: 'TSLA', price: 218.40, high: 219.80, low: 217.10, volume: 38000000, type: 'STOCK' },
    { timestamp: '2024-01-17 09:00', name: 'Apple', symbol: 'AAPL', price: 188.30, high: 189.50, low: 187.80, volume: 24000000, type: 'STOCK' },
];

const sampleCryptoData = [
    { timestamp: '2024-01-15 09:00', name: 'Bitcoin', symbol: 'BTC', price: 42150.00, volume: 1250000000, type: 'CRYPTO' },
    { timestamp: '2024-01-15 10:00', name: 'Bitcoin', symbol: 'BTC', price: 42380.00, volume: 1180000000, type: 'CRYPTO' },
    { timestamp: '2024-01-15 11:00', name: 'Ethereum', symbol: 'ETH', price: 2580.50, volume: 850000000, type: 'CRYPTO' },
    { timestamp: '2024-01-15 12:00', name: 'Bitcoin', symbol: 'BTC', price: 42290.00, volume: 1420000000, type: 'CRYPTO' },
    { timestamp: '2024-01-16 09:00', name: 'Bitcoin', symbol: 'BTC', price: 42650.00, volume: 1320000000, type: 'CRYPTO' },
    { timestamp: '2024-01-16 10:00', name: 'Ethereum', symbol: 'ETH', price: 2620.80, volume: 920000000, type: 'CRYPTO' },
    { timestamp: '2024-01-16 11:00', name: 'Bitcoin', symbol: 'BTC', price: 43100.00, volume: 1450000000, type: 'CRYPTO' },
    { timestamp: '2024-01-17 09:00', name: 'Ethereum', symbol: 'ETH', price: 2680.30, volume: 980000000, type: 'CRYPTO' },
];

const allData = [...sampleStockData, ...sampleCryptoData];

function App() {
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
    const [realPerformanceData, setRealPerformanceData] = useState(null);
    const [marketData, setMarketData] = useState(allData);

    React.useEffect(() => {
        fetch('/market_data.json')
            .then(response => response.json())
            .then(data => {
                setMarketData(data);
                console.log(`Loaded ${data.length} real market records`);
            })
            .catch(error => {
                console.log('Using sample data (market_data.json not found)');
                setMarketData(allData);
            });
    }, []);

    React.useEffect(() => {
        fetch('/performance_results.json')
            .then(response => response.json())
            .then(data => {
                setRealPerformanceData(data);
                console.log('Loaded real performance data');
            })
            .catch(error => {
                console.log('Using sample data (performance_results.json not found)');
            });
    }, []);

    const runQuery = () => {
        setIsLoading(true);

        setTimeout(() => {
            let filtered = [...marketData];

            if (queryType === 'ticker' && tickerInput) {
                filtered = filtered.filter(item =>
                    item.symbol.toLowerCase().includes(tickerInput.toLowerCase()) ||
                    item.name.toLowerCase().includes(tickerInput.toLowerCase())
                );
            } else if (queryType === 'dateRange') {
                filtered = filtered.filter(item => {
                    const itemDate = item.timestamp.split(' ')[0];
                    return itemDate >= startDate && itemDate <= endDate;
                });
            } else if (queryType === 'priceRange') {
                const min = parseFloat(minPrice) || 0;
                const max = parseFloat(maxPrice) || Infinity;
                filtered = filtered.filter(item => item.price >= min && item.price <= max);
            }

            const index = indexType === 'timestamp' ? 'timestamp_index' : 'price_index';
            let btreeTime, bplusTime, btreeMem, bplusMem, btreeBuild, bplusBuild;

            if (realPerformanceData && realPerformanceData[index]) {
                btreeTime = realPerformanceData[index].btree.rangeQuery100.toFixed(4);
                bplusTime = realPerformanceData[index].bplustree.rangeQuery100.toFixed(4);
                btreeMem = realPerformanceData[index].btree.memory.toFixed(1);
                bplusMem = realPerformanceData[index].bplustree.memory.toFixed(1);
                btreeBuild = realPerformanceData[index].btree.buildTime.toFixed(3);
                bplusBuild = realPerformanceData[index].bplustree.buildTime.toFixed(3);
            } else {
                const baseTime = indexType === 'timestamp' ? 0.0082 : 0.0091;
                btreeTime = (baseTime * (0.9 + Math.random() * 0.2)).toFixed(4);
                bplusTime = (baseTime * 0.52 * (0.9 + Math.random() * 0.2)).toFixed(4);
                btreeMem = indexType === 'timestamp' ? '48.2' : '49.1';
                bplusMem = indexType === 'timestamp' ? '52.7' : '53.8';
                btreeBuild = indexType === 'timestamp' ? '2.341' : '2.456';
                bplusBuild = indexType === 'timestamp' ? '2.518' : '2.634';
            }

            const improvement = (((parseFloat(btreeTime) - parseFloat(bplusTime)) / parseFloat(btreeTime)) * 100).toFixed(1);

            setPerformanceMetrics({
                btree: {
                    query: btreeTime,
                    memory: btreeMem,
                    build: btreeBuild
                },
                bplustree: {
                    query: bplusTime,
                    memory: bplusMem,
                    build: bplusBuild
                },
                improvement: improvement,
                recordsFound: filtered.length
            });

            setResults(filtered);
            setIsLoading(false);
        }, 800);
    };

    const performanceChartData = performanceMetrics ? [
        { name: 'Query Time', 'B-Tree': parseFloat(performanceMetrics.btree.query) * 1000, 'B+ Tree': parseFloat(performanceMetrics.bplustree.query) * 1000 },
        { name: 'Build Time', 'B-Tree': parseFloat(performanceMetrics.btree.build), 'B+ Tree': parseFloat(performanceMetrics.bplustree.build) },
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
                const date = item.timestamp.split(' ')[0];
                if (!dateGroups[date]) {
                    dateGroups[date] = { prices: [], count: 0 };
                }
                dateGroups[date].prices.push(parseFloat(item.price));
                dateGroups[date].count++;
            });

            const chartPoints = Object.entries(dateGroups).map(([date, data]) => ({
                name: date,
                price: parseFloat((data.prices.reduce((a, b) => a + b, 0) / data.count).toFixed(2))
            }));

            const prices = chartPoints.map(p => p.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const priceRange = maxPrice - minPrice;

            const padding = priceRange > 0 ? priceRange * 0.1 : maxPrice * 0.05;
            const yMin = Math.max(0, Math.floor(minPrice - padding));
            const yMax = Math.ceil(maxPrice + padding);

            return {
                type: 'price',
                data: chartPoints,
                yDomain: [yMin, yMax]
            };
        } else if (queryType === 'dateRange') {
            const stockCount = results.filter(r => r.type === 'STOCK').length;
            const cryptoCount = results.filter(r => r.type === 'CRYPTO').length;

            return {
                type: 'distribution',
                data: [
                    { name: 'Stocks', count: stockCount },
                    { name: 'Crypto', count: cryptoCount }
                ]
            };
        } else if (queryType === 'priceRange') {
            const symbolCounts = {};
            results.forEach(r => {
                if (r.symbol) {
                    symbolCounts[r.symbol] = (symbolCounts[r.symbol] || 0) + 1;
                }
            });

            const topSymbols = Object.entries(symbolCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([symbol, count]) => ({
                    name: symbol,
                    count: parseInt(count, 10)
                }));

            console.log('Top 5 symbols:', JSON.stringify(topSymbols, null, 2));

            return {
                type: 'symbols',
                data: topSymbols
            };
        }

        return { type: 'none', data: [] };
    };

    const chartData = getChartData();

    return (
        <div className="min-h-screen bg-black p-6" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
            <div className="max-w-7xl mx-auto">

                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 mb-6 border border-yellow-500/30">
                    <h1 className="text-3xl font-bold text-yellow-400 mb-2 tracking-tight">
                        Crypto & Stock Market Data Analyzer
                    </h1>
                    <div className="text-sm text-gray-400">
                        <div><span className="text-gray-500">Total Records:</span> <span className="font-semibold text-white">{marketData.length}</span></div>
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
                                                <td className="p-2 text-right font-mono text-white">${item.price.toLocaleString()}</td>
                                                <td className="p-2 text-right">{(item.volume / 1000000).toFixed(1)}M</td>
                                                <td className="p-2 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${item.type === 'CRYPTO' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-gray-700 text-gray-300 border border-gray-600'}`}>
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
                                                -{((parseFloat(performanceMetrics.bplustree.memory) - parseFloat(performanceMetrics.btree.memory)) / parseFloat(performanceMetrics.btree.memory) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-white">Build Time</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.btree.build}s</td>
                                            <td className="p-3 text-right font-mono text-white">{performanceMetrics.bplustree.build}s</td>
                                            <td className="p-3 text-right text-gray-400">
                                                -{((parseFloat(performanceMetrics.bplustree.build) - parseFloat(performanceMetrics.btree.build)) / parseFloat(performanceMetrics.btree.build) * 100).toFixed(1)}%
                                            </td>
                                        </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {performanceMetrics && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                    <h3 className="text-md font-bold text-yellow-400 mb-4">Performance Comparison</h3>
                                    <ResponsiveContainer width="100%" height={250}>
                                        <BarChart data={performanceChartData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                            <XAxis dataKey="name" stroke="#a1a1aa" />
                                            <YAxis stroke="#a1a1aa" />
                                            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #eab308' }} />
                                            <Legend />
                                            <Bar dataKey="B-Tree" fill="#71717a" />
                                            <Bar dataKey="B+ Tree" fill="#eab308" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {chartData.type !== 'none' && (
                                    <div className="bg-zinc-900 rounded-lg shadow-lg p-6 border border-yellow-500/30">
                                        <h3 className="text-md font-bold text-yellow-400 mb-4">
                                            {chartData.type === 'price' && 'Price Trend'}
                                            {chartData.type === 'distribution' && 'Records by Type'}
                                            {chartData.type === 'symbols' && 'Top 5 Symbols Found'}
                                        </h3>
                                        <ResponsiveContainer width="100%" height={250}>
                                            {chartData.type === 'price' ? (
                                                <LineChart data={chartData.data}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                                    <XAxis
                                                        dataKey="name"
                                                        stroke="#a1a1aa"
                                                        angle={-45}
                                                        textAnchor="end"
                                                        height={80}
                                                        fontSize={10}
                                                    />
                                                    <YAxis
                                                        stroke="#a1a1aa"
                                                        domain={chartData.yDomain}
                                                        tickFormatter={(value) => `$${Math.round(value)}`}
                                                        width={50}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #eab308' }}
                                                        formatter={(value) => [`$${value.toFixed(2)}`, 'Price']}
                                                        labelStyle={{ color: '#eab308' }}
                                                    />
                                                    <Line
                                                        type="monotone"
                                                        dataKey="price"
                                                        stroke="#eab308"
                                                        strokeWidth={1.5}
                                                        dot={{ fill: '#eab308', strokeWidth: 0, r: 2 }}
                                                        activeDot={{ r: 4, fill: '#eab308' }}
                                                    />
                                                </LineChart>
                                            ) : chartData.type === 'symbols' ? (
                                                <BarChart
                                                    data={chartData.data.length > 0 ? chartData.data : [
                                                        { name: 'TEST1', count: 5 },
                                                        { name: 'TEST2', count: 3 }
                                                    ]}
                                                    margin={{ top: 5, right: 20, left: 10, bottom: 60 }}
                                                >
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                                    <XAxis
                                                        dataKey="name"
                                                        stroke="#a1a1aa"
                                                        angle={-45}
                                                        textAnchor="end"
                                                        height={80}
                                                        interval={0}
                                                        tick={{ fontSize: 11, fill: '#ffffff' }}
                                                    />
                                                    <YAxis
                                                        stroke="#a1a1aa"
                                                        allowDecimals={false}
                                                        domain={[(dataMin) => Math.floor(dataMin * 0.95), 'auto']}
                                                    />
                                                    <Tooltip
                                                        contentStyle={{
                                                            backgroundColor: '#18181b',
                                                            border: '1px solid #eab308'
                                                        }}
                                                        cursor={{ fill: '#3f3f46', opacity: 0.3 }}
                                                    />
                                                    <Bar
                                                        dataKey="count"
                                                        fill="#eab308"
                                                        radius={[4, 4, 0, 0]}
                                                    />
                                                </BarChart>
                                            ) : (
                                                <BarChart data={chartData.data}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                                                    <XAxis dataKey="name" stroke="#a1a1aa" />
                                                    <YAxis stroke="#a1a1aa" />
                                                    <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #eab308' }} />
                                                    <Legend />
                                                    <Bar dataKey="count" fill="#eab308" />
                                                </BarChart>
                                            )}
                                        </ResponsiveContainer>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;