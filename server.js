'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const apiRoutes = require('./src/routes');
const terminalManager = require('./src/terminal-manager');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// Serve static files from "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight CLI tool page
app.get('/cli', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cli.html'));
});

// API routes
app.use('/api', apiRoutes);

// WebSocket server for terminal connections
const wss = new WebSocketServer({ server, path: '/ws/terminal' });

wss.on('connection', (ws, req) => {
    console.log('🌿 Terminal WebSocket connected');

    ws.on('message', (message) => {
        terminalManager.handleMessage(ws, message.toString());
    });

    ws.on('close', () => {
        console.log('🍂 Terminal WebSocket disconnected');
        terminalManager.detach(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        terminalManager.detach(ws);
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🌿 Shutting down TmuxPlant...');
    terminalManager.cleanup();
    server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
    terminalManager.cleanup();
    server.close(() => process.exit(0));
});

// Start server
server.listen(PORT, () => {
    console.log(`
  🌿 ╔══════════════════════════════════════╗
     ║        TmuxPlant is running!         ║
     ║                                      ║
     ║   http://localhost:${PORT}              ║
     ╚══════════════════════════════════════╝
  `);
});
