# Scriptorium

A candle-lit desk for writing books. Desktop app (Electron); end users just run `Scriptorium Setup.exe`.

## Your books are yours

Everything you write in Scriptorium belongs to you. Sell it, publish it, give it away: the software's license has no say over your books. The fonts bundled with the app may be embedded in your `.tome` files, which their licenses allow.

## License

Copyright (C) 2026 Zadamanim

Scriptorium is free software: you can redistribute it and/or modify it under the terms of the **GNU General Public License, version 3 or later** (see `LICENSE`). It comes with **no warranty**.

In short, anyone may use, study, change and share Scriptorium, even for money, but every copy and every changed version must stay under the GPL and come with its full source code. Bundled fonts and libraries keep their own licenses; see `THIRD_PARTY_NOTICES.md`.

## Build it yourself

You need Node.js 20+ installed on the build machine. End users need nothing.

```
npm install
npm start            # run in development
npm run dist         # builds dist/Scriptorium Setup <version>.exe (run on Windows)
```

## Publishing a new edition (the raven updater)

Scriptorium's raven checks the **latest GitHub Release** of the repository named in `package.json → scriptorium.updateRepo` (`Zadamanim/Scriptorium`).

New editions are built by **GitHub Actions** (`.github/workflows/draft-release.yml`):

1. Raise `version` in `package.json` (for example `0.4.0` → `0.4.1`), and write `release-notes/v0.4.1.md`. The raven reads these notes aloud.
2. Push, then push a tag with the same version: `git tag v0.4.1 && git push origin v0.4.1`.
3. GitHub builds the Windows installer from the published source and opens a **draft** release with it attached.
4. A human reviews the draft (download and try the installer if you like) and clicks **Publish**. The raven ignores drafts and pre-releases, so nothing reaches anyone before that.

When a user accepts, the raven:

1. downloads the installer and checks it against GitHub's SHA-256, refusing anything damaged;
2. zips the whole Library into `Documents/Scriptorium/Library Backups/`, keeping the last 5;
3. runs the installer silently, retrying briefly if Windows still holds the file. The installer closes Scriptorium, replaces the program and starts it again.

The installer never touches the Library or the settings.

## Where things live

| Path | What |
|---|---|
| `main.js` | Main process: windows, the Library on disk, reading and writing `.tome` files, finding fonts |
| `preload.js` | The narrow, safe bridge between the page and the filesystem |
| `updater.js` | The raven: checking for, downloading, verifying and installing new editions, plus the Library backup |
| `fontinfo.js` | Reads a font's name and embedding permission (OS/2 `fsType`) |
| `src/index.html`, `src/styles.css` | The room, a full circle: the window (start), the Library, the reading nook, the doorway (quit), and the desk below the window |
| `src/js/flow.js` | “Let the words flow”: pours text across pages, splitting paragraphs and lists at words |
| `src/js/editor.js` | The open book: the two-page spread, page breaks, chapters, formatting |
| `src/js/desk.js` | The props: Quill menu, Inkwell, Crystal Ball, Spectacles, Wax Seal |
| `src/js/library.js` | Bookshelf rendering and the "which shelf?" save dialog |
| `src/js/fonts.js` | Loads fonts with the FontFace API, so nothing ever needs installing |
| `assets/manifest.json` | Maps every prop animation frame and cursor to an image file. Swap art here. |
| `assets/fonts/` | Bundled fonts (redistributable only) and their licence files |

## The `.tome` format (version 1)

A ZIP container with this layout:

```
mimetype            "application/x-scriptorium-tome" (stored, uncompressed)
manifest.json       { format:"tome", version, title, author, saved, ... }
book.json           settings + pages[] (title, contents, text pages with sanitised HTML)
fonts/fonts.json    [{ family, weight, style, file, source, fsType }]
fonts/*.ttf|otf|woff2   every face of every family the book uses
images/*            (reserved for Phase 3)
```

**Sealed tomes** (password-protected): `book.json` is replaced by `book.sealed`, and images by `*.sealed`. The encryption is AES-256-GCM (12-byte IV + 16-byte tag + ciphertext), with the key derived from the magic words by PBKDF2-SHA256 (210,000 iterations, random 16-byte salt). `manifest.json` keeps the title, author, salt and an optional public hint, so the shelf can still show the spine. Fonts stay unencrypted. There is no way to recover forgotten words.

Every font family a book uses is embedded when it's saved, so a reader never has to install anything. Book HTML is sanitised against an allow-list whenever a book is opened, because books may come from other people.

## The Library

The Library defaults to `Documents/Scriptorium/Library`. Each folder in it is a shelf; `My Books` always exists. You can move the Library from the Spectacles.

## Fonts bundled in the installer

- **SIL Open Font License:** IM Fell English, EB Garamond, Almendra, UnifrakturMaguntia, Cinzel Decorative, MedievalSharp, Uncial Antiqua, Pirata One, Gossamer Noon Sans
- **Public domain:** Berry Rotunda
- **CC BY 3.0:** Alagard by Hewett Tsoi (Pix3M). Attribution is required.
- **Free (DaFont "100% Free"):** GothicPixels by LingDong Huang
- **Free, redistributable with its notice:** Venice Classic by soixantedeux

Windows and Office fonts (Gabriola, Palatino Linotype, Old English Text MT, Blackadder ITC…) are **not** shipped. They're used from the user's own machine when present, and embedded in `.tome` files the same way Word embeds fonts in documents.
