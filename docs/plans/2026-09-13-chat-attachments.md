# Attachments in the floor's chat, 2026-09-13

Owner task: drag and drop a document or an image into the chat, let the boss send an image back, and open
an image from the chat in a viewer that zooms and pans with the wheel. Plus: show in the chat that the
boss is thinking.

## Where the bytes live

Not in the event log. An event is replayed on every start and by every open office page, so a megabyte of
base64 in a payload would be paid for forever. Attachments are files under `<HO_HOME>/attachments/`, named
by the SHA-256 of their content, and the event carries only the descriptor:

```
{ id: <64 hex>, name: "design.png", mime: "image/png", bytes: 20481 }
```

Content addressing gives free deduplication and makes an upload idempotent. `ChatMessage.attachments`
defaults to an empty array, so every event written before today still replays.

## How a file gets in

The office uploads to `POST /attachments` on the daemon's own server (multipart, the same bearer token as
the RPC), gets the descriptor back, and sends it with `chat.send`. Reading goes through
`GET /attachments/<id>`, which needs the token too, so the office fetches the bytes and shows them from an
object URL rather than putting a credential in an `<img src>`.

Only a closed list of types is accepted, and the daemon serves the type it recorded rather than sniffing
the bytes: PNG, JPEG, GIF, WebP, PDF, plain text, Markdown, JSON and CSV. SVG is deliberately absent, it is
a script vector. Everything that is not an image is served as a download, with `nosniff` and a
`default-src 'none'` policy on that route.

Limits: 10 MiB per file, 10 files per message.

## How the boss sends one back

The sandbox has no route to the office's disk, so each session gets one: a per-session directory under
`<HO_HOME>/attachments/outbox/<sessionId>` bound at `/out/chat`. The same mechanism the git bridge already
uses for a local repository, so nothing new is required of Docker.

`ho_reply` gains a `files` field: the agent writes `graph.png` into `/out/chat` and names it in the call.
The daemon reads it from the host side of the bind, checks the name is a plain file name, hashes it into
the store and attaches the descriptor to the message. The directory goes with the session.

## The viewer

An image in the chat is a thumbnail; clicking it opens the kit's modal with the full image. The wheel
zooms around the pointer and dragging pans, which is the same camera behaviour the office map already has,
so the two read the same way.

## Not in this pass

- No attachments on task briefs or reports. Chat first; the same store extends to them unchanged.
- No thumbnail generation. A large image is displayed scaled by the browser.
- No retention. Attachments live as long as the event that names them; the garbage collector does not
  know about them yet.
