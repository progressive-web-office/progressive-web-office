"""Jupyter widgets in Progressive Web Office (CODE-016).

Widgets (ipywidgets, anywidget) talk to their front end through `comm`
channels. Here every channel is sent to the application through `send`, given
by the sandbox; messages from the front end come back through `receive`.
`display` and the value of the last line of a cell record the widgets to show.
The module `pwo` gives `ui` (re-run the cells using a widget when it changes)
and `install` (packages from a URL or the package index).
"""

from __future__ import annotations

import io
import sys
import types
import zipfile

_send = None
_displayed: list[str] = []
_reactive: set[str] = set()
_installed = False

VIEW = "application/vnd.jupyter.widget-view+json"


def _bundle(obj):
    """The MIME bundle of an object, if it has one."""
    method = getattr(obj, "_repr_mimebundle_", None)
    if not callable(method):
        return None
    try:
        bundle = method()
    except TypeError:
        return None
    if isinstance(bundle, tuple):
        bundle = bundle[0]
    return bundle if isinstance(bundle, dict) else None


def show(obj) -> bool:
    """Record a widget to display; False when `obj` is not one."""
    bundle = _bundle(obj)
    if bundle and VIEW in bundle:
        _displayed.append(bundle[VIEW]["model_id"])
        return True
    return False


def display(*objs, **kwargs) -> None:
    for obj in objs:
        if not show(obj):
            print(repr(obj) if not isinstance(obj, str) else obj)


def take_displayed() -> list[str]:
    out = list(dict.fromkeys(_displayed))
    _displayed.clear()
    return out


def install(send) -> None:
    """Route the widget channels to the application (once the packages are there)."""
    global _send, _installed
    _send = send
    if _installed:
        return
    import builtins

    import comm
    from comm.base_comm import BaseComm

    class PwoComm(BaseComm):
        def publish_msg(self, msg_type, data=None, metadata=None, buffers=None, **keys):
            _send(
                {"msg_type": msg_type, "comm_id": self.comm_id, "data": data or {}, "metadata": metadata or {}},
                [bytes(b) for b in (buffers or [])],
            )

    comm.create_comm = lambda *args, **kwargs: PwoComm(*args, **kwargs)
    builtins.display = display
    try:
        import IPython.display

        IPython.display.display = display
    except ImportError:
        pass
    _installed = True


def receive(comm_id: str, data: dict, buffers: list) -> list[str]:
    """A message from the front end; the names of the cells' variables to re-run for (`ui`)."""
    import comm

    channel = comm.get_comm_manager().get_comm(comm_id)
    if channel is None:
        return []
    widget = _widget(comm_id)
    keys = list(data.get("state", {})) if data.get("method") == "update" else []
    before = {k: getattr(widget, k, None) for k in keys} if widget is not None else {}
    channel.handle_msg({"content": {"comm_id": comm_id, "data": data}, "buffers": [memoryview(b) for b in buffers]})
    # Only a real change re-runs the cells (front ends often write back what they were given).
    if keys and comm_id in _reactive and widget is not None and any(getattr(widget, k, None) != v for k, v in before.items()):
        return names_of(comm_id)
    return []


def _widget(model_id: str):
    try:
        from ipywidgets.widgets.widget import _instances
    except ImportError:
        return None
    return _instances.get(model_id)


def names_of(model_id: str) -> list[str]:
    """Names of the interpreter bound to the widget `model_id`."""
    import __main__

    return sorted(k for k, v in vars(__main__).items() if not k.startswith("_") and getattr(v, "model_id", None) == model_id)


def ui(widget):
    """Re-run the cells using `widget` when the user changes it."""
    _reactive.add(widget.model_id)
    return widget


def _site() -> str:
    import site

    return site.getsitepackages()[0]


def unpack(data: bytes) -> list[str]:
    """Install a pure-Python wheel; its requirements (names) are returned."""
    requires: list[str] = []
    with zipfile.ZipFile(io.BytesIO(bytes(data))) as wheel:
        wheel.extractall(_site())
        for name in wheel.namelist():
            if name.endswith(".dist-info/METADATA"):
                for line in wheel.read(name).decode("utf-8", "replace").splitlines():
                    if line.startswith("Requires-Dist:") and "extra ==" not in line:
                        spec = line.split(":", 1)[1].strip()
                        requires.append(_project(spec))
    import importlib

    importlib.invalidate_caches()
    return requires


def _project(spec: str) -> str:
    """`numpy>=1.23 ; python_version…` → `numpy`."""
    out = ""
    for ch in spec:
        if ch.isalnum() or ch in "-_.":
            out += ch
        else:
            break
    return out.lower().replace("_", "-")


def module(fetch, load) -> types.ModuleType:
    """The `pwo` module. `fetch(spec)` gives wheels (bytes) for a URL, a list of
    wheels (`wheel.txt`) or a package name; `load(names)` loads packages of the
    Python distribution or bundled with the application."""
    pwo = types.ModuleType("pwo", "Progressive Web Office: widgets and packages.")

    async def install_(*specs: str) -> None:
        """Install packages: wheel URLs, a `wheel.txt` list of wheels, or names of the package index."""
        wanted: list[str] = []
        for spec in specs:
            for data in await fetch(spec):
                wanted += unpack(data)
        missing = []
        for name in dict.fromkeys(wanted):
            module_name = name.replace("-", "_")
            try:
                __import__(module_name)
            except ImportError:
                missing.append(name)
        if missing:
            await load(missing)

    pwo.install = install_
    pwo.ui = ui
    pwo.display = display
    sys.modules["pwo"] = pwo
    return pwo
