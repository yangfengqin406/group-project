import { isIP } from 'node:net'
import { networkInterfaces } from 'node:os'

// APIPA addresses can appear before the connected Wi-Fi adapter on Windows.
// Keep loopback usable, but never choose an unconfigured adapter as publicHost.
export function localAddresses(interfaces = networkInterfaces()) {
  const addresses = new Set(['127.0.0.1', 'localhost'])
  for (const rows of Object.values(interfaces || {})) {
    for (const row of Array.isArray(rows) ? rows : []) {
      const address = row?.address
      if (!row || row.internal || !['IPv4', 4].includes(row.family) || typeof address !== 'string' || isIP(address) !== 4 ||
        address === '0.0.0.0' || address.startsWith('127.') || address.startsWith('169.254.')) continue
      addresses.add(address)
    }
  }
  return [...addresses]
}
