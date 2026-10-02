#!/usr/bin/env python3
"""Run the Python cells of the lab example (src/templates/lab/<lang>/*.py) the
way the code-cell sandbox does, and store their printed output and figures,
so that the example opens with its plots already drawn.

Usage: python3 scripts/template-figures.py   (needs numpy and matplotlib)
"""
import ast
import contextlib
import hashlib
import io
import json
import os
import pathlib

os.environ["MPLBACKEND"] = "Agg"
import matplotlib  # noqa: E402

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

LAB = pathlib.Path(__file__).resolve().parent.parent / "src" / "templates" / "lab"
FIGURES = LAB / "figures"


def run(code: str, env: dict) -> str:
    """Run a cell like the sandbox: the value of a last expression is shown too."""
    tree = ast.parse(code)
    last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        exec(compile(tree, "<cell>", "exec"), env)
        if last is not None:
            value = eval(compile(ast.Expression(last.value), "<cell>", "eval"), env)
            if value is not None:
                print(repr(value))
    return out.getvalue()


def figures() -> list[str]:
    names = []
    for n in plt.get_fignums():
        buf = io.BytesIO()
        # Same settings as the sandbox; no date or software metadata, for stable files.
        plt.figure(n).savefig(buf, format="png", dpi=100, bbox_inches="tight", metadata={"Software": None})
        data = buf.getvalue()
        name = hashlib.sha256(data).hexdigest()[:16] + ".png"
        (FIGURES / name).write_bytes(data)
        names.append(name)
    plt.close("all")
    return names


def main() -> None:
    FIGURES.mkdir(exist_ok=True)
    for old in FIGURES.glob("*.png"):
        old.unlink()
    outputs = {}
    for lang_dir in sorted(p for p in LAB.iterdir() if p.is_dir() and p.name != "figures"):
        env: dict = {"__name__": "__main__"}
        cells = []
        for cell in sorted(lang_dir.glob("*.py")):
            text = run(cell.read_text(encoding="utf-8"), env)
            cells.append({"cell": cell.name, "text": text, "figures": figures()})
        outputs[lang_dir.name] = cells
    (LAB / "outputs.json").write_text(json.dumps(outputs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
