# Tourism Machine Audio Audit

## Scope

This audit covers only the Bendigo tourism machine audio choreography. The cabinet, reel geometry, visual styling, tourism data, and music/festival machine runtimes are unchanged.

## Root cause

The tourism runtime played a discrete sample whenever the calculated reel position crossed an item boundary. Browser frame timing and speed-dependent cadence gating caused those samples to bunch into irregular clusters. A separate relay sample then played after the winner ding, creating the unwanted final click.

## Authoritative audio flow

| Audio state | Trigger | Audible output |
| --- | --- | --- |
| `IDLE` | Ready/result resting state | Silence |
| `LEVER` | Accepted lever or Another Idea spin | One low mechanical clunk |
| `SPINNING` | Reel animation begins | One continuous 1989 machine recording |
| `DECELERATING` | Reel enters the shared slowdown curve | The same recording, with playback rate and volume following calculated reel velocity |
| `LOCKED` | Overshoot/recoil completes and the winner is aligned | One low, substantial gear-lock clunk |
| `WINNER_DING` | 125 ms after the lock | One lowered, restrained bell strike |
| `IDLE` | Bell ends or its safety timeout fires | Silence |

## Removed triggers

- item-boundary tick playback
- high-speed tick sample playback
- low-speed ratchet sample playback
- cadence timers used to gate row-crossing clicks
- post-result relay click
- lever pointer-down click layered beneath the lever clunk
- Another Idea button click layered beneath spin engagement

## Overlap protection

- `locked` continues to reject repeat spin requests.
- Each audio run has an identifier; stale completion audio cannot fire after mute/reset.
- Sound Off cancels the active motor, lever, lock, and bell immediately and clears the bell timer.
- Sound On does not restart a stale motor or completed sound.
- A new accepted run stops any prior bell or lock before engagement.
- The winner sequence has one path only: motor stop, lock, 125 ms pause, bell, silence.

## Reused assets

- `reel-actual-slotmachine-freesound-261346.mp3` — continuous physical motor/roll
- `reel-stop-gear-mixkit-2858.mp3` — lever and final lock, separately instantiated and pitched for weight
- `winner-tonal-bloom-mixkit-3109.mp3` — lowered in pitch and level, restricted to one short strike
- `reel-stop-lock-mixkit-2857.mp3` — user-initiated non-spin button presses only

No new audio assets were introduced.
