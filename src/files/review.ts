/**
 * Review comments in source files (FILE-024): written in the code itself,
 * as a comment of the file's language, `// REVIEW(Ann): text`, so that they
 * travel with the file and every editor shows them.
 */

export interface CommentTokens {
  line?: string;
  block?: { open: string; close: string };
}

export interface ReviewComment {
  /** Line number, from 1. */
  line: number;
  author: string;
  text: string;
}

const MARK = /REVIEW\(([^)]*)\):\s?(.*?)\s*(?:\*\/|-->|\*\)|-\}|#\}|=#|%\}|\]\])?\s*$/;

/** The line holding a review comment, indented like `indent`. */
export function reviewLine(tokens: CommentTokens, author: string, text: string, indent = ''): string {
  const body = `REVIEW(${author.replace(/[()]/g, '')}): ${text.replace(/\s*\n\s*/g, ' ').trim()}`;
  if (tokens.line) return `${indent}${tokens.line} ${body}`;
  if (tokens.block) return `${indent}${tokens.block.open} ${body} ${tokens.block.close}`;
  return `${indent}# ${body}`;
}

/** The review comments of a text. */
export function reviewComments(text: string): ReviewComment[] {
  const out: ReviewComment[] = [];
  text.split('\n').forEach((line, i) => {
    const m = MARK.exec(line);
    if (m) out.push({ line: i + 1, author: m[1]!.trim(), text: m[2]! });
  });
  return out;
}
