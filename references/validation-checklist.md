# Validation Checklist

Use this checklist after the web port is created.

## Structural Checks

- [ ] `taskbeacon.yaml` uses `id: H000039` and `variant: html`
- [ ] `slug` matches the local canonical task
- [ ] `main.ts` exports a `main(root)` entry point
- [ ] `src/run_trial.ts` exists and builds the logical trial stages
- [ ] `src/utils.ts` exists and contains the schedule, outcome, and summary helpers
- [ ] `notify-psyflow-web.yml` exists under `.github/workflows`

## Semantic Checks

- [ ] The trial order is fixation -> face preview -> mouth flash -> response -> feedback -> ITI
- [ ] The valid response keys are `f` and `j`
- [ ] `prt` is the only configured condition label
- [ ] Deterministic schedule generation uses the configured block seed rows
- [ ] Missing responses are imputed by `no_response_policy` and still scored
- [ ] The block break text uses the current block summary only
- [ ] The goodbye screen uses the full-task summary only
- [ ] The instruction voice remains disabled when `voice_enabled: false`

## Data Checks

- [ ] Reduced rows are one row per logical trial
- [ ] Reduced rows preserve the local top-level fields: `trial_kind`, `practice`, `practice_index`, `condition_id`, `stimulus_type`, `rich_stimulus`, `reward_due`, `reward_role`, `response_key`, `response_raw_key`, `response_correct`, `choice_timeout`, `choice_forced`, `choice_rt`, `reward_delivered`, `reward_delta`, `total_score`, `pending_before`, `pending_after`, `correct_key`
- [ ] `trial_id` stays monotonic for the scored trials
- [ ] `block_id`, `block_idx`, `trial_idx`, and `condition` match the local trial metadata
- [ ] `reward_due` and `reward_delta` match the deferred-reward logic

## Browser Checks

- [ ] The task loads through the shared `psyflow-web` runner
- [ ] `H000039-probabilistic-reward-task` appears in the generated task manifest
- [ ] The face and mouth line stimuli render correctly in the 1280x720 preview shell
- [ ] The instruction text, feedback text, block break text, and final summary remain readable in the browser
- [ ] The optional instruction voice asset is present, but `voice_enabled` remains off by default

## Notes

- Do not shorten block or trial counts for this task unless you are intentionally creating a separate preview variant.
- Hardware trigger codes are retained in config for provenance, but the browser runtime does not emit serial triggers.
- The canonical mouth line stimulus relies on the shared `psyflow-web` line renderer.
