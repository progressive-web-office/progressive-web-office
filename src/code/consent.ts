/**
 * CODE-016: the user's consent to download code from a site, for this
 * session. Cells run side by side, so several may need the same site, or
 * different sites, at once: the question is asked once per site, and one
 * question at a time (stacked dialogs would hide each other).
 */
export class DownloadConsent {
  private readonly allowed = new Set<string>();
  private readonly asking = new Map<string, Promise<boolean>>();
  private queue: Promise<unknown> = Promise.resolve();

  has(origin: string): boolean {
    return this.allowed.has(origin);
  }

  ask(origin: string, question: ((origin: string) => Promise<boolean>) | undefined): Promise<boolean> {
    if (this.allowed.has(origin)) return Promise.resolve(true);
    const pending = this.asking.get(origin);
    if (pending) return pending;
    const answer = this.queue.then(async () => {
      if (this.allowed.has(origin)) return true;
      const ok = await (question?.(origin) ?? false);
      if (ok) this.allowed.add(origin);
      return ok;
    }).catch(() => false).finally(() => this.asking.delete(origin));
    this.queue = answer;
    this.asking.set(origin, answer);
    return answer;
  }
}
