"""
WP Launcher Productivity — Sublime Text Plugin

Tracks your coding time automatically and sends heartbeats to the WP Launcher
API for productivity monitoring. See time by language, project, editor, and more.

https://wplauncher.msrbuilds.com
"""

import sublime
import sublime_plugin
import os
import json
import time
import hashlib
import platform
import subprocess
import threading
import uuid
from urllib.request import Request, urlopen
from urllib.error import URLError

# --- Constants ---

DEBOUNCE_SECONDS = 120          # 2 minutes per file
FLUSH_INTERVAL_SECONDS = 30     # 30 seconds
BACKOFF_INTERVAL_SECONDS = 300  # 5 minutes
MAX_QUEUE_SIZE = 500
MAX_CONSECUTIVE_FAILURES = 5
STATUS_REFRESH_SECONDS = 60     # 1 minute
SETTINGS_FILE = 'WPLProductivity.sublime-settings'

# --- Global State ---

_queue = []
_queue_lock = threading.Lock()
_last_heartbeats = {}  # file_path -> timestamp
_consecutive_failures = 0
_flush_timer = None
_status_timer = None
_machine_id = None


# --- Settings ---

def get_settings():
    return sublime.load_settings(SETTINGS_FILE)

def get_api_url():
    return get_settings().get('api_url', 'http://localhost:3737')

def is_enabled():
    return get_settings().get('enabled', True)


# --- Machine ID ---

def get_machine_id():
    global _machine_id
    if _machine_id:
        return _machine_id

    system = platform.system()
    try:
        if system == 'Windows':
            import winreg
            reg = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r'SOFTWARE\Microsoft\Cryptography')
            val, _ = winreg.QueryValueEx(reg, 'MachineGuid')
            winreg.CloseKey(reg)
            _machine_id = val
            return _machine_id
        elif system == 'Darwin':
            result = subprocess.run(
                ['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'],
                capture_output=True, text=True, timeout=3
            )
            for line in result.stdout.splitlines():
                if 'IOPlatformUUID' in line:
                    _machine_id = line.split('"')[-2]
                    return _machine_id
        else:
            for path in ['/etc/machine-id', '/var/lib/dbus/machine-id']:
                if os.path.exists(path):
                    with open(path) as f:
                        _machine_id = f.read().strip()
                        return _machine_id
    except Exception:
        pass

    # Fallback: persisted random UUID
    id_file = os.path.join(os.path.expanduser('~'), '.wpl-machine-id')
    try:
        if os.path.exists(id_file):
            with open(id_file) as f:
                _machine_id = f.read().strip()
                return _machine_id
    except Exception:
        pass

    _machine_id = str(uuid.uuid4())
    try:
        with open(id_file, 'w') as f:
            f.write(_machine_id)
    except Exception:
        pass
    return _machine_id


# --- Language Detection ---

# Map Sublime syntax names to standard language IDs
_SYNTAX_REMAP = {
    'javascript (babel)': 'javascript',
    'javascript': 'javascript',
    'typescript': 'typescript',
    'typescriptreact': 'typescriptreact',
    'jsx': 'javascriptreact',
    'tsx': 'typescriptreact',
    'c++': 'cpp',
    'c#': 'csharp',
    'objective-c': 'objectivec',
    'objective-c++': 'objectivecpp',
    'shell-unix-generic': 'shellscript',
    'bash': 'shellscript',
    'plain text': 'plaintext',
    'regular expressions': 'regex',
}

def get_language(view):
    syntax = view.settings().get('syntax', '')
    name = os.path.splitext(os.path.basename(syntax))[0].lower()
    return _SYNTAX_REMAP.get(name, name)


# --- Project & Path ---

def get_project_name(window):
    if not window:
        return ''
    proj = window.project_file_name()
    if proj:
        return os.path.splitext(os.path.basename(proj))[0]
    folders = window.folders()
    if folders:
        return os.path.basename(folders[0])
    return ''

def get_relative_path(view):
    file_path = view.file_name()
    if not file_path:
        return ''
    window = view.window()
    if window:
        for folder in window.folders():
            if file_path.startswith(folder):
                return os.path.relpath(file_path, folder).replace('\\', '/')
    return os.path.basename(file_path)


# --- Git Branch ---

def get_git_branch(file_path):
    if not file_path:
        return ''
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=os.path.dirname(file_path),
            capture_output=True, text=True, timeout=3
        )
        return result.stdout.strip() if result.returncode == 0 else ''
    except Exception:
        return ''


# --- HTTP Client ---

def post_heartbeats(api_url, heartbeats):
    url = api_url.rstrip('/') + '/api/productivity/heartbeats'
    data = json.dumps({'heartbeats': heartbeats}).encode('utf-8')
    req = Request(url, data=data, headers={'Content-Type': 'application/json'})
    req.method = 'POST'
    try:
        with urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception:
        return False

def fetch_today_stats(api_url):
    url = api_url.rstrip('/') + '/api/productivity/stats/today'
    req = Request(url)
    try:
        with urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception:
        return None


# --- Format Duration ---

def format_duration(seconds):
    h = seconds // 3600
    m = (seconds % 3600) // 60
    if h == 0:
        return '{}m'.format(m)
    return '{}h {}m'.format(h, m)


# --- Queue Management ---

def enqueue_heartbeat(view, is_write):
    if not is_enabled():
        return

    file_path = view.file_name()
    if not file_path:
        return

    now = time.time()

    # Debounce: skip same file within window (unless write)
    if not is_write:
        last = _last_heartbeats.get(file_path, 0)
        if now - last < DEBOUNCE_SECONDS:
            return

    _last_heartbeats[file_path] = now

    window = view.window()
    heartbeat = {
        'source': 'editor',
        'entity': get_relative_path(view),
        'entity_type': 'file',
        'project': get_project_name(window),
        'language': get_language(view),
        'editor': 'sublime',
        'machine_id': get_machine_id(),
        'branch': get_git_branch(file_path),
        'is_write': is_write,
        'time': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime()),
    }

    with _queue_lock:
        _queue.append(heartbeat)
        if len(_queue) > MAX_QUEUE_SIZE:
            del _queue[:-MAX_QUEUE_SIZE]


def flush_queue():
    global _consecutive_failures

    with _queue_lock:
        if not _queue:
            return
        batch = list(_queue)
        _queue.clear()

    api_url = get_api_url()
    success = post_heartbeats(api_url, batch)

    if success:
        _consecutive_failures = 0
    else:
        _consecutive_failures += 1
        with _queue_lock:
            _queue[:0] = batch  # prepend failed batch
            if len(_queue) > MAX_QUEUE_SIZE:
                del _queue[:-MAX_QUEUE_SIZE]


def schedule_flush():
    global _flush_timer

    interval = BACKOFF_INTERVAL_SECONDS if _consecutive_failures >= MAX_CONSECUTIVE_FAILURES else FLUSH_INTERVAL_SECONDS

    _flush_timer = threading.Timer(interval, _flush_and_reschedule)
    _flush_timer.daemon = True
    _flush_timer.start()

def _flush_and_reschedule():
    flush_queue()
    schedule_flush()


# --- Status Bar ---

def update_status_bar():
    global _status_timer

    if not is_enabled():
        _status_timer = threading.Timer(STATUS_REFRESH_SECONDS, update_status_bar)
        _status_timer.daemon = True
        _status_timer.start()
        return

    stats = fetch_today_stats(get_api_url())
    text = 'WPL: ' + format_duration(stats['totalSeconds']) if stats and 'totalSeconds' in stats else 'WPL: --'

    def _set():
        for window in sublime.windows():
            view = window.active_view()
            if view:
                view.set_status('wpl_productivity', text)

    sublime.set_timeout(_set, 0)

    _status_timer = threading.Timer(STATUS_REFRESH_SECONDS, update_status_bar)
    _status_timer.daemon = True
    _status_timer.start()


# --- Plugin Lifecycle ---

def plugin_loaded():
    """Called by Sublime Text when the plugin is loaded."""
    schedule_flush()
    # Delay status bar start slightly to let Sublime finish loading
    threading.Timer(2, update_status_bar).start()

def plugin_unloaded():
    """Called by Sublime Text when the plugin is unloaded."""
    global _flush_timer, _status_timer
    if _flush_timer:
        _flush_timer.cancel()
    if _status_timer:
        _status_timer.cancel()
    # Final flush
    flush_queue()


# --- Event Listener ---

class WplProductivityListener(sublime_plugin.EventListener):
    """Listens for editor events and enqueues heartbeats."""

    def on_modified_async(self, view):
        enqueue_heartbeat(view, is_write=False)

    def on_post_save_async(self, view):
        enqueue_heartbeat(view, is_write=True)

    def on_activated_async(self, view):
        enqueue_heartbeat(view, is_write=False)


# --- Commands ---

class WplShowStatsCommand(sublime_plugin.WindowCommand):
    """Opens the WP Launcher productivity dashboard in the browser."""

    def run(self):
        import webbrowser
        api_url = get_api_url()
        try:
            url = api_url.split('://')[1].split(':')[0]
            dashboard_url = api_url.split('://')[0] + '://' + url + '/productivity'
        except Exception:
            dashboard_url = 'http://localhost/productivity'
        webbrowser.open(dashboard_url)


class WplToggleTrackingCommand(sublime_plugin.WindowCommand):
    """Toggles productivity tracking on/off."""

    def run(self):
        settings = get_settings()
        current = settings.get('enabled', True)
        settings.set('enabled', not current)
        sublime.save_settings(SETTINGS_FILE)
        state = 'enabled' if not current else 'disabled'
        sublime.status_message('WP Launcher Productivity: Tracking {}'.format(state))
