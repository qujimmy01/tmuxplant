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

  exec(args) {
    try {
      const result = execSync('tmux ' + args, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      return result.trim();
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      if (this.isIgnorableTmuxError(msg)) {
        return '';
      }
      return '';
    }
  }

  t(name) {
    return '=' + name;
  }

  listSessions() {
    const raw = this.exec('list-sessions -F "#{session_id}||#{session_name}||#{session_windows}||#{session_attached}||#{session_created}"');
    if (!raw) return [];

    return raw.split('\n').filter(Boolean).map(line => {
      const [id, name, windowCount, attached, created] = line.split('||');
      return {
        id,
        name,
        windowCount: parseInt(windowCount, 10),
        attached: attached === '1',
        created: new Date(parseInt(created, 10) * 1000).toISOString(),
        windows: this.listWindows(this.t(name), name),
      };
    });
  }

  listWindows(sessionRef, sessionName) {
    const raw = this.exec('list-windows -t "' + sessionRef + '" -F "#{window_id}||#{window_index}||#{window_name}||#{window_active}||#{window_panes}"');
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

  listPanes(sessionRef, windowIndex) {
    const raw = this.exec('list-panes -t "' + sessionRef + ':' + windowIndex + '" -F "#{pane_id}||#{pane_index}||#{pane_active}||#{pane_width}||#{pane_height}||#{pane_current_command}||#{pane_current_path}"');
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

  newSession(name, startDir) {
    const nameArg = name ? '-s "' + name + '"' : '';
    const dirArg = startDir ? '-c "' + startDir + '"' : '';
    this.exec('new-session -d ' + nameArg + ' ' + dirArg);
    return this.listSessions();
  }

  killSession(name) {
    try { this.exec('kill-session -t "' + this.t(name) + '"'); } catch (e) { }
    return { success: true };
  }

  renameSession(oldName, newName) {
    try { this.exec('rename-session -t "' + this.t(oldName) + '" "' + newName + '"'); } catch (e) { }
    return { success: true };
  }

  newWindow(sessionName, windowName) {
    const nameArg = windowName ? '-n "' + windowName + '"' : '';
    try { this.exec('new-window -t "' + this.t(sessionName) + '" ' + nameArg); } catch (e) { }
    return this.listWindows(this.t(sessionName), sessionName);
  }

  killWindow(sessionName, windowIndex) {
    try { this.exec('kill-window -t "' + this.t(sessionName) + ':' + windowIndex + '"'); } catch (e) { }
    return { success: true };
  }

  renameWindow(sessionName, windowIndex, newName) {
    try { this.exec('rename-window -t "' + this.t(sessionName) + ':' + windowIndex + '" "' + newName + '"'); } catch (e) { }
    return { success: true };
  }

  selectWindow(sessionName, windowIndex) {
    try { this.exec('select-window -t "' + this.t(sessionName) + ':' + windowIndex + '"'); } catch (e) { }
    return { success: true };
  }

  splitPane(sessionName, windowIndex, paneIndex, direction = 'horizontal') {
    const flag = direction === 'vertical' ? '-v' : '-h';
    try { this.exec('split-window ' + flag + ' -t "' + this.t(sessionName) + ':' + windowIndex + '.' + paneIndex + '"'); } catch (e) { }
    return this.listPanes(this.t(sessionName), windowIndex);
  }

  killPane(sessionName, windowIndex, paneIndex) {
    try { this.exec('kill-pane -t "' + this.t(sessionName) + ':' + windowIndex + '.' + paneIndex + '"'); } catch (e) { }
    return { success: true };
  }

  selectPane(sessionName, windowIndex, paneIndex) {
    try { this.exec('select-pane -t "' + this.t(sessionName) + ':' + windowIndex + '.' + paneIndex + '"'); } catch (e) { }
    return { success: true };
  }

  sendKeys(target, keys, enterKey = true) {
    const enter = enterKey ? ' Enter' : '';
    try { this.exec('send-keys -t "' + target + '" "' + keys + '"' + enter); } catch (e) { }
    return { success: true };
  }

  resizePane(sessionName, windowIndex, paneIndex, direction, amount) {
    const dirMap = { up: '-U', down: '-D', left: '-L', right: '-R' };
    const flag = dirMap[direction] || '-R';
    try { this.exec('resize-pane -t "' + this.t(sessionName) + ':' + windowIndex + '.' + paneIndex + '" ' + flag + ' ' + amount); } catch (e) { }
    return { success: true };
  }

  capturePane(sessionName, windowIndex, paneIndex, lines = 50) {
    try { return this.exec('capture-pane -t "' + this.t(sessionName) + ':' + windowIndex + '.' + paneIndex + '" -p -S -' + lines); } catch (e) { return ''; }
  }
}

module.exports = new TmuxService();
