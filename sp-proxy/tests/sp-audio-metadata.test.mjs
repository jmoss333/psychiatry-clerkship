import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectAudio } from '../netlify/functions/_shared/sp-audio-metadata.mjs';

const MAX_BYTES = 4 * 1024 * 1024;

function bytes(...parts) {
  const normalized = parts.map((part) => (
    part instanceof Uint8Array ? part : new Uint8Array(part)
  ));
  const output = new Uint8Array(normalized.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of normalized) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function ascii(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function u16le(value) {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
}

function u32le(value) {
  return Uint8Array.of(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function u32be(value) {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function u64be(value) {
  let remaining = BigInt(value);
  const output = new Uint8Array(8);
  for (let index = 7; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function u64le(value) {
  return Uint8Array.from(u64be(value)).reverse();
}

function oggCrc(page) {
  let crc = 0;
  for (let offset = 0; offset < page.length; offset += 1) {
    const value = offset >= 22 && offset < 26 ? 0 : page[offset];
    crc = (crc ^ (value << 24)) >>> 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80000000
        ? ((crc << 1) ^ 0x04c11db7) >>> 0
        : (crc << 1) >>> 0;
    }
  }
  return crc >>> 0;
}

function assertOperationalError(error, { status, code }) {
  assert.equal(error?.name, 'OperationalError');
  assert.equal(error?.status, status);
  assert.equal(error?.code, code);
  assert.equal(typeof error?.message, 'string');
  assert.ok(error.message.length > 0);
  return true;
}

function wav({
  dataLength = 8_000,
  sampleRate = 8_000,
  channels = 1,
  bitsPerSample = 8,
  byteRate = sampleRate * channels * (bitsPerSample / 8),
  blockAlign = channels * (bitsPerSample / 8),
  format = 1,
  extraChunks = [],
} = {}) {
  const fmt = bytes(
    ascii('fmt '),
    u32le(16),
    u16le(format),
    u16le(channels),
    u32le(sampleRate),
    u32le(byteRate),
    u16le(blockAlign),
    u16le(bitsPerSample),
  );
  const data = bytes(
    ascii('data'),
    u32le(dataLength),
    new Uint8Array(dataLength),
    dataLength % 2 === 1 ? Uint8Array.of(0) : new Uint8Array(),
  );
  const body = bytes(...extraChunks, fmt, data);
  return bytes(ascii('RIFF'), u32le(body.length + 4), ascii('WAVE'), body);
}

function oggPage({
  serial = 0x12345678,
  sequence,
  flags,
  granule,
  packet,
  segments = [packet.length],
}) {
  assert.equal(segments.reduce((sum, length) => sum + length, 0), packet.length);
  assert.ok(segments.length <= 255 && segments.every((length) => length <= 255));
  const page = bytes(
    ascii('OggS'),
    Uint8Array.of(0, flags),
    u64le(granule),
    u32le(serial),
    u32le(sequence),
    u32le(0),
    Uint8Array.of(segments.length, ...segments),
    packet,
  );
  page.set(u32le(oggCrc(page)), 22);
  return page;
}

function continuedOggOpus({ continuation = true } = {}) {
  const opusHead = bytes(
    ascii('OpusHead'),
    Uint8Array.of(1, 1),
    u16le(312),
    u32le(48_000),
    u16le(0),
    Uint8Array.of(0),
  );
  const opusTags = bytes(
    ascii('OpusTags'),
    u32le(284),
    new Uint8Array(284),
    u32le(0),
  );
  return bytes(
    oggPage({
      sequence: 0,
      flags: 0x02,
      granule: 0n,
      packet: opusHead,
    }),
    oggPage({
      sequence: 1,
      flags: 0,
      granule: 0n,
      packet: opusTags.subarray(0, 255),
      segments: [255],
    }),
    oggPage({
      sequence: 2,
      flags: 0x04 | (continuation ? 0x01 : 0),
      granule: 48_312n,
      packet: bytes(opusTags.subarray(255), Uint8Array.of(0xf8)),
      segments: [45, 1],
    }),
  );
}

function opusHead({ preSkip = 312 } = {}) {
  return bytes(
    ascii('OpusHead'),
    Uint8Array.of(1, 1),
    u16le(preSkip),
    u32le(48_000),
    u16le(0),
    Uint8Array.of(0),
  );
}

function opusTags() {
  return bytes(ascii('OpusTags'), u32le(0), u32le(0));
}

function oggOpus({
  preSkip = 312,
  samples = 48_000n,
  finalGranule = null,
  audioPackets = [Uint8Array.of(0xf8)],
} = {}) {
  const audioPayload = bytes(...audioPackets);
  const segments = audioPackets.map((packet) => packet.length);
  assert.ok(segments.length <= 255 && segments.every((length) => length < 255));
  return bytes(
    oggPage({ sequence: 0, flags: 0x02, granule: 0n, packet: opusHead({ preSkip }) }),
    oggPage({ sequence: 1, flags: 0, granule: 0n, packet: opusTags() }),
    oggPage({
      sequence: 2,
      flags: 0x04,
      granule: finalGranule ?? (BigInt(preSkip) + BigInt(samples)),
      packet: audioPayload,
      segments,
    }),
  );
}

function oggWithFalsifiedGranule({ packetCount }) {
  const opusHead = bytes(
    ascii('OpusHead'),
    Uint8Array.of(1, 1),
    u16le(312),
    u32le(48_000),
    u16le(0),
    Uint8Array.of(0),
  );
  const pages = [
    oggPage({ sequence: 0, flags: 0x02, granule: 0n, packet: opusHead }),
    oggPage({ sequence: 1, flags: 0, granule: 0n, packet: opusTags() }),
  ];
  let remaining = packetCount;
  let sequence = 2;
  while (remaining > 0) {
    const count = Math.min(255, remaining);
    remaining -= count;
    pages.push(oggPage({
      sequence,
      flags: remaining === 0 ? 0x04 : 0,
      granule: 48_312n,
      packet: new Uint8Array(count).fill(0xf8),
      segments: Array(count).fill(1),
    }));
    sequence += 1;
  }
  return bytes(...pages);
}

function legacyUntaggedOgg() {
  return bytes(
    oggPage({ sequence: 0, flags: 0x02, granule: 0n, packet: opusHead() }),
    oggPage({
      sequence: 1,
      flags: 0x04,
      granule: 48_312n,
      packet: Uint8Array.of(0xf8),
    }),
  );
}

function mp4Box(type, payload, { extended = false, toEnd = false } = {}) {
  if (toEnd) return bytes(u32be(0), ascii(type), payload);
  if (extended) {
    return bytes(u32be(1), ascii(type), u64be(payload.length + 16), payload);
  }
  return bytes(u32be(payload.length + 8), ascii(type), payload);
}

function mp4({
  version = 0,
  timescale = 1_000,
  duration = 1_000,
  extendedMoov = false,
  extendedMvhd = false,
} = {}) {
  const timeFields = version === 1
    ? bytes(u64be(0), u64be(0), u32be(timescale), u64be(duration))
    : bytes(u32be(0), u32be(0), u32be(timescale), u32be(Number(duration)));
  const mvhd = mp4Box('mvhd', bytes(Uint8Array.of(version, 0, 0, 0), timeFields), {
    extended: extendedMvhd,
  });
  return bytes(
    mp4Box('ftyp', bytes(ascii('isom'), u32be(0), ascii('isom'))),
    mp4Box('moov', mvhd, { extended: extendedMoov }),
    mp4Box('mdat', Uint8Array.of(0)),
  );
}

const WEBM_IDS = Object.freeze({
  EBML: [0x1a, 0x45, 0xdf, 0xa3],
  DOC_TYPE: [0x42, 0x82],
  SEGMENT: [0x18, 0x53, 0x80, 0x67],
  INFO: [0x15, 0x49, 0xa9, 0x66],
  TIMECODE_SCALE: [0x2a, 0xd7, 0xb1],
  DURATION: [0x44, 0x89],
  TRACKS: [0x16, 0x54, 0xae, 0x6b],
  TRACK_ENTRY: [0xae],
  TRACK_NUMBER: [0xd7],
  TRACK_TYPE: [0x83],
  CODEC_ID: [0x86],
  CLUSTER: [0x1f, 0x43, 0xb6, 0x75],
  TIMESTAMP: [0xe7],
  SIMPLE_BLOCK: [0xa3],
  BLOCK_GROUP: [0xa0],
  BLOCK: [0xa1],
  BLOCK_DURATION: [0x9b],
});

function ebmlSize(value) {
  const numeric = BigInt(value);
  for (let length = 1; length <= 8; length += 1) {
    const maximum = (1n << BigInt(7 * length)) - 2n;
    if (numeric <= maximum) {
      const output = new Uint8Array(length);
      let remaining = numeric;
      for (let index = length - 1; index >= 0; index -= 1) {
        output[index] = Number(remaining & 0xffn);
        remaining >>= 8n;
      }
      output[0] |= 1 << (8 - length);
      return output;
    }
  }
  throw new Error('fixture size is too large');
}

function ebmlElement(id, payload, { unknownSize = false } = {}) {
  return bytes(
    Uint8Array.from(id),
    unknownSize ? Uint8Array.of(0xff) : ebmlSize(payload.length),
    payload,
  );
}

function ebmlUnsigned(value, length = null) {
  let remaining = BigInt(value);
  const outputLength = length ?? Math.max(1, Math.ceil(remaining.toString(2).length / 8));
  const output = new Uint8Array(outputLength);
  for (let index = outputLength - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

function floatBytes(value, size = 8) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  if (size === 4) view.setFloat32(0, value, false);
  else view.setFloat64(0, value, false);
  return new Uint8Array(buffer);
}

function webmTrackEntry({ codec = 'A_OPUS', trackNumber = 1 } = {}) {
  return ebmlElement(WEBM_IDS.TRACK_ENTRY, bytes(
    ebmlElement(WEBM_IDS.TRACK_NUMBER, ebmlUnsigned(trackNumber)),
    ebmlElement(WEBM_IDS.TRACK_TYPE, ebmlUnsigned(2)),
    ebmlElement(WEBM_IDS.CODEC_ID, ascii(codec)),
  ));
}

function webmTrack({ codec = 'A_OPUS', trackNumbers = [1], trackDefs = null } = {}) {
  const definitions = trackDefs
    ?? trackNumbers.map((trackNumber) => ({ codec, trackNumber }));
  return ebmlElement(
    WEBM_IDS.TRACKS,
    bytes(...definitions.map((definition) => webmTrackEntry(definition))),
  );
}

function simpleBlock({
  track = 1,
  relativeTimestamp = 0,
  packets = [Uint8Array.of(0xf8)],
  lacing = 'none',
} = {}) {
  assert.ok(track > 0 && track < 127);
  const timestamp = Uint8Array.of(
    (relativeTimestamp >> 8) & 0xff,
    relativeTimestamp & 0xff,
  );
  let flags = 0x80;
  let frames;
  if (lacing === 'none') {
    assert.equal(packets.length, 1);
    frames = packets[0];
  } else if (lacing === 'fixed') {
    flags |= 0x04;
    frames = bytes(Uint8Array.of(packets.length - 1), ...packets);
  } else if (lacing === 'xiph') {
    flags |= 0x02;
    const sizes = [];
    for (const packet of packets.slice(0, -1)) {
      let remaining = packet.length;
      while (remaining >= 255) {
        sizes.push(255);
        remaining -= 255;
      }
      sizes.push(remaining);
    }
    frames = bytes(Uint8Array.of(packets.length - 1, ...sizes), ...packets);
  } else if (lacing === 'ebml') {
    flags |= 0x06;
    assert.equal(packets.length, 2, 'fixture helper uses the two-frame EBML lace form');
    frames = bytes(
      Uint8Array.of(packets.length - 1),
      ebmlSize(packets[0].length),
      ...packets,
    );
  } else {
    throw new Error('unknown fixture lacing');
  }
  return bytes(Uint8Array.of(0x80 | track), timestamp, Uint8Array.of(flags), frames);
}

function webm({
  duration = null,
  durationFloatSize = 8,
  timecodeScale = 1_000_000,
  clusterTimestamp = 0,
  blocks = [simpleBlock()],
  codec = 'A_OPUS',
  unknownSegment = false,
  unknownCluster = false,
  blockGroupDuration = null,
  clusterBeforeTracks = false,
  trackNumbers = [1],
  trackDefs = null,
} = {}) {
  const ebmlHeader = ebmlElement(WEBM_IDS.EBML, ebmlElement(WEBM_IDS.DOC_TYPE, ascii('webm')));
  const infoParts = [ebmlElement(WEBM_IDS.TIMECODE_SCALE, ebmlUnsigned(timecodeScale))];
  if (duration !== null) {
    infoParts.push(ebmlElement(WEBM_IDS.DURATION, floatBytes(duration, durationFloatSize)));
  }
  const clusterParts = [ebmlElement(WEBM_IDS.TIMESTAMP, ebmlUnsigned(clusterTimestamp))];
  for (const block of blocks) {
    if (blockGroupDuration === null) {
      clusterParts.push(ebmlElement(WEBM_IDS.SIMPLE_BLOCK, block));
    } else {
      clusterParts.push(ebmlElement(WEBM_IDS.BLOCK_GROUP, bytes(
        ebmlElement(WEBM_IDS.BLOCK, block),
        ebmlElement(WEBM_IDS.BLOCK_DURATION, ebmlUnsigned(blockGroupDuration)),
      )));
    }
  }
  const info = ebmlElement(WEBM_IDS.INFO, bytes(...infoParts));
  const tracks = webmTrack({ codec, trackNumbers, trackDefs });
  const cluster = ebmlElement(
    WEBM_IDS.CLUSTER,
    bytes(...clusterParts),
    { unknownSize: unknownCluster },
  );
  const segment = clusterBeforeTracks
    ? bytes(info, cluster, tracks)
    : bytes(info, tracks, cluster);
  return bytes(ebmlHeader, ebmlElement(WEBM_IDS.SEGMENT, segment, { unknownSize: unknownSegment }));
}

function webmWithRepeatedMinimalBlocks(blockCount = 580_000) {
  const ebmlHeader = ebmlElement(WEBM_IDS.EBML, ebmlElement(WEBM_IDS.DOC_TYPE, ascii('webm')));
  const info = ebmlElement(
    WEBM_IDS.INFO,
    ebmlElement(WEBM_IDS.TIMECODE_SCALE, ebmlUnsigned(1_000_000)),
  );
  const tracks = webmTrack();
  const timestamp = ebmlElement(WEBM_IDS.TIMESTAMP, ebmlUnsigned(0));
  const block = ebmlElement(
    WEBM_IDS.SIMPLE_BLOCK,
    simpleBlock({ packets: [Uint8Array.of(0x80)] }), // One 2.5 ms Opus frame.
  );
  const clusterPayload = new Uint8Array(timestamp.length + (block.length * blockCount));
  clusterPayload.set(timestamp, 0);
  for (let offset = timestamp.length; offset < clusterPayload.length; offset += block.length) {
    clusterPayload.set(block, offset);
  }
  const cluster = ebmlElement(WEBM_IDS.CLUSTER, clusterPayload);
  const segment = ebmlElement(WEBM_IDS.SEGMENT, bytes(info, tracks, cluster));
  return bytes(ebmlHeader, segment);
}

if (process.env.SP_AUDIO_MEMORY_PROBE === '1') {
  const audio = webmWithRepeatedMinimalBlocks();
  if (audio.length < 3_900_000 || audio.length >= MAX_BYTES) process.exit(3);
  try {
    inspectAudio({ audio, mimeType: 'audio/webm;codecs=opus' });
    process.exit(4);
  } catch (error) {
    process.exit(
      error?.name === 'OperationalError'
      && error?.status === 422
      && error?.code === 'audio_too_long'
        ? 0
        : 5,
    );
  }
}

test('accepts WAV metadata and returns an immutable canonical result', () => {
  const input = wav({ dataLength: 8_000 });
  const snapshot = Uint8Array.from(input);
  const result = inspectAudio({ audio: input, mimeType: 'audio/wav' });

  assert.deepEqual(result, { mimeType: 'audio/wav', durationMilliseconds: 1_000 });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(input, snapshot);
  assert.throws(() => {
    result.durationMilliseconds = 2;
  }, TypeError);
});

test('accepts exact 90-second WAV and rejects a longer low-bitrate WAV below 4 MiB', () => {
  const boundary = wav({ dataLength: 720_000 });
  const over = wav({ dataLength: 720_001 });
  assert.ok(over.length < MAX_BYTES);

  assert.equal(
    inspectAudio({ audio: boundary.buffer, mimeType: 'audio/wav' }).durationMilliseconds,
    90_000,
  );
  assert.throws(
    () => inspectAudio({ audio: over, mimeType: 'audio/wav' }),
    (error) => assertOperationalError(error, { status: 422, code: 'audio_too_long' }),
  );
});

test('rejects malformed WAV rates, truncation, and zero duration', () => {
  for (const audio of [
    wav({ byteRate: 0 }),
    wav({ byteRate: 8_001 }),
    wav({ blockAlign: 0 }),
    wav({ dataLength: 0 }),
    wav().subarray(0, wav().length - 1),
  ]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/wav' }),
      (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
    );
  }
});

test('accepts Ogg Opus and applies pre-skip with conservative rounding', () => {
  assert.equal(
    inspectAudio({ audio: oggOpus({ samples: 48_001n }), mimeType: 'audio/ogg' })
      .durationMilliseconds,
    1_001,
  );
  assert.equal(
    inspectAudio({ audio: oggOpus({ samples: 4_320_000n }), mimeType: 'audio/ogg' })
      .durationMilliseconds,
    90_000,
  );
  assert.equal(
    inspectAudio({ audio: oggOpus({ preSkip: 65_535, samples: 1n }), mimeType: 'audio/ogg' })
      .durationMilliseconds,
    20,
  );
  assert.equal(
    inspectAudio({ audio: continuedOggOpus(), mimeType: 'audio/ogg' }).durationMilliseconds,
    1_000,
  );
  assert.equal(
    inspectAudio({ audio: oggOpus(), mimeType: 'audio/ogg;codecs=opus' })
      .durationMilliseconds,
    1_000,
  );
  assert.equal(
    inspectAudio({
      audio: oggOpus({
        samples: 1n,
        audioPackets: [Uint8Array.of(0xf8), Uint8Array.of(0xf8), Uint8Array.of(0xf8)],
      }),
      mimeType: 'audio/ogg',
    }).durationMilliseconds,
    60,
  );
  assert.equal(
    inspectAudio({
      audio: oggWithFalsifiedGranule({ packetCount: 4_500 }),
      mimeType: 'audio/ogg',
    }).durationMilliseconds,
    90_000,
  );
});

test('rejects overlong, invalid-granule, and malformed Ogg Opus', () => {
  const over = oggOpus({ samples: 4_320_001n });
  assert.ok(over.length < MAX_BYTES);
  assert.throws(
    () => inspectAudio({ audio: over, mimeType: 'audio/ogg' }),
    (error) => assertOperationalError(error, { status: 422, code: 'audio_too_long' }),
  );

  for (const audio of [
    oggOpus({ preSkip: 312, finalGranule: 311n }),
    oggOpus({ preSkip: 312, finalGranule: 312n }),
    oggOpus({ finalGranule: 0xffffffffffffffffn }),
    oggOpus().subarray(0, oggOpus().length - 1),
    legacyUntaggedOgg(),
  ]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/ogg' }),
      (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
    );
  }
});

test('validates Ogg CRC and rejects mutated page content', () => {
  const corrupted = Uint8Array.from(oggOpus());
  corrupted[corrupted.length - 1] ^= 1;
  assert.throws(
    () => inspectAudio({ audio: corrupted, mimeType: 'audio/ogg' }),
    (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
  );
});

test('rejects 120 seconds of Ogg Opus packets despite a falsified one-second granule', () => {
  const audio = oggWithFalsifiedGranule({ packetCount: 6_001 });
  assert.ok(audio.length < MAX_BYTES);
  assert.throws(
    () => inspectAudio({ audio, mimeType: 'audio/ogg;codecs=opus' }),
    (error) => assertOperationalError(error, { status: 422, code: 'audio_too_long' }),
  );
});

test('rejects Ogg stream sequence and serial discontinuities', () => {
  const valid = oggOpus();
  const secondPage = valid.indexOf(0x4f, 29);
  assert.ok(secondPage > 0);

  const sequenceBroken = Uint8Array.from(valid);
  sequenceBroken[secondPage + 18] = 7;
  const serialBroken = Uint8Array.from(valid);
  serialBroken[secondPage + 14] ^= 1;

  const falseContinuation = Uint8Array.from(valid);
  falseContinuation[secondPage + 5] |= 0x01;

  for (const audio of [
    sequenceBroken,
    serialBroken,
    falseContinuation,
    continuedOggOpus({ continuation: false }),
  ]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/ogg' }),
      (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
    );
  }
});

test('temporarily rejects structurally valid and metadata-mutated MP4 audio', () => {
  for (const audio of [mp4(), mp4({ version: 1, duration: 90_001n })]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/mp4' }),
      (error) => assertOperationalError(error, { status: 415, code: 'unsupported_audio' }),
    );
  }
});

test('accepts WebM Info Duration in float32 and float64 form', () => {
  for (const durationFloatSize of [4, 8]) {
    assert.equal(
      inspectAudio({
        audio: webm({ duration: 90_000, durationFloatSize }),
        mimeType: 'audio/webm',
      }).durationMilliseconds,
      90_000,
    );
  }
});

test('derives duration from browser-like WebM clusters without Info Duration', () => {
  const result = inspectAudio({
    audio: webm({
      duration: null,
      clusterTimestamp: 89_980,
      unknownSegment: true,
      unknownCluster: true,
    }),
    mimeType: 'audio/webm;codecs=opus',
  });
  assert.deepEqual(result, {
    mimeType: 'audio/webm;codecs=opus',
    durationMilliseconds: 90_000,
  });
});

test('uses Opus packet duration for fixed, Xiph, and EBML-laced WebM blocks', () => {
  for (const lacing of ['fixed', 'xiph', 'ebml']) {
    assert.equal(
      inspectAudio({
        audio: webm({
          clusterTimestamp: 89_960,
          blocks: [simpleBlock({
            packets: [Uint8Array.of(0xf8), Uint8Array.of(0xf8)],
            lacing,
          })],
        }),
        mimeType: 'audio/webm',
      }).durationMilliseconds,
      90_000,
    );
  }
});

test('uses the conservative maximum of WebM packet and BlockDuration timing', () => {
  assert.equal(
    inspectAudio({
      audio: webm({
        clusterTimestamp: 89_900,
        blocks: [simpleBlock()],
        blockGroupDuration: 100,
      }),
      mimeType: 'audio/webm',
    }).durationMilliseconds,
    90_000,
  );
});

test('rejects cumulative WebM Opus work hidden at one repeated timestamp', () => {
  const packet = Uint8Array.of(0x19); // Two 60 ms Opus frames.
  assert.equal(
    inspectAudio({
      audio: webm({
        blocks: Array.from({ length: 750 }, () => simpleBlock({ packets: [packet] })),
      }),
      mimeType: 'audio/webm',
    }).durationMilliseconds,
    90_000,
  );
  const audio = webm({
    blocks: Array.from({ length: 1_000 }, () => simpleBlock({ packets: [packet] })),
  });
  assert.ok(audio.length < MAX_BYTES);
  assert.throws(
    () => inspectAudio({ audio, mimeType: 'audio/webm;codecs=opus' }),
    (error) => assertOperationalError(error, { status: 422, code: 'audio_too_long' }),
  );
});

test('rejects multiple Opus tracks that split cumulative work below the duration limit', () => {
  const packet = Uint8Array.of(0x19); // Two 60 ms Opus frames.
  const audio = webm({
    trackNumbers: [1, 2],
    blocks: Array.from({ length: 1_000 }, (_, index) => simpleBlock({
      track: (index % 2) + 1,
      packets: [packet],
    })),
  });
  assert.ok(audio.length < MAX_BYTES);
  assert.throws(
    () => inspectAudio({ audio, mimeType: 'audio/webm;codecs=opus' }),
    (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
  );
});

test('rejects a non-Opus audio decoy alongside the governed Opus track', () => {
  const audio = webm({
    trackDefs: [
      { trackNumber: 1, codec: 'A_VORBIS' },
      { trackNumber: 2, codec: 'A_OPUS' },
    ],
    blocks: [simpleBlock({ track: 2 })],
  });
  assert.throws(
    () => inspectAudio({ audio, mimeType: 'audio/webm' }),
    (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
  );
});

test('rejects WebM clusters that precede the governed Opus track definition', () => {
  assert.throws(
    () => inspectAudio({
      audio: webm({ clusterBeforeTracks: true }),
      mimeType: 'audio/webm',
    }),
    (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
  );
});

test('rejects a near-4 MiB minimal-block WebM within a 64 MiB heap', () => {
  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=64', fileURLToPath(import.meta.url)],
    {
      env: { ...process.env, SP_AUDIO_MEMORY_PROBE: '1' },
      encoding: 'utf8',
      maxBuffer: 128 * 1024,
      timeout: 20_000,
    },
  );
  assert.equal(
    result.status,
    0,
    `memory probe failed (status=${result.status}, signal=${result.signal ?? 'none'})`,
  );
});

test('rejects overlong WebM below 4 MiB and unprovable or malformed timing', () => {
  const over = webm({ clusterTimestamp: 89_981 });
  assert.ok(over.length < MAX_BYTES);
  assert.throws(
    () => inspectAudio({ audio: over, mimeType: 'audio/webm' }),
    (error) => assertOperationalError(error, { status: 422, code: 'audio_too_long' }),
  );

  const malformedBlock = simpleBlock();
  malformedBlock[0] = 0xff;
  for (const audio of [
    webm({ duration: 0, blocks: [] }),
    webm({ duration: Number.NaN, blocks: [] }),
    webm({ duration: 1_000, blocks: [] }),
    webm({ timecodeScale: 0 }),
    webm({ duration: 1, durationFloatSize: 8 }).subarray(0, 20),
    webm({ duration: null, blocks: [] }),
    webm({ codec: 'A_VORBIS' }),
    webm({ blocks: [malformedBlock] }),
    webm({ blocks: [simpleBlock({ packets: [Uint8Array.of(0xfb, 63)] })] }),
  ]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/webm' }),
      (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
    );
  }
});

test('rejects malformed WebM varints, duration floats, and laced blocks', () => {
  const invalidFloat = webm({ duration: 1, blocks: [] });
  const durationIdOffset = invalidFloat.findIndex((value, index) => (
    value === 0x44 && invalidFloat[index + 1] === 0x89
  ));
  invalidFloat[durationIdOffset + 2] = 0x83;

  const invalidLace = webm({
    blocks: [simpleBlock({
      packets: [Uint8Array.of(0xf8), Uint8Array.of(0xf8)],
      lacing: 'fixed',
    }).subarray(0, 6)],
  });
  const invalidSize = Uint8Array.from(webm());
  invalidSize[4] = 0x00;

  for (const audio of [invalidFloat, invalidLace, invalidSize]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/webm' }),
      (error) => assertOperationalError(error, { status: 422, code: 'invalid_audio' }),
    );
  }
});

test('rejects container spoofing and noncanonical MIME declarations', () => {
  const fixtures = [
    [wav(), 'audio/ogg'],
    [oggOpus(), 'audio/mp4'],
    [mp4(), 'audio/webm'],
    [webm(), 'audio/wav'],
  ];
  for (const [audio, mimeType] of fixtures) {
    assert.throws(
      () => inspectAudio({ audio, mimeType }),
      (error) => assertOperationalError(error, { status: 415, code: 'unsupported_audio' }),
    );
  }

  for (const mimeType of [
    'audio/x-wav',
    'audio/ogg; codecs=opus',
    'Audio/Ogg;codecs=opus',
    'audio/webm; codecs=opus',
    'Audio/WebM',
    '',
    null,
  ]) {
    assert.throws(
      () => inspectAudio({ audio: wav(), mimeType }),
      (error) => assertOperationalError(error, { status: 415, code: 'unsupported_audio' }),
    );
  }
});

test('rejects empty, wrong-type, and oversized inputs without exposing content', () => {
  const secret = 'student said a private secret';
  for (const audio of [
    new Uint8Array(),
    ascii(secret),
    new Uint8Array(MAX_BYTES + 1),
    'not bytes',
    null,
  ]) {
    assert.throws(
      () => inspectAudio({ audio, mimeType: 'audio/wav' }),
      (error) => {
        assert.equal(error?.name, 'OperationalError');
        assert.ok([413, 415, 422].includes(error?.status));
        assert.equal(error.message.includes(secret), false);
        assert.equal(error.code.includes(secret), false);
        return true;
      },
    );
  }
});
