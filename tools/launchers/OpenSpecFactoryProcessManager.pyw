from __future__ import annotations

import json
import queue
import subprocess
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk

LAUNCHER_DIR = Path(__file__).resolve().parent
ROOT = LAUNCHER_DIR.parent.parent
BACKEND_PATH = ROOT / 'tools' / 'specfactory-process-manager.js'
ICON_PATH = LAUNCHER_DIR / 'icons' / 'specfactory-process-manager.ico'
TARGET_PORT = 8788
CREATE_NO_WINDOW = getattr(subprocess, 'CREATE_NO_WINDOW', 0)


class BackendError(RuntimeError):
    pass


def run_backend(action: str, pid: int | None = None) -> dict:
    command = ['node', str(BACKEND_PATH), action, '--json']
    if pid is not None:
        command.extend(['--pid', str(pid)])

    try:
        result = subprocess.run(
            command,
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
            creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError as error:
        raise BackendError('node_not_found') from error

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


class ProcessManagerApp:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title('Spec Factory Process Manager')
        self.root.geometry('1320x760')
        self.root.minsize(1080, 640)
        self.root.configure(bg='#0b1320')
        if ICON_PATH.exists():
            try:
                self.root.iconbitmap(default=str(ICON_PATH))
            except tk.TclError:
                pass

        self.busy = False
        self.rows_by_pid: dict[int, dict] = {}
        self.selected_pid: int | None = None
        self.preflight_data: dict = {}

        self._configure_style()
        self._build_ui()
        self.refresh_state()

    def _configure_style(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use('clam')
        style.configure('.', background='#0b1320', foreground='#edf3fb')
        style.configure('Root.TFrame', background='#0b1320')
        style.configure('Panel.TFrame', background='#132033')
        style.configure(
            'Headline.TLabel',
            background='#0b1320',
            foreground='#f5fbff',
            font=('Segoe UI Semibold', 21),
        )
        style.configure(
            'Subhead.TLabel',
            background='#0b1320',
            foreground='#91a6bf',
            font=('Segoe UI', 10),
        )
        style.configure(
            'PanelTitle.TLabel',
            background='#132033',
            foreground='#f5fbff',
            font=('Segoe UI Semibold', 11),
        )
        style.configure(
            'StatLabel.TLabel',
            background='#16314d',
            foreground='#91a6bf',
            font=('Segoe UI', 9),
        )
        style.configure(
            'StatValue.TLabel',
            background='#16314d',
            foreground='#f5fbff',
            font=('Segoe UI Semibold', 15),
        )
        style.configure(
            'Action.TButton',
            padding=(16, 9),
            font=('Segoe UI Semibold', 10),
        )
        style.configure(
            'Treeview',
            background='#0f1b2b',
            foreground='#edf3fb',
            fieldbackground='#0f1b2b',
            rowheight=28,
            borderwidth=0,
        )
        style.configure(
            'Treeview.Heading',
            background='#1d334d',
            foreground='#d7e6f7',
            relief='flat',
            font=('Segoe UI Semibold', 9),
        )
        style.map(
            'Treeview',
            background=[('selected', '#225c7d')],
            foreground=[('selected', '#f5fbff')],
        )

    def _build_ui(self) -> None:
        shell = ttk.Frame(self.root, style='Root.TFrame', padding=18)
        shell.pack(fill='both', expand=True)
        shell.columnconfigure(0, weight=3)
        shell.columnconfigure(1, weight=2)
        shell.rowconfigure(2, weight=3)
        shell.rowconfigure(3, weight=1)

        header = ttk.Frame(shell, style='Root.TFrame')
        header.grid(row=0, column=0, columnspan=2, sticky='ew')
        header.columnconfigure(0, weight=1)

        ttk.Label(header, text='Spec Factory Process Manager', style='Headline.TLabel').grid(
            row=0,
            column=0,
            sticky='w',
        )
        ttk.Label(
            header,
            text='Desktop view for repo-managed PIDs. The backend still enforces the same kill and restart safety gates.',
            style='Subhead.TLabel',
        ).grid(row=1, column=0, sticky='w', pady=(6, 0))

        actions = ttk.Frame(header, style='Root.TFrame')
        actions.grid(row=0, column=1, rowspan=2, sticky='e')

        self.refresh_button = ttk.Button(actions, text='Refresh', command=self.refresh_state, style='Action.TButton')
        self.refresh_button.grid(row=0, column=0, padx=(0, 8))
        self.kill_button = ttk.Button(actions, text='Kill Selected', command=self.kill_selected, style='Action.TButton')
        self.kill_button.grid(row=0, column=1, padx=(0, 8))
        self.restart_button = ttk.Button(actions, text='Restart Selected', command=self.restart_selected, style='Action.TButton')
        self.restart_button.grid(row=0, column=2)

        stats_row = ttk.Frame(shell, style='Root.TFrame')
        stats_row.grid(row=1, column=0, columnspan=2, sticky='ew', pady=(16, 16))
        for index in range(6):
            stats_row.columnconfigure(index, weight=1)

        self.tracked_api_value = self._create_stat(stats_row, 0, 'Tracked API PID')
        self.port_owner_value = self._create_stat(stats_row, 1, f'Port {TARGET_PORT} Owner')
        self.node_version_value = self._create_stat(stats_row, 2, 'Node Version')
        self.native_module_value = self._create_stat(stats_row, 3, 'Native Modules')
        self.row_count_value = self._create_stat(stats_row, 4, 'Rows')
        self.updated_at_value = self._create_stat(stats_row, 5, 'Last Refresh')

        table_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        table_panel.grid(row=2, column=0, sticky='nsew', padx=(0, 10))
        table_panel.columnconfigure(0, weight=1)
        table_panel.rowconfigure(1, weight=1)

        ttk.Label(table_panel, text='Process List', style='PanelTitle.TLabel').grid(row=0, column=0, sticky='w')

        table_frame = ttk.Frame(table_panel, style='Panel.TFrame')
        table_frame.grid(row=1, column=0, sticky='nsew', pady=(10, 0))
        table_frame.columnconfigure(0, weight=1)
        table_frame.rowconfigure(0, weight=1)

        columns = ('pid', 'name', 'roles', 'actions')
        self.tree = ttk.Treeview(table_frame, columns=columns, show='headings', selectmode='browse')
        self.tree.heading('pid', text='PID')
        self.tree.heading('name', text='Name')
        self.tree.heading('roles', text='Roles')
        self.tree.heading('actions', text='Actions')
        self.tree.column('pid', width=90, anchor='center')
        self.tree.column('name', width=140, anchor='w')
        self.tree.column('roles', width=380, anchor='w')
        self.tree.column('actions', width=180, anchor='w')
        self.tree.grid(row=0, column=0, sticky='nsew')
        self.tree.bind('<<TreeviewSelect>>', self.on_tree_select)
        self.tree.tag_configure('owner', background='#143245')
        self.tree.tag_configure('protected', background='#3b1822')
        self.tree.tag_configure('managed', background='#173422')

        table_scroll = ttk.Scrollbar(table_frame, orient='vertical', command=self.tree.yview)
        table_scroll.grid(row=0, column=1, sticky='ns')
        self.tree.configure(yscrollcommand=table_scroll.set)

        detail_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        detail_panel.grid(row=2, column=1, sticky='nsew')
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
        self._sync_buttons()

        # ── Environment panel (spans both columns below process panels) ──
        env_panel = ttk.Frame(shell, style='Panel.TFrame', padding=14)
        env_panel.grid(row=3, column=0, columnspan=2, sticky='nsew', pady=(10, 0))
        env_panel.columnconfigure(0, weight=1)
        env_panel.rowconfigure(1, weight=1)

        ttk.Label(env_panel, text='Environment', style='PanelTitle.TLabel').grid(row=0, column=0, sticky='w')
        self.env_text = self._create_detail_text(env_panel, 0)
        self._set_detail_text(self.env_text, 'Run Refresh to load environment diagnostics.')

    def _create_stat(self, parent: ttk.Frame, column: int, label: str) -> ttk.Label:
        panel = ttk.Frame(parent, style='Panel.TFrame', padding=12)
        panel.grid(row=0, column=column, sticky='ew', padx=(0 if column == 0 else 8, 0))
        panel.configure(style='Panel.TFrame')
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
            frame,
            height=6,
            wrap='word',
            bg='#0f1b2b',
            fg='#edf3fb',
            insertbackground='#edf3fb',
            relief='flat',
            highlightthickness=0,
            font=('Consolas', 10),
            padx=10,
            pady=10,
        )
        text.pack(fill='both', expand=True)
        text.configure(state='disabled')
        return text

    def _set_detail_text(self, widget: tk.Text, content: str) -> None:
        widget.configure(state='normal')
        widget.delete('1.0', 'end')
        widget.insert('1.0', content)
        widget.configure(state='disabled')

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

    def _sync_buttons(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        refresh_state = 'disabled' if self.busy else 'normal'
        kill_state = 'normal' if row and row.get('can_kill') and not self.busy else 'disabled'
        restart_state = 'normal' if row and row.get('can_restart') and not self.busy else 'disabled'
        self.refresh_button.configure(state=refresh_state)
        self.kill_button.configure(state=kill_state)
        self.restart_button.configure(state=restart_state)

    def _set_status(self, text: str, color: str = '#91a6bf') -> None:
        self.status_label.configure(text=text, foreground=color)

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

        self.tree.delete(*self.tree.get_children())
        owner_pid = None
        for row in rows:
            pid = int(row['pid'])
            tags = []
            if row.get('port_8788_owner'):
                owner_pid = pid
                tags.append('owner')
            if row.get('protected_process'):
                tags.append('protected')
            elif row.get('spec_factory_process'):
                tags.append('managed')

            self.tree.insert(
                '',
                'end',
                iid=str(pid),
                values=(
                    str(pid),
                    row.get('name') or '-',
                    self._format_roles(row),
                    self._format_actions(row),
                ),
                tags=tuple(tags),
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
        # Trigger preflight fetch after state is loaded
        self._fetch_preflight()

    def _run_task(self, status_text: str, worker, on_success) -> None:
        if self.busy:
            return

        self.busy = True
        self._set_status(status_text, '#f2b24b')
        self._sync_buttons()
        result_queue: queue.Queue[tuple[str, object]] = queue.Queue()

        def target() -> None:
            try:
                result_queue.put(('ok', worker()))
            except Exception as error:  # pragma: no cover - handled in UI
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
        if kind == 'ok':
            on_success(payload)
        else:
            message = str(payload)
            self._set_status(message, '#ff8c8c')
            messagebox.showerror('Spec Factory Process Manager', message, parent=self.root)
        self._sync_buttons()

    def refresh_state(self) -> None:
        self._run_task('Refreshing state...', lambda: run_backend('state'), self._apply_state)

    def _fetch_preflight(self) -> None:
        """Fetch environment diagnostics in a background thread (non-blocking)."""
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
            self._apply_preflight(payload)
        else:
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

        self._set_detail_text(self.env_text, '\n'.join(lines))

    def _apply_preflight_error(self, message: str) -> None:
        self.node_version_value.configure(text='?')
        self.native_module_value.configure(text='ERROR', foreground='#ff8c8c')
        self._set_detail_text(self.env_text, f'Preflight check failed:\n{message}')

    def kill_selected(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        if not row or not row.get('can_kill'):
            return
        if not messagebox.askyesno(
            'Kill Process',
            f"Kill PID {row['pid']} ({row.get('name') or 'unknown'})?",
            parent=self.root,
        ):
            return
        self._run_task(
            f"Killing PID {row['pid']}...",
            lambda: run_backend('kill', int(row['pid'])),
            lambda _payload: self.refresh_state(),
        )

    def restart_selected(self) -> None:
        row = self.rows_by_pid.get(self.selected_pid or -1)
        if not row or not row.get('can_restart'):
            return
        if not messagebox.askyesno(
            'Restart Process',
            f"Restart PID {row['pid']} ({row.get('name') or 'unknown'})?",
            parent=self.root,
        ):
            return
        self._run_task(
            f"Restarting PID {row['pid']}...",
            lambda: run_backend('restart', int(row['pid'])),
            lambda _payload: self.refresh_state(),
        )

    def run(self) -> None:
        self.root.mainloop()


if __name__ == '__main__':
    ProcessManagerApp().run()
