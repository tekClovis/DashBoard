/**
 * Reads one cookie value from a raw `Cookie` header. No dependency on cookie-parser.
 * A value with a malformed percent-escape reads as absent (`null`).
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;

    const key = part.slice(0, eq).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch (err) {
        if (err instanceof URIError) return null;
        throw err;
      }
    }
  }

  return null;
}
