function cloneBytes(value) {
  return Uint8Array.from(value);
}

async function passBarrier(barrier) {
  if (typeof barrier === 'function') await barrier();
  else if (barrier && typeof barrier.then === 'function') await barrier;
}

export function createFakeSpeechProvider({
  transcript = 'Deterministic test transcript.',
  durationMilliseconds = 1_000,
  transcriptionUsage = { milliseconds: 1_000 },
  audio = Uint8Array.of(0x49, 0x44, 0x33, 0x04),
  synthesisUsage = { characters: 12 },
  prepareError = null,
  transcribeError = null,
  synthesizeError = null,
  barriers = {},
} = {}) {
  let prepareCount = 0;
  let transcribeCount = 0;
  let synthesizeCount = 0;

  const calls = Object.freeze({
    get prepare() { return prepareCount; },
    get transcribe() { return transcribeCount; },
    get synthesize() { return synthesizeCount; },
  });

  const provider = Object.freeze({
    async prepare() {
      prepareCount += 1;
      if (prepareError) throw prepareError;

      return Object.freeze({
        async transcribe() {
          transcribeCount += 1;
          await passBarrier(barriers.transcribe);
          if (transcribeError) throw transcribeError;
          return Object.freeze({
            text: transcript,
            durationMilliseconds,
            usage: transcriptionUsage === null
              ? null
              : Object.freeze({ milliseconds: transcriptionUsage.milliseconds }),
          });
        },

        async synthesize() {
          synthesizeCount += 1;
          await passBarrier(barriers.synthesize);
          if (synthesizeError) throw synthesizeError;
          return Object.freeze({
            audio: cloneBytes(audio),
            contentType: 'audio/mpeg',
            usage: Object.freeze({ characters: synthesisUsage.characters }),
          });
        },
      });
    },
  });

  return Object.freeze({ provider, calls });
}

export function createProviderBarrier() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return Object.freeze({ promise, release });
}
