# Scriptorium — Art Asset Guide

Everything you see in Scriptorium right now is a placeholder I drew in code. Each one can be swapped for a painted PNG without touching any program code: drop the file in `assets/` and point `assets/manifest.json` at it.

## General rules

- **Format:** PNG with a transparent background for everything except the textures. WebP works too.
- **Resolution:** paint at **2× the listed size** (so a 160×320 prop gets a 320×640 PNG). It stays crisp on high-DPI screens and when the window is enlarged.
- **Frames:** each animation state is a short list of frames. Keep every frame of a prop **the same canvas size, with the object in the same spot**, so nothing jitters. Old adventure-game style: 2–3 frames that loop or play once.
- **Lighting:** the candle sits top-left of the desk, so the key light comes from the **upper left**. Soft shadows fall down and to the right.
- **Perspective:** a slight top-down view, as if you're sitting at the desk.

## Desk props (on the writing screen)

| Prop | Size (1×) | Frames needed | Notes |
|---|---|---|---|
| **Candle** (closes the app) | 160×320 | idle ×3 (gentle flicker), hover ×3 (taller, brighter flame), snuff ×3 (flame shrinks → glowing wick + smoke → thin smoke wisp), out ×1 (unlit) | Brass dish holder. I add the light on the desk myself, so don't paint a big glow onto the PNG; a small halo around the flame is fine. |
| **Inkwell** (ink colour) | 200×200 | idle ×1, hover ×3 (ink **swirling** in the mouth of the bottle), click ×2 (small splash/drops) | Plus **one ink mask**: same canvas, pure white where the ink surface is visible, transparent everywhere else. I tint that area with the chosen ink colour. |
| **Quill** (text menu) | 120×370 | idle ×1, hover ×3 (feather sways left–centre–right), click ×2 (a little flick) | Drawn **upright**, nib at the bottom centre. I tilt it and dip it into the inkwell in code. |
| **Crystal ball** (help) | 200×220 | idle ×3 (slow swirling mist), hover ×3 (brighter, with sparkles) | Orb on a small claw or wooden stand. |
| **Spectacles** (UI scale & comfort) | 200×100 | idle ×1, hover ×3 (a glint travelling across the lenses) | Round brass reading glasses, folded open. |
| **Pounce pot** (save — "dry the ink") | 120×172 | idle ×1, hover ×3 (wobble), click ×3 (tips over and sprinkles sand, then rights itself) | A small brass shaker with a perforated dome top. |
| **Wax seal** (shown on the clasp of a password-sealed book) | 140×140 | idle ×1 (hover ×3 and click ×2 are optional, for a future "stamping" animation) | Red wax with an emblem stamped in. The current "S" is a placeholder for whatever emblem you choose. |

## The room

| Piece | Size (1×) | Frames needed | Notes |
|---|---|---|---|
| **Window scene** (the start view) | 620×720 window, arched top | One backdrop: night sky, distant hills, castle with lit windows. Plus a separate **lattice** overlay (lead diamonds and the stone cross), and the **stone arch frame**. | Stars, moon, clouds and the moonlight glow are animated in code, so leave them out of the backdrop or paint them as separate pieces. A daytime version would allow a day/night cycle later. |
| **Door** (quit) | 440×700 | idle ×1, hover ×3 (ring knocker swings), open ×3 (door swings open onto the night) | Stone arch around it. Drawn from straight on. |
| **Raven** (brings word of a new edition) | 170×186 | idle ×4 (head tilts), hover ×3 (wings flap, small hop) | Perches on the window sill with a small sealed letter tied to its leg. Faces right. |
| **Wall torch** | 120×240 | idle ×3 (flame flicker) | Iron sconce. Two of them flank the door. |
| **Lectern** (book stand) | about 1100×920 | still | Slanted backboard, a ledge the book rests on, and two legs. The book sits in front of it, so the middle can stay plain. |
| **Desk top** | 1024×1024+ | **must tile seamlessly** | Planks running **away from you** (top to bottom). I put it in perspective in code. |
| **Floor** (door and library views) | 512×512 | **must tile seamlessly** | Stone flags. |

## Textures

| Texture | Size | Tiling | Notes |
|---|---|---|---|
| **Wooden tabletop** | 1024×1024 or larger | **Must tile seamlessly** | Dark aged oak planks running left–right. |
| **Parchment page** | 976×1412 (2× the page) | Stretched, not tiled | One sheet, aged at the edges, with a calm, light centre that's easy to read on. |
| **Book cover leather** | 512×512 | **Must tile seamlessly** | Visible as the border around the open pages and on the clasp. |
| **Library wall** | 512×512 | **Must tile seamlessly** | Stone or plaster behind the bookcase. |
| **Shelf wood** | 1024×1024 | **Must tile seamlessly** | The bookcase body and the wooden sign. |

## Cursors (optional but nice)

Paint each at **32×32** (64×64 is accepted, but Windows may scale it down). Tell me the hotspot pixel for each one.

| Cursor | When it shows | Hotspot |
|---|---|---|
| Arrow | Default | Arrow tip |
| Pointing gauntlet/hand | Over anything clickable | Fingertip |
| Quill nib | Over text you can write in | Nib point (bottom) |
| Hourglass | While saving or loading | Centre |
| Grabbing hand | Moving pictures and text boxes (coming in a later phase) | Centre |
| Look left / right / up / down | Over the screen edges that turn you to another part of the room | The arrow tip |
| Ink drop | Choosing an ink colour | Bottom tip |

## Nice-to-haves for later phases

- **Ribbon bookmarks** for chapters and marks, in 4–6 colours, about 40×260, hanging straight down.
- **Picture frame / tape corners** for images placed on pages.
- **A page-turn** sequence (3–4 frames of a page curling over) to replace the simple flip.
- **Illuminated drop-cap frames**: a decorative square that sits behind the fancy first letter.

## Naming

Any names work. Something like `candle_idle1.png`, `candle_hover2.png`, `inkwell_inkmask.png` keeps things easy. Send them over and I'll wire them into `manifest.json` and rebuild the installer.
