const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

export function isValidUUID(s: string): boolean {
  return new RegExp(uuidRegex).test(s);
}
