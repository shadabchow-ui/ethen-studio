/**
 * Studio V2 Job 07 — minimal deterministic ZIP (stored, no compression).
 * Handoff bundles need a container; the runtime has no zip dependency, so
 * this module writes method-0 entries deterministically (fixed timestamps,
 * stable order) and reads them back for verification. No encryption,
 * no archives over 4GB, no directory entries.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] as number ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Build a deterministic stored ZIP. Names must be unique, non-empty, and slash-safe. */
export function buildStoredZip(entries: readonly ZipEntryInput[]): Uint8Array {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.name || entry.name.includes("\\") || entry.name.startsWith("/") || entry.name.includes("..")) {
      throw new Error(`EXPORT_ZIP_INVALID: unsafe entry name ${entry.name}.`);
    }
    if (seen.has(entry.name)) throw new Error(`EXPORT_ZIP_INVALID: duplicate entry ${entry.name}.`);
    seen.add(entry.name);
  }
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = utf8Bytes(entry.name);
    const crc = crc32(entry.data);
    const header = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,
      ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0), // fixed DOS time/date: deterministic bytes
      ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(name.length), ...u16(0),
    ]);
    chunks.push(header, name, entry.data);
    central.push(new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,
      ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc), ...u32(entry.data.length), ...u32(entry.data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0),
      ...u32(offset),
    ]), name);
    offset += header.length + name.length + entry.data.length;
  }
  const centralStart = offset;
  const centralBytes = concat(central);
  chunks.push(centralBytes);
  const end = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(centralBytes.length), ...u32(centralStart),
    ...u16(0),
  ]);
  chunks.push(end);
  return concat(chunks);
}

export interface ZipEntryOutput {
  name: string;
  data: Uint8Array;
}

function readU16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error("EXPORT_ZIP_INVALID: truncated header.");
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error("EXPORT_ZIP_INVALID: truncated header.");
  return view.getUint32(offset, true);
}

/** Read back a stored ZIP, verifying CRCs. Throws on any structural or integrity failure. */
export function readStoredZip(bytes: Uint8Array): ZipEntryOutput[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || readU32(view, bytes.length - 22) !== 0x06054b50) {
    throw new Error("EXPORT_ZIP_INVALID: missing end-of-central-directory.");
  }
  // EOCD layout: sig(4) disk(2) cd-disk(2) count-disk(2) count(2) size(4) offset(4) comment(2).
  const count = readU16(view, bytes.length - 14);
  let centralOffset = readU32(view, bytes.length - 6);
  const out: ZipEntryOutput[] = [];
  for (let i = 0; i < count; i += 1) {
    if (readU32(view, centralOffset) !== 0x02014b50) throw new Error("EXPORT_ZIP_INVALID: bad central header.");
    const method = readU16(view, centralOffset + 10);
    if (method !== 0) throw new Error("EXPORT_ZIP_INVALID: only stored entries are supported.");
    const crc = readU32(view, centralOffset + 16);
    const size = readU32(view, centralOffset + 24);
    const nameLength = readU16(view, centralOffset + 28);
    const extraLength = readU16(view, centralOffset + 30);
    const commentLength = readU16(view, centralOffset + 32);
    const localOffset = readU32(view, centralOffset + 42);
    const name = new TextDecoder().decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
    if (readU32(view, localOffset) !== 0x04034b50) throw new Error("EXPORT_ZIP_INVALID: bad local header.");
    const localNameLength = readU16(view, localOffset + 26);
    const localExtraLength = readU16(view, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (data.length !== size) throw new Error("EXPORT_ZIP_INVALID: truncated entry data.");
    if (crc32(data) !== crc) throw new Error(`EXPORT_ZIP_INVALID: CRC mismatch on ${name}.`);
    out.push({ name, data: new Uint8Array(data) });
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}
