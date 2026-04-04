# Probabilistic Reward Task

![Maturity: prototype](https://img.shields.io/badge/Maturity-prototype-64748b?style=flat-square&labelColor=111827)

| Field | Value |
|---|---|
| Name | Probabilistic Reward Task |
| Version | html (v0.1.0-dev) |
| URL / Repository | https://github.com/TaskBeacon/H000039-probabilistic-reward-task |
| Short Description | Browser companion for the Chinese probabilistic reward task with short-vs-long mouth discrimination and deferred reward carryover |
| Created By | TaskBeacon psyflow-web py2js port |
| Modality | Behavior |
| Language | Chinese |

## 1. Task Overview

This HTML companion mirrors the canonical local `T000039-probabilistic-reward-task`. Participants first read Chinese instructions, complete two practice trials, and then perform three experimental blocks of 100 trials each. On every trial they see a cartoon face, briefly flash a short or long mouth, and identify the mouth length with a counterbalanced key mapping.

The browser port preserves the local reward logic: one stimulus type is rich and receives three times as many reward opportunities as the lean stimulus, missed reward opportunities remain pending until the next correct response to the same stimulus type, and the cumulative score starts at 0.

## 2. Task Flow

### Block-Level Flow

| Step | Description |
|---|---|
| Load Config | Load `config/config.yaml` and build the shared stimulus bank. |
| Collect Subject Info | The shared runner collects a three-digit `subject_id`. |
| Counterbalance | `subject_id mod 4` assigns the short/long key order and rich-stimulus mapping. |
| Show Instructions | Present the Chinese instruction text and optional instruction voice asset. |
| Practice | Run two practice trials with correctness-only feedback. |
| Experimental Blocks | Run three blocks of 100 trials with 30 rich and 10 lean reward opportunities per block. |
| Rest Breaks | Show a fixed 30-second break after each block. |
| Final Summary | Show the final cumulative score and export data through the shared runner. |

### Trial-Level Flow

| Step | Description |
|---|---|
| Fixation | Show a central `+` for 500 ms. |
| Face Preview | Show the face outline and eyes for 500 ms. |
| Mouth Flash | Flash the short or long mouth for 100 ms. |
| Response Window | Keep the face visible while collecting a response for up to 2.5 s. |
| Outcome Feedback | Practice trials show `正确` / `错误`; experimental trials show reward feedback only when a reward is delivered, otherwise a neutral fixation. |
| ITI | Show a short fixation for 500 ms before the next trial. |

### Controller Logic

| Component | Description |
|---|---|
| Schedule generator | `generate_prt_schedule(...)` creates balanced short/long trial orders and controlled reward-opportunity lists. |
| Deferred reward rule | `RewardTracker` keeps pending rewards per stimulus type and delivers them on the next correct response of the same type. |
| Counterbalancing | `resolve_counterbalance(...)` maps `subject_id mod 4` to key order and rich-stimulus assignment. |
| Signal-detection metrics | Block summaries compute reward totals, accuracy, and the `log_b` / `log_d` audit metrics. |

## 3. Configuration Summary

All settings are defined in `config/config.yaml`.

### a. Subject Info

| Field | Meaning |
|---|---|
| `subject_id` | Three-digit participant identifier used for deterministic counterbalancing. |

### b. Stimuli

| Stimulus ID | Purpose |
|---|---|
| `instruction_text` | Chinese task instructions. |
| `instruction_text_voice.mp3` | Canonical instruction voice asset preserved for parity. |
| `fixation` | Central fixation cross. |
| `face_outline` | Cartoon face outline. |
| `eye_left` / `eye_right` | Eyes shown during preview and response screens. |
| `mouth_short` / `mouth_long` | Line stimuli for the short/long mouth flash. |
| `practice_feedback_correct` / `practice_feedback_incorrect` | Practice-only correctness feedback. |
| `reward_feedback` | Reward feedback with the running score. |
| `block_break` | Fixed-duration rest screen between blocks. |
| `good_bye` | Final completion screen. |

### c. Timing

| Phase | Duration |
|---|---|
| Practice fixation | `0.5 s` |
| Face preview | `0.5 s` |
| Mouth flash | `0.1 s` |
| Response window | `2.5 s` |
| Reward feedback | `1.75 s` |
| Practice feedback | `1.75 s` |
| ITI | `0.5 s` |
| Block break | `30 s` |

### d. Reward Rules

| Parameter | Value |
|---|---|
| `rich_reward_trials` | `30` per experimental block |
| `lean_reward_trials` | `10` per experimental block |
| `reward_win` | `5` |
| `reward_loss` | `0` |
| `counterbalance_policy` | `subject_id_mod_4` |
| `no_response_policy` | `random` |

### e. Browser Notes

| Parameter | Meaning |
|---|---|
| `task.save_path` | Browser output target handled by the shared runner. |
| `task.voice_enabled` | Kept `false` by default so the task remains text-only. |
| Runtime renderer | The shared `psyflow-web` runtime renders PsychoPy-style line stimuli and wrapped Chinese text. |

## 4. Methods

Participants completed a browser-based probabilistic reward task that measures reward responsiveness and response bias. On each trial, a cartoon face is previewed and then flashed with either a short or long mouth. Participants identify the mouth length using a counterbalanced response-key mapping. Reward feedback is delivered according to a controlled schedule that favors one stimulus type three-to-one over the other, and missed reward opportunities are carried forward until the next correct response of the same stimulus type.

The browser companion keeps the local analysis logic intact while moving shell behavior into the shared `psyflow-web` runtime. Reduced output remains one logical trial per row, and the task-specific Chinese text stays in YAML so it can be reviewed without editing the trial logic.

## Run

1. Open `psyflow-web` in the shared workspace.
2. Run `npm install` if dependencies are not installed yet.
3. Start the runner with `npm run dev`.
4. Open `http://127.0.0.1:4173/?task=H000039-probabilistic-reward-task`.

## Notes

- The browser companion preserves the canonical 3-block, 300-trial structure.
- The local trigger codes stay in config for provenance, but the browser runtime does not emit serial triggers.
- Pushes to `main` can refresh the shared runner through `.github/workflows/notify-psyflow-web.yml` when `TASKBEACON_ORG_DISPATCH_TOKEN` is configured.
