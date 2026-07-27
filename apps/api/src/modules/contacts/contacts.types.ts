export interface ContactWarning {
  code: 'CONTACT_EMAIL_POSSIBLE_DUPLICATE';
  existingContactId: string;
}

export function normalizeWhitespace(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEmailValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function hasMinimumIdentity(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}): boolean {
  return Boolean(
    normalizeWhitespace(input.firstName) ||
    normalizeWhitespace(input.lastName) ||
    normalizeEmailValue(input.email) ||
    normalizeWhitespace(input.phone),
  );
}

export function displayName(firstName: string | null, lastName: string | null): string | null {
  const name = [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ');
  return name || null;
}

export function buildInitialOpportunityTitle(
  firstName: string | null,
  lastName: string | null,
  phoneNormalized: string | null,
): string {
  const name = displayName(firstName, lastName);
  if (name) {
    return `Interés de ${name}`;
  }
  if (phoneNormalized) {
    return `Lead ${phoneNormalized}`;
  }
  return 'Nuevo lead';
}
