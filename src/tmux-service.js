'use strict';

const { execSync } = require('child_process');

class TmuxService {
  isIgnorableTmuxError(msg) {
    const text = (msg || '').toLowerCase();
    return text.includes('no server running')
      || text.includes('no current')
      || text.includes("can't find session")
      || text.includes('error connecting to')
      || text.includes('/tmp/tmux-');
  }

  /**
   * Execute a tmux command and return stdout
   */
  exec(args) {
    try {
      const result = execSync(`tmux ${args}`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return result.trim();
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      if (this.isIgnorableTmuxError(msg)) {
        return '';
      }
      throw new Error(msg || err.message);
    }
  }

  /**
   * Escape a session/window name for use as an exact tmux target.
   * Prefix with '=' forces tmux to match by name, not by index.
   */
  t(name) {
    // tmux exact-match prefix: '=name' — prevents numeric names being treated as indexes
    return `=${name}`;
  }

  /**
   * List all sessions with their windows and panes
   */
  listSessions() {
    const raw = this.exec(
      'list-sessions -F "#{session_id}||#{session_name}||#{session_windows}||#{session_attached}||#{session_created}"'
    );
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [id, name, windowCount, attached, created] = line.split('||');
      return {
        id,
        name,
        windowCount: parseInt(windowCount, 10),
        attached: attached === '1',
        created: new Date(parseInt(created, 10) * 1000).toISOString(),
        // Use session ID ($0, $1, ...) internally to avoid numeric-name ambiguity
        windows: this.listWindows(id, name),
      };
    });
  }

  /**
   * List windows for a session.
   * @param {string} sessionRef - session ID ($0) or exact name
   * @param {string} sessionName - human-readable name (stored in returned objects)
   */
  listWindows(sessionRef, sessionName) {
    const raw = this.exec(
      `list-windows -t "${sessionRef}" -F "#{window_id}||#{window_index}||#{window_name}||#{window_active}||#{window_panes}"`
    );
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [id, index, name, active, paneCount] = line.split('||');
      const idx = parseInt(index, 10);
      return {
        id,
        index: idx,
        name,
        active: active === '1',
        paneCount: parseInt(paneCount, 10),
        panes: this.listPanes(sessionRef, idx),
      };
    });
  }

  /**
   * List panes for a window.
   * @param {string} sessionRef - session ID or exact name
   */
  listPanes(sessionRef, windowIndex) {
    const raw = this.exec(
      `list-panes -t "${sessionRef}:${windowIndex}" -F "#{pane_id}||#{pane_index}||#{pane_active}||#{pane_width}||#{pane_height}||#{pane_current_command}||#{pane_current_path}"`
    );
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [id, index, active, width, height, command, path] = line.split('||');
      return {
        id,
        index: parseInt(index, 10),
        active: active === '1',
        width: parseInt(width, 10),
        height: parseInt(height, 10),
        currentCommand: command,
        currentPath: path,
      };
    });
  }

  /**
   * Create a new session
   */
  newSession(name, startDir) {
    const nameArg = name ? `-s "${name}"` : '';
    const dirArg = startDir ? `-c "${startDir}"` : '';
    this.exec(`new-session -d ${nameArg} ${dirArg}`);
    return this.listSessions();
  }

  /**
   * Kill a session by name (exact match)
   */
  killSession(name) {
    this.exec(`kill-session -t "${this.t(name)}"`);
    return { success: true };
  }

  /**
   * Rename a session (exact match)
   */
  renameSession(oldName, newName) {
    this.exec(`rename-session -t "${this.t(oldName)}" "${newName}"`);
    return { success: true };
  }

  /**
   * Create a new window in a session (exact match)
   */
  newWindow(sessionName, windowName) {
    const nameArg = windowName ? `-n "${windowName}"` : '';
    this.exec(`new-window -t "${this.t(sessionName)}" ${nameArg}`);
    return this.listWindows(this.t(sessionName), sessionName);
  }

  /**
   * Kill a window (exact session name match)
   */
  killWindow(sessionName, windowIndex) {
    this.exec(`kill-window -t "${this.t(sessionName)}:${windowIndex}"`);
    return { success: true };
  }

  /**
   * Rename a window (exact session name match)
   */
  renameWindow(sessionName, windowIndex, newName) {
    this.exec(`rename-window -t "${this.t(sessionName)}:${windowIndex}" "${newName}"`);
    return { success: true };
  }

  /**
   * Select a window (exact session name match)
   */
  selectWindow(sessionName, windowIndex) {
    this.exec(`select-window -t "${this.t(sessionName)}:${windowIndex}"`);
    return { success: true };
  }

  /**
   * Split a pane (exact session name match)
   */
  splitPane(sessionName, windowIndex, paneIndex, direction = 'horizontal') {
    const flag = direction === 'vertical' ? '-v' : '-h';
    this.exec(`split-window ${flag} -t "${this.t(sessionName)}:${windowIndex}.${paneIndex}"`);
    return this.listPanes(this.t(sessionName), windowIndex);
  }

  /**
   * Kill a pane (exact session name match)
   */
  killPane(sessionName, windowIndex, paneIndex) {
    this.exec(`kill-pane -t "${this.t(sessionName)}:${windowIndex}.${paneIndex}"`);
    return { success: true };
  }

  /**
   * Select a pane (exact session name match)
   */
  selectPane(sessionName, windowIndex, paneIndex) {
    this.exec(`select-pane -t "${this.t(sessionName)}:${windowIndex}.${paneIndex}"`);
    return { success: true };
  }

  /**
   * Send keys to a target
   */
  sendKeys(target, keys, enterKey = true) {
    const enter = enterKey ? ' Enter' : '';
    this.exec(`send-keys -t "${target}" "${keys}"${enter}`);
    return { success: true };
  }

  /**
   * Resize a pane
   */
  resizePane(sessionName, windowIndex, paneIndex, direction, amount) {
    const dirMap = { up: '-U', down: '-D', left: '-L', right: '-R' };
    const flag = dirMap[direction] || '-R';
    this.exec(`resize-pane -t "${this.t(sessionName)}:${windowIndex}.${paneIndex}" ${flag} ${amount}`);
    return { success: true };
  }

  /**
   * Capture pane contents
   */
  capturePane(sessionName, windowIndex, paneIndex, lines = 50) {
    return this.exec(
      `capture-pane -t "${this.t(sessionName)}:${windowIndex}.${paneIndex}" -p -S -${lines}`
    );
  }
}

module.exports = new TmuxService();
