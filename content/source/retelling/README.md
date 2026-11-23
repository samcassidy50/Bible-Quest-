# Kid-friendly retelling

The verse text Bible Quest shows and reads aloud. Each verse is retold in simple words for
children, keeping the meaning of the passage: nothing added or left out that changes what it says.

- **Format:** one verse per line, `GEN <chapter>:<verse> <text>`. Only the verses the game uses
  are here (a unit test checks every line is read by some passage).
- **How it is made:** retold verse by verse from a public-domain English translation open beside
  the writer, never from memory. Retold verses are **drafts** until a human reviews them.
- **Narration:** after changing a verse, re-record it with `scripts/audio/narrate.py` (a unit test
  fails while any verse has no up-to-date recording).
- **Questions:** each encounter's question `highlight` and orb `word` must appear word for word in
  this text; `npm run validate:content` checks them.

## Adding a book

1. Create `<CODE>.txt` here (3-letter book code) with the retold verses.
2. Add the book to `BOOK_NAMES` in `src/core/content/bible.ts` and import the file in
   `src/content/index.ts`.
