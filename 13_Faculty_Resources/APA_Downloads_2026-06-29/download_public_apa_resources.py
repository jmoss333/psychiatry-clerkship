#!/usr/bin/env python3
"""Download public APA document resources relevant to the clerkship library.

This deliberately does not mirror member-only books, journals, course videos,
or subscription pages. It downloads only direct public document files exposed
from selected official APA pages and writes a manifest for faculty review.
"""

from __future__ import annotations

import csv
import hashlib
import html
import mimetypes
import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path

import requests


BASE = Path('/Users/jm/Psychiatry-Clerkship-Library/13_Faculty_Resources/APA_Downloads_2026-06-29')
FILES = BASE / 'files'
METADATA = BASE / 'metadata'
SITEMAP = 'https://www.psychiatry.org/sitemap.xml'

HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
}

PAGE_PREFIXES = (
  'https://www.psychiatry.org/patients-families',
  'https://www.psychiatry.org/residents-medical-students',
  'https://www.psychiatry.org/psychiatrists/practice/dsm',
  'https://www.psychiatry.org/psychiatrists/practice/telepsychiatry',
  'https://www.psychiatry.org/psychiatrists/practice/professional-interests/collaborative-care',
  'https://www.psychiatry.org/psychiatrists/practice/professional-interests/integrated-care',
  'https://www.psychiatry.org/psychiatrists/practice/professional-interests/women-s-mental-health',
  'https://www.psychiatry.org/psychiatrists/practice/clinical-practice-guidelines',
  'https://www.psychiatry.org/psychiatrists/diversity/education',
  'https://www.psychiatry.org/psychiatrists/education/smi-adviser',
  'https://www.psychiatry.org/psychiatrists/education/apa-learning-center',
)

DOCUMENT_EXTENSIONS = ('.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv')
DOCUMENT_CONTENT_TYPES = (
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-',
  'text/csv',
)


@dataclass
class Link:
  source_page: str
  source_title: str
  text: str
  url: str


class LinkParser(HTMLParser):
  def __init__(self, base_url: str) -> None:
    super().__init__()
    self.base_url = base_url
    self.links: list[dict[str, str]] = []
    self.title = ''
    self._in_title = False
    self._current_href: str | None = None
    self._current_text: list[str] = []

  def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
    attr = dict(attrs)
    if tag.lower() == 'title':
      self._in_title = True
    if tag.lower() == 'a' and attr.get('href'):
      self._current_href = urllib.parse.urljoin(self.base_url, attr['href'] or '')
      self._current_text = []

  def handle_endtag(self, tag: str) -> None:
    if tag.lower() == 'title':
      self._in_title = False
    if tag.lower() == 'a' and self._current_href:
      self.links.append({
        'href': self._current_href,
        'text': ' '.join(' '.join(self._current_text).split()),
      })
      self._current_href = None
      self._current_text = []

  def handle_data(self, data: str) -> None:
    if self._in_title:
      self.title += data
    if self._current_href:
      self._current_text.append(data)


def clean_text(value: str) -> str:
  value = html.unescape(value or '')
  return ' '.join(value.replace('\xa0', ' ').split())


def safe_filename(text: str, fallback: str) -> str:
  text = urllib.parse.unquote(text or fallback)
  text = re.sub(r'[?#].*$', '', text)
  text = Path(text).name or fallback
  text = re.sub(r'[^A-Za-z0-9._-]+', '_', text).strip('._-')
  return text[:140] or fallback


def load_sitemap_pages() -> list[str]:
  response = requests.get(SITEMAP, headers=HEADERS, timeout=30)
  response.raise_for_status()
  root = ET.fromstring(response.text)
  ns = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
  urls = [loc.text or '' for loc in root.findall('.//sm:loc', ns)]
  return sorted(url for url in urls if url.startswith(PAGE_PREFIXES))


def fetch_page_links(url: str) -> tuple[str, list[dict[str, str]]]:
  response = requests.get(url, headers=HEADERS, timeout=(6, 12))
  response.raise_for_status()
  parser = LinkParser(url)
  parser.feed(response.text)
  return clean_text(parser.title), parser.links


def looks_like_document(url: str) -> bool:
  parsed = urllib.parse.urlparse(url)
  path = parsed.path.lower()
  if path.endswith(DOCUMENT_EXTENSIONS):
    return True
  if '/getmedia/' in path or '/getattachment/' in path:
    return True
  return False


def document_type(url: str) -> tuple[bool, str]:
  parsed = urllib.parse.urlparse(url)
  ext = Path(parsed.path).suffix.lower()
  if ext in DOCUMENT_EXTENSIONS:
    return True, mimetypes.types_map.get(ext, '')
  try:
    response = requests.head(url, headers=HEADERS, timeout=(5, 10), allow_redirects=True)
    content_type = response.headers.get('content-type', '').split(';')[0].lower()
    if response.status_code >= 400 or not content_type:
      response = requests.get(url, headers=HEADERS, timeout=(5, 10), stream=True, allow_redirects=True)
      content_type = response.headers.get('content-type', '').split(';')[0].lower()
      response.close()
  except requests.RequestException:
    return False, ''
  return any(content_type.startswith(prefix) for prefix in DOCUMENT_CONTENT_TYPES), content_type


def download(link: Link, content_type: str) -> dict[str, str]:
  response = requests.get(link.url, headers=HEADERS, timeout=(8, 45))
  response.raise_for_status()
  digest = hashlib.sha256(response.content).hexdigest()
  parsed = urllib.parse.urlparse(response.url)
  filename = safe_filename(parsed.path, digest[:12])
  if '.' not in filename and content_type == 'application/pdf':
    filename += '.pdf'
  target = FILES / f'{digest[:10]}_{filename}'
  if not target.exists():
    target.write_bytes(response.content)
  return {
    'source_page': link.source_page,
    'source_title': link.source_title,
    'link_text': link.text,
    'url': link.url,
    'final_url': response.url,
    'content_type': content_type or response.headers.get('content-type', '').split(';')[0],
    'filename': target.name,
    'path': str(target),
    'bytes': str(len(response.content)),
    'sha256': digest,
  }


def main() -> None:
  FILES.mkdir(parents=True, exist_ok=True)
  METADATA.mkdir(parents=True, exist_ok=True)
  pages = load_sitemap_pages()
  (METADATA / 'crawled_pages.txt').write_text('\n'.join(pages) + '\n', encoding='utf-8')

  candidates: dict[str, Link] = {}
  page_errors = []

  def collect_page(page: str) -> tuple[str, str, list[dict[str, str]], str]:
    try:
      title, links = fetch_page_links(page)
    except requests.RequestException as exc:
      return page, '', [], str(exc)
    return page, title, links, ''

  with ThreadPoolExecutor(max_workers=8) as pool:
    futures = [pool.submit(collect_page, page) for page in pages]
    for idx, future in enumerate(as_completed(futures), 1):
      page, title, links, error = future.result()
      if error:
        page_errors.append({'page': page, 'error': error})
        continue
      print(f'pages {idx}/{len(pages)}: {page}', flush=True)
      for raw in links:
        url = raw['href'].split('#', 1)[0]
        if not url.startswith('https://www.psychiatry.org/'):
          continue
        if not looks_like_document(url):
          continue
        candidates.setdefault(url, Link(
          source_page=page,
          source_title=title,
          text=clean_text(raw['text']),
          url=url,
        ))

  rows = []
  skipped = []

  def process_document(link: Link) -> tuple[dict[str, str] | None, dict[str, str] | None]:
    ok, ctype = document_type(link.url)
    if not ok:
      return None, {
        'source_page': link.source_page,
        'link_text': link.text,
        'url': link.url,
        'reason': f'not_document:{ctype}',
      }
    try:
      return download(link, ctype), None
    except requests.RequestException as exc:
      return None, {
        'source_page': link.source_page,
        'link_text': link.text,
        'url': link.url,
        'reason': f'download_error:{exc}',
      }

  candidate_list = list(candidates.values())
  with ThreadPoolExecutor(max_workers=6) as pool:
    futures = [pool.submit(process_document, link) for link in candidate_list]
    for idx, future in enumerate(as_completed(futures), 1):
      row, skip = future.result()
      if row:
        rows.append(row)
      if skip:
        skipped.append(skip)
      print(f'documents {idx}/{len(candidate_list)}', flush=True)

  manifest = METADATA / 'manifest.csv'
  fieldnames = [
    'source_page', 'source_title', 'link_text', 'url', 'final_url',
    'content_type', 'filename', 'path', 'bytes', 'sha256',
  ]
  with manifest.open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

  with (METADATA / 'skipped.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=['source_page', 'link_text', 'url', 'reason'])
    writer.writeheader()
    writer.writerows(skipped)

  with (METADATA / 'page_errors.csv').open('w', newline='', encoding='utf-8') as handle:
    writer = csv.DictWriter(handle, fieldnames=['page', 'error'])
    writer.writeheader()
    writer.writerows(page_errors)

  summary = (
    f'pages_crawled={len(pages)}\n'
    f'document_candidates={len(candidates)}\n'
    f'downloaded={len(rows)}\n'
    f'skipped={len(skipped)}\n'
    f'page_errors={len(page_errors)}\n'
  )
  (METADATA / 'summary.txt').write_text(summary, encoding='utf-8')
  print(summary, end='')


if __name__ == '__main__':
  main()
