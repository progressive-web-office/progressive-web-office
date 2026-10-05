// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseTotp, totp } from '../src/vault/totp';
import { entropyBits, generatePassword } from '../src/vault/generator';
import { deleteEntry, entriesOf, fieldOf, groupsOf, isKdbx, newEntry, newGroup, newVault, openVault, saveVault, setFields, setTags, WrongKeyError } from '../src/vault/kdbx';

// VAULT-001, VAULT-003: vaults of passwords in the KDBX format, one-time codes, generated passwords.

const ascii = (s: string) => new TextEncoder().encode(s);

describe('VAULT-003 one-time codes', () => {
  it('gives the codes of RFC 6238', async () => {
    const at = async (secret: string, algorithm: 'SHA-1' | 'SHA-256' | 'SHA-512', seconds: number) => (await totp({ secret: ascii(secret), digits: 8, period: 30, algorithm }, seconds * 1000)).code;
    expect(await at('12345678901234567890', 'SHA-1', 59)).toBe('94287082');
    expect(await at('12345678901234567890', 'SHA-1', 1111111109)).toBe('07081804');
    expect(await at('12345678901234567890123456789012', 'SHA-256', 59)).toBe('46119246');
    expect(await at('1234567890123456789012345678901234567890123456789012345678901234', 'SHA-512', 59)).toBe('90693936');
    expect((await totp({ secret: ascii('x'), digits: 6, period: 30, algorithm: 'SHA-1' }, 59_000)).remaining).toBe(1);
  });

  it('reads otpauth addresses and base32 secrets', () => {
    const p = parseTotp('otpauth://totp/Mail:ada@example.org?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Mail&digits=8&period=60&algorithm=SHA256')!;
    expect([Array.from(p.secret), p.digits, p.period, p.algorithm]).toEqual([Array.from(ascii('12345678901234567890')), 8, 60, 'SHA-256']);
    expect(parseTotp('gezd gnbv gy3t qojq')).toMatchObject({ digits: 6, period: 30, algorithm: 'SHA-1' });
    expect(parseTotp('otpauth://hotp/x?secret=GEZD')).toBeUndefined();
    expect(parseTotp('not a secret!')).toBeUndefined();
  });
});

describe('VAULT-003 generated passwords', () => {
  it('draws passwords of the length and classes asked for', () => {
    const p = generatePassword({ length: 24, lower: true, upper: true, digits: true, symbols: false, unambiguous: true });
    expect(p).toHaveLength(24);
    expect(p).toMatch(/[a-z]/);
    expect(p).toMatch(/[A-Z]/);
    expect(p).toMatch(/\d/);
    expect(p).not.toMatch(/[^a-zA-Z\d]|[0Oo1lI]/);
    expect(new Set(Array.from({ length: 20 }, () => generatePassword())).size).toBe(20);
    expect(entropyBits('correcthorsebatterystaple')).toBe(118);
    expect(() => generatePassword({ length: 8, lower: false, upper: false, digits: false, symbols: false, unambiguous: false })).toThrow();
  });
});

describe('VAULT-001 KDBX vaults', () => {
  it('makes a vault, saves it, opens it again with its password only', async () => {
    const db = await newVault('Mine', 'correct horse battery staple');
    const work = newGroup(db, undefined, 'Work');
    const mail = newEntry(db, work, 'Mail');
    setFields(db, mail, { UserName: 'ada@example.org', Password: 's3cret!', URL: 'https://mail.example.org', otp: 'otpauth://totp/Mail?secret=GEZDGNBVGY3TQOJQ' });
    setTags(db, mail, ['work', 'mail']);
    const bank = newEntry(db, undefined, 'Bank');
    setFields(db, bank, { Password: 'p4ss', 'Customer number': '12345' });
    const bytes = await saveVault(db);
    expect(isKdbx(bytes)).toBe(true);
    expect(isKdbx(ascii('PK not a vault'))).toBe(false);
    // The password nowhere in the file.
    expect(new TextDecoder('latin1').decode(bytes)).not.toContain('s3cret');

    await expect(openVault(bytes, 'wrong')).rejects.toBeInstanceOf(WrongKeyError);
    const back = await openVault(bytes, 'correct horse battery staple');
    expect(back.header.kdfParameters?.get('M')).toBeTruthy();
    expect(groupsOf(back).map((g) => [g.name, g.depth, g.recycle])).toEqual([
      ['Mine', 0, false],
      ['Recycle Bin', 1, true],
      ['Work', 1, false],
    ]);
    const all = entriesOf(back);
    expect(all.map((e) => [e.title, e.username, e.tags])).toEqual([
      ['Bank', '', []],
      ['Mail', 'ada@example.org', ['work', 'mail']],
    ]);
    expect(all[1]!.fields).toEqual([{ name: 'otp', protected: true }]);
    expect(all[0]!.fields).toEqual([{ name: 'Customer number', protected: false }]);
    expect(fieldOf(back, all[1]!.uuid, 'Password')).toBe('s3cret!');
    expect(entriesOf(back, groupsOf(back)[2]!.uuid).map((e) => e.title)).toEqual(['Mail']);

    // Deleted: to the recycle bin, out of the entries.
    deleteEntry(back, all[0]!.uuid);
    expect(entriesOf(back).map((e) => e.title)).toEqual(['Mail']);
    expect(entriesOf(back, groupsOf(back)[1]!.uuid).map((e) => e.title)).toEqual(['Bank']);
  }, 30_000);
});
