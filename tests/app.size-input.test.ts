import { describe, expect, it } from 'vitest';
import { MAX_FONT_SIZE, parseFontSize, sizeInput } from '../src/app/size-input';

describe('UI-016 custom font size', () => {
  it('reads sizes typed in several ways', () => {
    expect(parseFontSize('12')).toBe(12);
    expect(parseFontSize(' 10,5 ')).toBe(10.5);
    expect(parseFontSize('200 pt')).toBe(200);
    expect(parseFontSize('13.3')).toBe(13.5);
    expect(parseFontSize('5000')).toBe(MAX_FONT_SIZE);
    expect(parseFontSize('0.2')).toBe(1);
    expect(parseFontSize('')).toBeNull();
    expect(parseFontSize('big')).toBeNull();
    expect(parseFontSize('-3')).toBeNull();
  });

  it('applies a typed size on Enter, and reverts an invalid one', () => {
    const applied: number[] = [];
    const input = sizeInput({ label: 'Font size', suggestions: [10, 12, 80], onChange: (n) => applied.push(n) });
    document.body.append(input.element);
    const field = input.element.querySelector('input')!;
    expect(input.element.querySelectorAll('datalist option').length).toBe(3);
    input.set(12);
    field.value = '250';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(applied).toEqual([250]);
    expect(field.value).toBe('250');
    field.value = 'abc';
    field.dispatchEvent(new Event('change'));
    expect(applied).toEqual([250]);
    expect(field.value).toBe('250');
  });

  it('steps through the suggested sizes with the arrow keys, beyond the last one', () => {
    const applied: number[] = [];
    const input = sizeInput({ label: 'Font size', suggestions: [10, 12, 80], onChange: (n) => applied.push(n) });
    const field = input.element.querySelector('input')!;
    input.set(11);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(applied).toEqual([12, 80, 96]);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(applied.at(-1)).toBe(80);
  });

  it('shows an empty field for a mixed selection', () => {
    const input = sizeInput({ label: 'Font size', suggestions: [10], onChange: () => undefined });
    input.set(undefined);
    expect(input.element.querySelector('input')!.value).toBe('');
  });
});
