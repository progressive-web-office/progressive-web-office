/**
 * Offline synchronisation of a text document (COLLAB-008): the passes shown
 * and scanned through QRShare, on top of the `offline` frames of
 * @scelles/collab.
 *
 * A two-way sync takes three passes, each a few frames in one transfer:
 *   1. A shows HELLO + STATE_VECTOR;
 *   2. B shows HELLO + UPDATE (what A lacks) + STATE_VECTOR;
 *   3. A shows UPDATE (what B lacks).
 * `everything()` is the one-way pass: the whole document, merged by the
 * receiver (also how a new device gets the document).
 */
import * as Y from 'yjs';
import { offline } from '@scelles/collab';
import { validateCrdt } from './crdt';

type OfflineSyncOptions = ConstructorParameters<typeof offline.OfflineSync>[0];
type TrustedPeer = offline.TrustedPeer;
type UpdateSummary = offline.UpdateSummary;

/** An update waiting for the user's decision. */
export interface PendingUpdate {
  trust: 'trusted' | 'unknown';
  peer?: TrustedPeer;
  /** Hex id of the sender. */
  from: string;
  summary: UpdateSummary;
}

/** Questions asked to the user while handling a pass. */
export interface SyncPrompts {
  /** A device introduced itself: trust it from now on? */
  trust(peer: TrustedPeer): Promise<boolean>;
  /** Apply this update? */
  review(update: PendingUpdate): Promise<boolean>;
}

export interface HandleResult {
  /** The pass to show back, when the sync goes on. */
  reply?: Uint8Array;
  /** Whether the document changed. */
  changed: boolean;
  /** Whether the reply asks the other device for one more pass. */
  awaitsReply: boolean;
}

/** The document id of a pass, or null when the bytes are not sync frames. */
export function docIdOf(bytes: Uint8Array): string | null {
  try {
    const first = offline.splitFrames(bytes)[0]!;
    return offline.bytesToUuid(first.slice(8, 24));
  } catch {
    return null;
  }
}

/** Refuse a received update that would not make a valid text document. */
export function validateTextDocument(copy: Y.Doc): void {
  const error = validateCrdt(copy);
  if (error) throw new Error(error);
}

export class DocumentSync {
  private readonly sync: offline.OfflineSync;

  constructor(private readonly opts: Omit<OfflineSyncOptions, 'validate'>) {
    this.sync = new offline.OfflineSync({ ...opts, validate: validateTextDocument });
  }

  get docId(): string {
    return this.opts.docId;
  }

  /** First pass of a two-way sync. */
  async start(): Promise<Uint8Array> {
    return offline.joinFrames([await this.sync.hello(), await this.sync.stateVector()]);
  }

  /** One-way pass: the whole document. */
  async everything(): Promise<Uint8Array> {
    return offline.joinFrames([await this.sync.hello(), await this.sync.updateFor(Y.encodeStateVector(new Y.Doc()))]);
  }

  /** Handle a scanned pass: trust, review and apply what it carries, and give the pass to show back. */
  async handle(bytes: Uint8Array, prompts: SyncPrompts): Promise<HandleResult> {
    const frames = offline.splitFrames(bytes, { maxBytes: offline.DEFAULT_MAX_BYTES });
    let replyUpdate: Uint8Array | undefined;
    let gotUpdate = false;
    let changed = false;
    for (const frame of frames) {
      const got = await this.sync.receive(frame);
      if (got.type === 'hello') {
        if (!got.known && (await prompts.trust(got.peer))) await this.opts.peers.put(got.peer);
      } else if (got.type === 'stateVector') {
        replyUpdate = got.reply;
      } else {
        gotUpdate = true;
        const pending: PendingUpdate = { trust: got.trust, from: got.from, summary: got.summary, ...(got.peer ? { peer: got.peer } : {}) };
        if (await prompts.review(pending)) changed = (await got.apply()).changed || changed;
        else await got.refuse();
      }
    }
    if (!replyUpdate) return { changed, awaitsReply: false };
    // Pass 1 asks for an update and our state vector; pass 2 already brought its update.
    const reply = gotUpdate ? [replyUpdate] : [await this.sync.hello(), replyUpdate, await this.sync.stateVector()];
    return { reply: offline.joinFrames(reply), changed, awaitsReply: !gotUpdate };
  }
}
