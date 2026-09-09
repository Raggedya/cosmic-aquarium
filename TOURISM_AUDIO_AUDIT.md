# Tourism Machine Audio Audit

## Current authority

The Workfriend Artist Music Machine audio lifecycle is authoritative. Tourism now uses the same assets, rates, levels, ordering, and stop timing rather than its former velocity-modulated custom sequence.

## Artist lifecycle ported

| Phase | Artist/Tourism implementation |
| --- | --- |
| Lever engagement | `reel-stop-lock-mixkit-2857.mp3`, volume `.58`, rate `.9` |
| Motor start | `reel-ratchet-mixkit-2641.mp3`, volume `.66`, rate `.96` |
| Reel roll | `reel-actual-slotmachine-freesound-261346.mp3`, starts at `.15s`, volume `.42`, rate `1`, not looped |
| Reel lock | `reel-stop-lock-mixkit-2857.mp3`, volume `.72`, rate `1.04` |
| Motor fade | Six 30 ms reductions, then pause and reset |
| Evaluation pause | `380ms` (`100ms` under reduced-motion) |
| Winner confirmation | `winner-tonal-bloom-mixkit-3109.mp3`, volume `.58`, rate `1`, capped at `1450ms` |

## Retired Tourism audio code

- velocity-based motor playback-rate and volume modulation
- separate Tourism gear-lock treatment and 125 ms pause
- Tourism-only audio run state machine
- all historical item-crossing tick or timer-driven click code
- action-button audio layered into automatic spin completion

## Overlap and sound-toggle behaviour

- One `locked` gate rejects concurrent lever, API, and Another Idea spins.
- Lever and Another Idea call the same `spin` path.
- Muting immediately stops the motor, ratchet, stop, and winner samples.
- The Artist engine emits no item-crossing sample events.
- A new accepted spin clears the previous winner timeout and stops the prior winner sample.

## Verification

Thirty consecutive Tourism spins produced the same five-play Artist sequence every time: engagement, ratchet, motor, reel lock, winner confirmation. Rapid repeat calls produced only one active sequence. The local Workfriend Artist Machine retained its 13-track catalogue, three-slot reel, and winner resolution after extraction to the shared engine.

No new audio assets were added.
