export const guests = `## The guest desk

**Guests & RSVPs** is where you add guests, hand out their links, and read their replies.
Pick a published invitation from the selector at the top; guest parties become available
only after the invitation has finished publishing.

## Guest parties

A guest party is one invitation recipient. Usually that is a household or a group rather
than a single person — the Santos family, or Lena and Paolo — and the party replies once,
together.

Each party has:

- **A name**, which is how you find it in your ledger.
- **A recipient name**, which is the greeting the guest actually reads. Leave it as
  **same as name** if they are the same.
- **A capacity**, the maximum number of people that party may bring. Their reply cannot
  exceed it.
- **Members**, the individual names in the party, which are optional.

Romance invitations work differently: they have exactly one recipient, and there is no
general link at all.

You may create up to fifty parties for one invitation.

## Adding guests

Press **Add guests**. You can type one party at a time, or paste a list — pasting several
lines creates several parties at once, which is much faster than typing a long list on a
phone.

**Create & copy** makes the party and copies its ready-to-send message in the same action,
so you can go straight to your messaging app.

## Personal links and the general link

- **A personal link** belongs to one party. It carries a private tag that only that party
  has, and it is the only kind of link that shows the reply form.
- **The general link** is the plain invitation address. Anyone may read it, and nobody may
  reply from it. It has no reply form, no deadline notice, and no mention of a personal
  link — replies are wanted only from the guests you personally invited.

Use the general link for a group chat or a social post; use personal links for the people
you actually want an answer from.

## Copying an invitation message

Each row has **Copy invitation**. It copies plain text — a short message plus that party's
complete link — ready to paste into any messaging app. The copy is instant; nothing has to
load first.

You can write your own wording with **Edit message**. There are two: one for personal
invitations and one for the general invitation. A preview shows exactly what a guest will
receive. Clearing your wording restores Invitica's default message.

## Tracking who you have sent to

Tick **I have sent this** once you have actually sent a party their link. It is your own
record, it is reversible, and it survives a reload.

Invitica also counts how many times you have copied a party's message. Copied and Sent stay
separate, because copying shows intent and only you know whether the message was really
sent.

**Invitica does not track your guests.** There is no read receipt, no open detection, and
no click tracking. If you want to know whether a guest saw the invitation, ask them or wait
for their reply.

## Finding a party

The search box searches your whole guest list, not just the rows currently on screen. You
can filter by response — attending, declined, or still awaiting a reply — and parties you
have already sent to are ordered last, so the ones still needing attention stay at the top.

Twenty parties load at a time; **Load More** brings the next twenty.

## Replacing and revoking a link

- **Replace private link** issues a fresh link for that party. The previous one stops
  working immediately. Use it when a link went to the wrong person.
- **Revoke link** withdraws the private link without issuing a new one. That party can no
  longer reply, though the general invitation is still readable.

Both take effect at once. A revoked link cannot be brought back — issue a new one instead.

## Trash

**Move to trash** takes a party out of your working list without destroying it, and you can
restore it later. A restored party comes back without a working link, so create a fresh one
when you are ready.

Removing an individual member from a party is immediate and is not reversible.

## Guest privacy

Guest names are never part of the published invitation. A personal link's private tag is
never stored as you see it — Invitica keeps only a scrambled form it can check against, so
the list of who was invited cannot be read back out of the link itself. Personal links also
keep their private part out of the address that reaches Invitica's servers.

Treat a personal link as private. Anyone holding one can reply as that party.

## Not available yet

Importing a guest list from a spreadsheet or CSV file is planned but not built. Add guests
by pasting a list for now.
`;
