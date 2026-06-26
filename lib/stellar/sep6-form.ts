import { z } from 'zod';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw field descriptor from a SEP-6 /withdraw or needs_info response. */
export interface Sep6FieldDescriptor {
  description: string;
  choices?: string[];
  optional?: boolean;
}

/** The rendered input control type derived from the field descriptor. */
export type Sep6FieldControl = 'text' | 'select';

/** A single generated form field with validator and control type. */
export interface Sep6FormField {
  name: string;
  control: Sep6FieldControl;
  description: string;
  choices?: string[];
  optional: boolean;
  validator: z.ZodTypeAny;
}

/** Generated form schema ready to drive a React form. */
export interface Sep6FormSchema {
  fields: Sep6FormField[];
  zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Generates a form schema from SEP-6 field descriptors.
 *
 * Rules:
 * - Fields with `choices` → select control; validator enforces the enum.
 * - All other fields → text control; validator ensures non-empty string.
 * - `optional: true` fields wrap their validator in z.optional().
 */
export function buildSep6FormSchema(
  descriptors: Record<string, Sep6FieldDescriptor>
): Sep6FormSchema {
  const fields: Sep6FormField[] = [];
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, descriptor] of Object.entries(descriptors)) {
    const isOptional = Boolean(descriptor.optional);
    const hasChoices = Array.isArray(descriptor.choices) && descriptor.choices.length > 0;

    let baseValidator: z.ZodTypeAny;
    let control: Sep6FieldControl;

    if (hasChoices) {
      const choices = descriptor.choices as [string, ...string[]];
      baseValidator = z.enum(choices);
      control = 'select';
    } else {
      baseValidator = z.string().min(1, `${name} is required`);
      control = 'text';
    }

    const validator: z.ZodTypeAny = isOptional
      ? baseValidator.optional()
      : baseValidator;

    fields.push({
      name,
      control,
      description: descriptor.description,
      ...(hasChoices ? { choices: descriptor.choices } : {}),
      optional: isOptional,
      validator,
    });

    shape[name] = validator;
  }

  return {
    fields,
    zodSchema: z.object(shape),
  };
}
