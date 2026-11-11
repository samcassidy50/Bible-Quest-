# World English Bible (WEB) source text

Vendored Scripture used by Bible Quest. **Never edit these files by hand**; re-import them instead.

- **Translation:** World English Bible (eBible.org edition `eng-web`)
- **License:** Public Domain. "World English Bible" is a trademark of eBible.org; the name is used here only to identify the source text.
- **Source:** https://ebible.org/Scriptures/eng-web_vpl.zip (verse-per-line text, last modified 2026-11-10)
- **Downloaded:** 2026-11-11
- **Zip SHA-256:** `ae3b6acaaca97356311410e0e9a318d964140f8a4082394e8810776a111f944c`

## Files

| File      | Contents                                                            | SHA-256                                                            |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GEN.txt` | Genesis, 1,533 verses, one per line: `GEN <chapter>:<verse> <text>` | `b1853b1b5d7623863578325edbe3401e12dbf592ca95e86deb1c89c0b112873f` |

## Adding a book

1. Download `eng-web_vpl.zip` from the source above into a scratch folder.
2. `grep "^EXO " eng-web_vpl.txt > content/source/web/EXO.txt` (use the book's 3-letter code).
3. Add the file and its SHA-256 to the table above.
