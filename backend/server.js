const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/query', (req, res) => {
    const queryJson = JSON.stringify(req.body);
    
    const child = exec('./server',{maxBuffer: 1024 * 1024 * 10}, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        const results = JSON.parse(stdout.trim());
        res.json(results);
    });
    
    child.stdin.write(queryJson + '\n');
    child.stdin.end();
});

app.listen(8080, () => {
    console.log('Server running on port 8080');
});
// node.js express server to query the server.cpp file
// this code queries, then sends output as a JSON back to react.