import { SepError, parseSepErrorBody } from './errors';
import type { Sep12CustomerResponse, Sep12CustomerStatus } from '@/types';

// ─── Status normalisation ─────────────────────────────────────────────────────

const VALID_STATUSES = new Set<Sep12CustomerStatus>([
  'ACCEPTED',
  'NEEDS_INFO',
  'PROCESSING',
  'REJECTED',
]);

function normalizeCustomerStatus(raw: unknown): Sep12CustomerStatus {
  if (typeof raw === 'string' && VALID_STATUSES.has(raw as Sep12CustomerStatus)) {
    return raw as Sep12CustomerStatus;
  }
  return 'NEEDS_INFO';
}

// ─── Client ───────────────────────────────────────────────────────────────────

/**
 * Submits KYC fields for a customer via SEP-12 PUT /customer.
 * Returns the anchor-assigned customer id on success.
 */
export async function putCustomer(
  kycServer: string,
  jwt: string,
  fields: Record<string, string>
): Promise<string> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, value);
  }

  const res = await fetch(`${kycServer}/customer`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });

  if (!res.ok) {
    const errBody: unknown =
      typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    throw parseSepErrorBody(errBody, res.status);
  }

  const data = (await res.json()) as { id?: string };
  if (!data.id) {
    throw new SepError('SEP-12 PUT /customer returned no customer id', 'missing_id', res.status, null);
  }
  return data.id;
}

/**
 * Fetches the current KYC status for a customer via SEP-12 GET /customer.
 * `id` is optional — omit it to fetch the status for the authenticated account.
 */
export async function getCustomer(
  kycServer: string,
  jwt: string,
  id?: string
): Promise<Sep12CustomerResponse> {
  const url = new URL(`${kycServer}/customer`);
  if (id) {
    url.searchParams.set('id', id);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    const errBody: unknown =
      typeof res.json === 'function' ? await res.json().catch(() => null) : null;
    throw parseSepErrorBody(errBody, res.status);
  }

  const data = (await res.json()) as Record<string, unknown>;

  return {
    id: typeof data['id'] === 'string' ? data['id'] : undefined,
    status: normalizeCustomerStatus(data['status']),
    fields: data['fields'] as Sep12CustomerResponse['fields'],
    provided_fields: data['provided_fields'] as Sep12CustomerResponse['provided_fields'],
    message: typeof data['message'] === 'string' ? data['message'] : undefined,
  };
}
