# Link-Resolution Handoff — Books (Amazon) & Podcasts (YouTube)

Two CSVs to resolve exact links. Fill the single blank column in each, hand them back, and Dr. Moss's hub will swap the channel-search links for exact video URLs and add Amazon links to the book page.

## Files
- `books_handoff.csv` — fill `amazon_url_TO_FILL` with the canonical US product page (`https://www.amazon.com/dp/<ASIN>`).
- `podcasts_handoff.csv` — fill `youtube_url_TO_FILL` with the exact video (`https://www.youtube.com/watch?v=<ID>`).

## Option A — Codex
For each BOOK row: search Amazon for `title` + `author`; choose the real book (NOT a study guide/summary/workbook), prefer the named author, US store; record the canonical `/dp/<ASIN>` URL.
For each PODCAST row: on the channel **@psychiatrypsychotherapy6939**, find the video whose title matches `full_title`; record the `watch?v=` URL.
Validation: the `episode_number` must appear in the resolved YouTube title; the Amazon result author must match `author`.

## Option B — Apify actors
- YouTube: `streamers/youtube-scraper` or `apidojo/youtube-scraper` — feed `youtube_channel_search_url` (or a `Psychiatry Psychotherapy Podcast <full_title>` query), take the top channel-matched result.
- Amazon: `junglee/free-amazon-product-scraper` or `apify/amazon-product-scraper` — feed `amazon_search_url`, take the first organic product.
Then validate as above before writing the URL back.

*Faculty handoff artifact — not part of the student site.*
