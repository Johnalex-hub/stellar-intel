'use client';
import { useState, useId } from 'react';
import { buildSep6FormSchema } from '@/lib/stellar/sep6-form';
import type { Sep6FieldDescriptor } from '@/lib/stellar/sep6-form';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Sep6KycFormProps {
  /** Raw SEP-6 field descriptors from a needs_info or /info fields response. */
  fields: Record<string, Sep6FieldDescriptor>;
  /** Anchor's SEP-6 transfer server URL. */
  transferServer: string;
  /** SEP-10 JWT for the authenticated user. */
  jwt: string;
  /** Asset code being withdrawn (e.g. "USDC"). */
  assetCode: string;
  /** Called with the transaction id once submit succeeds — advances state machine. */
  onComplete: (transactionId: string) => void;
  onCancel: () => void;
  onError: (error: Error) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Sep6KycForm({
  fields,
  transferServer,
  jwt,
  assetCode,
  onComplete,
  onCancel,
  onError,
}: Sep6KycFormProps) {
  const idPrefix = useId();
  const { fields: formFields, zodSchema } = buildSep6FormSchema(fields);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(formFields.map((f) => [f.name, '']))
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function setValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = zodSchema.safeParse(values);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key && !errs[key]) errs[key] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/sep6/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transferServer,
          jwt,
          assetCode,
          fields: result.data,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { id?: string };
      if (!data.id) throw new Error('Anchor did not return a transaction id');
      onComplete(data.id);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formFields.map((field) => {
        const inputId = `${idPrefix}-${field.name}`;
        const errorId = `${inputId}-error`;
        const hasError = Boolean(fieldErrors[field.name]);

        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {field.description}
              {!field.optional && (
                <span className="ml-1 text-red-500" aria-hidden="true">
                  *
                </span>
              )}
            </label>

            {field.control === 'select' ? (
              <select
                id={inputId}
                name={field.name}
                value={values[field.name]}
                onChange={(e) => setValue(field.name, e.target.value)}
                aria-required={!field.optional}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white ${
                  hasError
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <option value="">Select…</option>
                {field.choices?.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id={inputId}
                name={field.name}
                value={values[field.name]}
                onChange={(e) => setValue(field.name, e.target.value)}
                aria-required={!field.optional}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white ${
                  hasError
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            )}

            {hasError && (
              <p id={errorId} role="alert" className="text-xs text-red-500 dark:text-red-400">
                {fieldErrors[field.name]}
              </p>
            )}
          </div>
        );
      })}

      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}
