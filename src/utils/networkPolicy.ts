/**
 * Pure private-network classification shared by the server and the renderer.
 *
 * The server additionally resolves hostnames before fetching; this helper covers
 * literal IPs, localhost and local suffixes so the UI never sends a direct iframe
 * to an obviously private destination.
 */

/** Expand an IPv6 address into eight 16-bit groups. */
function ipv6Groups(rawAddress: string): number[] | null {
  let address = rawAddress.toLowerCase().split('%')[0];
  if (!address.includes(':')) return null;

  // Accept a dotted IPv4 tail (`::ffff:127.0.0.1`) and normalise it to two
  // hextets so both mapped forms follow the same classification path.
  const dottedTail = address.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedTail) {
    const octets = dottedTail[2].split('.').map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    address = `${dottedTail[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${(
      (octets[2] << 8) |
      octets[3]
    ).toString(16)}`;
  }

  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const parts =
    halves.length === 2
      ? [...left, ...Array.from({ length: missing }, () => '0'), ...right]
      : left;
  if (parts.length !== 8) return null;

  const groups = parts.map((part) =>
    /^[0-9a-f]{1,4}$/.test(part) ? Number.parseInt(part, 16) : Number.NaN
  );
  return groups.every((group) => Number.isFinite(group)) ? groups : null;
}

/** Return the embedded IPv4 address for mapped or IPv4-compatible IPv6. */
function embeddedIpv4(groups: number[]): string | null {
  const mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const compatible = groups.slice(0, 6).every((group) => group === 0);
  if (!mapped && !compatible) return null;
  // `::` and `::1` are IPv6 loopback/unspecified, not embedded IPv4.
  if (compatible && groups[6] === 0 && groups[7] <= 1) return null;
  const high = groups[6];
  const low = groups[7];
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
}

function isPrivateIpv4(address: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return a >= 224;
}

/** RFC1918, loopback, link-local, CGNAT, documentation and reserved ranges. */
export function isPrivateAddress(rawAddress: string): boolean {
  const address = rawAddress.toLowerCase().split('%')[0];
  const groups = ipv6Groups(address);
  if (groups) {
    const embedded = embeddedIpv4(groups);
    if (embedded) return isPrivateIpv4(embedded);
    if (groups.every((group) => group === 0)) return true; // ::
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1

    const first = groups[0];
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
    if (first === 0x2001 && groups[1] === 0x0db8) return true; // documentation
    return false;
  }

  return isPrivateIpv4(address);
}

export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.home.arpa')
  );
}

/** True for HTTP(S) URLs whose literal host is obviously private. */
export function isPrivateTargetUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  return isPrivateHostname(hostname) || isPrivateAddress(hostname);
}
