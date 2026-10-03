/** A marimo notebook as marimo writes it (DOC-039). */
export const MARIMO_NB = `import marimo

__generated_with = "0.19.7"
app = marimo.App()


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell(hide_code=True)
def _(mo):
    mo.md("""
    marimo knows how your cells are related, and can automatically update
    outputs like a spreadsheet.

    Try updating the values of **variables** below!
    """)
    return


@app.cell
def _():
    x = 0
    return (x,)


@app.cell
def _():
    y = 1
    return


@app.cell
def _(x):
    x
    return


if __name__ == "__main__":
    app.run()
`;
