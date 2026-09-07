"""Local-only OpenAI SDK worker. Protocol output never includes provider errors or keys."""
import base64
import json
import re
import sys

ABBREVIATIONS = {'dr', 'mr', 'mrs', 'ms', 'prof', 'st', 'vs', 'etc', 'e.g', 'i.e', 'a.m', 'p.m', 'u.s'}
ACTOR_MODEL = 'gpt-5.4-2026-03-05'
ACTOR_REASONING_EFFORT = 'low'
ACTOR_MAX_OUTPUT_TOKENS = 768


def first_substantive_sentence(text):
    """Exact prefix; tiny acknowledgements stay attached to a substantive sentence.

    This conservative length heuristic matches the standalone experiment. While
    streaming, require whitespace after punctuation and skip initials,
    abbreviations and ellipses. This is not a clinical validation of the words.
    """
    text = text.lstrip()
    segment_start = 0
    for match in re.finditer(r'[.!?][\u201d\u2019\"\']?', text):
        punctuation, end = match.start(), match.end()
        if end == len(text) or not text[end].isspace():
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


def emit_message(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    sys.stdout.flush()


def normalized_usage(value):
    """Allowlist provider token counts; absent or invalid usage is unknown, not zero."""
    def field(obj, name):
        return obj.get(name) if isinstance(obj, dict) else getattr(obj, name, None)
    def number(value):
        return value if type(value) is int and 0 <= value <= 9_007_199_254_740_991 else None
    details_in, details_out = field(value, 'input_tokens_details'), field(value, 'output_tokens_details')
    usage = {
        'inputTokens': number(field(value, 'input_tokens')),
        'cachedInputTokens': number(field(details_in, 'cached_tokens')),
        'cacheWriteTokens': number(field(details_in, 'cache_write_tokens')),
        'outputTokens': number(field(value, 'output_tokens')),
        'reasoningTokens': number(field(details_out, 'reasoning_tokens')),
        'totalTokens': number(field(value, 'total_tokens')),
    }
    return usage if any(item is not None for item in usage.values()) else None


class ProviderResultError(ValueError):
    def __init__(self, message, usage, diagnostic_code=None):
        super().__init__(message)
        self.usage = usage
        self.diagnostic_code = diagnostic_code


def with_usage(value, usage):
    return dict(value, usage=usage) if usage is not None else value


def run(job, client):
    if job.get('kind') in ('speech', 'speech_stream') and job.get('voice', 'marin') not in ('marin', 'cedar'):
        raise ValueError('Unsupported local voice')
    if job.get('kind') == 'reply':
        result = client.responses.create(
            model=ACTOR_MODEL,
            instructions=job['system'],
            input=job['messages'],
            store=False,
            max_output_tokens=ACTOR_MAX_OUTPUT_TOKENS,
            reasoning={'effort': ACTOR_REASONING_EFFORT},
        )
        usage = normalized_usage(getattr(result, 'usage', None))
        if result.status != 'completed' or not isinstance(result.output_text, str) or not result.output_text.strip():
            raise ProviderResultError('Incomplete response', usage, 'actor_incomplete')
        return with_usage({'text': result.output_text.strip()}, usage)
    if job.get('kind') == 'reply_stream':
        accumulated, lead = '', None
        with client.responses.stream(
            model=ACTOR_MODEL,
            instructions=job['system'], input=job['messages'],
            store=False, max_output_tokens=ACTOR_MAX_OUTPUT_TOKENS, reasoning={'effort': ACTOR_REASONING_EFFORT},
        ) as stream:
            for event in stream:
                if event.type != 'response.output_text.delta':
                    continue
                delta = event.delta
                if not isinstance(delta, str):
                    raise ValueError('Invalid text delta')
                if not delta:
                    continue
                accumulated += delta
                # Match the Node bound, including Unicode surrogate pairs.
                if len(accumulated.encode('utf-16-le')) // 2 > 1200:
                    raise ValueError('Reply too large')
                emit_message({'delta': delta})
                if lead is None:
                    candidate = first_substantive_sentence(accumulated)
                    if candidate is not None:
                        if len(candidate.encode('utf-16-le')) // 2 > 900:
                            raise ValueError('Lead too large')
                        lead = candidate
                        emit_message({'lead': lead})
            result = stream.get_final_response()
        usage = normalized_usage(getattr(result, 'usage', None))
        if usage is not None:
            emit_message({'usage': usage})
        if result.status != 'completed' or not isinstance(result.output_text, str) or result.output_text != accumulated:
            raise ValueError('Incomplete or inconsistent response')
        text = result.output_text.strip()
        if not text or len(text.encode('utf-16-le')) // 2 > 900 or (lead is not None and not text.startswith(lead)):
            raise ValueError('Invalid final response')
        # The caller must validate the complete text before publishing any audio.
        emit_message({'done': True, 'text': text, 'lead': lead})
        return None
    if job.get('kind') == 'speech':
        result = client.audio.speech.create(
            model='gpt-4o-mini-tts-2025-12-15', voice=job.get('voice', 'marin'),
            input=job['text'], instructions=job['instructions'],
            response_format='mp3', speed=1.0,
        )
        usage = normalized_usage(getattr(result, 'usage', None))
        data = result.content
        if not data or len(data) > 4_000_000:
            raise ProviderResultError('Invalid audio', usage)
        return with_usage({'audio': base64.b64encode(data).decode('ascii')}, usage)
    if job.get('kind') == 'speech_stream':
        total = 0
        with client.audio.speech.with_streaming_response.create(
            model='gpt-4o-mini-tts-2025-12-15', voice=job.get('voice', 'marin'),
            input=job['text'], instructions=job['instructions'],
            response_format='mp3', speed=1.0,
        ) as response:
            try:
                for chunk in response.iter_bytes(chunk_size=4096):
                    if not chunk:
                        continue
                    if not isinstance(chunk, bytes) or len(chunk) > 4096:
                        raise ValueError('Invalid audio chunk')
                    total += len(chunk)
                    if total > 4_000_000:
                        raise ValueError('Invalid audio size')
                    emit_message({'chunk': base64.b64encode(chunk).decode('ascii')})
            finally:
                # Binary MP3 responses normally have no usage. Capture it only
                # when the SDK response actually supplies numeric metadata.
                usage = normalized_usage(getattr(response, 'usage', None))
                if usage is not None:
                    emit_message({'usage': usage})
        if total < 100:
            raise ValueError('Incomplete audio')
        emit_message({'done': True, 'bytes': total})
        return None
    raise ValueError('Invalid operation')


def main():
    try:
        import openai
        OpenAI, AuthenticationError, RateLimitError, APITimeoutError = openai.OpenAI, openai.AuthenticationError, openai.RateLimitError, openai.APITimeoutError
        APIConnectionError = getattr(openai, 'APIConnectionError', ())
        APIStatusError = getattr(openai, 'APIStatusError', ())
        data = sys.stdin.buffer.read(200_001)
        if len(data) > 200_000:
            raise ValueError('Request too large')
        job = json.loads(data)
        client = OpenAI(base_url='https://api.openai.com/v1', max_retries=0, timeout=30.0)
        try:
            output = run(job, client)
        except AuthenticationError:
            output = {'error': 'provider_auth', 'diagnosticCode': 'provider_auth'}
        except RateLimitError:
            output = {'error': 'provider_limit', 'diagnosticCode': 'provider_limit'}
        except APITimeoutError:
            output = {'error': 'provider_timeout', 'diagnosticCode': 'provider_timeout'}
        except APIConnectionError:
            output = {'error': 'provider_unavailable', 'diagnosticCode': 'provider_connection'}
        except APIStatusError as error:
            output = {'error': 'provider_unavailable', 'diagnosticCode': 'provider_status'}
            status = getattr(error, 'status_code', None)
            if type(status) is int and 400 <= status <= 599:
                output['httpStatus'] = status
    except Exception as error:
        internal_codes = {
            'Invalid text delta': 'protocol_encoding', 'Reply too large': 'protocol_size',
            'Lead too large': 'protocol_size', 'Incomplete or inconsistent response': 'actor_incomplete',
            'Invalid final response': 'protocol_final', 'Invalid audio chunk': 'protocol_encoding',
            'Invalid audio size': 'protocol_size', 'Incomplete audio': 'speech_incomplete',
            'Invalid audio': 'speech_incomplete',
        }
        code = getattr(error, 'diagnostic_code', None) or internal_codes.get(str(error), 'unknown')
        output = with_usage({'error': 'provider_unavailable', 'diagnosticCode': code}, getattr(error, 'usage', None))
    if output is not None:
        emit_message(output)


if __name__ == '__main__':
    main()
