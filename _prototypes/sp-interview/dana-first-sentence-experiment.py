"""Standalone, explicitly experimental actor/Marin overlap benchmark.

This never plays audio or changes the local patient server. A lead can be generated
before the actor's final validation; failed runs discard all experiment audio.
"""
import argparse
import concurrent.futures
import json
import pathlib
import re
import threading
import time

ACTOR_MODEL = 'gpt-5.4-mini-2026-03-17'
SPEECH_MODEL = 'gpt-4o-mini-tts-2025-12-15'
MAX_AUDIO_BYTES = 4_000_000
ABBREVIATIONS = {'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s'}


class ExperimentFailure(Exception):
    pass


def first_substantive_sentence(text, final=False):
    """Return an exact prefix, keeping tiny acknowledgements with a later sentence.

    This deliberately waits for whitespace after punctuation while streaming.
    Abbreviations/initials/ellipses are not boundaries. Substantiveness is a modest
    length heuristic, not a clinical or linguistic judgement.
    """
    text = text.lstrip()
    segment_start = 0
    for match in re.finditer(r'[.!?][\u201d\u2019\"\']?', text):
        punctuation, end = match.start(), match.end()
        if end == len(text) and not final:
            continue
        if end < len(text) and not text[end].isspace():
            continue
        if text[punctuation] == '.':
            if (punctuation and text[punctuation - 1] == '.') or (punctuation + 1 < len(text) and text[punctuation + 1] == '.'):
                continue
            token = re.search(r'([A-Za-z][A-Za-z.]*)\.$', text[:punctuation + 1])
            if token and (token.group(1).lower() in ABBREVIATIONS or len(token.group(1)) == 1):
                continue
        segment = text[segment_start:end].strip()
        words = re.findall(r"\b[\w]+(?:['\u2019][\w]+)*\b", segment)
        if len(words) >= 4 and len(segment) >= 20:
            return text[:end]
        segment_start = end
    return None


def validate_spoken(text):
    if not isinstance(text, str):
        raise ExperimentFailure('invalid_actor_text')
    text = text.strip()
    if not text or len(text) > 900 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f{}\[\]`*_<>]', text):
        raise ExperimentFailure('invalid_actor_text')
    if re.search(r'(^|\n)\s*(?:#{1,6}\s|[-+]\s|\d+[.)]\s)', text) or re.match(r'^(?:Dana|Patient|Assistant|System)\s*:', text, re.I):
        raise ExperimentFailure('invalid_actor_text')
    return text


def run_experiment(job, actor_client, speech_client_factory, output_dir):
    if not isinstance(job, dict) or set(job) != {'system', 'messages', 'instructions'}:
        raise ExperimentFailure('invalid_job')
    if not isinstance(job['system'], str) or not isinstance(job['instructions'], str) or not isinstance(job['messages'], list):
        raise ExperimentFailure('invalid_job')
    if len(json.dumps(job).encode('utf8')) > 200_000:
        raise ExperimentFailure('invalid_job')
    output_dir = pathlib.Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in ('lead.mp3', 'remainder.mp3', 'baseline.mp3', 'results.json'):
        if (output_dir / name).exists():
            raise ExperimentFailure('output_already_exists')
    origin = time.monotonic()
    elapsed = lambda: round((time.monotonic() - origin) * 1000, 2)
    cancel = threading.Event()
    result = {
        'status': 'running', 'actor_model': ACTOR_MODEL, 'speech_model': SPEECH_MODEL,
        'voice': 'marin', 'full_text': None, 'lead_text': None, 'remainder_text': None,
        'first_actor_text_ms': None, 'lead_boundary_ms': None, 'actor_complete_ms': None,
        'speech': {}, 'tts_jobs_started': 0,
        'early_speech_risk': 'Lead speech begins before complete actor validation. This experiment saves audio only; it must not be treated as a safe production playback policy.',
    }
    lock = threading.Lock()
    futures = {}
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=3)
    phase = 'actor'

    def synthesize(name, text):
        if cancel.is_set():
            raise ExperimentFailure('cancelled')
        metrics = {'started_ms': elapsed(), 'first_chunk_ms': None, 'completed_ms': None, 'bytes': 0}
        with lock:
            result['speech'][name] = metrics
            result['tts_jobs_started'] += 1
            if result['tts_jobs_started'] > 3:
                raise ExperimentFailure('speech_limit')
        client = speech_client_factory()
        chunks, total = [], 0
        try:
            with client.audio.speech.with_streaming_response.create(
                model=SPEECH_MODEL, voice='marin', input=text,
                instructions=job['instructions'], response_format='mp3', speed=1.0,
            ) as stream:
                for chunk in stream.iter_bytes(chunk_size=4096):
                    if cancel.is_set() or elapsed() - metrics['started_ms'] > 35_000:
                        raise ExperimentFailure('cancelled_or_timeout')
                    if not chunk:
                        continue
                    if not isinstance(chunk, bytes) or len(chunk) > 4096:
                        raise ExperimentFailure('invalid_audio')
                    total += len(chunk)
                    if total > MAX_AUDIO_BYTES:
                        raise ExperimentFailure('audio_limit')
                    if metrics['first_chunk_ms'] is None:
                        metrics['first_chunk_ms'] = elapsed()
                    chunks.append(chunk)
            audio = b''.join(chunks)
            if len(audio) < 100 or not (audio.startswith(b'ID3') or (audio[0] == 255 and audio[1] & 224 == 224)):
                raise ExperimentFailure('invalid_audio')
            if cancel.is_set():
                raise ExperimentFailure('cancelled')
            with (output_dir / (name + '.mp3')).open('xb') as target:
                target.write(audio)
            metrics['bytes'] = len(audio)
            metrics['completed_ms'] = elapsed()
            return metrics
        finally:
            if hasattr(client, 'close'):
                client.close()

    try:
        accumulated = ''
        with actor_client.responses.stream(
            model=ACTOR_MODEL, instructions=job['system'], input=job['messages'],
            store=False, max_output_tokens=240, reasoning={'effort': 'none'},
        ) as stream:
            for event in stream:
                if elapsed() > 35_000:
                    raise ExperimentFailure('actor_timeout_or_protocol')
                if event.type != 'response.output_text.delta':
                    continue
                delta = event.delta
                if not isinstance(delta, str):
                    raise ExperimentFailure('actor_timeout_or_protocol')
                if delta and result['first_actor_text_ms'] is None:
                    result['first_actor_text_ms'] = elapsed()
                accumulated += delta
                if len(accumulated) > 1200:
                    raise ExperimentFailure('actor_limit')
                if result['lead_text'] is None:
                    prefix = first_substantive_sentence(accumulated)
                    if prefix:
                        result['lead_text'] = validate_spoken(prefix)
                        result['lead_boundary_ms'] = elapsed()
                        futures['lead'] = pool.submit(synthesize, 'lead', result['lead_text'])
            final = stream.get_final_response()
        if final.status != 'completed':
            raise ExperimentFailure('actor_incomplete')
        full_text = validate_spoken(final.output_text)
        if accumulated.strip() != full_text:
            raise ExperimentFailure('actor_text_mismatch')
        if result['lead_text'] is not None and not full_text.startswith(result['lead_text']):
            raise ExperimentFailure('actor_prefix_mismatch')
        result['full_text'] = full_text
        result['actor_complete_ms'] = elapsed()
        phase = 'speech'
        if result['lead_text'] is None:
            result['lead_text'] = first_substantive_sentence(full_text, final=True) or full_text
            result['lead_boundary_ms'] = elapsed()
            futures['lead'] = pool.submit(synthesize, 'lead', result['lead_text'])
        result['remainder_text'] = full_text[len(result['lead_text']):]
        if result['remainder_text'].strip():
            futures['remainder'] = pool.submit(synthesize, 'remainder', result['remainder_text'])
        else:
            result['remainder_note'] = 'The actor produced no remaining text; no empty remainder request was sent.'
        futures['baseline'] = pool.submit(synthesize, 'baseline', full_text)
        for future in futures.values():
            future.result(timeout=40)
        result['status'] = 'completed'
    except ExperimentFailure as error:
        result['status'] = 'failed'
        result['failure'] = str(error)
        cancel.set()
    except Exception:
        result['status'] = 'failed'
        result['failure'] = phase + '_failed'
        cancel.set()
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    if result['status'] != 'completed':
        for name in ('lead', 'remainder', 'baseline'):
            (output_dir / (name + '.mp3')).unlink(missing_ok=True)
        result['audio_discarded'] = True
    result['experiment_completed_ms'] = elapsed()
    with (output_dir / 'results.json').open('x', encoding='utf8') as target:
        json.dump(result, target, ensure_ascii=False, indent=2)
        target.write('\n')
    return result


def main():
    parser = argparse.ArgumentParser(description='Standalone Dana first-sentence audio experiment; never enables patient playback.')
    parser.add_argument('--job', required=True)
    parser.add_argument('--out-dir', required=True)
    args = parser.parse_args()
    try:
        from openai import OpenAI
        data = pathlib.Path(args.job).read_bytes()
        if len(data) > 200_000:
            raise ExperimentFailure('invalid_job')
        job = json.loads(data)
        factory = lambda: OpenAI(base_url='https://api.openai.com/v1', max_retries=0, timeout=30.0)
        actor = factory()
        try:
            result = run_experiment(job, actor, factory, pathlib.Path(args.out_dir))
        finally:
            actor.close()
        print(json.dumps({'status': result['status'], 'tts_jobs_started': result['tts_jobs_started'], 'elapsed_ms': result['experiment_completed_ms']}))
        return 0 if result['status'] == 'completed' else 1
    except Exception:
        print(json.dumps({'status': 'failed', 'failure': 'experiment_setup_failed'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
