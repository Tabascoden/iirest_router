export function now(): Date {
  return new Date();
}

export function iso(date: Date): string {
  return date.toISOString();
}
