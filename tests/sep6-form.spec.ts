import { describe, it, expect } from 'vitest';
import { buildSep6FormSchema } from '@/lib/stellar/sep6-form';
import type { Sep6FieldDescriptor } from '@/lib/stellar/sep6-form';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FOUR_FIELD_DESCRIPTORS: Record<string, Sep6FieldDescriptor> = {
  full_name: { description: 'Your full legal name' },
  bank_account: { description: 'Bank account number' },
  account_type: {
    description: 'Type of bank account',
    choices: ['checking', 'savings'],
  },
  memo: { description: 'Optional memo for the transfer', optional: true },
};

// ─── buildSep6FormSchema ──────────────────────────────────────────────────────

describe('buildSep6FormSchema', () => {
  it('produces one field entry per descriptor key', () => {
    const schema = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    expect(schema.fields).toHaveLength(4);
  });

  it('maps text fields to "text" control', () => {
    const schema = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const nameField = schema.fields.find((f) => f.name === 'full_name');
    expect(nameField?.control).toBe('text');
  });

  it('maps choice fields to "select" control and exposes choices', () => {
    const schema = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const typeField = schema.fields.find((f) => f.name === 'account_type');
    expect(typeField?.control).toBe('select');
    expect(typeField?.choices).toEqual(['checking', 'savings']);
  });

  it('marks optional fields correctly', () => {
    const schema = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const memo = schema.fields.find((f) => f.name === 'memo');
    const nameField = schema.fields.find((f) => f.name === 'full_name');
    expect(memo?.optional).toBe(true);
    expect(nameField?.optional).toBe(false);
  });

  it('rejects empty required text field', () => {
    const { zodSchema } = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const result = zodSchema.safeParse({
      full_name: '',
      bank_account: '123456',
      account_type: 'checking',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid enum value for choice field', () => {
    const { zodSchema } = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const result = zodSchema.safeParse({
      full_name: 'Jane Doe',
      bank_account: '123456789',
      account_type: 'wire', // not in choices
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid data for all four fields', () => {
    const { zodSchema } = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const result = zodSchema.safeParse({
      full_name: 'Jane Doe',
      bank_account: '123456789',
      account_type: 'savings',
      memo: 'Test transfer',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid data when optional field is omitted', () => {
    const { zodSchema } = buildSep6FormSchema(FOUR_FIELD_DESCRIPTORS);
    const result = zodSchema.safeParse({
      full_name: 'Jane Doe',
      bank_account: '123456789',
      account_type: 'checking',
    });
    expect(result.success).toBe(true);
  });

  it('handles empty descriptor record without throwing', () => {
    const schema = buildSep6FormSchema({});
    expect(schema.fields).toHaveLength(0);
    const result = schema.zodSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
