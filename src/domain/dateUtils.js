import { DomainError } from './errors.js';

const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

export function parseIsoDate(value, field, { endOfDay = false } = {}) {
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date`);
  }

  const match = ISO_DATE_PATTERN.exec(value);
  const time = new Date(value).getTime();
  if (!match || Number.isNaN(time)) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date`);
  }

  const [, year, month, day] = match;
  const dateAtUtcMidnight = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (
    dateAtUtcMidnight.getUTCFullYear() !== Number(year) ||
    dateAtUtcMidnight.getUTCMonth() + 1 !== Number(month) ||
    dateAtUtcMidnight.getUTCDate() !== Number(day)
  ) {
    throw new DomainError('VALIDATION', `${field} must be a real date`);
  }

  const isDateOnly = value.length === 10;
  return endOfDay && isDateOnly ? time + 24 * 60 * 60 * 1000 - 1 : time;
}
