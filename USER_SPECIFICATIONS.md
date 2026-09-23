#preamble

this file specifies the tool we are working on.
DO NOT update this file. this is meant to be edited only be the end user.

#objective

this tool is a sprite editor, focused on msx2 mode 2 multi-colored sprites
using the OR-color feature.

#why another sprite editor?

the current msx sprite editors (such as tinysprite) do not have any tool
to allow testing of the OR-color feature.


# msx2 mode 2 sprites

8x8 or 16x16 pixels
they can be monocolored or multi-colored, meaning one different color per sprite line.
the sprites are represented in msx vram as a bitmap, with one byte per 8 pixel wide line.
0 represents transparent, 1 represents opaque color.
the color palete for sprites is fixed and not configurable.
a sprite can be configured to use or-color, meaning that, if juxtaposed to another sprite,
instead of superimposing its figure, it will generate new colors using bitwise OR operation.
the or-color effect work only with sprites, will not interact with the background picture/text.

# desired UI

[ 15 colors palette + transparency ]  | sprites preview |
[undo/redo/cut/copy/rotate/mirror/clear/export/import tools]

|                 |c
|                 |c
| ..16x16 grid..  |c   [+] <- add another grid
|                 |c
|                 |c


- the user will click on one of the colors from the palette, and left-click on the grid to set the pixels.
"c" is the line color.
- when painting with one color a line that already have another color, it will be replaced with the new color
- the user can select a color then click on "c" to recolor all pixels from that column
- when clicking on [+],  another grid beside the first one is added.
- a maximum of 8 grids can exist simultaneously
- the sprites preview will show the sprites emulating the OR effect
- extra grids can be removed, but the first one should always persist
- a whole grid can be selected for the cut/copy/clear operations
- a retangular region can be selected for the cut/copy/clear operations
- pasting a retangular region into another grid should allow dragging the pasted image around before actually pasting it. the operation can be cancelled
- import should accept:
  -- tinysprite backup format (truncated to the first 8 entries)
  -- png (very controled - a 16x16 image with 15 colors+transparency, using the msx palette, and an algorithm will find the optimal combination of the least possible number of sprites to represent the images using OR)
- export should provide:
  -- tinysprite backup format (the primary export format)
  -- png (with the individual sprites + the OR composite)
  -- basic code (with the sprite data load in DATA statements, and a small code to load and show the sprites with the OR effect)
  -- BIN (two binary files, one with pattern and one with attribute data)
  -- C (a text file with sprite_patterns[] and sprite_attributes[] array)

# references

## files format examples
References/File_Formats

## technical specification of msx2 vdp:
References/'CHAPTER 4 - VDP AND DISPLAY SCREEN (Sections 1 to 5) _ MSX2-Technical-Handbook.html'  

## basic tools:
https://github.com/pvmm/spritetools.py

# technologies

- modern html/javascript
- libraries TBD
