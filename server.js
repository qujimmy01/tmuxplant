'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { WebSocketServer } = require('ws');
const apiRoutes = require('./src/routes');
const terminalManager = require('./src/terminal-manager');
const auth = require('./src/auth');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3002;

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.json());

// Session middleware — must be configured before any route that uses sessions.
app.use(session({
    secret: auth.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,          // Prevent XSS access to cookie
        sameSite: 'lax',         // CSRF mitigation
        secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
        maxAge: 8 * 60 * 60 * 1000  // 8 hours
    }
}));

// ── Public routes (no auth required) ─────────────────────────────────────────

// Serve only the login page and its static assets without auth.
app.get('/login', auth.getLogin);
app.post('/auth/login', auth.postLogin);
app.post('/auth/logout', auth.postLogout);
app.get('/auth/status', auth.getStatus);

// Static assets for the login page (CSS, fonts, etc.)
// Full static serving is gated behind requireAuth below.
app.use('/css/login.css', express.static(path.join(__dirname, 'public', 'css', 'login.css')));

// ── Protected routes ──────────────────────────────────────────────────────────
app.use(auth.requireAuth);

// Serve static files from "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Lightweight CLI tool page
app.get('/cli', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cli.html'));
});

// Add logout button endpoint info in header (optional convenience route)
app.get('/auth/whoami', (req, res) => {
    res.json({ user: req.session.user });
});

// API routes
app.use('/api', apiRoutes);

// ── WebSocket server (session-authenticated) ──────────────────────────────────
const sessionParser = session({
    secret: auth.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
});

const wss = new WebSocketServer({
    server,
    path: '/ws/terminal',
    verifyClient: ({ req }, done) => {
        // Re-use express-session to parse the session cookie on the upgrade request.
        sessionParser(req, {}, () => {
            if (req.session && req.session.authenticated) {
                done(true);
            } else {
                done(false, 401, 'Unauthorized');
            }
        });
    }
});

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
