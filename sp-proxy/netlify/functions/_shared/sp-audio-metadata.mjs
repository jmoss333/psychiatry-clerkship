import { OperationalError, operationalError } from './sp-http.mjs';

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_DURATION_MILLISECONDS = 90_000;
const MAX_DURATION_MICROSECONDS = 90_000_000n;
const MAX_DURATION_NANOSECONDS = 90_000_000_000n;
const MAX_WEBM_TRACKS = 64;
const MAX_WEBM_CLUSTERS = 40_000;
const MAX_WEBM_BLOCKS = 40_000;
const MAX_OPUS_PACKETS = 36_000;
const UNKNOWN_EBML_SIZE = Symbol('unknown-ebml-size');
const UNKNOWN_OGG_GRANULE = 0xffffffffffffffffn;

const MIME_TO_CONTAINER = new Map([
  ['audio/wav', 'wav'],
  ['audio/ogg', 'ogg'],
  ['audio/ogg;codecs=opus', 'ogg'],
  ['audio/webm', 'webm'],
  ['audio/webm;codecs=opus', 'webm'],
]);

const OGG_CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index << 24;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 0x80000000
      ? ((value << 1) ^ 0x04c11db7) >>> 0
      : (value << 1) >>> 0;
  }
  return value >>> 0;
}));

const EBML_IDS = Object.freeze({
  EBML: 0x1a45dfa3,
  DOC_TYPE: 0x4282,
  SEGMENT: 0x18538067,
  INFO: 0x1549a966,
  TIMECODE_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_TYPE: 0x83,
  CODEC_ID: 0x86,
  CLUSTER: 0x1f43b675,
  TIMESTAMP: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  BLOCK_GROUP: 0xa0,
  BLOCK: 0xa1,
  BLOCK_DURATION: 0x9b,
});

function unsupportedAudio() {
  return operationalError(415, 'unsupported_audio', 'The audio format is not supported.');
}

function invalidAudio() {
  return operationalError(422, 'invalid_audio', 'The audio file is invalid.');
}

function audioTooLong() {
  return operationalError(422, 'audio_too_long', 'The recording must be 90 seconds or shorter.');
}

function audioTooLarge() {
  return operationalError(413, 'audio_too_large', 'The audio file is too large.');
}

function requireRange(bytes, offset, length, end = bytes.length) {
  if (
    !Number.isSafeInteger(offset)
    || !Number.isSafeInteger(length)
    || offset < 0
    || length < 0
    || offset + length > end
    || end > bytes.length
  ) {
    throw invalidAudio();
  }
}

function textAt(bytes, offset, length) {
  requireRange(bytes, offset, length);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(bytes[offset + index]);
  }
  return value;
}

function u16le(bytes, offset) {
  requireRange(bytes, offset, 2);
  return bytes[offset] + (bytes[offset + 1] * 0x100);
}

function u32le(bytes, offset) {
  requireRange(bytes, offset, 4);
  return (
    bytes[offset]
    + (bytes[offset + 1] * 0x100)
    + (bytes[offset + 2] * 0x10000)
    + (bytes[offset + 3] * 0x1000000)
  );
}

function unsignedBigEndian(bytes, offset, length) {
  requireRange(bytes, offset, length);
  if (length < 1 || length > 8) throw invalidAudio();
  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function unsignedLittleEndian(bytes, offset, length) {
  requireRange(bytes, offset, length);
  if (length < 1 || length > 8) throw invalidAudio();
  let value = 0n;
  for (let index = length - 1; index >= 0; index -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function ceilRatio(numerator, denominator) {
  if (numerator <= 0n || denominator <= 0n) throw invalidAudio();
  return (numerator + denominator - 1n) / denominator;
}

function durationNumber(milliseconds) {
  const value = typeof milliseconds === 'bigint'
    ? milliseconds
    : BigInt(milliseconds);
  if (value <= 0n) throw invalidAudio();
  if (value > BigInt(MAX_DURATION_MILLISECONDS)) throw audioTooLong();
  return Number(value);
}

function sniffContainer(bytes) {
  if (bytes.length >= 12 && textAt(bytes, 0, 4) === 'RIFF' && textAt(bytes, 8, 4) === 'WAVE') {
    return 'wav';
  }
  if (bytes.length >= 4 && textAt(bytes, 0, 4) === 'OggS') return 'ogg';
  if (bytes.length >= 8 && textAt(bytes, 4, 4) === 'ftyp') return 'mp4';
  if (
    bytes.length >= 4
    && bytes[0] === 0x1a
    && bytes[1] === 0x45
    && bytes[2] === 0xdf
    && bytes[3] === 0xa3
  ) {
    return 'webm';
  }
  return null;
}

function parseWav(bytes) {
  requireRange(bytes, 0, 12);
  const riffEnd = u32le(bytes, 4) + 8;
  if (riffEnd !== bytes.length) throw invalidAudio();

  let offset = 12;
  let format = null;
  let dataBytes = 0n;
  while (offset < riffEnd) {
    requireRange(bytes, offset, 8, riffEnd);
    const type = textAt(bytes, offset, 4);
    const size = u32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    requireRange(bytes, dataOffset, size, riffEnd);

    if (type === 'fmt ') {
      if (format !== null || size < 16) throw invalidAudio();
      const formatTag = u16le(bytes, dataOffset);
      const channels = u16le(bytes, dataOffset + 2);
      const sampleRate = u32le(bytes, dataOffset + 4);
      const byteRate = u32le(bytes, dataOffset + 8);
      const blockAlign = u16le(bytes, dataOffset + 12);
      const bitsPerSample = u16le(bytes, dataOffset + 14);
      const validBits = formatTag === 1
        ? new Set([8, 16, 24, 32])
        : formatTag === 3
          ? new Set([32, 64])
          : null;
      if (
        validBits === null
        || channels < 1
        || channels > 8
        || sampleRate < 1
        || !validBits.has(bitsPerSample)
        || bitsPerSample % 8 !== 0
      ) {
        throw invalidAudio();
      }
      const expectedBlockAlign = channels * (bitsPerSample / 8);
      const expectedByteRate = sampleRate * expectedBlockAlign;
      if (
        blockAlign !== expectedBlockAlign
        || byteRate !== expectedByteRate
        || byteRate < 1
        || byteRate > 0xffffffff
      ) {
        throw invalidAudio();
      }
      format = { byteRate, blockAlign };
    } else if (type === 'data') {
      if (size === 0) throw invalidAudio();
      dataBytes += BigInt(size);
    }

    const paddedSize = size + (size % 2);
    requireRange(bytes, dataOffset, paddedSize, riffEnd);
    offset = dataOffset + paddedSize;
  }

  if (offset !== riffEnd || format === null || dataBytes <= 0n) throw invalidAudio();
  if (dataBytes % BigInt(format.blockAlign) !== 0n) throw invalidAudio();
  return durationNumber(ceilRatio(dataBytes * 1_000n, BigInt(format.byteRate)));
}

function parseOpusHead(packet) {
  if (
    packet.length !== 19
    || textAt(packet, 0, 8) !== 'OpusHead'
    || packet[8] !== 1
    || packet[9] < 1
    || packet[9] > 2
    || packet[18] !== 0
  ) {
    throw invalidAudio();
  }
  return u16le(packet, 10);
}

function parseOpusTags(packet) {
  if (packet.length < 16 || textAt(packet, 0, 8) !== 'OpusTags') throw invalidAudio();
  const vendorLength = u32le(packet, 8);
  let offset = 12;
  requireRange(packet, offset, vendorLength);
  offset += vendorLength;
  requireRange(packet, offset, 4);
  const commentCount = u32le(packet, offset);
  offset += 4;
  if (commentCount > Math.floor((packet.length - offset) / 4)) throw invalidAudio();
  for (let comment = 0; comment < commentCount; comment += 1) {
    requireRange(packet, offset, 4);
    const commentLength = u32le(packet, offset);
    offset += 4;
    requireRange(packet, offset, commentLength);
    offset += commentLength;
  }
  if (offset !== packet.length) throw invalidAudio();
}

function validateOggPageCrc(bytes, start, end) {
  const stored = u32le(bytes, start + 22);
  let crc = 0;
  for (let offset = start; offset < end; offset += 1) {
    const value = offset >= start + 22 && offset < start + 26 ? 0 : bytes[offset];
    const lookup = ((crc >>> 24) ^ value) & 0xff;
    crc = (((crc << 8) >>> 0) ^ OGG_CRC_TABLE[lookup]) >>> 0;
  }
  if (crc !== stored) throw invalidAudio();
}

function parseOgg(bytes) {
  let offset = 0;
  let serial = null;
  let expectedSequence = 0;
  let previousGranule = 0n;
  let finalGranule = null;
  let preSkip = null;
  let packetCount = 0;
  let packetParts = [];
  let packetLength = 0;
  let sawEnd = false;
  let audioPacketCount = 0;
  let audioDurationMicroseconds = 0n;

  while (offset < bytes.length) {
    requireRange(bytes, offset, 27);
    if (textAt(bytes, offset, 4) !== 'OggS' || bytes[offset + 4] !== 0) throw invalidAudio();
    const flags = bytes[offset + 5];
    if ((flags & ~0x07) !== 0 || sawEnd) throw invalidAudio();
    const granule = unsignedLittleEndian(bytes, offset + 6, 8);
    const pageSerial = u32le(bytes, offset + 14);
    const sequence = u32le(bytes, offset + 18);
    const segmentCount = bytes[offset + 26];
    if (segmentCount === 0) throw invalidAudio();
    const tableOffset = offset + 27;
    requireRange(bytes, tableOffset, segmentCount);
    let payloadLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      payloadLength += bytes[tableOffset + index];
    }
    const payloadOffset = tableOffset + segmentCount;
    requireRange(bytes, payloadOffset, payloadLength);
    const pageEnd = payloadOffset + payloadLength;
    validateOggPageCrc(bytes, offset, pageEnd);
    const expectsContinuation = packetLength > 0;
    if (((flags & 0x01) !== 0) !== expectsContinuation) throw invalidAudio();

    if (serial === null) {
      if ((flags & 0x02) === 0 || (flags & 0x01) !== 0 || sequence !== 0) throw invalidAudio();
      serial = pageSerial;
    } else if (
      pageSerial !== serial
      || sequence !== expectedSequence
      || (flags & 0x02) !== 0
    ) {
      throw invalidAudio();
    }
    expectedSequence = (sequence + 1) >>> 0;

    if (granule !== UNKNOWN_OGG_GRANULE) {
      if (granule < previousGranule) throw invalidAudio();
      previousGranule = granule;
    }

    let cursor = payloadOffset;
    for (let index = 0; index < segmentCount; index += 1) {
      const partLength = bytes[tableOffset + index];
      const part = bytes.subarray(cursor, cursor + partLength);
      packetParts.push(part);
      packetLength += partLength;
      if (packetLength > 65_535) throw invalidAudio();
      cursor += partLength;
      if (partLength < 255) {
        const packet = new Uint8Array(packetLength);
        let packetOffset = 0;
        for (const packetPart of packetParts) {
          packet.set(packetPart, packetOffset);
          packetOffset += packetPart.length;
        }
        packetCount += 1;
        if (packetCount === 1) {
          preSkip = parseOpusHead(packet);
        } else if (packetCount === 2) {
          parseOpusTags(packet);
        } else {
          audioPacketCount += 1;
          if (audioPacketCount > MAX_OPUS_PACKETS) throw audioTooLong();
          audioDurationMicroseconds += BigInt(opusPacketDurationMicroseconds(packet));
          if (audioDurationMicroseconds > MAX_DURATION_MICROSECONDS) throw audioTooLong();
        }
        packetParts = [];
        packetLength = 0;
      }
    }

    if (sequence === 0) {
      if (
        packetCount !== 1
        || packetLength !== 0
        || segmentCount !== 1
        || bytes[tableOffset] !== 19
        || granule !== 0n
        || (flags & 0x04) !== 0
      ) {
        throw invalidAudio();
      }
    }
    if (audioPacketCount === 0 && granule !== 0n) throw invalidAudio();

    if ((flags & 0x04) !== 0) {
      if (pageEnd !== bytes.length || granule === UNKNOWN_OGG_GRANULE) throw invalidAudio();
      finalGranule = granule;
      sawEnd = true;
    }
    offset = pageEnd;
  }

  if (
    offset !== bytes.length
    || !sawEnd
    || packetParts.length !== 0
    || packetCount < 3
    || audioPacketCount < 1
    || preSkip === null
    || finalGranule === null
    || finalGranule <= BigInt(preSkip)
  ) {
    throw invalidAudio();
  }
  const samples = finalGranule - BigInt(preSkip);
  const granuleMilliseconds = ceilRatio(samples * 1_000n, 48_000n);
  const packetMilliseconds = ceilRatio(audioDurationMicroseconds, 1_000n);
  return durationNumber(
    granuleMilliseconds > packetMilliseconds ? granuleMilliseconds : packetMilliseconds,
  );
}

function vintLength(firstByte, maximumLength) {
  if (firstByte === 0) throw invalidAudio();
  let mask = 0x80;
  let length = 1;
  while ((firstByte & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > maximumLength) throw invalidAudio();
  return { length, mask };
}

function readEbmlId(bytes, offset, end) {
  requireRange(bytes, offset, 1, end);
  const { length } = vintLength(bytes[offset], 4);
  requireRange(bytes, offset, length, end);
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value * 256) + bytes[offset + index];
  }
  return { value, length };
}

function readEbmlVint(bytes, offset, end, { signed = false } = {}) {
  requireRange(bytes, offset, 1, end);
  const { length, mask } = vintLength(bytes[offset], 8);
  requireRange(bytes, offset, length, end);
  let value = BigInt(bytes[offset] & (mask - 1));
  for (let index = 1; index < length; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  const bits = BigInt(7 * length);
  const unknown = value === ((1n << bits) - 1n);
  if (unknown) return { value: UNKNOWN_EBML_SIZE, length };
  if (signed) {
    const bias = (1n << (bits - 1n)) - 1n;
    value -= bias;
  }
  return { value, length };
}

function readEbmlElement(bytes, offset, end, { allowUnknownSize = false } = {}) {
  const id = readEbmlId(bytes, offset, end);
  const size = readEbmlVint(bytes, offset + id.length, end);
  const dataOffset = offset + id.length + size.length;
  if (size.value === UNKNOWN_EBML_SIZE) {
    if (!allowUnknownSize) throw invalidAudio();
    return { id: id.value, dataOffset, end, unknownSize: true };
  }
  if (size.value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAudio();
  const dataEnd = dataOffset + Number(size.value);
  requireRange(bytes, dataOffset, Number(size.value), end);
  return { id: id.value, dataOffset, end: dataEnd, unknownSize: false };
}

function readEbmlUnsigned(bytes, element) {
  const length = element.end - element.dataOffset;
  return unsignedBigEndian(bytes, element.dataOffset, length);
}

function readEbmlText(bytes, element) {
  const length = element.end - element.dataOffset;
  if (length < 1 || length > 64) throw invalidAudio();
  return textAt(bytes, element.dataOffset, length);
}

function parseEbmlHeader(bytes, element) {
  let offset = element.dataOffset;
  let docType = null;
  while (offset < element.end) {
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.DOC_TYPE) {
      if (docType !== null) throw invalidAudio();
      docType = readEbmlText(bytes, child);
    }
    offset = child.end;
  }
  if (offset !== element.end || docType !== 'webm') throw invalidAudio();
}

function parseWebmInfo(bytes, element) {
  let offset = element.dataOffset;
  let timecodeScale = null;
  let duration = null;
  while (offset < element.end) {
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.TIMECODE_SCALE) {
      if (timecodeScale !== null) throw invalidAudio();
      const value = readEbmlUnsigned(bytes, child);
      if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAudio();
      timecodeScale = value;
    } else if (child.id === EBML_IDS.DURATION) {
      if (duration !== null) throw invalidAudio();
      const size = child.end - child.dataOffset;
      if (size !== 4 && size !== 8) throw invalidAudio();
      const view = new DataView(bytes.buffer, bytes.byteOffset + child.dataOffset, size);
      duration = size === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
      if (!Number.isFinite(duration) || duration <= 0) throw invalidAudio();
    }
    offset = child.end;
  }
  if (offset !== element.end) throw invalidAudio();
  return { timecodeScale, duration };
}

function parseTrackEntry(bytes, element) {
  let offset = element.dataOffset;
  let number = null;
  let type = null;
  let codec = null;
  while (offset < element.end) {
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.TRACK_NUMBER) {
      if (number !== null) throw invalidAudio();
      const value = readEbmlUnsigned(bytes, child);
      if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAudio();
      number = Number(value);
    } else if (child.id === EBML_IDS.TRACK_TYPE) {
      if (type !== null) throw invalidAudio();
      const value = readEbmlUnsigned(bytes, child);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAudio();
      type = Number(value);
    } else if (child.id === EBML_IDS.CODEC_ID) {
      if (codec !== null) throw invalidAudio();
      codec = readEbmlText(bytes, child);
    }
    offset = child.end;
  }
  if (offset !== element.end || number === null || type === null || codec === null) {
    throw invalidAudio();
  }
  return { number, type, codec };
}

function parseWebmTracks(bytes, element) {
  let offset = element.dataOffset;
  const entries = [];
  while (offset < element.end) {
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.TRACK_ENTRY) {
      if (entries.length >= MAX_WEBM_TRACKS) throw invalidAudio();
      entries.push(parseTrackEntry(bytes, child));
    }
    offset = child.end;
  }
  if (offset !== element.end || entries.length === 0) throw invalidAudio();
  return entries;
}

function parseBlockGroup(bytes, element) {
  let offset = element.dataOffset;
  let block = null;
  let blockDuration = null;
  while (offset < element.end) {
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.BLOCK) {
      if (block !== null) throw invalidAudio();
      block = bytes.subarray(child.dataOffset, child.end);
    } else if (child.id === EBML_IDS.BLOCK_DURATION) {
      if (blockDuration !== null) throw invalidAudio();
      blockDuration = readEbmlUnsigned(bytes, child);
      if (blockDuration <= 0n) throw invalidAudio();
    }
    offset = child.end;
  }
  if (offset !== element.end || block === null) throw invalidAudio();
  return { bytes: block, blockDuration };
}

function isSegmentLevelId(id) {
  return id === EBML_IDS.INFO || id === EBML_IDS.TRACKS || id === EBML_IDS.CLUSTER;
}

function parseWebmCluster(bytes, element, parentEnd, state) {
  let offset = element.dataOffset;
  let timestamp = null;
  let sawBlock = false;
  while (offset < element.end) {
    const childId = readEbmlId(bytes, offset, element.end).value;
    if (element.unknownSize && isSegmentLevelId(childId)) break;
    const child = readEbmlElement(bytes, offset, element.end);
    if (child.id === EBML_IDS.TIMESTAMP) {
      if (timestamp !== null || sawBlock) throw invalidAudio();
      timestamp = readEbmlUnsigned(bytes, child);
    } else if (child.id === EBML_IDS.SIMPLE_BLOCK) {
      if (timestamp === null) throw invalidAudio();
      sawBlock = true;
      processWebmBlock({
        blockBytes: bytes.subarray(child.dataOffset, child.end),
        blockDuration: null,
        clusterTimestamp: timestamp,
        state,
      });
    } else if (child.id === EBML_IDS.BLOCK_GROUP) {
      if (timestamp === null) throw invalidAudio();
      sawBlock = true;
      const group = parseBlockGroup(bytes, child);
      processWebmBlock({
        blockBytes: group.bytes,
        blockDuration: group.blockDuration,
        clusterTimestamp: timestamp,
        state,
      });
    }
    offset = child.end;
  }
  if (!element.unknownSize && offset !== element.end) throw invalidAudio();
  if (offset > parentEnd || timestamp === null) throw invalidAudio();
  return { nextOffset: offset };
}

function splitLacedPackets(block, offset, end, lacing) {
  if (offset >= end) throw invalidAudio();
  if (lacing === 0) return [block.subarray(offset, end)];

  const packetCount = block[offset] + 1;
  offset += 1;
  if (packetCount < 2) throw invalidAudio();
  const sizes = [];

  if (lacing === 1) {
    for (let packet = 0; packet < packetCount - 1; packet += 1) {
      let size = 0;
      while (true) {
        if (offset >= end) throw invalidAudio();
        const part = block[offset];
        offset += 1;
        size += part;
        if (part !== 255) break;
      }
      sizes.push(size);
    }
  } else if (lacing === 2) {
    const remaining = end - offset;
    if (remaining <= 0 || remaining % packetCount !== 0) throw invalidAudio();
    sizes.push(...Array(packetCount - 1).fill(remaining / packetCount));
  } else if (lacing === 3) {
    const first = readEbmlVint(block, offset, end);
    if (first.value === UNKNOWN_EBML_SIZE || first.value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw invalidAudio();
    }
    let previous = Number(first.value);
    if (previous <= 0) throw invalidAudio();
    sizes.push(previous);
    offset += first.length;
    for (let packet = 1; packet < packetCount - 1; packet += 1) {
      const difference = readEbmlVint(block, offset, end, { signed: true });
      if (difference.value === UNKNOWN_EBML_SIZE) throw invalidAudio();
      const next = BigInt(previous) + difference.value;
      if (next <= 0n || next > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAudio();
      previous = Number(next);
      sizes.push(previous);
      offset += difference.length;
    }
  } else {
    throw invalidAudio();
  }

  const used = sizes.reduce((sum, size) => sum + size, 0);
  const finalSize = end - offset - used;
  if (finalSize <= 0) throw invalidAudio();
  sizes.push(finalSize);
  const packets = [];
  for (const size of sizes) {
    if (!Number.isSafeInteger(size) || size <= 0 || offset + size > end) throw invalidAudio();
    packets.push(block.subarray(offset, offset + size));
    offset += size;
  }
  if (offset !== end) throw invalidAudio();
  return packets;
}

function opusPacketDurationMicroseconds(packet) {
  if (packet.length < 1) throw invalidAudio();
  const toc = packet[0];
  const configuration = toc >>> 3;
  let frameDuration;
  if (configuration >= 16) {
    frameDuration = 2_500 * (2 ** (configuration & 0x03));
  } else if (configuration >= 12) {
    frameDuration = 10_000 * (2 ** (configuration & 0x01));
  } else if ((configuration & 0x03) === 3) {
    frameDuration = 60_000;
  } else {
    frameDuration = 10_000 * (2 ** (configuration & 0x03));
  }

  const frameCode = toc & 0x03;
  let frameCount;
  if (frameCode === 0) frameCount = 1;
  else if (frameCode === 1 || frameCode === 2) frameCount = 2;
  else {
    if (packet.length < 2) throw invalidAudio();
    frameCount = packet[1] & 0x3f;
    if (frameCount < 1) throw invalidAudio();
  }
  const duration = frameDuration * frameCount;
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > 120_000) {
    throw invalidAudio();
  }
  return duration;
}

function parseWebmBlock(block, opusTracks) {
  const track = readEbmlVint(block, 0, block.length);
  if (
    track.value === UNKNOWN_EBML_SIZE
    || track.value <= 0n
    || track.value > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw invalidAudio();
  }
  let offset = track.length;
  requireRange(block, offset, 3);
  const relativeTimestamp = new DataView(
    block.buffer,
    block.byteOffset + offset,
    2,
  ).getInt16(0, false);
  offset += 2;
  const flags = block[offset];
  offset += 1;
  const lacing = (flags & 0x06) >>> 1;
  const packets = splitLacedPackets(block, offset, block.length, lacing);
  const trackNumber = Number(track.value);
  if (!opusTracks.has(trackNumber)) return null;
  let durationMicroseconds = 0;
  for (const packet of packets) durationMicroseconds += opusPacketDurationMicroseconds(packet);
  return {
    trackNumber,
    relativeTimestamp,
    packetCount: packets.length,
    durationMicroseconds,
  };
}

function processWebmBlock({
  blockBytes,
  blockDuration,
  clusterTimestamp,
  state,
}) {
  state.totalBlocks += 1;
  if (state.totalBlocks > MAX_WEBM_BLOCKS) throw invalidAudio();
  const block = parseWebmBlock(blockBytes, state.opusTracks);
  if (block === null) return;

  state.opusBlockCount += 1;
  state.audioPacketCount += block.packetCount;
  if (state.audioPacketCount > MAX_OPUS_PACKETS) throw audioTooLong();

  const previousWork = state.trackWorkMicroseconds.get(block.trackNumber) ?? 0n;
  const nextWork = previousWork + BigInt(block.durationMicroseconds);
  if (nextWork > MAX_DURATION_MICROSECONDS) throw audioTooLong();
  state.trackWorkMicroseconds.set(block.trackNumber, nextWork);

  const startTicks = clusterTimestamp + BigInt(block.relativeTimestamp);
  if (startTicks < 0n) throw invalidAudio();
  const packetNanoseconds = BigInt(block.durationMicroseconds) * 1_000n;
  const declaredNanoseconds = blockDuration === null
    ? 0n
    : blockDuration * state.timecodeScale;
  const blockNanoseconds = packetNanoseconds > declaredNanoseconds
    ? packetNanoseconds
    : declaredNanoseconds;
  const endNanoseconds = (startTicks * state.timecodeScale) + blockNanoseconds;
  if (endNanoseconds > MAX_DURATION_NANOSECONDS) throw audioTooLong();
  if (endNanoseconds > state.maximumEndNanoseconds) {
    state.maximumEndNanoseconds = endNanoseconds;
  }
}

function parseWebm(bytes) {
  let offset = 0;
  const header = readEbmlElement(bytes, offset, bytes.length);
  if (header.id !== EBML_IDS.EBML) throw invalidAudio();
  parseEbmlHeader(bytes, header);
  offset = header.end;

  const segment = readEbmlElement(bytes, offset, bytes.length, { allowUnknownSize: true });
  if (segment.id !== EBML_IDS.SEGMENT) throw invalidAudio();
  if (!segment.unknownSize && segment.end !== bytes.length) throw invalidAudio();
  const segmentEnd = segment.unknownSize ? bytes.length : segment.end;
  offset = segment.dataOffset;

  let timecodeScale = 1_000_000n;
  let infoDuration = null;
  let sawInfo = false;
  let sawTracks = false;
  let sawCluster = false;
  let clusterCount = 0;
  const state = {
    timecodeScale,
    opusTracks: new Set(),
    trackWorkMicroseconds: new Map(),
    totalBlocks: 0,
    audioPacketCount: 0,
    opusBlockCount: 0,
    maximumEndNanoseconds: 0n,
  };
  while (offset < segmentEnd) {
    const id = readEbmlId(bytes, offset, segmentEnd).value;
    const allowUnknownSize = id === EBML_IDS.CLUSTER;
    const child = readEbmlElement(bytes, offset, segmentEnd, { allowUnknownSize });
    if (child.id === EBML_IDS.INFO) {
      if (sawInfo || sawCluster || child.unknownSize) throw invalidAudio();
      sawInfo = true;
      const info = parseWebmInfo(bytes, child);
      if (info.timecodeScale !== null) timecodeScale = info.timecodeScale;
      state.timecodeScale = timecodeScale;
      infoDuration = info.duration;
      if (infoDuration !== null) {
        const scaled = (infoDuration * Number(timecodeScale)) / 1_000_000;
        if (!Number.isFinite(scaled) || scaled <= 0) throw invalidAudio();
        if (Math.ceil(scaled) > MAX_DURATION_MILLISECONDS) throw audioTooLong();
      }
      offset = child.end;
    } else if (child.id === EBML_IDS.TRACKS) {
      if (sawTracks || sawCluster || child.unknownSize) throw invalidAudio();
      sawTracks = true;
      const trackNumbers = new Set();
      for (const track of parseWebmTracks(bytes, child)) {
        if (trackNumbers.has(track.number)) throw invalidAudio();
        trackNumbers.add(track.number);
        if (track.type === 2 && track.codec === 'A_OPUS') {
          state.opusTracks.add(track.number);
          state.trackWorkMicroseconds.set(track.number, 0n);
        }
      }
      if (state.opusTracks.size === 0) throw invalidAudio();
      offset = child.end;
    } else if (child.id === EBML_IDS.CLUSTER) {
      if (!sawTracks) throw invalidAudio();
      sawCluster = true;
      clusterCount += 1;
      if (clusterCount > MAX_WEBM_CLUSTERS) throw invalidAudio();
      const cluster = parseWebmCluster(bytes, child, segmentEnd, state);
      offset = child.unknownSize ? cluster.nextOffset : child.end;
      if (child.unknownSize && offset === child.dataOffset) throw invalidAudio();
    } else {
      if (child.unknownSize) throw invalidAudio();
      offset = child.end;
    }
  }
  if (
    offset !== segmentEnd
    || !sawTracks
    || !sawCluster
    || state.opusBlockCount === 0
  ) {
    throw invalidAudio();
  }

  let maximumMilliseconds = 0;
  if (infoDuration !== null) {
    const scaled = (infoDuration * Number(timecodeScale)) / 1_000_000;
    const rounded = Math.ceil(scaled);
    if (!Number.isSafeInteger(rounded) || rounded > MAX_DURATION_MILLISECONDS) {
      throw audioTooLong();
    }
    maximumMilliseconds = rounded;
  }

  let maximumWorkMicroseconds = 0n;
  for (const work of state.trackWorkMicroseconds.values()) {
    if (work > maximumWorkMicroseconds) maximumWorkMicroseconds = work;
  }
  if (maximumWorkMicroseconds > 0n) {
    const workMilliseconds = ceilRatio(maximumWorkMicroseconds, 1_000n);
    maximumMilliseconds = Math.max(maximumMilliseconds, Number(workMilliseconds));
  }
  if (state.maximumEndNanoseconds > 0n) {
    const blockMilliseconds = ceilRatio(state.maximumEndNanoseconds, 1_000_000n);
    if (blockMilliseconds > BigInt(Number.MAX_SAFE_INTEGER)) throw audioTooLong();
    maximumMilliseconds = Math.max(maximumMilliseconds, Number(blockMilliseconds));
  }

  return durationNumber(maximumMilliseconds);
}

export function inspectAudio({ audio, mimeType } = {}) {
  if (!MIME_TO_CONTAINER.has(mimeType)) throw unsupportedAudio();
  let bytes;
  if (audio instanceof Uint8Array) {
    bytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
  } else if (audio instanceof ArrayBuffer) {
    bytes = new Uint8Array(audio);
  } else {
    throw invalidAudio();
  }
  if (bytes.length === 0) throw invalidAudio();
  if (bytes.length > MAX_AUDIO_BYTES) throw audioTooLarge();

  const expectedContainer = MIME_TO_CONTAINER.get(mimeType);
  let actualContainer;
  try {
    actualContainer = sniffContainer(bytes);
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidAudio();
  }
  if (actualContainer !== expectedContainer) throw unsupportedAudio();

  try {
    const durationMilliseconds = actualContainer === 'wav'
      ? parseWav(bytes)
      : actualContainer === 'ogg'
        ? parseOgg(bytes)
        : parseWebm(bytes);
    return Object.freeze({ mimeType, durationMilliseconds });
  } catch (error) {
    if (error instanceof OperationalError) throw error;
    throw invalidAudio();
  }
}
