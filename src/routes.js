'use strict';

const express = require('express');
const tmux = require('./tmux-service');
const router = express.Router();

// ========== Sessions ==========

/**
 * GET /api/sessions — list all sessions with full tree
 */
router.get('/sessions', (req, res) => {
    try {
        const sessions = tmux.listSessions();
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/sessions — create a new session
 */
router.post('/sessions', (req, res) => {
    try {
        const { name, startDir } = req.body;
        const sessions = tmux.newSession(name, startDir);
        res.json({ success: true, data: sessions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/sessions/:name — kill a session
 */
router.delete('/sessions/:name', (req, res) => {
    try {
        tmux.killSession(req.params.name);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/sessions/:name — rename a session
 */
router.put('/sessions/:name', (req, res) => {
    try {
        const { newName } = req.body;
        tmux.renameSession(req.params.name, newName);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== Windows ==========

/**
 * POST /api/sessions/:name/windows — create a new window
 */
router.post('/sessions/:name/windows', (req, res) => {
    try {
        const { windowName } = req.body;
        const windows = tmux.newWindow(req.params.name, windowName);
        res.json({ success: true, data: windows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/sessions/:name/windows/:index — kill a window
 */
router.delete('/sessions/:name/windows/:index', (req, res) => {
    try {
        tmux.killWindow(req.params.name, req.params.index);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/sessions/:name/windows/:index — rename a window
 */
router.put('/sessions/:name/windows/:index', (req, res) => {
    try {
        const { newName } = req.body;
        tmux.renameWindow(req.params.name, req.params.index, newName);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/sessions/:name/windows/:index/select — select a window
 */
router.post('/sessions/:name/windows/:index/select', (req, res) => {
    try {
        tmux.selectWindow(req.params.name, req.params.index);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== Panes ==========

/**
 * POST /api/sessions/:name/windows/:index/split — split pane
 */
router.post('/sessions/:name/windows/:index/split', (req, res) => {
    try {
        const { paneIndex, direction } = req.body;
        const panes = tmux.splitPane(
            req.params.name,
            req.params.index,
            paneIndex || 0,
            direction || 'horizontal'
        );
        res.json({ success: true, data: panes });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/sessions/:name/windows/:windex/panes/:pindex — kill pane
 */
router.delete('/sessions/:name/windows/:windex/panes/:pindex', (req, res) => {
    try {
        tmux.killPane(req.params.name, req.params.windex, req.params.pindex);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/sessions/:name/windows/:windex/panes/:pindex/resize — resize pane
 */
router.post('/sessions/:name/windows/:windex/panes/:pindex/resize', (req, res) => {
    try {
        const { direction, amount } = req.body;
        tmux.resizePane(req.params.name, req.params.windex, req.params.pindex, direction, amount || 5);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== Broadcast ==========

/**
 * POST /api/broadcast — send keys to multiple targets
 */
router.post('/broadcast', (req, res) => {
    try {
        const { targets, keys, enter } = req.body;
        const results = [];
        for (const target of targets) {
            try {
                tmux.sendKeys(target, keys, enter !== false);
                results.push({ target, success: true });
            } catch (err) {
                results.push({ target, success: false, error: err.message });
            }
        }
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/send-keys — send keys to a single target
 */
router.post('/send-keys', (req, res) => {
    try {
        const { target, keys, enter } = req.body;
        tmux.sendKeys(target, keys, enter !== false);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/capture/:session/:window/:pane — capture pane contents
 */
router.get('/capture/:session/:window/:pane', (req, res) => {
    try {
        const content = tmux.capturePane(
            req.params.session,
            req.params.window,
            req.params.pane,
            req.query.lines || 50
        );
        res.json({ success: true, data: content });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
