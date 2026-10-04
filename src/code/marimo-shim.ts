/**
 * DOC-039: what the cells of a marimo notebook need from marimo to run here:
 * `mo.md(...)` (shown as its text), and `marimo.App` with its decorators.
 * The rest of marimo (`mo.ui`…) says it needs marimo itself. Private and
 * special names (`__path__`, `_runtime`…) are missing as for any module:
 * libraries probe marimo with `try: import marimo.x except ImportError`.
 */
export const MARIMO_SHIM = `
import sys, importlib.util
if "marimo" not in sys.modules and importlib.util.find_spec("marimo") is None:
    import types, textwrap, contextlib
    _mo = types.ModuleType("marimo")
    _mo.__version__ = "0+pwo"

    class _Md:
        def __init__(self, text):
            self.text = textwrap.dedent(text).strip()
        def __repr__(self):
            return self.text
        def _repr_markdown_(self):
            return self.text

    class App:
        def __init__(self, *args, **kwargs):
            pass
        def cell(self, fn=None, **kwargs):
            return fn if fn is not None else (lambda f: f)
        function = cell
        class_definition = cell
        @property
        def setup(self):
            return contextlib.nullcontext()
        def run(self):
            print("Open this notebook as a document to run its cells.")

    def _missing(name):
        if name.startswith("_"):
            raise AttributeError(f"module 'marimo' has no attribute {name!r}")
        raise NotImplementedError(f"marimo.{name} needs marimo itself: run this notebook with marimo, or install it with: import pwo; await pwo.install('marimo')")

    _mo.md = lambda text: _Md(text)
    _mo.App = App
    _mo.__getattr__ = _missing
    sys.modules["marimo"] = _mo
`;
