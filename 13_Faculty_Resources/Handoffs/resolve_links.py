#!/usr/bin/env python3
"""Resolve handoff Amazon and YouTube links.

Writes only the requested URL columns and review reports. The resolver is
conservative: it leaves ambiguous rows blank rather than fabricating links.
"""

from __future__ import annotations

import csv
import html
import json
import re
import subprocess
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

import requests


BASE = Path('/Users/jm/Psychiatry-Clerkship-Library/13_Faculty_Resources/Handoffs')
YTDLP = BASE / '.link_resolver_venv/bin/yt-dlp'
CHANNEL_ID = 'UCDV4XSQbdB3n6X3QirO5i_w'
CHANNEL_HANDLE = '@psychiatrypsychotherapy6939'

# Verified manual overrides for titles where the channel's current public
# title differs enough from the handoff title that token matching is brittle.
PODCAST_OVERRIDES_BY_TITLE = {
  'Hormonal Contraceptives and Mental Health': 'Z_MRaEZ-4NI',
  'Microexpressions Part 1': 'AkWMEe9pDCA',
  'Microexpressions Part 2': 'jFhFcoVTZdI',
  'Microexpressions in Psychotherapy Part 3': 'kb_cXrVFjsY',
  'How to Fix Emotional Detachment': '4wM_cw7qY5A',
  'Emotional Shutdown - Polyvagal Theory': 'dVrT_QqqyZs',
  'Eating Disorders Overview': 'ZZgEz8c_NzI',
  'Suicide Epidemiology and Prevention': '_5ebgHRNmCw',
  'Neuralink and Mental Health': 'PhxZ33kAhMI',
  'Fentanyl and the Opioid Crisis': '7ZiJKV-sy9Q',
  'Joker Character Analysis': '_xv240cm_to',
  'IQ and Environmental Factors': '-jmXWOCsXts',
  'Valproic Acid Deep Dive': '8dnqdB03bks',
  'Cancer and Mental Health': 'Ilv9OoMaZW4',
  'Free Will in Psychiatry Part 1': 'N9gYwgMkT-k',
  'Free Will Part 2': 'zxM9opzlycI',
  'Free Will Part 3': '4HRjlTn1adM',
  'Disorganized Attachment Part 1': 'ZS45l18sWAg',
  'Disorganized Attachment Part 2': 'Y3eW7mvX4f0',
  'Big Five Neuroticism Part 1': 'kxGGuQgfBUk',
  'Big Five Neuroticism Part 2': 't-rKwbtHF8k',
  'Big Five Conscientiousness Part 1': 'Rb7JuaarA7s',
  'Big Five Conscientiousness Part 2': 'QsbuCMJs56o',
  'Psilocybin Therapy Part 1': '6atRgjYIip0',
  'Psilocybin Therapy Part 2': 'XC7KP43U3DY',
  "Hero's Journey": 'cWXrKYqRUUE',
  "Hero's Journey for Professionals": 'XX-eDb6JLjY',
  'SNRIs Deep Dive Part 1': 'MsOVGtstdEM',
  'SNRIs Deep Dive Part 2': '5a8BdHV9Go0',
  'Female Psychopathy': '7c3SwebWYtQ',
  'Treating VIP Patients': 'WFzhMU2z7Pw',
  'Exercise as Medicine': 'YQrhLzKcDW4',
  'Psychodynamic Therapy Evidence': 'Wxmzk8IE0ew',
  'Integrating Psychotherapy': 'p2XkYUZRsJ0',
  'Conrad Roy Case Analysis': 'Ri3Z-2nLssk',
  'Microdosing Psychedelics': 'e4l1TiKnX9s',
  'Emerging Drugs': '0lQlRRSOiZM',
  'Pregnancy and Psych Meds': 'ba8MyUs3I2g',
  'Resisting Conformity': '1LlxOHciMZg',
  'Eating Disorders Medical Care': 'dZOH0jbPXo4',
  'Mentalization-Based Therapy': 'OlaHnCCi8kE',
  'ACEs Part 2': 'xMkt1WyZzAw',
  'Q&A with Dr. Cummings': 'FOlmOKGCBIE',
  'Q&A Part 2': 'KgrpJEcExps',
  'Weight Gain from Psych Meds': 'JMHLFLCU7Qc',
  'Cold Exposure Benefits': 'Xnvy6MA4jGY',
  'Therapy Termination': 'uvtw_zsSDjw',
  'Clozapine Update': '3nv3XLluQ1Q',
  'The Bear TV Show Analysis': 'IewBzMztsB4',
  'Pediatric Catatonia': 'nZCav67MXBs',
}

PODCAST_TITLES_TO_LEAVE_BLANK = {
  'Bipolar I and II - Diagnosis and Treatment',
  'OCD Psychotherapy',
}

BOOK_ASIN_OVERRIDES_BY_TITLE = {
  'Stop Walking on Eggshells': '1684036895',
  'I Hate You': '0593418492',
  'The Buddha and the Borderline': '157224710X',
  'Borderline Personality Disorder Demystified': '0738220248',
  'Codependent No More': '0894864025',
  'Adult Children of Emotionally Immature Parents': '1626251703',
  'Set Boundaries Find Peace': '0593192095',
  'Crucial Conversations': '1260474186',
  'Nonviolent Communication': '189200528X',
  'Hold Me Tight': '031611300X',
  'Attached': '1585429139',
  'Wired for Love': '1608820580',
  'The Body Keeps the Score': '0143127748',
  'The Pain We Carry: Healing from Complex PTSD for People of Color': '1684039312',
  '8 Keys to Safe Trauma Recovery': '0393706052',
  'What Happened to You?': '1250223180',
  'In the Realm of Hungry Ghosts': '155643880X',
  'When the Body Says No': '0470923350',
  'Beyond Addiction': '1476709475',
  'This Naked Mind': '0525537236',
  'Addict in the Family': '1616499559',
  'An Unquiet Mind': '0679763309',
  'Loving Someone with Bipolar Disorder': '1608822192',
  'Feeling Good': '0380810336',
  'Reasons to Stay Alive': '0143128728',
  'Noonday Demon': '1501123882',
  "I Am Not Sick I Don't Need Help!": '0985206705',
  'Surviving Schizophrenia for Families': '1593852738',
  'The Center Cannot Hold': '1401309445',
  'Taking Charge of Adult ADHD': '1462546854',
  'Driven to Distraction': '0307743152',
  'Scattered Minds': '0593714377',
  'Whole-Brain Child': '0553386697',
  'Brainstorm': '158542935X',
  'Mindsight': '0553386395',
  'Power of Showing Up': '1524797715',
  'Four Thousand Weeks': '1250849357',
  "Man's Search for Meaning": '0807014273',
  'Happiness Trap': '1645471160',
  'When Things Fall Apart': '1611803438',
  'Full Catastrophe Living': '0345536932',
  'Think Again': '1984878107',
  'Give and Take': '0143124986',
  'Atlas of the Heart': '0399592555',
  'Daring Greatly: How the Courage to Be Vulnerable Transforms the Way We Live': '1592408419',
  "It's OK That You're Not OK": '1622039076',
  'Bearing the Unbearable': '1614292965',
  'No Time to Say Goodbye': '0385485514',
  'Option B': '1524732680',
  'Being Mortal': '1250076226',
  "A Beginner's Guide to the End": '1501157167',
}


def norm(text: str) -> str:
  text = (text or '').lower()
  text = text.replace('&', ' and ')
  text = re.sub(r'episode\s*0*\d+\s*[:\-–—]*\s*', ' ', text)
  text = re.sub(r'\bpsychiatry\b|\bpsychotherapy\b|\bpodcast\b|\bdr\b|\bdavid\b|\bpuder\b', ' ', text)
  text = re.sub(r'[^a-z0-9]+', ' ', text)
  return re.sub(r'\s+', ' ', text).strip()


def tokens(text: str) -> set[str]:
  stop = {
    'the', 'and', 'or', 'of', 'to', 'a', 'an', 'with', 'for', 'in', 'on',
    'part', 'episode', 'book', 'guide', 'how', 'what', 'is',
  }
  return {t for t in norm(text).split() if len(t) > 2 and t not in stop}


def token_score(target: str, candidate: str) -> float:
  tt = tokens(target)
  ct = tokens(candidate)
  if not tt or not ct:
    return 0.0
  recall = len(tt & ct) / len(tt)
  jaccard = len(tt & ct) / len(tt | ct)
  return 0.75 * recall + 0.25 * jaccard


def load_channel_videos() -> list[dict[str, str]]:
  jsonl = BASE / 'youtube_channel_flat.jsonl'
  if not jsonl.exists():
    subprocess.run(
      [str(YTDLP), '--flat-playlist', '--dump-json', f'https://www.youtube.com/{CHANNEL_HANDLE}/videos'],
      check=True,
      stdout=jsonl.open('w', encoding='utf-8'),
    )
  videos = []
  for line in jsonl.read_text(encoding='utf-8').splitlines():
    if not line.strip():
      continue
    data = json.loads(line)
    videos.append({
      'id': data.get('id', ''),
      'title': data.get('title', ''),
      'channel_id': data.get('channel_id') or data.get('channel') or '',
    })
  return videos


def ytdlp_search(query: str, limit: int = 5) -> list[dict[str, str]]:
  cache_dir = BASE / '.yt_search_cache'
  cache_dir.mkdir(exist_ok=True)
  cache_key = re.sub(r'[^a-zA-Z0-9]+', '_', query)[:180] + '.jsonl'
  cache_path = cache_dir / cache_key
  if not cache_path.exists():
    result = subprocess.run(
      [str(YTDLP), '--flat-playlist', '--dump-json', f'ytsearch{limit}:{query}'],
      check=False,
      stdout=subprocess.PIPE,
      stderr=subprocess.DEVNULL,
      text=True,
      timeout=30,
    )
    cache_path.write_text(result.stdout, encoding='utf-8')
    time.sleep(0.25)
  out = []
  for line in cache_path.read_text(encoding='utf-8').splitlines():
    if not line.strip():
      continue
    try:
      data = json.loads(line)
    except json.JSONDecodeError:
      continue
    out.append({
      'id': data.get('id', ''),
      'title': data.get('title', ''),
      'channel_id': data.get('channel_id') or '',
      'channel': data.get('channel') or data.get('uploader') or '',
    })
  return out


def youtube_channel_search(search_url: str) -> list[dict[str, str]]:
  cache_dir = BASE / '.yt_channel_search_cache'
  cache_dir.mkdir(exist_ok=True)
  cache_key = re.sub(r'[^a-zA-Z0-9]+', '_', search_url)[-180:] + '.html'
  cache_path = cache_dir / cache_key
  if not cache_path.exists():
    response = requests.get(
      search_url,
      headers={'User-Agent': 'Mozilla/5.0'},
      timeout=20,
    )
    cache_path.write_text(response.text, encoding='utf-8')
    time.sleep(0.15)
  text = cache_path.read_text(encoding='utf-8')
  found = []
  seen = set()
  for match in re.finditer(r'"videoId":"([A-Za-z0-9_-]{11})"', text):
    video_id = match.group(1)
    if video_id in seen:
      continue
    seen.add(video_id)
    chunk = text[match.start():match.start() + 2500]
    title_match = re.search(r'"title":\{"runs":\[\{"text":"([^"]+)"', chunk)
    raw_title = title_match.group(1) if title_match else ''
    try:
      title = json.loads(f'"{raw_title}"')
    except Exception:
      title = raw_title.replace(r'\u0026', '&').replace(r'\"', '"')
    found.append({
      'id': video_id,
      'title': title,
      'channel_id': CHANNEL_ID,
      'channel': 'Psychiatry & Psychotherapy',
    })
  return found


def resolve_podcasts() -> None:
  videos = load_channel_videos()
  rows = list(csv.DictReader((BASE / 'podcasts_handoff.csv').open(newline='', encoding='utf-8-sig')))
  review = []
  for i, row in enumerate(rows, 1):
    title = row['full_title'] or row['title']
    if row['title'] in PODCAST_TITLES_TO_LEAVE_BLANK:
      row['youtube_url_TO_FILL'] = ''
      review.append({
        'row': i,
        'episode_number': row.get('episode_number', ''),
        'full_title': title,
        'best_score': '',
        'best_source': 'manual-review',
        'best_video_id': '',
        'best_video_title': '',
        'reason': 'no_unambiguous_channel_match',
      })
      continue

    override_video_id = PODCAST_OVERRIDES_BY_TITLE.get(row['title'])
    if override_video_id:
      row['youtube_url_TO_FILL'] = f'https://www.youtube.com/watch?v={override_video_id}'
      continue

    candidates = []
    for video in videos:
      score = token_score(title, video['title'])
      if score:
        candidates.append((score, 'channel-index', video))

    candidates.sort(key=lambda item: item[0], reverse=True)
    best = candidates[0] if candidates else (0, 'none', {'id': '', 'title': ''})

    # Short or generated titles often need exact channel search. It can find
    # older videos whose channel-index title has changed substantially.
    if best[0] < 0.72:
      for result in youtube_channel_search(row['youtube_channel_search_url']):
        score = token_score(title, result['title'])
        candidates.append((score + 0.08, 'channel-search', result))
      candidates.sort(key=lambda item: item[0], reverse=True)
      best = candidates[0] if candidates else best

    score, source, video = best
    accepted = score >= 0.62
    # Non-numbered generated rows need stronger title agreement.
    if not row.get('episode_number') and score < 0.78:
      accepted = False
    if accepted and video.get('id'):
      row['youtube_url_TO_FILL'] = f'https://www.youtube.com/watch?v={video["id"]}'
    else:
      row['youtube_url_TO_FILL'] = ''
      review.append({
        'row': i,
        'episode_number': row.get('episode_number', ''),
        'full_title': title,
        'best_score': f'{score:.3f}',
        'best_source': source,
        'best_video_id': video.get('id', ''),
        'best_video_title': video.get('title', ''),
        'reason': 'ambiguous_or_not_found',
      })

  with (BASE / 'podcasts_handoff.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

  if review:
    with (BASE / 'podcasts_unresolved_review.csv').open('w', newline='', encoding='utf-8') as handle:
      writer = csv.DictWriter(handle, fieldnames=review[0].keys())
      writer.writeheader()
      writer.writerows(review)
  else:
    (BASE / 'podcasts_unresolved_review.csv').write_text('', encoding='utf-8')


def ddg_results(query: str) -> list[dict[str, str]]:
  cache_dir = BASE / '.amazon_search_cache'
  cache_dir.mkdir(exist_ok=True)
  cache_key = re.sub(r'[^a-zA-Z0-9]+', '_', query)[:180] + '.html'
  cache_path = cache_dir / cache_key
  if not cache_path.exists():
    response = requests.get(
      'https://html.duckduckgo.com/html/',
      params={'q': query},
      headers={'User-Agent': 'Mozilla/5.0'},
      timeout=20,
    )
    cache_path.write_text(response.text, encoding='utf-8')
    time.sleep(0.4)
  text = cache_path.read_text(encoding='utf-8')
  results = []
  pattern = re.compile(
    r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'(?:class="result__snippet"[^>]*>(.*?)</a>)?',
    re.S,
  )
  for match in pattern.finditer(text):
    href = html.unescape(match.group(1))
    title = html.unescape(re.sub('<.*?>', '', match.group(2)))
    snippet = html.unescape(re.sub('<.*?>', '', match.group(3) or ''))
    parsed = urllib.parse.urlparse(href)
    qs = urllib.parse.parse_qs(parsed.query)
    real = urllib.parse.unquote(qs.get('uddg', [href])[0])
    results.append({'title': title, 'snippet': snippet, 'url': real})
  return results


def author_surnames(author: str) -> set[str]:
  names = re.split(r'&|,| and | et al', author or '')
  surnames = set()
  for name in names:
    parts = re.findall(r"[A-Za-zÀ-ÿ'-]+", name)
    if parts:
      surnames.add(parts[-1].lower())
  return surnames


def extract_asin(url: str) -> str:
  match = re.search(r'amazon\.com/(?:[^?#]*/)?(?:dp|gp/product)/([A-Z0-9]{10}|[0-9]{9}[0-9X])', url)
  return match.group(1) if match else ''


def resolve_books() -> None:
  rows = list(csv.DictReader((BASE / 'books_handoff.csv').open(newline='', encoding='utf-8-sig')))
  review = []
  for i, row in enumerate(rows, 1):
    override_asin = BOOK_ASIN_OVERRIDES_BY_TITLE.get(row['title'])
    if override_asin:
      row['amazon_url_TO_FILL'] = f'https://www.amazon.com/dp/{override_asin}'
      continue

    query = f'Amazon {row["title"]} {row["author"]} book'
    candidates = []
    for result in ddg_results(query):
      url = result['url']
      asin = extract_asin(url)
      if not asin:
        continue
      if not url.startswith('https://www.amazon.com/'):
        continue
      blob = f'{result["title"]} {result["snippet"]} {url}'
      score = token_score(row['title'], blob)
      surnames = author_surnames(row['author'])
      blob_l = blob.lower()
      if surnames:
        score += 0.15 * (len([s for s in surnames if s in blob_l]) / len(surnames))
      if not asin.startswith('B'):
        score += 0.08
      if re.search(r'kindle|ebook|audible|summary|workbook|study guide', blob_l):
        score -= 0.12
      candidates.append((score, asin, result))

    candidates.sort(key=lambda item: item[0], reverse=True)
    if candidates and candidates[0][0] >= 0.45:
      row['amazon_url_TO_FILL'] = f'https://www.amazon.com/dp/{candidates[0][1]}'
    else:
      row['amazon_url_TO_FILL'] = ''
      best = candidates[0] if candidates else (0, '', {'title': '', 'url': ''})
      review.append({
        'row': i,
        'title': row['title'],
        'author': row['author'],
        'best_score': f'{best[0]:.3f}',
        'best_asin': best[1],
        'best_result_title': best[2].get('title', ''),
        'best_result_url': best[2].get('url', ''),
        'reason': 'ambiguous_or_not_found',
      })

  with (BASE / 'books_handoff.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

  if review:
    with (BASE / 'books_unresolved_review.csv').open('w', newline='', encoding='utf-8') as handle:
      writer = csv.DictWriter(handle, fieldnames=review[0].keys())
      writer.writeheader()
      writer.writerows(review)
  else:
    (BASE / 'books_unresolved_review.csv').write_text('', encoding='utf-8')


def main() -> None:
  resolve_podcasts()
  resolve_books()


if __name__ == '__main__':
  main()
