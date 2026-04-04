# Assets for Probabilistic Reward Task

This browser companion keeps the canonical instruction voice MP3 at
`assets/instruction_text_voice.mp3` for parity with the local PsychoPy task.

The default browser config keeps `voice_enabled: false`, so the task runs with
text-only instructions unless the config is intentionally changed later.

The face outline, eyes, and mouth stimuli are rendered from PsychoPy-style
`circle` and `line` primitives in `config/config.yaml`, so no other media files
are required for the current implementation.
