/**
 * VAULT-001..VAULT-004: a vault of passwords (a `.kdbx` file) as a document:
 * opened by its master password (and key file), or by the lock of the
 * application on this device (LOCK-002); its groups, entries and their
 * fields; passwords shown only when asked, copied to the clipboard and
 * cleared from it after a while; one-time codes; generated passwords; a
 * check against known breaches after consent. Saved in the same format.
 */
import { button, busyText, h } from '../app/dom';
import { t } from '../i18n';
import type { EditorView, ViewContext } from '../app/views';
import { lockSet, sealText, unlocked, unsealText } from '../lock/session';
import { BREACH_ORIGIN, breachCount } from './breach';
import { DEFAULT_PASSWORD, entropyBits, generatePassword, type PasswordOptions } from './generator';
import { deleteEntry, entriesOf, fieldOf, groupsOf, newEntry, newGroup, openVault, saveVault, setFields, setTags, WrongKeyError, type Kdbx, type VaultEntry } from './kdbx';
import { parseTotp, totp } from './totp';

const CLEAR_AFTER = 30_000;
const rememberKey = (name: string): string => `pwo.vault.remember.${name}`;
let breachAllowed = false;

export class VaultView implements EditorView {
  readonly element: HTMLElement;
  private db: Kdbx | undefined;
  private group: string | undefined;
  private selected: string | undefined;
  private query = '';
  private readOnly = false;
  private codeTimer: ReturnType<typeof setInterval> | undefined;
  private clearTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly body = h('div', { class: 'vault-body' });
  private readonly info = h('p', { class: 'hint vault-status', role: 'status' });

  constructor(
    private bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
    db?: Kdbx,
  ) {
    this.db = db;
    this.element = h('section', { class: 'vault-view', 'aria-label': fileName }, this.info, this.body);
    if (db) this.render();
    else this.renderLocked();
  }

  mounted(): void {
    // Remembered on this device, opened by the lock of the application: opened at once.
    const remembered = localStorage.getItem(rememberKey(this.fileName));
    if (!this.db && remembered && lockSet() && unlocked()) void unsealText(remembered).then((pw) => this.unlock(pw, undefined, false), () => undefined);
  }

  // --- locked -------------------------------------------------------------------

  private renderLocked(message = ''): void {
    const password = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('pw.master') });
    const keyFile = h('input', { type: 'file', 'aria-label': t('pw.keyFile') });
    const remember = h('input', { type: 'checkbox', id: 'vault-remember' });
    const go = async (): Promise<void> => {
      const file = keyFile.files?.[0];
      await this.unlock(password.value, file ? new Uint8Array(await file.arrayBuffer()) : undefined, remember.checked);
    };
    password.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void go();
    });
    this.body.replaceChildren(
      h(
        'div',
        { class: 'vault-locked' },
        h('h2', {}, `🔐 ${this.fileName}`),
        h('label', { class: 'vault-field' }, h('span', {}, t('pw.master')), password),
        h('label', { class: 'vault-field' }, h('span', {}, t('pw.keyFile')), keyFile),
        lockSet() ? h('div', { class: 'settings-field check' }, remember, h('label', { for: 'vault-remember' }, t('pw.remember'))) : h('p', { class: 'hint' }, t('pw.rememberNeedsLock')),
        h('p', { class: 'vault-error', role: 'alert' }, message),
        button(t('pw.open'), () => void go(), { className: 'primary', icon: '🔓' }),
      ),
    );
    setTimeout(() => password.focus());
  }

  private async unlock(password: string, keyFile: Uint8Array | undefined, remember: boolean): Promise<void> {
    this.info.replaceChildren(...busyText(t('pw.opening')));
    try {
      this.db = await openVault(this.bytes, password, keyFile);
      if (remember && !keyFile && lockSet()) localStorage.setItem(rememberKey(this.fileName), await sealText(password));
      this.info.textContent = '';
      this.render();
    } catch (err) {
      this.info.textContent = '';
      this.renderLocked(err instanceof WrongKeyError ? t('pw.wrongKey') : (err as Error).message);
    }
  }

  // --- open ---------------------------------------------------------------------

  private changed(): void {
    this.ctx.changed();
    this.render();
  }

  private render(): void {
    const db = this.db!;
    const groups = groupsOf(db);
    const all = entriesOf(db, this.group);
    const q = this.query.toLowerCase();
    const entries = q ? all.filter((e) => [e.title, e.username, e.url, ...e.tags].some((v) => v.toLowerCase().includes(q))) : all;
    if (!this.selected || !all.some((e) => e.uuid === this.selected)) this.selected = entries[0]?.uuid;
    const search = h('input', { type: 'search', 'aria-label': t('pw.search'), placeholder: t('pw.search'), value: this.query });
    search.addEventListener('input', () => {
      this.query = search.value;
      this.render();
      (this.element.querySelector('.vault-entries input[type="search"]') as HTMLInputElement | null)?.focus();
    });
    const groupList = h(
      'ul',
      { class: 'vault-groups', role: 'listbox', 'aria-label': t('pw.groups') },
      h('li', { role: 'option', 'aria-selected': String(!this.group), tabindex: '0' }, `🗂 ${t('pw.allEntries')}`),
      ...groups.map((g) => h('li', { role: 'option', 'aria-selected': String(g.uuid === this.group), tabindex: '0', 'data-uuid': g.uuid, style: `padding-left: ${0.6 + g.depth}em` }, `${g.recycle ? '🗑' : '📁'} ${g.name}`)),
    );
    groupList.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest('li');
      if (!li) return;
      this.group = li.dataset.uuid;
      this.render();
    });
    const entryList = h(
      'ul',
      { class: 'vault-list', role: 'listbox', 'aria-label': t('pw.entries') },
      ...entries.map((e) => {
        const li = h('li', { role: 'option', 'aria-selected': String(e.uuid === this.selected), tabindex: e.uuid === this.selected ? '0' : '-1' }, h('strong', {}, e.title || t('pw.untitled')), h('small', {}, e.username));
        li.addEventListener('click', () => {
          this.selected = e.uuid;
          this.render();
        });
        return li;
      }),
      ...(entries.length ? [] : [h('li', { class: 'hint' }, t('pw.noEntries'))]),
    );
    const entry = all.find((e) => e.uuid === this.selected);
    this.body.replaceChildren(
      h(
        'div',
        { class: 'vault-bar' },
        h('h2', {}, `🔐 ${db.meta.name || this.fileName}`),
        ...(this.readOnly ? [] : [button(t('pw.newEntry'), () => this.addEntry(), { icon: '＋', className: 'primary' }), button(t('pw.newGroup'), () => this.addGroup(), { icon: '📁' })]),
        button(t('pw.generator'), () => this.generatorDialog(), { icon: '🎲' }),
        button(t('pw.lock'), () => this.lock(), { icon: '🔒' }),
      ),
      h('div', { class: 'vault-panes' }, h('nav', { class: 'vault-side', 'aria-label': t('pw.groups') }, groupList), h('div', { class: 'vault-entries' }, search, entryList), entry ? this.details(entry) : h('div', { class: 'vault-details hint' }, t('pw.chooseEntry'))),
    );
    this.ctx.statusChanged();
  }

  /** Copy a value, cleared from the clipboard after a while (if it is still there). */
  private async copy(value: string, what: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return this.ctx.notify?.(t('pw.copyFailed'));
    }
    this.ctx.notify?.(t('pw.copied', { what, s: CLEAR_AFTER / 1000 }));
    clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      void navigator.clipboard.readText().then((now) => (now === value ? navigator.clipboard.writeText('') : undefined), () => (document.hasFocus() ? navigator.clipboard.writeText('') : undefined)).catch(() => undefined);
    }, CLEAR_AFTER);
  }

  private details(e: VaultEntry): HTMLElement {
    const db = this.db!;
    const input = (name: string, value: string, type = 'text'): HTMLInputElement => h('input', { type, value, 'aria-label': name, autocomplete: 'off', spellcheck: 'false', readonly: this.readOnly });
    const title = input(t('pw.title'), e.title);
    const user = input(t('pw.username'), e.username);
    const password = input(t('pw.password'), fieldOf(db, e.uuid, 'Password'), 'password');
    const url = input(t('pw.url'), e.url, 'url');
    const tags = input(t('pw.tags'), e.tags.join(', '));
    const notes = h('textarea', { rows: '4', 'aria-label': t('pw.notes'), readonly: this.readOnly });
    notes.value = e.notes;
    const strength = h('span', { class: 'vault-strength hint' }, t('pw.strength', { n: entropyBits(password.value) }));
    password.addEventListener('input', () => (strength.textContent = t('pw.strength', { n: entropyBits(password.value) })));
    const reveal = button(t('pw.show'), () => {
      password.type = password.type === 'password' ? 'text' : 'password';
      reveal.setAttribute('aria-pressed', String(password.type === 'text'));
    }, { text: '👁', pressed: false });
    const row = (label: string, el: HTMLElement, ...actions: HTMLElement[]): HTMLElement => h('div', { class: 'vault-row' }, h('span', { class: 'vault-label' }, label), el, ...actions);
    const otpField = e.fields.find((f) => f.name.toLowerCase() === 'otp');
    const otp = otpField ? parseTotp(fieldOf(db, e.uuid, otpField.name)) : undefined;
    const code = h('output', { class: 'vault-code', 'aria-live': 'polite' });
    clearInterval(this.codeTimer);
    if (otp) {
      const tick = async (): Promise<void> => {
        const c = await totp(otp);
        code.textContent = `${c.code.replace(/(\d{3})(?=\d)/g, '$1 ')} · ${c.remaining}s`;
        code.dataset.code = c.code;
      };
      void tick();
      this.codeTimer = setInterval(() => void tick(), 1000);
    }
    const custom = e.fields.filter((f) => f.name.toLowerCase() !== 'otp');
    const customInputs = custom.map((f) => [f.name, input(f.name, fieldOf(db, e.uuid, f.name), f.protected ? 'password' : 'text')] as const);
    const save = (): void => {
      setFields(db, e.uuid, { Title: title.value, UserName: user.value, Password: password.value, URL: url.value, Notes: notes.value, ...Object.fromEntries(customInputs.map(([n, i]) => [n, i.value])) }, ['Password', ...custom.filter((f) => f.protected).map((f) => f.name)]);
      setTags(db, e.uuid, tags.value.split(',').map((s) => s.trim()).filter(Boolean));
      this.changed();
      this.ctx.notify?.(t('pw.saved'));
    };
    const breach = h('span', { class: 'hint', role: 'status' });
    return h(
      'form',
      { class: 'vault-details', 'aria-label': e.title || t('pw.untitled') },
      row(t('pw.title'), title),
      row(t('pw.username'), user, button(t('pw.copyUser'), () => void this.copy(user.value, t('pw.username')), { text: '⧉' })),
      row(
        t('pw.password'),
        password,
        reveal,
        button(t('pw.copyPassword'), () => void this.copy(password.value, t('pw.password')), { text: '⧉' }),
        ...(this.readOnly ? [] : [button(t('pw.generate'), () => {
          password.value = generatePassword();
          password.dispatchEvent(new Event('input'));
        }, { text: '🎲' })]),
      ),
      h('div', { class: 'vault-row' }, h('span', {}), strength, button(t('pw.checkBreach'), () => void this.checkBreach(password.value, breach), { className: 'link' }), breach),
      row(t('pw.url'), url, ...(e.url ? [button(t('pw.openUrl'), () => window.open(url.value, '_blank', 'noopener,noreferrer'), { text: '↗' })] : [])),
      ...(otp ? [row(t('pw.code'), code, button(t('pw.copyCode'), () => void this.copy(code.dataset.code ?? '', t('pw.code')), { text: '⧉' }))] : []),
      ...customInputs.map(([name, i]) => row(name, i, button(t('pw.copyField', { name }), () => void this.copy(i.value, name), { text: '⧉' }))),
      row(t('pw.tags'), tags),
      row(t('pw.notes'), notes),
      ...(this.readOnly ? [] : [h('div', { class: 'dialog-actions' }, button(t('pw.delete'), () => {
        if (!window.confirm(t('pw.deleteConfirm', { name: e.title }))) return;
        deleteEntry(db, e.uuid);
        this.changed();
      }, { className: 'danger' }), button(t('pw.apply'), save, { className: 'primary' }))]),
    );
  }

  private async checkBreach(password: string, out: HTMLElement): Promise<void> {
    if (!password) return;
    if (!breachAllowed && !window.confirm(t('pw.breachConsent', { origin: BREACH_ORIGIN }))) return;
    breachAllowed = true;
    out.replaceChildren(...busyText(t('pw.checking')));
    try {
      const n = await breachCount(password);
      out.textContent = n ? t('pw.breached', { n }) : t('pw.notBreached');
      out.classList.toggle('error', n > 0);
    } catch (err) {
      out.textContent = t('pw.breachFailed', { error: (err as Error).message });
    }
  }

  private addEntry(): void {
    const name = window.prompt(t('pw.newEntryName'))?.trim();
    if (!name) return;
    this.selected = newEntry(this.db!, this.group, name);
    this.query = '';
    this.changed();
  }

  private addGroup(): void {
    const name = window.prompt(t('pw.newGroupName'))?.trim();
    if (!name) return;
    this.group = newGroup(this.db!, this.group, name);
    this.changed();
  }

  /** VAULT-003: a password to copy, generated with the options chosen. */
  private generatorDialog(): void {
    const o: PasswordOptions = { ...DEFAULT_PASSWORD };
    const out = h('output', { class: 'vault-generated', 'aria-live': 'polite' });
    const draw = (): void => {
      out.textContent = generatePassword(o);
    };
    const length = h('input', { type: 'number', min: '8', max: '128', value: String(o.length), 'aria-label': t('pw.length') });
    length.addEventListener('input', () => {
      o.length = Math.min(128, Math.max(8, Number(length.value) || 20));
      draw();
    });
    const box = (key: keyof Omit<PasswordOptions, 'length'>): HTMLElement => {
      const c = h('input', { type: 'checkbox', checked: o[key], id: `vault-gen-${key}` });
      c.addEventListener('change', () => {
        o[key] = c.checked;
        // One class of characters at least.
        if (![o.lower, o.upper, o.digits, o.symbols].some(Boolean)) {
          o[key] = true;
          c.checked = true;
        }
        draw();
      });
      return h('div', { class: 'settings-field check' }, c, h('label', { for: `vault-gen-${key}` }, t(`pw.gen.${key}`)));
    };
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'vault-gen-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    dialog.append(
      h('h2', { id: 'vault-gen-title' }, t('pw.generator')),
      out,
      h('label', { class: 'vault-field' }, h('span', {}, t('pw.length')), length),
      box('lower'),
      box('upper'),
      box('digits'),
      box('symbols'),
      box('unambiguous'),
      h('div', { class: 'dialog-actions' }, button(t('pw.again'), draw, { text: '🎲' }), button(t('pw.copyPassword'), () => void this.copy(out.textContent ?? '', t('pw.password'))), button(t('common.close'), close, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    draw();
    this.element.append(dialog);
    dialog.showModal();
  }

  /** Forget the opened vault (the changes are kept until saved or closed). */
  private lock(): void {
    if (this.db && !window.confirm(t('pw.lockConfirm'))) return;
    clearInterval(this.codeTimer);
    this.db = undefined;
    this.renderLocked();
  }

  async save(): Promise<Uint8Array> {
    if (!this.db) return this.bytes;
    this.bytes = await saveVault(this.db);
    return this.bytes;
  }

  status(): string {
    return this.db ? t('pw.count', { n: entriesOf(this.db).length }) : t('pw.lockedStatus');
  }

  formatLabel(): string {
    return t('pw.format');
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    if (this.db) this.render();
  }

  destroy(): void {
    clearInterval(this.codeTimer);
    this.db = undefined;
    this.element.remove();
  }
}
