# Berean Standard Bible (BSB) source text

Vendored Scripture used by Bible Quest. **Never edit these files by hand**; re-import them instead.

- **Translation:** Berean Standard Bible (BSB)
- **License:** Public domain. The publisher dedicated the text to the public domain on April 30, 2023 (https://berean.bible/licensing.htm). Attribution is appreciated but not required: "The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee." The publisher asks that the Berean name is not used for altered text, so the text here is kept verbatim.
- **Source:** https://bereanbible.com/bsb.txt (tab-separated `Genesis 1:1<TAB>text`, last modified 2026-07-31)
- **Downloaded:** 2026-11-12
- **Download SHA-256:** `2ac3af1de52d4e68261cba91d85c320b7eadc6560e830d99e591767b8ff5ca96`

The game used the World English Bible until 2026-11-12; the BSB replaced it because it reads more
naturally aloud.

## Files

| File      | Contents                                                            | SHA-256                                                            |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GEN.txt` | Genesis, 1,533 verses, one per line: `GEN <chapter>:<verse> <text>` | `fcb471c079d04cac220bd9fbfd6a3a07d9e2714b6f3a0af9ce768ec39ec2744c` |

## Adding a book

1. Download `bsb.txt` from the source above into a scratch folder.
2. Convert the book's lines to the verse-per-line format, changing only the reference and the tab
   (use the book's 3-letter code):
   `grep "^Exodus " bsb.txt | perl -pe 's/\r//; s/^Exodus (\d+:\d+)\t/EXO $1 /' > content/source/bsb/EXO.txt`
3. Add the file and its SHA-256 to the table above, and the book to `BOOK_NAMES` in
   `src/core/content/bible.ts`.
