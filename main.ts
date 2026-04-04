import {
  StimBank,
  SubInfo,
  TaskSettings,
  TrialBuilder,
  mountTaskApp,
  next_trial_id,
  parsePsyflowConfig,
  reset_trial_counter,
  set_trial_context,
  type CompiledTrial
} from "psyflow-web";

import { runTrial } from "./src/run_trial";
import {
  build_condition_id,
  compute_signal_detection_metrics,
  generate_prt_schedule,
  normalize_stimulus_type,
  resolve_counterbalance,
  RewardTracker,
  type PRTScheduleRow,
  type StimulusType
} from "./src/utils";

const TASK_ID = "H000039-probabilistic-reward-task";
const TASK_NAME = "Probabilistic Reward Task";
const TASK_DESCRIPTION =
  "Browser companion for the canonical T000039 probabilistic reward task.";

type TaskSettingsView = TaskSettings & Record<string, unknown>;

type ConditionGenerationConfig = {
  stimulus_types?: StimulusType[];
  rich_reward_trials?: number;
  lean_reward_trials?: number;
  counterbalance_policy?: string;
  no_response_policy?: string;
  practice_trials?: number;
};

async function loadConfig() {
  const configUrl = new URL("./config/config.yaml", import.meta.url);
  const response = await fetch(configUrl);
  if (!response.ok) {
    throw new Error(`Failed to load config: ${response.status} ${response.statusText}`);
  }
  const yamlText = await response.text();
  return parsePsyflowConfig(yamlText, import.meta.url);
}

function coerceSubjectId(value: unknown): number {
  const digits = String(value ?? "")
    .split("")
    .filter((char) => /\d/.test(char))
    .join("");
  return digits.length > 0 ? Number(digits) : 101;
}

function createInstructionTrial(stimBank: StimBank, settings: TaskSettingsView): CompiledTrial {
  const trial = new TrialBuilder({
    trial_id: "instructions",
    block_id: "instructions",
    trial_index: -1,
    condition: "instructions"
  });
  const shortKeyLabel = String(settings.short_key_label ?? settings.short_key ?? "f").toUpperCase();
  const longKeyLabel = String(settings.long_key_label ?? settings.long_key ?? "j").toUpperCase();
  const unit = trial.unit("instruction_text").addStim(
    stimBank.get_and_format("instruction_text", {
      short_key: shortKeyLabel,
      long_key: longKeyLabel,
      reward_win: Number(settings.reward_win ?? 5)
    })
  );
  if (stimBank.has("instruction_text_voice")) {
    unit.addStim(stimBank.get("instruction_text_voice"));
  }
  set_trial_context(unit, {
    trial_id: trial.trial_id,
    phase: "instructions",
    deadline_s: null,
    valid_keys: ["space"],
    block_id: "instructions",
    condition_id: "instructions",
    task_factors: {
      stage: "instructions",
      practice_trials: Number(settings.practice_trials ?? 2),
      short_key: String(settings.short_key ?? "f"),
      long_key: String(settings.long_key ?? "j"),
      rich_stimulus: String(settings.rich_stimulus ?? "short")
    },
    stim_id: "instruction_text"
  });
  unit.waitAndContinue({ keys: ["space"] });
  return trial.build();
}

function createBlockBreakTrial(
  stimBank: StimBank,
  blockId: string,
  blockIdx: number,
  totalBlocks: number,
  rewardTracker: RewardTracker,
  richStimulus: StimulusType,
  breakSeconds: number
): CompiledTrial {
  const blockNum = blockIdx + 1;
  const trial = new TrialBuilder({
    trial_id: `block_break_${blockNum}`,
    block_id: blockId,
    trial_index: blockIdx,
    condition: "block_break"
  });
  let loggedSummary = false;
  const unit = trial.unit("block_break").addStim((_, runtime) => {
    if (!loggedSummary) {
      const blockRows = runtime
        .getReducedRows()
        .filter((row) => String(row.block_id ?? "") === blockId && !Boolean(row.practice ?? false));
      const summary = compute_signal_detection_metrics(blockRows, richStimulus);
      console.log(
        `[prt] block=${blockNum} reward=${summary.reward_total} ` +
          `log_b=${summary.log_b.toFixed(3)} log_d=${summary.log_d.toFixed(3)} ` +
          `acc=${(summary.accuracy * 100).toFixed(1)}%`
      );
      loggedSummary = true;
    }
    return stimBank.get_and_format("block_break", {
      block_num: blockNum,
      total_blocks: totalBlocks,
      break_seconds: Math.round(breakSeconds),
      total_score: rewardTracker.peek()
    });
  });
  set_trial_context(unit, {
    trial_id: trial.trial_id,
    phase: "block_break",
    deadline_s: breakSeconds,
    valid_keys: [],
    block_id: blockId,
    condition_id: "block_break",
    task_factors: {
      stage: "block_break",
      block_num: blockNum,
      total_blocks: totalBlocks
    },
    stim_id: "block_break"
  });
  unit.show({ duration: breakSeconds });
  return trial.build();
}

function createGoodbyeTrial(
  stimBank: StimBank,
  totalTrials: number,
  rewardTracker: RewardTracker
): CompiledTrial {
  const trial = new TrialBuilder({
    trial_id: "good_bye",
    block_id: "summary",
    trial_index: totalTrials,
    condition: "good_bye"
  });
  const unit = trial.unit("good_bye").addStim((_, runtime) =>
    stimBank.get_and_format("good_bye", {
      total_score: rewardTracker.peek()
    })
  );
  set_trial_context(unit, {
    trial_id: trial.trial_id,
    phase: "good_bye",
    deadline_s: null,
    valid_keys: ["space"],
    block_id: "summary",
    condition_id: "good_bye",
    task_factors: {
      stage: "good_bye",
      total_trials: totalTrials
    },
    stim_id: "good_bye"
  });
  unit.waitAndContinue({ keys: ["space"] });
  return trial.build();
}

function createPracticeConditions(practiceTrials: number, richStimulus: StimulusType): PRTScheduleRow[] {
  const stimulusCycle: StimulusType[] = ["short", "long"];
  return new Array(Math.max(0, Math.floor(practiceTrials))).fill(null).map((_, index) => {
    const stimulusType = stimulusCycle[index % stimulusCycle.length];
    return {
      block_idx: -1,
      trial_idx: index + 1,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: false,
      reward_role: "practice"
    };
  });
}

function buildTrials(
  settings: TaskSettingsView,
  stimBank: StimBank,
  conditionGeneration: ConditionGenerationConfig,
  rewardTracker: RewardTracker
): CompiledTrial[] {
  reset_trial_counter();

  const totalBlocks = Math.max(1, Number(settings.total_blocks ?? 1));
  const trialsPerBlock = Math.max(1, Number(settings.trials_per_block ?? settings.trial_per_block ?? 1));
  const totalTrials = Math.max(1, Number(settings.total_trials ?? totalBlocks * trialsPerBlock));
  const practiceTrials = Math.max(
    0,
    Number(conditionGeneration.practice_trials ?? settings.practice_trials ?? 2)
  );
  const richRewardTrials = Math.max(
    0,
    Number(conditionGeneration.rich_reward_trials ?? settings.rich_reward_trials ?? 30)
  );
  const leanRewardTrials = Math.max(
    0,
    Number(conditionGeneration.lean_reward_trials ?? settings.lean_reward_trials ?? 10)
  );
  const richStimulus = normalize_stimulus_type(settings.rich_stimulus ?? "short");
  const breakDuration = Number(settings.block_break_duration ?? 30.0);
  const trials: CompiledTrial[] = [];

  trials.push(createInstructionTrial(stimBank, settings));

  for (const practiceCondition of createPracticeConditions(practiceTrials, richStimulus)) {
    const trial = new TrialBuilder({
      trial_id: next_trial_id(),
      block_id: "practice",
      trial_index: practiceCondition.trial_idx - 1,
      condition: build_condition_id(
        practiceCondition.stimulus_type,
        practiceCondition.rich_stimulus,
        practiceCondition.reward_due
      )
    });
    runTrial(trial, practiceCondition, {
      settings,
      stimBank,
      rewardTracker,
      blockIdx: -1,
      practice: true,
      practiceIndex: practiceCondition.trial_idx
    });
    trials.push(trial.build());
  }

  for (let blockIdx = 0; blockIdx < totalBlocks; blockIdx += 1) {
    const blockId = `block_${blockIdx}`;
    rewardTracker.begin_block();

    const blockSeedRaw = (settings.block_seed as Array<number | null> | undefined)?.[blockIdx];
    const blockSeed =
      blockSeedRaw == null ? Number(settings.overall_seed ?? 0) : Number(blockSeedRaw);
    const plannedConditions = generate_prt_schedule({
      block_idx: blockIdx,
      n_trials: trialsPerBlock,
      seed: blockSeed,
      rich_stimulus: richStimulus,
      rich_reward_trials: richRewardTrials,
      lean_reward_trials: leanRewardTrials
    });

    for (const condition of plannedConditions) {
      const trial = new TrialBuilder({
        trial_id: next_trial_id(),
        block_id: blockId,
        trial_index: condition.trial_idx - 1,
        condition: build_condition_id(condition.stimulus_type, condition.rich_stimulus, condition.reward_due)
      });
      runTrial(trial, condition, {
        settings,
        stimBank,
        rewardTracker,
        blockIdx
      });
      trials.push(trial.build());
    }

    trials.push(
      createBlockBreakTrial(
        stimBank,
        blockId,
        blockIdx,
        totalBlocks,
        rewardTracker,
        richStimulus,
        breakDuration
      )
    );
  }

  trials.push(createGoodbyeTrial(stimBank, totalTrials, rewardTracker));
  return trials;
}

export async function main(root: HTMLElement): Promise<unknown> {
  const parsed = await loadConfig();
  const settings = TaskSettings.from_dict(parsed.task_config) as TaskSettingsView;
  const settingsView = settings as TaskSettingsView;
  const conditionGeneration = (parsed.raw.condition_generation ?? {}) as ConditionGenerationConfig;

  settingsView.triggers = parsed.trigger_config;
  settingsView.no_response_policy = String(conditionGeneration.no_response_policy ?? "random");
  settingsView.practice_trials = Number(conditionGeneration.practice_trials ?? settingsView.practice_trials ?? 2);
  settingsView.rich_reward_trials = Number(conditionGeneration.rich_reward_trials ?? settingsView.rich_reward_trials ?? 30);
  settingsView.lean_reward_trials = Number(conditionGeneration.lean_reward_trials ?? settingsView.lean_reward_trials ?? 10);
  settingsView.initial_score = 0;

  const subInfo = new SubInfo(parsed.subform_config);
  const stimBank = new StimBank(parsed.stim_config);
  const subjectData = subInfo.collect();
  const subjectId = coerceSubjectId(subjectData.subject_id);
  const balance = resolve_counterbalance(subjectId);
  const rewardTracker = new RewardTracker(0);

  settingsView.short_key = balance.short_key;
  settingsView.long_key = balance.long_key;
  settingsView.rich_stimulus = balance.rich_stimulus;
  settingsView.counterbalance_id = balance.counterbalance_id;
  settingsView.short_key_label = balance.short_key.toUpperCase();
  settingsView.long_key_label = balance.long_key.toUpperCase();

  settings.add_subinfo(subjectData);

  if (Boolean(settingsView.voice_enabled)) {
    const voiceName =
      typeof settingsView.voice_name === "string" && settingsView.voice_name.trim().length > 0
        ? settingsView.voice_name
        : "zh-CN-YunyangNeural";
    stimBank.convert_to_voice("instruction_text", {
      voice: voiceName,
      fallbackToSpeech: true
    });
  }

  return mountTaskApp({
    root,
    task_id: TASK_ID,
    task_name: TASK_NAME,
    task_description: TASK_DESCRIPTION,
    settings,
    subInfo,
    stimBank,
    buildTrials: () => buildTrials(settingsView, stimBank, conditionGeneration, rewardTracker)
  });
}

export default main;
