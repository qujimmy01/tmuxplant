'use strict';

const { execSync } = require('child_process');

class TmuxService {
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
      // tmux returns exit code 1 when no sessions exist
      if (err.stderr && err.stderr.includes('no server running')) {
        return '';
      }
      if (err.stderr && err.stderr.includes('no current')) {
        return '';
      }
      throw new Error(`tmux error: ${err.stderr || err.message}`);
    }
  }

  /**
   * List all sessions with their windows and panes
   */
  listSessions() {
    const raw = this.exec(
      'list-sessions -F "#{session_id}||#{session_name}||#{session_windows}||#{session_attached}||#{session_created}" 2>/dev/null'
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
        windows: this.listWindows(name),
      };
    });
  }

  /**
   * List windows for a session
   */
  listWindows(sessionName) {
    const raw = this.exec(
      `list-windows -t "${sessionName}" -F "#{window_id}||#{window_index}||#{window_name}||#{window_active}||#{window_panes}" 2>/dev/null`
    );
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [id, index, name, active, paneCount] = line.split('||');
      return {
        id,
        index: parseInt(index, 10),
        name,
        active: active === '1',
        paneCount: parseInt(paneCount, 10),
        panes: this.listPanes(sessionName, parseInt(index, 10)),
      };
    });
  }

  /**
   * List panes for a window
   */
  listPanes(sessionName, windowIndex) {
    const raw = this.exec(
      `list-panes -t "${sessionName}:${windowIndex}" -F "#{pane_id}||#{pane_index}||#{pane_active}||#{pane_width}||#{pane_height}||#{pane_current_command}||#{pane_current_path}" 2>/dev/null`
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
   * Kill a session
   */
  killSession(name) {
    this.exec(`kill-session -t "${name}"`);
    return { success: true };
  }

  /**
   * Rename a session
   */
  renameSession(oldName, newName) {
    this.exec(`rename-session -t "${oldName}" "${newName}"`);
    return { success: true };
  }

  /**
   * Create a new window in a session
   */
  newWindow(sessionName, windowName) {
    const nameArg = windowName ? `-n "${windowName}"` : '';
    this.exec(`new-window -t "${sessionName}" ${nameArg}`);
    return this.listWindows(sessionName);
  }

  /**
   * Kill a window
   */
  killWindow(sessionName, windowIndex) {
    this.exec(`kill-window -t "${sessionName}:${windowIndex}"`);
    return { success: true };
  }

  /**
   * Rename a window
   */
  renameWindow(sessionName, windowIndex, newName) {
    this.exec(`rename-window -t "${sessionName}:${windowIndex}" "${newName}"`);
    return { success: true };
  }

  /**
   * Select a window
   */
  selectWindow(sessionName, windowIndex) {
    this.exec(`select-window -t "${sessionName}:${windowIndex}"`);
    return { success: true };
  }

  /**
   * Split a pane
   */
  splitPane(sessionName, windowIndex, paneIndex, direction = 'horizontal') {
    const flag = direction === 'vertical' ? '-v' : '-h';
    this.exec(`split-window ${flag} -t "${sessionName}:${windowIndex}.${paneIndex}"`);
    return this.listPanes(sessionName, windowIndex);
  }

  /**
   * Kill a pane
   */
  killPane(sessionName, windowIndex, paneIndex) {
    this.exec(`kill-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`);
    return { success: true };
  }

  /**
   * Select a pane
   */
  selectPane(sessionName, windowIndex, paneIndex) {
    this.exec(`select-pane -t "${sessionName}:${windowIndex}.${paneIndex}"`);
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
    this.exec(`resize-pane -t "${sessionName}:${windowIndex}.${paneIndex}" ${flag} ${amount}`);
    return { success: true };
  }

  /**
   * Capture pane contents
   */
  capturePane(sessionName, windowIndex, paneIndex, lines = 50) {
    const result = this.exec(
      `capture-pane -t "${sessionName}:${windowIndex}.${paneIndex}" -p -S -${lines}`
    );
    return result;
  }
}

module.exports = new TmuxService();
