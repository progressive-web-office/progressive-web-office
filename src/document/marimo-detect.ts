/** Whether a Python text is a marimo notebook (DOC-039); kept apart so that format detection stays light. */
export function isMarimo(text: string): boolean {
  return /^import marimo\b/m.test(text) && /^app\s*=\s*marimo\.App\(/m.test(text) && /^@app\.(cell|function|class_definition)\b|^with app\.setup/m.test(text);
}
