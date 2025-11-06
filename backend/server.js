const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BIN = path.join(__dirname, process.platform === 'win32' ? 'server.exe' : './server');

let engine = null;
let buf = '';
let pending = null;

function start() {
    engine = spawn(BIN, [], { cwd: __dirname, stdio: ['pipe', 'pipe', 'inherit'] });
    engine.on('error', e => console.error('[engine error]', e));
    engine.on('exit', (code, sig) => {
        console.error(`[engine exited] code=${code} sig=${sig}`);
        if (pending) { pending.reject(new Error('engine exited')); pending = null; }
        setTimeout(start, 500);
    });
    engine.stdout.on('data', chunk => {
        buf += chunk.toString('utf8');
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            if (pending) { pending.resolve(line); pending = null; }
        }
    });
}
start();

function callEngine(obj, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        if (!engine || engine.killed) return reject(new Error('engine not ready'));
        if (pending) return reject(new Error('busy, try again'));
        pending = { resolve, reject };
        try { engine.stdin.write(JSON.stringify(obj) + '\n', 'utf8'); }
        catch (e) { pending = null; return reject(e); }
        setTimeout(() => { if (pending) { pending = null; reject(new Error('engine timeout')); } }, timeoutMs);
    });
}

let lastPerfKick = 0;
let perfInFlight = false;
const PERF_DEBOUNCE_MS = 750;

async function kickPerf() {
    const now = Date.now();
    if (now - lastPerfKick < PERF_DEBOUNCE_MS) return;
    lastPerfKick = now;
    if (perfInFlight) return;
    perfInFlight = true;
    try {
        await callEngine({ queryType: 'runPerf' }, 60000);
        console.log('[perf] refreshed');
    } catch (err) {
        console.warn('[perf] refresh skipped:', err.message);
    } finally {
        perfInFlight = false;
    }
}

app.post('/api/query', async (req, res) => {
    try {
        const raw = await callEngine(req.body);
        try { res.status(200).json(JSON.parse(raw)); }
        catch { res.status(200).type('application/json').send(raw); }
    } catch (e) {
        console.error('[api error]', e);
        res.status(500).json({ error: String(e) });
    } finally {
        kickPerf();
    }
});

app.post('/api/run-perf', async (req, res) => {
    try {
        const raw = await callEngine({ queryType: 'runPerf' }, 60000);
        return res.status(200).json({ ok: true, raw });
    } catch (e) {
        return res.status(500).json({ error: String(e) });
    }
});

app.get('/api/perf', (req, res) => {
    const f = path.join(__dirname, 'performance_results.json');
    fs.stat(f, (err, stat) => {
        if (err) return res.status(404).json({ error: 'performance_results.json not found' });
        res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'ETag': String(stat.mtimeMs),
            'X-Perf-Updated-At': new Date(stat.mtimeMs).toISOString()
        });
        res.sendFile(f);
    });
});

const PORT = 8080;
app.listen(PORT, () => console.log(`http://127.0.0.1:${PORT}`));
