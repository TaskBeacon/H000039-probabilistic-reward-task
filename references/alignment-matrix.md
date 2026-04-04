# Alignment Matrix

Canonical local task: `T000039-probabilistic-reward-task`
Web companion task: `H000039-probabilistic-reward-task`

## Must Align

| Area | Canonical Python task | Web companion | Notes |
|---|---|---|---|
| Task meaning | Chinese probabilistic reward / signal-detection task | same | Preserve the short-vs-long mouth decision and reward-bias logic. |
| Task identity | `slug: probabilistic-reward-task` | same | Keep the same conceptual task name and paired numeric id. |
| Block structure | 3 experimental blocks x 100 trials, plus 2 practice trials | same | No preview shortening is needed for the main web companion. |
| Condition set | `prt` | same | Single condition label expanded into a full reward schedule. |
| Trial order | fixation -> face preview -> mouth flash -> response -> feedback -> ITI | same | The implemented stage order must not drift. |
| Response mapping | keys `f` and `j`, counterbalanced by subject id | same | The browser runtime must treat the same keys as valid choice keys. |
| Reward rule | rich/lean stimulus gets 30/10 reward opportunities per block | same | Missed opportunities remain pending until a correct response of the same stimulus type. |
| Score semantics | Running score starts at 0 and accumulates reward deltas | same | Keep the feedback text and final score aligned with the local task. |
| Instruction meaning | Chinese instruction text with 2 practice trials | same | Text lives in `config/config.yaml`. |
| Reduced data meaning | One logical trial per reduced row | same | Keep the top-level fields aligned with the local analysis contract. |

## May Differ

| Area | Local task | Browser companion | Why it is allowed |
|---|---|---|---|
| Shell | PsychoPy desktop window | psyflow-web browser runtime | Platform-specific shell behavior is expected. |
| Fullscreen | Desktop window control | Shared web runner / preview shell | The browser companion can remain windowed for review. |
| Cursor | PsychoPy cursor behavior | Browser cursor policy | The shared runner owns cursor handling. |
| Hardware triggers | Serial trigger driver | Trigger map kept as config metadata | The browser runtime currently does not emit serial triggers. |
| Random backend | Python `random` in the local runtime | Browser-native seeded RNG and runtime fallback selection | Determinism is preserved, but the implementation lives in TS. |
| Save path | `./outputs/human` | `./outputs/html` | Browser output is downloaded or previewed, not written like the desktop task. |
| Voice playback | Local MP3 asset is preserved but disabled in config | Browser speech synthesis stays disabled by config | Keeps the browser companion text-only unless the task is intentionally reconfigured. |
| Line renderer | PsychoPy line stimulus | Shared runtime `line` renderer | The task repo assumes the shared `psyflow-web` renderer supports line geometry. |

## Keep In Task Repo

- `taskbeacon.yaml`
- `README.md`
- `config/config.yaml`
- `main.ts`
- `src/run_trial.ts`
- `src/utils.ts`
- `assets/README.md`
- `assets/instruction_text_voice.mp3`
- `references/alignment-matrix.md`
- `references/validation-checklist.md`

## Move To `psyflow-web`

- fullscreen and shell presentation
- preflight form and participant collection
- shared jsPsych runtime
- keyboard handling
- countdown helper
- generic browser result export UI
- line-stimulus rendering and wrapped Chinese text support

## Review Questions

- If the web companion produces a different reward total for the same block, is the difference caused by the reward tracker or by the schedule seed?
- If a summary screen disagrees with the local task, are timeout choices being counted the same way?
- If a helper appears reusable across multiple `H` tasks, should it move into `psyflow-web` instead of staying in the task repo?
