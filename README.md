# MORDEN2

**An MSX2 sprite mode 2 editor that shows you the OR-color effect.**

On the MSX2, a sprite can be set to *OR mode*: where it overlaps the sprite
before it, the two color indexes are combined bit by bit, giving a third color
from just two sprites. Existing MSX sprite editors don't let you see that.
MORDEN2 does. It shows what the VDP will draw while you paint, then exports
it in formats ready for MSX-BASIC, C, or raw VRAM.

![MORDEN2 editing a mushroom made of three sprites: a black outline, a red and
yellow fill, and an OR sprite whose cyan spots mix with the red into white](docs/screenshot.png)

*Three sprites: outline, fill, and an OR sprite whose cyan (7) spots mix with
the red (8) cap into white (15).*

## Features

- **Up to 8 sprites of 16×16**, the most the MSX2 can show on one scanline,
  each with one color per row, as the hardware requires.
- **Real OR compositing**: an OR sprite mixes with the nearest non-OR sprite
  before it, exactly as the V9938 does. The preview applies these rules live,
  and you drag sprites in it to control where they overlap.
- **OR mixes panel**: lists which pairs of colors combine into the current
  color, highlighting ones you already use.
- **Drawing tools**: Pencil, Fill and rectangle Select, right-click erase,
  middle-click eyedropper, cut / copy / floating paste, rotate, flip, clear,
  and full undo / redo.
- **Two palettes**: the regular MSX sprite palette and SCREEN 8's fixed sprite
  colors.
- **Import** 16×16 PNG images and [TinySprite](http://msx.jannone.org/tinysprite/tinysprite.html)
  `.tiny` backups.
- **Export** to:
  - an MSX-BASIC program
  - C arrays
  - raw `.bin` pattern and color tables
  - PNG (each sprite plus the composite)
  - TinySprite
- **Autosave** to the browser, so a refresh doesn't lose your work.
- **Built-in help**: hold <kbd>Ctrl</kbd> and click anything to open the
  [help page](help.html) at the section about it.

## Running it

MORDEN2 is a static web app with no build step and no dependencies. It uses
ES modules, so it must be served over HTTP; opening `index.html` straight
from disk won't work.

```sh
./run.sh
```

That starts `python3 -m http.server` on port 8765 and opens
<http://localhost:8765/index.html> in your browser. Set `PORT` to use another
port. Any other static file server works too.

The fonts come from Google Fonts. Offline, the editor falls back to system
fonts and works the same.

## Tests

The core logic (model, compositing, codecs, clipboard, transforms, history,
persistence) has unit tests using Node's built-in test runner:

```sh
npm test
```

This needs Node.js 18 or newer. There are no packages to install.

## Project layout

```
index.html            the editor
help.html             user help (also opened by Ctrl+click in the editor)
src/
  app.js              wires the UI together: menus, tool rail, status bar, shortcuts
  model.js            sprites: 16×16 opacity bitmap + one color per row
  composite.js        the MSX2 OR / priority compositing rule
  grid-view.js        one sprite card with its paintable grid
  palette-view.js     palette, current color, OR mixes
  preview-view.js     the composited, draggable preview
  history.js          undo / redo
  clipboard.js        cut / copy / paste
  transform.js        rotate / flip
  persistence.js      localStorage autosave
  codec/              PNG, TinySprite, C, BIN and BASIC import / export
test/                 unit tests
References/           MSX2 Technical Handbook excerpt and sample files
docs/claude/          development notes: spec, implementation plan, handoff
```

Development notes written with Claude (Anthropic's AI assistant) live in
[`docs/claude/`](docs/claude/): the design and hardware rules are in
[`FUNCTIONAL_SPEC.md`](docs/claude/FUNCTIONAL_SPEC.md), and how the code fits
together and where to make changes is in [`HANDOFF.md`](docs/claude/HANDOFF.md).
The original requirements are in [`USER_SPECIFICATIONS.md`](USER_SPECIFICATIONS.md).

## References

- [MSX2 Technical Handbook, chapter 4, section 5: Sprites](https://konamiman.github.io/MSX2-Technical-Handbook/md/Chapter4a.html#5-sprites)
- [Yamaha V9938](https://en.wikipedia.org/wiki/Yamaha_V9938), the MSX2 video chip
- [openMSX](https://openmsx.org/), for trying the BASIC export

## License

Copyright © 2026 Diogo Patrão

MORDEN2 is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. See [LICENSE](LICENSE).

Made by [RutaGames](https://rutagamesltda.itch.io/).
