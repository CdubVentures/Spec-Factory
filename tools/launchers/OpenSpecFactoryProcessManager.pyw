from __future__ import annotations

import json
import queue
import socket
import subprocess
import threading
import time
import tkinter as tk
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from tkinter import ttk

# ── Constants ──────────────────────────────────────────────────────────

LAUNCHER_DIR = Path(__file__).resolve().parent
ROOT = LAUNCHER_DIR.parent.parent
BACKEND_PATH = ROOT / 'tools' / 'specfactory-process-manager.js'
DEV_STACK_PATH = ROOT / 'tools' / 'dev-stack-control.js'
ICON_PATH = LAUNCHER_DIR / 'icons' / 'specfactory-process-manager.ico'
TARGET_PORT = 8788
PORT_POLL_INTERVAL = 0.5
PORT_POLL_TIMEOUT = 30.0
CREATE_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
AUTO_REFRESH_MS = 15_000
MAX_LOG_LINES = 5000
BACKEND_TIMEOUT_S = 30
STREAM_POLL_MS = 30
STREAM_BATCH_LIMIT = 100
KILL_CIRCUIT_BREAKER_LIMIT = 3


# ── Tooltip helper ─────────────────────────────────────────────────────


class _ToolTip:
    """Lightweight delayed tooltip for any tkinter widget."""

    _DELAY_MS = 500

    def __init__(self, widget: tk.Widget, text: str) -> None:
        self._widget = widget
        self.text = text
        self._tip: tk.Toplevel | None = None
        self._after_id: str | None = None
        widget.bind('<Enter>', self._schedule, add='+')
        widget.bind('<Leave>', self._cancel, add='+')
        widget.bind('<ButtonPress>', self._cancel, add='+')

    def _schedule(self, _event: object = None) -> None:
        self._cancel()
        self._after_id = self._widget.after(self._DELAY_MS, self._show)

    def _cancel(self, _event: object = None) -> None:
        if self._after_id:
            self._widget.after_cancel(self._after_id)
            self._after_id = None
        if self._tip:
            self._tip.destroy()
            self._tip = None

    def _show(self) -> None:
        if self._tip:
            self._tip.destroy()
        x = self._widget.winfo_rootx() + 4
        y = self._widget.winfo_rooty() + self._widget.winfo_height() + 4
        self._tip = tk.Toplevel(self._widget)
        self._tip.wm_overrideredirect(True)
        self._tip.wm_geometry(f'+{x}+{y}')
        tk.Label(
            self._tip, text=self.text,
            background='#1d334d', foreground='#edf3fb',
            font=('Segoe UI', 9), relief='solid', borderwidth=1,
            padx=8, pady=4,
        ).pack()


# ── Backend communication ──────────────────────────────────────────────


class BackendError(RuntimeError):
    pass


def wait_for_port(port: int = TARGET_PORT, timeout: float = PORT_POLL_TIMEOUT) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.5):
                return True
        except OSError:
            time.sleep(PORT_POLL_INTERVAL)
    return False


def probe_port(port: int = TARGET_PORT) -> bool:
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.3):
            return True
    except OSError:
        return False


def run_backend(action: str, pid: int | None = None) -> dict:
    command = ['node', str(BACKEND_PATH), action, '--json']
    if pid is not None:
        command.extend(['--pid', str(pid)])

    try:
        result = subprocess.run(
            command, cwd=ROOT, capture_output=True, text=True, check=False,
            timeout=BACKEND_TIMEOUT_S, creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError as error:
        raise BackendError('node_not_found') from error
    except subprocess.TimeoutExpired as error:
        raise BackendError('backend_timeout') from error

    payload_text = result.stdout.strip() or result.stderr.strip()
    if not payload_text:
        raise BackendError('empty_backend_response')

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError as error:
        raise BackendError(f'invalid_backend_json: {payload_text[:200]}') from error

    if result.returncode != 0 or payload.get('ok') is False:
        raise BackendError(str(payload.get('error') or f'backend_exit_{result.returncode}'))

    return payload


# ── Main application ───────────────────────────────────────────────────


class ProcessManagerApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title('Spec Factory Process Manager \u2014 Stopped')
        self.root.geometry('1680x900')
        self.root.minsize(1400, 750)
        self.root.configure(bg='#0b1320')
        self.root.protocol('WM_DELETE_WINDOW', self._on_close)
        if ICON_PATH.exists():
            try:
                self.root.iconbitmap(default=str(ICON_PATH))
            except tk.TclError:
                pass

        self.busy = False
        self.rows_by_pid: dict[int, dict] = {}
        self.selected_pid: int | None = None
        self.preflight_data: dict = {}
        self._streaming_process: subprocess.Popen | None = None
        self._op_start: float | None = None
        self._auto_refresh_id: str | None = None
        self._server_alive: bool = False
        self._preflight_retried: bool = False
        self._preflight_logged: bool = False
        self._bg_refresh_pending: bool = False
        self._row_fingerprints: dict[int, tuple] = {}
        self._preflight_fetched_at: float = 0

        self._configure_style()
        self._build_ui()
        self._attach_tooltips()
        self.refresh_state()
        self._schedule_auto_refresh()

    # ── Styles ─────────────────────────────────────────────────────────

    def _configure_style(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use('clam')
        style.configure('.', background='#0b1320', foreground='#edf3fb')
        style.configure('Root.TFrame', background='#0b1320')
        style.configure('Panel.TFrame', background='#132033')
        style.configure('Headline.TLabel', background='#0b1320', foreground='#f5fbff', font=('Segoe UI Semibold', 21))
        style.configure('Subhead.TLabel', background='#0b1320', foreground='#91a6bf', font=('Segoe UI', 10))
        style.configure('PanelTitle.TLabel', background='#132033', foreground='#f5fbff', font=('Segoe UI Semibold', 11))
        style.configure('StatLabel.TLabel', background='#16314d', foreground='#91a6bf', font=('Segoe UI', 9))
        style.configure('StatValue.TLabel', background='#16314d', foreground='#f5fbff', font=('Segoe UI Semibold', 15))
        style.configure('Action.TButton', padding=(16, 9), font=('Segoe UI Semibold', 10))
        style.configure('QuickAction.TButton', padding=(20, 12), font=('Segoe UI Semibold', 11))
        style.configure('Destructive.QuickAction.TButton', padding=(20, 12), font=('Segoe UI Semibold', 11))
        style.map('Destructive.QuickAction.TButton', background=[('active', '#8b2020'), ('!disabled', '#5c1616')])
        style.configure('Destructive.Action.TButton', padding=(16, 9), font=('Segoe UI Semibold', 10))
        style.map('Destructive.Action.TButton', background=[('active', '#8b2020'), ('!disabled', '#5c1616')])
        style.configure('Treeview', background='#0f1b2b', foreground='#edf3fb', fieldbackground='#0f1b2b', rowheight=28, borderwidth=0)
        style.configure('Treeview.Heading', background='#1d334d', foreground='#d7e6f7', relief='flat', font=('Segoe UI Semibold', 9))
        style.map('Treeview', background=[('selected', '#225c7d')], foreground=[('selected', '#f5fbff')])

    # ── UI construction ────────────────────────────────────────────────

    def _build_ui(self) -> None:
        shell = ttk.Frame(self.root, style='Root.TFrame', padding=18)
        shell.pack(fill='both', expand=True)
        shell.columnconfigure(0, weight=3)
        shell.columnconfigure(1, weight=2)
        shell.rowconfigure(3, weight=2)
        shell.rowconfigure(4, weight=5)

        # ── Header ─────────────────────────────────────────────────────
        header = ttk.Frame(shell, style='Root.TFrame')
        header.grid(row=0, column=0, columnspan=2, sticky='ew')
        header.columnconfigure(1, weight=1)

        self._status_dot = tk.Canvas(header, width=22, height=22, bg='#0b1320', highlightthickness=0)
        self._status_dot.grid(row=0, column=0, padx=(0, 10))
        self._dot_id = self._status_dot.create_oval(3, 3, 19, 19, fill='#ef4444', outline='')

        ttk.Label(header, text='Spec Factory Process Manager', style='Headline.TLabel').grid(
            row=0, column=1, sticky='w',
        )
        ttk.Label(
            header,
            text='Start, build, manage, and monitor Spec Factory from one place.',
            style='Subhead.TLabel',
        ).grid(row=1, column=1, sticky='w', pady=(6, 0))

        # ── Quick Actions bar ──────────────────────────────────────────
        actions_bar = ttk.Frame(shell, style='Root.TFrame')
        actions_bar.grid(row=1, column=0, columnspan=2, sticky='ew', pady=(14, 0))
        for col in range(8):
            actions_bar.columnconfigure(col, weight=1)

        self.btn_start = ttk.Button(
            actions_bar, text='Start Server', command=self._on_start_server, style='QuickAction.TButton',
        )
        self.btn_start.grid(row=0, column=0, sticky='ew', padx=(0, 6))

        self.btn_reload = ttk.Button(
            actions_bar, text='Full Reload', command=self._on_full_reload, style='QuickAction.TButton',
        )
        self.btn_reload.grid(row=0, column=1, sticky='ew', padx=(0, 6))

        self.btn_build_gui = ttk.Button(
            actions_bar, text='Build GUI', command=self._on_build_gui, style='QuickAction.TButton',
        )
        self.btn_build_gui.grid(row=0, column=2, sticky='ew', padx=(0, 6))

        self.btn_build_exe = ttk.Button(
            actions_bar, text='Build EXE', command=self._on_build_exe, style='QuickAction.TButton',
        )
        self.btn_build_exe.grid(row=0, column=3, sticky='ew', padx=(0, 6))

        self.btn_cleanup = ttk.Button(
            actions_bar, text='Cleanup', command=self._on_cleanup, style='QuickAction.TButton',
        )
        self.btn_cleanup.grid(row=0, column=4, sticky='ew', padx=(0, 6))

        self.btn_browser = ttk.Button(
            actions_bar, text='Open Browser', command=self.open_browser, style='QuickAction.TButton',
        )
        self.btn_browser.grid(row=0, column=5, sticky='ew', padx=(0, 6))

        self.btn_refresh = ttk.Button(
            actions_bar, text='Refresh Status', command=self.refresh_state, style='QuickAction.TButton',
        )
        self.btn_refresh.grid(row=0, column=6, sticky='ew', padx=(0, 6))

        self.btn_kill_all = ttk.Button(
            actions_bar, text='Kill All', command=self._on_kill_all, style='Destructive.QuickAction.TButton',
        )
        self.btn_kill_all.grid(row=0, column=7, sticky='ew')

        # ── Stats row ──────────────────────────────────────────────────
        stats_row = ttk.Frame(shell, style='Root.TFrame')
        stats_row.grid(row=2, column=0, columnspan=2, sticky='ew', pady=(14, 14))
        for index in range(6):
            stats_row.columnconfigure(index, weight=1)

        self.tracked_api_value = self._create_stat(stats_row, 0, 'Tracked API PID')
        self.port_owner_value = self._create_stat(stats_row, 1, f'Port {TARGET_PORT} Owner')
        self.node_version_value = self._create_stat(stats_row, 2, 'Node Version')
        self.native_module_value = self._create_stat(stats_row, 3, 'Native Modules')
        self.row_count_value = self._create_stat(stats_row, 4, 'Rows')
        self.updated_at_value = self._create_stat(stats_row, 5, 'Last Refresh')

        # ── Process table (left) ───────────────────────────────────────
        table_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        table_panel.grid(row=3, column=0, sticky='nsew', padx=(0, 10))
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(1, weight=1)

        table_header = ttk.Frame(table_panel, style='Panel.TFrame')
        table_header.grid(row=0, column=0, sticky='ew')
        table_header.columnconfigure(0, weight=1)

        ttk.Label(table_header, text='Process List', style='PanelTitle.TLabel').grid(row=0, column=0, sticky='w')

        process_btns = ttk.Frame(table_header, style='Panel.TFrame')
        process_btns.grid(row=0, column=1, sticky='e')

        self.kill_button = ttk.Button(
            process_btns, text='Kill Selected', command=self.kill_selected, style='Destructive.Action.TButton',
        )
        self.kill_button.grid(row=0, column=0, padx=(0, 6))
        self.restart_button = ttk.Button(
            process_btns, text='Restart Selected', command=self.restart_selected, style='Action.TButton',
        )
        self.restart_button.grid(row=0, column=1)

        table_frame = ttk.Frame(table_panel, style='Panel.TFrame')
        table_frame.grid(row=1, column=0, sticky='nsew', pady=(10, 0))
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        columns = ('pid', 'name', 'roles', 'uptime', 'actions')
        self.tree = ttk.Treeview(table_frame, columns=columns, show='headings', selectmode='browse')
        self.tree.heading('pid', text='PID')
        self.tree.heading('name', text='Name')
        self.tree.heading('roles', text='Roles')
        self.tree.heading('uptime', text='Uptime')
        self.tree.heading('actions', text='Actions')
        self.tree.column('pid', width=80, anchor='center')
        self.tree.column('name', width=130, anchor='w')
        self.tree.column('roles', width=300, anchor='w')
        self.tree.column('uptime', width=80, anchor='center')
        self.tree.column('actions', width=150, anchor='w')
        self.tree.grid(row=0, column=0, sticky='nsew')
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)
        self.tree.tag_configure('stripe', background='#111d2e')
        self.tree.tag_configure('owner', background='#143245')
        self.tree.tag_configure('protected', background='#3b1822')
        self.tree.tag_configure('managed', background='#173422')

        table_scroll = ttk.Scrollbar(table_frame, orient='vertical', command=self.tree.yview)
        table_scroll.grid(row=0, column=1, sticky='ns')
        self.tree.configure(yscrollcommand=table_scroll.set)

        # ── Detail panel (right) ───────────────────────────────────────
        detail_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        detail_panel.grid(row=3, column=1, sticky='nsew')
        detail_panel.columnconfigure(0, weight=1)
        detail_panel.rowconfigure(2, weight=1)
        detail_panel.rowconfigure(4, weight=1)
        detail_panel.rowconfigure(6, weight=1)

        ttk.Label(detail_panel, text='Selection', style='PanelTitle.TLabel').grid(row=0, column=0, sticky='w')
        self.status_label = ttk.Label(detail_panel, text='Loading state...', style='Subhead.TLabel')
        self.status_label.grid(row=1, column=0, sticky='w', pady=(8, 12))

        self.summary_text = self._create_detail_text(detail_panel, 2)
        self.command_text = self._create_detail_text(detail_panel, 4)
        self.gate_text = self._create_detail_text(detail_panel, 6)

        ttk.Label(detail_panel, text='Selected Process', style='PanelTitle.TLabel').grid(row=2, column=0, sticky='nw', pady=(0, 4))
        ttk.Label(detail_panel, text='Command Line', style='PanelTitle.TLabel').grid(row=4, column=0, sticky='nw', pady=(10, 4))
        ttk.Label(detail_panel, text='Action Gate', style='PanelTitle.TLabel').grid(row=6, column=0, sticky='nw', pady=(10, 4))

        self._set_detail_text(self.summary_text, 'No row selected.')
        self._set_detail_text(self.command_text, '-')
        self._set_detail_text(self.gate_text, '-')

        # ── Output Log panel (full width, bottom) ──────────────────────
        log_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        log_panel.grid(row=4, column=0, columnspan=2, sticky='nsew', pady=(10, 0))
        log_panel.columnconfigure(0, weight=1)
        log_panel.rowconfigure(1, weight=1)

        log_header = ttk.Frame(log_panel, style='Panel.TFrame')
        log_header.grid(row=0, column=0, sticky='ew')
        log_header.columnconfigure(0, weight=1)

        ttk.Label(log_header, text='Output Log', style='PanelTitle.TLabel').grid(row=0, column=0, sticky='w')

        log_btns = ttk.Frame(log_header, style='Panel.TFrame')
        log_btns.grid(row=0, column=1, sticky='e')

        self.btn_cancel = ttk.Button(
            log_btns, text='Cancel', command=self._cancel_streaming, style='Destructive.Action.TButton',
        )
        # Initially hidden; shown only during streaming operations.
        self.btn_copy_log = ttk.Button(log_btns, text='Copy', command=self._copy_log, style='Action.TButton')
        self.btn_copy_log.grid(row=0, column=1, padx=(0, 6))
        self.btn_clear_log = ttk.Button(log_btns, text='Clear', command=self._clear_log, style='Action.TButton')
        self.btn_clear_log.grid(row=0, column=2)

        log_frame = tk.Frame(log_panel, bg='#0f1b2b', highlightbackground='#294462', highlightthickness=1)
        log_frame.grid(row=1, column=0, sticky='nsew', pady=(8, 0))
        log_frame.columnconfigure(0, weight=1)
        log_frame.rowconfigure(0, weight=1)

        self.log_text = tk.Text(
            log_frame, height=30, wrap='word', bg='#0f1b2b', fg='#edf3fb',
            insertbackground='#edf3fb', relief='flat', highlightthickness=0,
            font=('Consolas', 10), padx=10, pady=10,
        )
        self.log_text.pack(side='left', fill='both', expand=True)
        self.log_text.configure(state='disabled')
        self.log_text.tag_configure('timestamp', foreground='#5a7a99')
        self.log_text.tag_configure('error', foreground='#ff8c8c')
        self.log_text.tag_configure('success', foreground='#8ee39d')
        self.log_text.tag_configure('info', foreground='#7bb8f5')

        log_scroll = ttk.Scrollbar(log_frame, orient='vertical', command=self.log_text.yview)
        log_scroll.pack(side='right', fill='y')
        self.log_text.configure(yscrollcommand=log_scroll.set)

        self._sync_buttons()

    def _attach_tooltips(self) -> None:
        _ToolTip(self.btn_start, 'Start the Spec Factory API server')
        _ToolTip(self.btn_reload, 'Kill all, rebuild native modules + GUI, restart server')
        _ToolTip(self.btn_build_gui, 'Rebuild native modules and Vite GUI bundle')
        _ToolTip(self.btn_build_exe, 'Package Spec Factory as a standalone executable')
        _ToolTip(self.btn_cleanup, 'Remove build artifacts and temp files')
        _ToolTip(self.btn_browser, 'Open the Spec Factory GUI in your default browser')
        _ToolTip(self.btn_refresh, 'Re-scan running processes and refresh the table')
        _ToolTip(self.btn_kill_all, 'Terminate all killable Spec Factory processes')
        _ToolTip(self.kill_button, 'Kill the selected process')
        _ToolTip(self.restart_button, 'Restart the selected process')

    # ── Widget helpers ─────────────────────────────────────────────────

    def _create_stat(self, parent: ttk.Frame, column: int, label: str) -> ttk.Label:
        panel = ttk.Frame(parent, style='Panel.TFrame', padding=12)
        panel.grid(row=0, column=column, sticky='ew', padx=(0 if column == 0 else 8, 0))
        inner = tk.Frame(panel, bg='#16314d', bd=0, highlightthickness=0)
        inner.pack(fill='both', expand=True)
        ttk.Label(inner, text=label, style='StatLabel.TLabel').pack(anchor='w')
        value = ttk.Label(inner, text='-', style='StatValue.TLabel')
        value.pack(anchor='w', pady=(6, 0))
        return value

    def _create_detail_text(self, parent: ttk.Frame, row: int) -> tk.Text:
        frame = tk.Frame(parent, bg='#0f1b2b', highlightbackground='#294462', highlightthickness=1)
        frame.grid(row=row + 1, column=0, sticky='nsew')
        parent.rowconfigure(row + 1, weight=1)
        text = tk.Text(
            frame, height=6, wrap='word', bg='#0f1b2b', fg='#edf3fb',
            insertbackground='#edf3fb', relief='flat', highlightthickness=0,
            font=('Consolas', 10), padx=10, pady=10,
        )
        text.pack(fill='both', expand=True)
        text.configure(state='disabled')
        return text

    def _set_detail_text(self, widget: tk.Text, content: str) -> None:
        widget.configure(state='normal')
        widget.delete('1.0', 'end')
        widget.insert('1.0', content)
        widget.configure(state='disabled')

    # ── Formatters ─────────────────────────────────────────────────────

    def _format_roles(self, row: dict) -> str:
        labels = []
        if row.get('port_8788_owner'):
            labels.append(f'{TARGET_PORT} owner')
        if row.get('tracked_api'):
            labels.append('tracked api')
        if row.get('tracked_gui'):
            labels.append('tracked gui')
        if row.get('spec_factory_process'):
            labels.append('spec factory')
        if row.get('protected_process'):
            labels.append('protected')
        if not labels:
            labels.append('unmanaged')
        return ', '.join(labels)

    def _format_actions(self, row: dict) -> str:
        if row.get('can_restart'):
            return 'kill + restart'
        if row.get('can_kill'):
            return 'kill only'
        return str(row.get('action_block_reason') or 'blocked')

    def _format_uptime(self, row: dict) -> str:
        created = row.get('createdAt')
        if not created or not row.get('running'):
            return '-'
        try:
            created_dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
            delta_s = int((datetime.now(timezone.utc) - created_dt).total_seconds())
            if delta_s < 0:
                return '-'
            if delta_s < 60:
                return '< 1m'
            minutes = delta_s // 60
            if minutes < 60:
                return f'{minutes}m'
            hours, mins = divmod(minutes, 60)
            if hours < 24:
                return f'{hours}h {mins}m'
            days, hrs = divmod(hours, 24)
            return f'{days}d {hrs}h'
        except (ValueError, TypeError):
            return '-'

    def _format_elapsed(self) -> str:
        if self._op_start is None:
            return ''
        elapsed = time.monotonic() - self._op_start
        return f' ({elapsed:.1f}s)'

    # ── Row fingerprinting ──────────────────────────────────────────────

    def _compute_row_tag(self, row: dict, idx: int) -> str:
        if row.get('port_8788_owner'):
            return 'owner'
        if row.get('protected_process'):
            return 'protected'
        if row.get('spec_factory_process'):
            return 'managed'
        if idx % 2 == 1:
            return 'stripe'
        return ''

    def _compute_row_fingerprint(self, row: dict, idx: int) -> tuple:
        """Hashable tuple of display-stable values (excludes uptime which changes every minute)."""
        return (
            str(row.get('pid', '')),
            row.get('name') or '-',
            self._format_roles(row),
            self._format_actions(row),
            self._compute_row_tag(row, idx),
            row.get('running', False),
        )

    # ── Button state management ────────────────────────────────────────

    def _sync_buttons(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        disabled = 'disabled' if self.busy else 'normal'
        has_port_owner = any(r.get('port_8788_owner') for r in self.rows_by_pid.values())
        has_killable = any(r.get('can_kill') for r in self.rows_by_pid.values())
        browser_state = 'normal' if has_port_owner and not self.busy else 'disabled'
        kill_state = 'normal' if row and row.get('can_kill') and not self.busy else 'disabled'
        restart_state = 'normal' if row and row.get('can_restart') and not self.busy else 'disabled'
        kill_all_state = 'normal' if has_killable and not self.busy else 'disabled'

        self.btn_refresh.configure(state=disabled)
        self.btn_start.configure(state=disabled)
        self.btn_reload.configure(state=disabled)
        self.btn_build_gui.configure(state=disabled)
        self.btn_build_exe.configure(state=disabled)
        self.btn_cleanup.configure(state=disabled)
        self.btn_browser.configure(state=browser_state)
        self.btn_kill_all.configure(state=kill_all_state)
        self.kill_button.configure(state=kill_state)
        self.restart_button.configure(state=restart_state)

        # Toggle cancel button visibility
        if self.busy and self._streaming_process is not None:
            self.btn_cancel.grid(row=0, column=0, padx=(0, 6))
        else:
            self.btn_cancel.grid_remove()

    def _set_status(self, text: str, color: str = '#91a6bf') -> None:
        self.status_label.configure(text=text, foreground=color)

    # ── Health indicator ───────────────────────────────────────────────

    def _update_status_dot(self, alive: bool | None = None) -> None:
        if alive is not None:
            self._server_alive = alive
        color = '#4ade80' if self._server_alive else '#ef4444'
        self._status_dot.itemconfigure(self._dot_id, fill=color)

    def _update_title(self, op_label: str = '') -> None:
        base = 'Spec Factory Process Manager'
        if op_label:
            self.root.title(f'{base} \u2014 {op_label}')
        elif self._server_alive:
            self.root.title(f'{base} \u2014 Running')
        else:
            self.root.title(f'{base} \u2014 Stopped')

    def _probe_health(self) -> None:
        def worker():
            alive = probe_port()
            try:
                self.root.after(0, lambda: self._update_status_dot(alive))
                self.root.after(0, lambda: self._update_title())
            except RuntimeError:
                pass  # Window destroyed
        threading.Thread(target=worker, daemon=True).start()

    # ── Output log helpers ─────────────────────────────────────────────

    def _append_log(self, text: str, tag: str = '', stamped: bool = True) -> None:
        self.log_text.configure(state='normal')
        if stamped and text.strip():
            stamp = time.strftime('%H:%M:%S')
            if text.startswith('\n'):
                self.log_text.insert('end', '\n')
                text = text[1:]
            self.log_text.insert('end', f'[{stamp}] ', 'timestamp')
        if tag:
            self.log_text.insert('end', text, tag)
        else:
            self.log_text.insert('end', text)
        self.log_text.see('end')
        line_count = int(self.log_text.index('end-1c').split('.')[0])
        if line_count > MAX_LOG_LINES:
            excess = line_count - MAX_LOG_LINES
            self.log_text.delete('1.0', f'{excess}.0')
        self.log_text.configure(state='disabled')

    def _log_error(self, operation: str, error: Exception | str) -> None:
        self._append_log(f'[ERROR] {operation}: {error}\n', 'error')

    def _clear_log(self) -> None:
        self.log_text.configure(state='normal')
        self.log_text.delete('1.0', 'end')
        self.log_text.configure(state='disabled')

    def _copy_log(self) -> None:
        content = self.log_text.get('1.0', 'end-1c')
        self.root.clipboard_clear()
        self.root.clipboard_append(content)

    # ── Auto-refresh ───────────────────────────────────────────────────

    def _schedule_auto_refresh(self) -> None:
        self._auto_refresh_id = self.root.after(AUTO_REFRESH_MS, self._auto_refresh_tick)

    def _auto_refresh_tick(self) -> None:
        self._background_refresh()
        self._schedule_auto_refresh()

    # ── Background refresh (non-blocking) ───────────────────────────────

    def _background_refresh(self) -> None:
        """Refresh process state without locking the UI."""
        if self.busy or self._bg_refresh_pending:
            self._probe_health()
            return
        self._bg_refresh_pending = True
        result_queue: queue.Queue[tuple[str, object]] = queue.Queue()

        def worker() -> None:
            try:
                result_queue.put(('ok', run_backend('state')))
            except Exception as error:
                result_queue.put(('error', error))

        threading.Thread(target=worker, daemon=True).start()
        self.root.after(100, lambda: self._poll_bg_refresh(result_queue))

    def _poll_bg_refresh(self, result_queue: queue.Queue[tuple[str, object]]) -> None:
        try:
            kind, payload = result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, lambda: self._poll_bg_refresh(result_queue))
            return
        self._bg_refresh_pending = False
        # Discard result if user started an action while we were refreshing
        if self.busy:
            return
        if kind == 'ok':
            self._apply_state_diff(payload)

    def _apply_state_diff(self, payload: dict) -> None:
        """Apply state only if process rows actually changed."""
        rows = payload.get('rows') or []
        new_fingerprints: dict[int, tuple] = {}
        for idx, row in enumerate(rows):
            pid = int(row['pid'])
            new_fingerprints[pid] = self._compute_row_fingerprint(row, idx)

        if new_fingerprints == self._row_fingerprints:
            # Nothing changed — update uptime in-place and timestamp only
            for row in rows:
                pid = str(row['pid'])
                if pid in self.tree.get_children():
                    self.tree.set(pid, 'uptime', self._format_uptime(row))
            self.updated_at_value.configure(text=str(payload.get('updatedAt') or '-'))
            self._probe_health()
            return

        # Process list changed — do a full rebuild
        self.rows_by_pid = {int(r['pid']): r for r in rows}
        self._row_fingerprints = new_fingerprints
        self._rebuild_tree(rows, payload)

    # ── Streaming shell command runner ─────────────────────────────────

    def _run_streaming(self, label: str, command: list[str], on_done=None) -> None:
        if self.busy:
            return
        self.busy = True
        self._op_start = time.monotonic()
        self._set_status(f'{label}...', '#f2b24b')
        self._update_title(f'{label}...')
        self._sync_buttons()
        self._append_log(f'\n--- {label} ---\n', 'info')

        line_queue: queue.Queue[tuple[str, str | None]] = queue.Queue()

        def worker() -> None:
            try:
                proc = subprocess.Popen(
                    command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, shell=True, creationflags=CREATE_NO_WINDOW,
                )
                self._streaming_process = proc
                try:
                    self.root.after(0, self._sync_buttons)
                except RuntimeError:
                    pass
                for line in proc.stdout:
                    line_queue.put(('line', line))
                proc.wait()
                self._streaming_process = None
                if proc.returncode == 0:
                    line_queue.put(('done', None))
                else:
                    line_queue.put(('fail', f'Exit code {proc.returncode}'))
            except Exception as error:
                self._streaming_process = None
                line_queue.put(('fail', str(error)))

        threading.Thread(target=worker, daemon=True).start()
        self.root.after(STREAM_POLL_MS, lambda: self._poll_streaming(line_queue, label, on_done))

    def _poll_streaming(self, line_queue: queue.Queue, label: str, on_done) -> None:
        batch = 0
        while batch < STREAM_BATCH_LIMIT:
            try:
                kind, payload = line_queue.get_nowait()
            except queue.Empty:
                self.root.after(STREAM_POLL_MS, lambda: self._poll_streaming(line_queue, label, on_done))
                return

            if kind == 'line':
                self._append_log(payload, stamped=False)
                batch += 1
                continue

            elapsed = self._format_elapsed()
            self.busy = False
            self._streaming_process = None
            self._op_start = None
            if kind == 'done':
                self._append_log(f'--- {label} complete{elapsed} ---\n', 'success')
                self._set_status(f'{label} complete.{elapsed}', '#8ee39d')
            else:
                self._append_log(f'--- {label} FAILED{elapsed}: {payload} ---\n', 'error')
                self._set_status(f'{label} failed.{elapsed}', '#ff8c8c')
            self._update_title()
            self._sync_buttons()
            self._probe_health()
            if on_done:
                on_done(kind == 'done')
            return

        self.root.after(10, lambda: self._poll_streaming(line_queue, label, on_done))

    def _cancel_streaming(self) -> None:
        proc = self._streaming_process
        if proc is None or proc.poll() is not None:
            return
        try:
            proc.terminate()
        except OSError:
            pass

        def force_kill():
            if proc.poll() is None:
                try:
                    proc.kill()
                except OSError:
                    pass

        self.root.after(2000, force_kill)
        self._append_log('Operation cancelled by user.\n', 'error')

    # ── Chained streaming commands ─────────────────────────────────────

    def _run_streaming_chain(self, steps: list[tuple[str, list[str]]], final_done=None) -> None:
        if not steps:
            if final_done:
                final_done(True)
            return
        label, command = steps[0]
        remaining = steps[1:]

        def chain_done(success: bool) -> None:
            if success and remaining:
                self._run_streaming_chain(remaining, final_done)
            elif final_done:
                final_done(success)

        self._run_streaming(label, command, on_done=chain_done)

    # ── Quick Action handlers ──────────────────────────────────────────

    def _on_start_server(self) -> None:
        def after_start(success: bool) -> None:
            if success:
                self.refresh_state()

        self._run_streaming(
            'Start Server',
            ['node', str(DEV_STACK_PATH), 'start-api'],
            on_done=after_start,
        )

    def _on_full_reload(self) -> None:
        def after_state(payload: dict) -> None:
            self._apply_state(payload)
            self._append_log('\n--- Full Reload ---\n', 'info')
            self._kill_all_then(after_kills)

        def after_kills(_success: bool) -> None:
            self._run_streaming_chain([
                ('Rebuild native modules', ['npm', 'rebuild', 'better-sqlite3']),
                ('Build GUI', ['npm', 'run', 'gui:build']),
                ('Start Server', ['node', str(DEV_STACK_PATH), 'start-api']),
            ], final_done=lambda s: self.refresh_state())

        self._run_task('Refreshing state...', lambda: run_backend('state'), after_state)

    def _on_kill_all(self) -> None:
        def after_state(payload: dict) -> None:
            self._apply_state(payload)
            killable = [r for r in self.rows_by_pid.values() if r.get('can_kill')]
            if not killable:
                self._append_log('No killable processes found.\n', 'info')
                return
            self._append_log(f'Killing {len(killable)} process(es)...\n', 'info')
            self._kill_all_then(lambda _ok: self.refresh_state())

        self._run_task('Refreshing state...', lambda: run_backend('state'), after_state)

    def _kill_all_then(self, callback) -> None:
        killable = [r for r in self.rows_by_pid.values() if r.get('can_kill')]
        if not killable:
            callback(True)
            return

        killed = 0
        consecutive_errors = 0

        def kill_next():
            nonlocal killed, consecutive_errors
            if killed >= len(killable):
                self._append_log(f'Kill sweep done ({killed} attempted).\n', 'info')
                callback(True)
                return

            if consecutive_errors >= KILL_CIRCUIT_BREAKER_LIMIT:
                self._append_log(
                    f'Aborting kill sweep: {consecutive_errors} consecutive failures.\n', 'error',
                )
                callback(False)
                return

            row = killable[killed]
            pid = int(row['pid'])
            self._append_log(f'  Killing PID {pid} ({row.get("name", "?")})...\n')

            result_queue: queue.Queue = queue.Queue()

            def worker():
                try:
                    run_backend('kill', pid)
                    result_queue.put(True)
                except BackendError:
                    result_queue.put(False)

            threading.Thread(target=worker, daemon=True).start()

            def poll():
                try:
                    success = result_queue.get_nowait()
                except queue.Empty:
                    self.root.after(100, poll)
                    return
                nonlocal killed, consecutive_errors
                if success:
                    consecutive_errors = 0
                else:
                    consecutive_errors += 1
                killed += 1
                kill_next()

            self.root.after(100, poll)

        kill_next()

    def _on_build_gui(self) -> None:
        self._run_streaming_chain([
            ('Rebuild native modules', ['npm', 'rebuild', 'better-sqlite3']),
            ('Build GUI', ['npm', 'run', 'gui:build']),
        ])

    def _on_build_exe(self) -> None:
        self._run_streaming(
            'Build EXE',
            ['node', str(ROOT / 'tools' / 'build-exe.mjs')],
        )

    def _on_cleanup(self) -> None:
        self._run_streaming(
            'Cleanup Artifacts',
            [str(ROOT / 'SpecFactory.bat'), 'cleanup', '--yes'],
        )

    # ── Process management ─────────────────────────────────────────────

    def on_tree_select(self, _event: object | None = None) -> None:
        selection = self.tree.selection()
        if not selection:
            self.selected_pid = None
        else:
            self.selected_pid = int(selection[0])
        self._render_selection()

    def _render_selection(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        if not row:
            self._set_detail_text(self.summary_text, 'No row selected.')
            self._set_detail_text(self.command_text, '-')
            self._set_detail_text(self.gate_text, '-')
            self._sync_buttons()
            return

        summary = '\n'.join([
            f"PID: {row.get('pid', '-')}",
            f"Name: {row.get('name', '-')}",
            f"Running: {row.get('running', False)}",
            f"Parent PID: {row.get('parentPid', '-')}",
            f"Created: {row.get('createdAt') or '-'}",
            f"Executable: {row.get('executablePath') or '-'}",
        ])
        gate = '\n'.join([
            f"can_kill: {row.get('can_kill', False)}",
            f"can_restart: {row.get('can_restart', False)}",
            f"restart_strategy: {row.get('restart_strategy') or '-'}",
            f"block_reason: {row.get('action_block_reason') or '-'}",
        ])
        self._set_detail_text(self.summary_text, summary)
        self._set_detail_text(self.command_text, row.get('commandLine') or '-')
        self._set_detail_text(self.gate_text, gate)
        self._sync_buttons()

    def _apply_state(self, payload: dict) -> None:
        rows = payload.get('rows') or []
        self.rows_by_pid = {int(row['pid']): row for row in rows}
        self._row_fingerprints = {
            int(row['pid']): self._compute_row_fingerprint(row, idx)
            for idx, row in enumerate(rows)
        }
        self._rebuild_tree(rows, payload)

    def _rebuild_tree(self, rows: list[dict], payload: dict) -> None:
        self.tree.delete(*self.tree.get_children())
        owner_pid = None
        for idx, row in enumerate(rows):
            pid = int(row['pid'])
            tag = self._compute_row_tag(row, idx)
            if row.get('port_8788_owner'):
                owner_pid = pid

            self.tree.insert(
                '', 'end', iid=str(pid),
                values=(
                    str(pid),
                    row.get('name') or '-',
                    self._format_roles(row),
                    self._format_uptime(row),
                    self._format_actions(row),
                ),
                tags=(tag,) if tag else (),
            )

        if self.selected_pid not in self.rows_by_pid:
            if owner_pid is not None:
                self.selected_pid = owner_pid
            elif rows:
                self.selected_pid = int(rows[0]['pid'])
            else:
                self.selected_pid = None

        if self.selected_pid is not None and str(self.selected_pid) in self.tree.get_children():
            self.tree.selection_set(str(self.selected_pid))
            self.tree.focus(str(self.selected_pid))
        else:
            self.tree.selection_remove(self.tree.selection())

        tracked_api = payload.get('tracked', {}).get('api')
        self.tracked_api_value.configure(text=str(tracked_api or '-'))
        self.port_owner_value.configure(text=str(owner_pid or '-'))
        self.row_count_value.configure(text=str(len(rows)))
        self.updated_at_value.configure(text=str(payload.get('updatedAt') or '-'))
        self._render_selection()
        self._set_status('State refreshed.', '#8ee39d')
        self._probe_health()
        # Only re-fetch preflight every 5 minutes
        PREFLIGHT_INTERVAL_S = 300
        now = time.monotonic()
        if now - self._preflight_fetched_at > PREFLIGHT_INTERVAL_S:
            self._preflight_fetched_at = now
            self._fetch_preflight()

    def _run_task(self, status_text: str, worker, on_success) -> None:
        if self.busy:
            return

        self.busy = True
        self._op_start = time.monotonic()
        self._set_status(status_text, '#f2b24b')
        self._sync_buttons()
        result_queue: queue.Queue[tuple[str, object]] = queue.Queue()

        def target() -> None:
            try:
                result_queue.put(('ok', worker()))
            except Exception as error:
                result_queue.put(('error', error))

        threading.Thread(target=target, daemon=True).start()
        self.root.after(100, lambda: self._poll_task(result_queue, on_success))

    def _poll_task(self, result_queue: queue.Queue[tuple[str, object]], on_success) -> None:
        try:
            kind, payload = result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, lambda: self._poll_task(result_queue, on_success))
            return

        self.busy = False
        self._op_start = None
        if kind == 'ok':
            on_success(payload)
        else:
            self._log_error('Task', payload)
            self._set_status(str(payload), '#ff8c8c')
        self._update_title()
        self._sync_buttons()

    def refresh_state(self) -> None:
        self._run_task('Refreshing state...', lambda: run_backend('state'), self._apply_state)

    def _fetch_preflight(self) -> None:
        result_queue: queue.Queue[tuple[str, object]] = queue.Queue()

        def worker() -> None:
            try:
                result_queue.put(('ok', run_backend('preflight')))
            except Exception as error:
                result_queue.put(('error', error))

        threading.Thread(target=worker, daemon=True).start()
        self.root.after(100, lambda: self._poll_preflight(result_queue))

    def _poll_preflight(self, result_queue: queue.Queue[tuple[str, object]]) -> None:
        try:
            kind, payload = result_queue.get_nowait()
        except queue.Empty:
            self.root.after(100, lambda: self._poll_preflight(result_queue))
            return
        if kind == 'ok':
            self._preflight_retried = False
            self._apply_preflight(payload)
        elif not self._preflight_retried:
            self._preflight_retried = True
            self.root.after(3000, self._fetch_preflight)
        else:
            self._preflight_retried = False
            self._apply_preflight_error(str(payload))

    def _apply_preflight(self, payload: dict) -> None:
        self.preflight_data = payload
        diag = payload.get('diagnostics') or {}
        preflight = payload.get('preflight') or {}
        categories = payload.get('categories') or []

        node_ver = diag.get('version', '-')
        self.node_version_value.configure(text=node_ver)

        status = preflight.get('status', 'unknown')
        if preflight.get('ok'):
            self.native_module_value.configure(text='OK', foreground='#8ee39d')
        else:
            self.native_module_value.configure(text=status.upper(), foreground='#ff8c8c')

        lines = [
            f"Node:             {diag.get('version', '-')} ({diag.get('execPath', '-')})",
            f"MODULE_VERSION:   {diag.get('moduleVersion', '-')}",
            f"Arch:             {diag.get('arch', '-')}",
            f"Platform:         {diag.get('platform', '-')}",
            '',
            f"better-sqlite3:   {status}",
        ]
        if preflight.get('rebuildAttempted'):
            lines.append(f"Auto-rebuild:     {'succeeded' if preflight.get('rebuildSucceeded') else 'FAILED'}")
        if preflight.get('errorMessage'):
            lines.append(f"Error:            {preflight['errorMessage'][:200]}")
        lines.append('')
        lines.append(f"Categories ({len(categories)}):  {', '.join(categories) or 'none'}")

        if not self._preflight_logged:
            self._preflight_logged = True
            self._append_log('\n'.join(lines) + '\n', 'info')

    def _apply_preflight_error(self, message: str) -> None:
        self.node_version_value.configure(text='?')
        self.native_module_value.configure(text='ERROR', foreground='#ff8c8c')
        self._log_error('Preflight', message)

    def open_browser(self) -> None:
        webbrowser.open(f'http://127.0.0.1:{TARGET_PORT}')

    def kill_selected(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        if not row or not row.get('can_kill'):
            return
        pid = int(row['pid'])

        def on_kill_success(_payload: dict) -> None:
            # Optimistic: remove the row immediately
            self.rows_by_pid.pop(pid, None)
            self._row_fingerprints.pop(pid, None)
            if str(pid) in self.tree.get_children():
                self.tree.delete(str(pid))
            self.row_count_value.configure(text=str(len(self.rows_by_pid)))
            self._probe_health()
            self._set_status(f'Killed PID {pid}.', '#8ee39d')
            # Reconcile with reality after a short delay
            self.root.after(2000, self._background_refresh)

        self._run_task(
            f"Killing PID {pid}...",
            lambda: run_backend('kill', pid),
            on_kill_success,
        )

    def restart_selected(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        if not row or not row.get('can_restart'):
            return
        pid = int(row['pid'])

        def restart_worker():
            result = run_backend('restart', pid)
            if not wait_for_port():
                raise BackendError('Server did not start within timeout.')
            return result

        def on_restart_success(_payload: dict) -> None:
            self._set_status(f'Restarted PID {pid}.', '#8ee39d')
            self._probe_health()
            # Reconcile after new process has time to start
            self.root.after(3000, self._background_refresh)

        self._run_task(
            f"Restarting PID {pid}...",
            restart_worker,
            on_restart_success,
        )

    # ── Lifecycle ──────────────────────────────────────────────────────

    def _on_close(self) -> None:
        if self._auto_refresh_id is not None:
            self.root.after_cancel(self._auto_refresh_id)
            self._auto_refresh_id = None
        proc = self._streaming_process
        if proc is not None and proc.poll() is None:
            try:
                proc.terminate()
            except OSError:
                pass
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


if __name__ == '__main__':
    ProcessManagerApp().run()
