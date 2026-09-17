/** Deterministic ZIP32 writer: stored entries, sorted names, fixed DOS date. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function collect(root, prefix = '') {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collect(root, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported ZIP entry: ${name}`);
  }
  return files.sort();
}
export async function writeZip(root, destination) {
  const names = await collect(root), local = [], central = [];
  if (names.length > 65535) throw new Error('ZIP32 entry limit');
  let offset = 0;
  for (const relative of names) {
    const name = Buffer.from(relative, 'utf8'), data = await readFile(path.join(root, relative));
    if (name.length > 65535 || data.length > 0xffffffff) throw new Error('ZIP32 size limit');
    const checksum = crc32(data), header = Buffer.alloc(30), directory = Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0x21, 12); // 1980-01-01, midnight; never source mtime.
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(0x21, 14); directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    local.push(header, name, data); central.push(directory, name); offset += header.length + name.length + data.length;
    if (offset > 0xffffffff) throw new Error('ZIP32 offset limit');
  }
  const size = central.reduce((n, part) => n + part.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16);
  await writeFile(destination, Buffer.concat([...local, ...central, end]));
  return names;
}
