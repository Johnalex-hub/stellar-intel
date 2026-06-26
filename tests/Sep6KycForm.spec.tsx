import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sep6KycForm } from '@/components/offramp/Sep6KycForm';
import type { Sep6KycFormProps } from '@/components/offramp/Sep6KycForm';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIELDS = {
  full_name: { description: 'Your full legal name' },
  bank_account: { description: 'Bank account number' },
  account_type: {
    description: 'Account type',
    choices: ['checking', 'savings'],
  },
  memo: { description: 'Optional memo', optional: true },
};

function makeProps(overrides: Partial<Sep6KycFormProps> = {}): Sep6KycFormProps {
  return {
    fields: FIELDS,
    transferServer: 'https://cowrie.exchange/sep6',
    jwt: 'test-jwt',
    assetCode: 'USDC',
    onComplete: vi.fn(),
    onCancel: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Sep6KycForm', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('renders a label and input for each field', () => {
    render(<Sep6KycForm {...makeProps()} />);
    expect(screen.getByLabelText(/your full legal name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/bank account number/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /account type/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/optional memo/i)).toBeInTheDocument();
  });

  it('renders a select control for choice fields', () => {
    render(<Sep6KycForm {...makeProps()} />);
    const select = screen.getByRole('combobox', { name: /account type/i });
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'checking' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'savings' })).toBeInTheDocument();
  });

  it('blocks submit and shows errors when required fields are empty', async () => {
    const onComplete = vi.fn();
    render(<Sep6KycForm {...makeProps({ onComplete })} />);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clears a field error once the user types in the field', async () => {
    render(<Sep6KycForm {...makeProps()} />);

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));

    await userEvent.type(screen.getByLabelText(/your full legal name/i), 'Jane Doe');
    await waitFor(() => {
      const alerts = screen.queryAllByRole('alert');
      const nameAlert = alerts.find((el) => el.textContent?.includes('full_name'));
      expect(nameAlert).toBeUndefined();
    });
  });

  it('submits valid data and calls onComplete with transaction id', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'tx-abc-123' }),
    });

    const onComplete = vi.fn();
    render(<Sep6KycForm {...makeProps({ onComplete })} />);

    await userEvent.type(screen.getByLabelText(/your full legal name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/bank account number/i), '0123456789');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /account type/i }),
      'checking'
    );

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith('tx-abc-123'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sep6/withdraw',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('calls onError when the API returns a non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid bank account' }),
    });

    const onError = vi.fn();
    render(<Sep6KycForm {...makeProps({ onError })} />);

    await userEvent.type(screen.getByLabelText(/your full legal name/i), 'Jane Doe');
    await userEvent.type(screen.getByLabelText(/bank account number/i), '0123456789');
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /account type/i }),
      'savings'
    );

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid bank account' }))
    );
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<Sep6KycForm {...makeProps({ onCancel })} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('marks required fields with aria-required', () => {
    render(<Sep6KycForm {...makeProps()} />);
    const nameInput = screen.getByLabelText(/your full legal name/i);
    expect(nameInput).toHaveAttribute('aria-required', 'true');
  });

  it('does not mark optional fields as aria-required', () => {
    render(<Sep6KycForm {...makeProps()} />);
    const memoInput = screen.getByLabelText(/optional memo/i);
    expect(memoInput).toHaveAttribute('aria-required', 'false');
  });
});
