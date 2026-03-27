'use strict';

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── Load credentials from config file ────────────────────────────────────────
const AUTH_FILE = path.join(__dirname, '..', 'data', 'auth.json');

function loadAuthConfig() {
    if (!fs.existsSync(AUTH_FILE)) {
        console.warn('⚠️  data/auth.json 不存在，将使用默认账号 admin / tmuxplant。');
        console.warn('   请运行 node scripts/set-password.js 设置你自己的账号和密码。');
        return {
            username: 'admin',
            passwordHash: bcrypt.hashSync('tmuxplant', 12),
            sessionSecret: crypto.randomBytes(32).toString('hex')
        };
    }

    let config;
    try {
        config = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    } catch (err) {
        throw new Error(`无法解析 data/auth.json: ${err.message}`);
    }

    if (!config.username || !config.passwordHash || !config.sessionSecret) {
        throw new Error('data/auth.json 格式不正确，缺少 username / passwordHash / sessionSecret 字段。请运行 node scripts/set-password.js 重新生成。');
    }

    return config;
}

const authConfig = loadAuthConfig();
const CONFIGURED_USER = authConfig.username;
const PASSWORD_HASH = authConfig.passwordHash;

// ── Session secret ────────────────────────────────────────────────────────────
const SESSION_SECRET = authConfig.sessionSecret;

// ── Login rate limiting ───────────────────────────────────────────────────────
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** ip -> { count, lockedUntil } */
const loginAttempts = new Map();

function getAttemptRecord(ip) {
    if (!loginAttempts.has(ip)) {
        loginAttempts.set(ip, { count: 0, lockedUntil: 0 });
    }
    return loginAttempts.get(ip);
}

function recordFailedAttempt(ip) {
    const rec = getAttemptRecord(ip);
    rec.count += 1;
    if (rec.count >= MAX_ATTEMPTS) {
        rec.lockedUntil = Date.now() + LOCKOUT_MS;
        rec.count = 0; // reset counter after lock
    }
}

function clearAttempts(ip) {
    loginAttempts.delete(ip);
}

function isLockedOut(ip) {
    const rec = loginAttempts.get(ip);
    if (!rec) return false;
    if (rec.lockedUntil > Date.now()) return true;
    // Lock expired; clear stale record
    if (rec.lockedUntil && rec.lockedUntil <= Date.now()) {
        loginAttempts.delete(ip);
    }
    return false;
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * requireAuth — protect any route that needs an active login session.
 * API calls get a 401 JSON response; browser requests are redirected to /login.
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    const isApi = req.path.startsWith('/api') || req.headers.accept === 'application/json';
    if (isApi) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    return res.redirect('/login');
}

// ── Route handlers ────────────────────────────────────────────────────────────

/**
 * GET /login — serve the login page.
 * Already-authenticated users are bounced to /.
 */
function getLogin(req, res) {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.sendFile(require('path').join(__dirname, '..', 'public', 'login.html'));
}

/**
 * POST /auth/login — validate credentials and start a session.
 */
async function postLogin(req, res) {
    const ip = req.ip || 'unknown';

    if (isLockedOut(ip)) {
        return res.status(429).json({
            success: false,
            error: 'Too many failed attempts. Please try again in 15 minutes.'
        });
    }

    const { username, password } = req.body || {};

    if (!username || !password) {
        recordFailedAttempt(ip);
        return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }

    // Constant-time username comparison prevents user-enumeration via timing.
    const userMatch = crypto.timingSafeEqual(
        Buffer.from(username.toLowerCase()),
        Buffer.from(CONFIGURED_USER.toLowerCase())
    );

    const passMatch = await bcrypt.compare(String(password), PASSWORD_HASH);

    if (!userMatch || !passMatch) {
        recordFailedAttempt(ip);
        // Uniform error — do not reveal which field was wrong.
        return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    clearAttempts(ip);

    // Regenerate session ID on privilege escalation (OWASP Session Fixation).
    req.session.regenerate((err) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Session error.' });
        }
        req.session.authenticated = true;
        req.session.user = CONFIGURED_USER;
        res.json({ success: true });
    });
}

/**
 * POST /auth/logout — destroy the current session.
 */
function postLogout(req, res) {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
}

/**
 * GET /auth/status — let the frontend check whether the session is still valid.
 */
function getStatus(req, res) {
    if (req.session && req.session.authenticated) {
        return res.json({ authenticated: true, user: req.session.user });
    }
    res.json({ authenticated: false });
}

module.exports = {
    SESSION_SECRET,
    requireAuth,
    getLogin,
    postLogin,
    postLogout,
    getStatus,
    /** Exported so WebSocket verifyClient can reuse session parsing. */
    isSessionAuthenticated(session) {
        return !!(session && session.authenticated);
    }
};
