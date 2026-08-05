export const editing = `## The editor

Open an invitation from your library and you get the editor: your details on one side, a
live preview on the other. The preview uses the same renderer that produces the published
invitation, so what you see is what your guests will get.

On a phone the editor and the preview swap places rather than sitting side by side, so
neither is squeezed into half a screen.

## Sections

An invitation is a series of sections — the opening, the message, where and when, the
schedule, the entourage, photographs, gift notes, the reply form. Which ones you get
depends on the design you chose.

Most sections can be hidden. Two cannot:

- **The opening**, which carries the names and the occasion.
- **Where and when**, which carries the date, time, and venue.

Every invitation needs those two, so Invitica does not offer to hide them.

Hiding a section removes it from the published invitation completely. It does not grey it
out or leave an empty heading behind. Your typed content is kept, so unhiding it later
brings the text back.

## Lists inside a section

Some sections hold a list — entourage roles, schedule items, gift suggestions, photographs.
A visible list needs at least one entry. If you remove the last one, Invitica offers to hide
the whole section instead of leaving you with an invitation it cannot save.

Photo albums are the exception in one direction: a hidden album may be empty, but a visible
one needs at least one photograph.

Lists have limits, which differ by design. A wedding entourage allows up to ten groups of
twenty names, and a schedule allows up to sixteen items.

## Photographs

Add a photograph to any image slot from your phone or computer. Invitica converts it and
prepares the sizes a guest's device will actually download, so a large photograph from a
modern phone camera does not cost your guests a slow load on mobile data.

You can replace a photograph, remove it, or reorder an album. While a replacement is
uploading the old picture stays on screen rather than leaving a gap.

Your draft photographs are private. They are served only to you, while you are signed in,
and they are not public until you publish.

Rotation from your camera is respected — a photograph taken sideways is not published
sideways.

## The venue and the map

The **where and when** section takes a venue name, an address, and a location on a map.
Tap the map to open a full-screen picker: drag the map under the centre pin, or search for
the place by name. Search matters — it means placing a pin never requires precise dragging
on a small screen.

Guests see a map on the published invitation, loaded only when they tap it, plus a **get
directions** link that opens their own maps app.

If no location is set, the map is not shown and the directions link is used instead.

## Saving

Invitica saves as you type. You can also press **Save now**.

A save that is taking too long becomes a visible, recoverable error after fifteen seconds
rather than hanging silently. Some failures retry on their own; a timeout or a dropped
request does not, because the save may in fact have gone through, and sending it twice
would be worse than asking you. Those show a manual retry instead.

If you edit the same invitation in two tabs, or on your phone and your laptop at once, the
second save is refused rather than overwriting the first. Reload the page to pick up the
newer version before editing again. Merging two sets of edits is not something Invitica can
do yet.

## What the editor does not do yet

- No undo and redo, and no named checkpoints.
- No general reordering of sections. The order of each design is curated.
- No offline editing. You need a connection to save.
- Background music is not published, even though some designs have a place for it. The
  licensing for it is not settled.
`;
