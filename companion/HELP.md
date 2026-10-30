# ShowSign Signage

Fire ShowSign announcement cues to groups of screens from Companion — take-your-seats prompts,
"starting now" flashes, or a looping brand clip on every sign in a room.

## Setup

1. In the ShowSign portal, open your **Event → Announcements** and create at least one
   **screen group** (the signs a cue targets) and one **cue** (text or media).
2. Under **Automation keys**, generate a key for this event and copy it. It is only shown once.
3. In Companion, add the **ShowSign Signage** connection and set:
   - **ShowSign API base URL** — usually `https://portal.showsign.io/api`
   - **Automation key** — the key you copied (starts with `ssk_`; stored as a secret)

The connection turns **OK** and shows your event name once the key is valid. If the key is
revoked or mistyped, the connection shows **Invalid or revoked automation key**. If ShowSign
can't be reached, the status says why — for example _host name not found_ (check the URL),
_connection refused_, or a TLS certificate problem (the venue network may be intercepting it).

## Presets

The **Presets** tab has a section for each screen group: one button per cue (fires it on that
group) and a **Clear** button. A preset lights **yellow** while its group is showing its cue and
**red** for a few seconds if ShowSign refused the press. Presets update by themselves when you
add groups or cues in the portal.

## Actions

- **Fire cue on group** — pick a group and a cue; optionally auto-clear after N seconds.
- **Clear group** — remove the current announcement from a group's signs.

The group and cue dropdowns populate automatically from your event and refresh every few
seconds, so cues you add in the portal appear here without reconfiguring.

**Using expressions:** the Group and Cue options can be switched to an expression. The
expression must return the group's or cue's **name exactly as shown in ShowSign** (any case),
for example `General Announcements` — or its ShowSign id. If nothing matches, the press fails
and the reason shows in the log and in `$(showsign:last_action_error)`.

## Feedbacks

- **Group is showing cue** — lights a button (ShowSign yellow by default) while the chosen
  group is currently showing the chosen cue, so your surface reflects what's live on the walls.
- **Last action failed** — lights a button (red by default) for 10 seconds after a Fire or
  Clear press that ShowSign refused or couldn't receive (a deleted cue, a revoked key, no
  network). Choose a group to light it only for presses on that group.

## Variables

Replace `showsign` below with your connection's label.

- `$(showsign:event_name)` — the connected event.
- `$(showsign:group_<id>_cue)` — the live cue label for each group (blank when clear). Browse
  the connection's variables list in Companion to find each group's exact variable name.
- `$(showsign:last_action_error)` — why the last Fire or Clear press failed (blank after a
  successful press).

## A typical "take your seats" flow

Three buttons on your surface, all targeting a _General Announcements_ group (the presets
give you these ready-made):

1. **5 minutes** → Fire cue "Program begins in 5 minutes"
2. **About to begin** → Fire cue "Please take your seats"
3. **Starting now** → Fire cue "Starting now" (or a media cue), auto-clear after 60s

Add the **Group is showing cue** feedback to each so the live cue is lit on your surface.
