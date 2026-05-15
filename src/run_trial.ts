import { TrialBuilder, set_trial_context, type RuntimeView, type StimBank, type TaskSettings, type TrialSnapshot } from "psyflow-web";

import {
  build_condition_id,
  get_correct_key,
  get_fallback_response_key,
  normalize_stimulus_type,
  RewardTracker,
  type PRTScheduleRow,
  type RewardOutcome,
  type StimulusType
} from "./utils";

type PRTTaskSettings = TaskSettings &
  Record<string, unknown> & {
    short_key?: string;
    long_key?: string;
    rich_stimulus?: string;
    reward_win?: number;
    reward_loss?: number;
    response_timeout_sec?: number;
    pre_face_duration?: number;
    practice_fixation_duration?: number;
    mouth_flash_duration?: number;
    reward_feedback_duration?: number;
    practice_feedback_duration?: number;
    iti_duration?: number;
    block_break_duration?: number;
    no_response_policy?: string;
    triggers?: Record<string, unknown>;
  };

type RunTrialOptions = {
  settings: PRTTaskSettings;
  stimBank: StimBank;
  rewardTracker: RewardTracker;
  blockIdx: number;
  practice?: boolean;
  practiceIndex?: number;
};

type ResolvedOutcome = RewardOutcome & {
  response_raw_key: string;
  response_key: string;
  response_correct: boolean;
  choice_timeout: boolean;
  choice_forced: boolean;
  choice_rt: number | null;
  correct_key: string;
};

type TrialUnit = ReturnType<TrialBuilder["unit"]>;

function getNumberSetting(settings: PRTTaskSettings, key: string, fallback: number): number {
  const value = Number(settings[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getTriggerMap(settings: PRTTaskSettings): Record<string, unknown> {
  const raw = settings.triggers;
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return raw;
}

function getNumberTrigger(settings: PRTTaskSettings, key: string): number | null {
  const value = Number(getTriggerMap(settings)[key]);
  return Number.isFinite(value) ? value : null;
}

function readResponseKey(snapshot: Record<string, any>, unitLabel: string): string {
  const state = snapshot.units?.[unitLabel] ?? {};
  return String(state.response ?? state.response_key ?? "").trim().toLowerCase();
}

function readResponseRt(snapshot: Record<string, any>, unitLabel: string): number | null {
  const state = snapshot.units?.[unitLabel] ?? {};
  const rt = state.rt ?? state.response_rt;
  return typeof rt === "number" && Number.isFinite(rt) ? rt : null;
}

function addFaceBase(unit: TrialUnit, stimBank: StimBank): TrialUnit {
  unit.addStim(stimBank.get("face_outline"));
  unit.addStim(stimBank.get("eye_left"));
  unit.addStim(stimBank.get("eye_right"));
  return unit;
}

function addFace(unit: TrialUnit, stimBank: StimBank, stimulusType: StimulusType | null): TrialUnit {
  addFaceBase(unit, stimBank);
  if (stimulusType) {
    unit.addStim(stimBank.get(stimulusType === "short" ? "mouth_short" : "mouth_long"));
  }
  return unit;
}

function resolveOutcome(
  snapshot: Record<string, any>,
  trialKind: "practice" | "experimental",
  condition: PRTScheduleRow,
  options: RunTrialOptions,
  responsePhase: string,
  shortKey: string,
  longKey: string,
  correctKey: string
): ResolvedOutcome {
  const rawResponseKey = readResponseKey(snapshot, responsePhase);
  const responseRt = readResponseRt(snapshot, responsePhase);
  const choiceTimeout = rawResponseKey !== shortKey && rawResponseKey !== longKey;
  const responseKey = choiceTimeout
    ? get_fallback_response_key(options.settings.no_response_policy ?? "random", shortKey, longKey)
    : rawResponseKey;
  const responseCorrect = !choiceTimeout && responseKey === correctKey;

  if (trialKind === "practice") {
    return {
      response_raw_key: rawResponseKey,
      response_key: responseKey,
      response_correct: responseCorrect,
      choice_timeout: choiceTimeout,
      choice_forced: choiceTimeout,
      choice_rt: responseRt,
      correct_key: correctKey,
      reward_delivered: false,
      reward_delta: 0,
      total_score: options.rewardTracker.peek(),
      pending_before: 0,
      pending_after: 0
    };
  }

  const outcome = options.rewardTracker.preview_trial({
    stimulus_type: condition.stimulus_type,
    reward_due: condition.reward_due,
    is_correct: responseCorrect,
    reward_win: getNumberSetting(options.settings, "reward_win", 5),
    reward_loss: getNumberSetting(options.settings, "reward_loss", 0)
  });

  return {
    response_raw_key: rawResponseKey,
    response_key: responseKey,
    response_correct: responseCorrect,
    choice_timeout: choiceTimeout,
    choice_forced: choiceTimeout,
    choice_rt: responseRt,
    correct_key: correctKey,
    ...outcome
  };
}

export function runTrial(
  trial: TrialBuilder,
  condition: PRTScheduleRow,
  options: RunTrialOptions
): TrialBuilder {
  const blockId = options.practice ? "practice" : trial.block_id ?? `block_${options.blockIdx}`;
  const blockIndex = Number.isFinite(options.blockIdx) ? options.blockIdx : 0;
  const practice = Boolean(options.practice);
  const practiceIndex = options.practiceIndex ?? null;
  const trialKind: "practice" | "experimental" = practice ? "practice" : "experimental";
  const stimulusType = normalize_stimulus_type(condition.stimulus_type);
  const richStimulus = normalize_stimulus_type(condition.rich_stimulus);
  const rewardDue = Boolean(condition.reward_due);
  const shortKey = String(options.settings.short_key ?? "f").trim() || "f";
  const longKey = String(options.settings.long_key ?? "j").trim() || "j";
  const correctKey = get_correct_key(stimulusType, shortKey, longKey);
  const conditionId = build_condition_id(stimulusType, richStimulus, rewardDue);
  const fixationDuration = getNumberSetting(options.settings, "pre_face_duration", 0.5);
  const mouthFlashDuration = getNumberSetting(options.settings, "mouth_flash_duration", 0.1);
  const responseDuration = getNumberSetting(options.settings, "response_timeout_sec", 2.5);
  const practiceFeedbackDuration = getNumberSetting(options.settings, "practice_feedback_duration", 1.75);
  const rewardFeedbackDuration = getNumberSetting(options.settings, "reward_feedback_duration", 1.75);
  const itiDuration = getNumberSetting(options.settings, "iti_duration", 0.5);
  let cachedOutcome: ResolvedOutcome | null = null;

  const getOutcome = (snapshot: Record<string, any>): ResolvedOutcome => {
    if (!cachedOutcome) {
      cachedOutcome = resolveOutcome(
        snapshot,
        trialKind,
        condition,
        options,
        trialKind === "practice" ? "practice_response" : "exp_response",
        shortKey,
        longKey,
        correctKey
      );
    }
    return cachedOutcome;
  };

  trial.setTrialState("trial_id", trial.trial_id);
  trial.setTrialState("block_id", blockId);
  trial.setTrialState("block_idx", blockIndex);
  trial.setTrialState("trial_kind", trialKind);
  trial.setTrialState("practice", practice);
  trial.setTrialState("practice_index", practiceIndex);
  trial.setTrialState("trial_idx", condition.trial_idx);
  trial.setTrialState("condition_id", conditionId);
  trial.setTrialState("stimulus_type", stimulusType);
  trial.setTrialState("rich_stimulus", richStimulus);
  trial.setTrialState("reward_due", rewardDue);
  trial.setTrialState("reward_role", condition.reward_role);
  trial.setTrialState("correct_key", correctKey);
  trial.setTrialState("short_key", shortKey);
  trial.setTrialState("long_key", longKey);

  const fixationPhase = trialKind === "practice" ? "practice_fixation" : "exp_fixation";
  const previewPhase = trialKind === "practice" ? "practice_face_preview" : "exp_face_preview";
  const flashPhase = trialKind === "practice" ? "practice_mouth_flash" : "exp_mouth_flash";
  const responsePhase = trialKind === "practice" ? "practice_response" : "exp_response";
  const feedbackPhase = trialKind === "practice" ? "practice_feedback" : "exp_feedback";
  const itiPhase = trialKind === "practice" ? "practice_iti" : "exp_iti";

  const fixation = addFaceBase(trial.unit(fixationPhase), options.stimBank).addStim(options.stimBank.get("fixation"));
  set_trial_context(fixation, {
    trial_id: trial.trial_id,
    phase: fixationPhase,
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id: blockId,
    condition_id: conditionId,
    task_factors: {
      stage: fixationPhase,
      practice,
      trial_idx: condition.trial_idx,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      block_idx: blockIndex
    },
    stim_id: "fixation"
  });
  fixation.show({ duration: fixationDuration });

  const preview = addFaceBase(trial.unit(previewPhase), options.stimBank);
  set_trial_context(preview, {
    trial_id: trial.trial_id,
    phase: previewPhase,
    deadline_s: fixationDuration,
    valid_keys: [],
    block_id: blockId,
    condition_id: conditionId,
    task_factors: {
      stage: previewPhase,
      practice,
      trial_idx: condition.trial_idx,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      block_idx: blockIndex
    },
    stim_id: "face_outline+eye_left+eye_right"
  });
  preview.show({ duration: fixationDuration });

  const flash = addFace(trial.unit(flashPhase), options.stimBank, stimulusType);
  set_trial_context(flash, {
    trial_id: trial.trial_id,
    phase: flashPhase,
    deadline_s: mouthFlashDuration,
    valid_keys: [],
    block_id: blockId,
    condition_id: conditionId,
    task_factors: {
      stage: flashPhase,
      practice,
      trial_idx: condition.trial_idx,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      block_idx: blockIndex
    },
    stim_id:
      stimulusType === "short"
        ? "face_outline+eye_left+eye_right+mouth_short"
        : "face_outline+eye_left+eye_right+mouth_long"
  });
  flash.show({ duration: mouthFlashDuration });

  const response = addFaceBase(trial.unit(responsePhase), options.stimBank);
  const responseTriggerMap = (() => {
    const shortTrigger = getNumberTrigger(options.settings, "short_response");
    const longTrigger = getNumberTrigger(options.settings, "long_response");
    if (shortTrigger == null && longTrigger == null) {
      return null;
    }
    const map: Record<string, number> = {};
    if (shortTrigger != null) {
      map[shortKey] = shortTrigger;
    }
    if (longTrigger != null) {
      map[longKey] = longTrigger;
    }
    return map;
  })();
  set_trial_context(response, {
    trial_id: trial.trial_id,
    phase: responsePhase,
    deadline_s: responseDuration,
    valid_keys: [shortKey, longKey],
    block_id: blockId,
    condition_id: conditionId,
    task_factors: {
      stage: responsePhase,
      practice,
      trial_idx: condition.trial_idx,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      block_idx: blockIndex,
      correct_key: correctKey
    },
    stim_id: "face_outline+eye_left+eye_right"
  });
  response.set_state({
    response_key: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).response_key,
    response_raw_key: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).response_raw_key,
    response_correct: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).response_correct,
    choice_timeout: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).choice_timeout,
    choice_forced: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).choice_forced,
    choice_rt: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).choice_rt,
    correct_key: correctKey
  });
  response.captureResponse({
    keys: [shortKey, longKey],
    duration: responseDuration,
    correct_keys: [shortKey, longKey],
    response_trigger: responseTriggerMap,
    timeout_trigger: getNumberTrigger(options.settings, "response_timeout")
  });

  if (trialKind === "practice") {
    const practiceFeedback = trial.unit(feedbackPhase).addStim((snapshot: TrialSnapshot, _runtime: RuntimeView) => {
      const outcome = getOutcome(snapshot as Record<string, any>);
      return options.stimBank.get(
        outcome.response_correct ? "practice_feedback_correct" : "practice_feedback_incorrect"
      );
    });
    set_trial_context(practiceFeedback, {
      trial_id: trial.trial_id,
      phase: feedbackPhase,
      deadline_s: practiceFeedbackDuration,
      valid_keys: [],
      block_id: blockId,
      condition_id: conditionId,
      task_factors: {
        stage: feedbackPhase,
        practice: true,
        trial_idx: condition.trial_idx,
        stimulus_type: stimulusType,
        rich_stimulus: richStimulus,
        reward_due: false,
        block_idx: blockIndex
      },
      stim_id: "practice_feedback_correct"
    });
    practiceFeedback.set_state({
      practice_correct: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).response_correct,
      reward_delivered: false,
      reward_delta: 0,
      total_score: options.rewardTracker.peek()
    });
    practiceFeedback.show({ duration: practiceFeedbackDuration });
  } else {
    const experimentalFeedback = trial.unit(feedbackPhase).addStim((snapshot: TrialSnapshot, _runtime: RuntimeView) => {
      const outcome = getOutcome(snapshot as Record<string, any>);
      if (outcome.reward_delivered) {
        return options.stimBank.get_and_format("reward_feedback", {
          reward_delta: outcome.reward_delta,
          total_score: outcome.total_score
        });
      }
      return options.stimBank.get("fixation");
    });
    set_trial_context(experimentalFeedback, {
      trial_id: trial.trial_id,
      phase: feedbackPhase,
      deadline_s: rewardFeedbackDuration,
      valid_keys: [],
      block_id: blockId,
      condition_id: conditionId,
      task_factors: {
        stage: feedbackPhase,
        practice: false,
        trial_idx: condition.trial_idx,
        stimulus_type: stimulusType,
        rich_stimulus: richStimulus,
        reward_due: rewardDue,
        block_idx: blockIndex
      },
      stim_id: "reward_feedback"
    });
    experimentalFeedback.set_state({
      reward_delivered: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).reward_delivered,
      reward_delta: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).reward_delta,
      total_score: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).total_score,
      pending_before: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).pending_before,
      pending_after: (snapshot: TrialSnapshot, _runtime: RuntimeView) => getOutcome(snapshot as Record<string, any>).pending_after
    });
    experimentalFeedback.show({ duration: rewardFeedbackDuration });
  }

  const iti = addFaceBase(trial.unit(itiPhase), options.stimBank).addStim(options.stimBank.get("fixation"));
  set_trial_context(iti, {
    trial_id: trial.trial_id,
    phase: itiPhase,
    deadline_s: itiDuration,
    valid_keys: [],
    block_id: blockId,
    condition_id: conditionId,
    task_factors: {
      stage: itiPhase,
      practice,
      trial_idx: condition.trial_idx,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      block_idx: blockIndex
    },
    stim_id: "fixation"
  });
  iti.show({ duration: itiDuration });

  trial.finalize((snapshot, _runtime, helpers) => {
    const outcome = getOutcome(snapshot as Record<string, any>);
    const finalOutcome =
      trialKind === "experimental"
        ? {
            ...outcome,
            ...options.rewardTracker.update_trial({
              stimulus_type: condition.stimulus_type,
              reward_due: condition.reward_due,
              is_correct: outcome.response_correct,
              reward_win: getNumberSetting(options.settings, "reward_win", 5),
              reward_loss: getNumberSetting(options.settings, "reward_loss", 0)
            })
          }
        : outcome;

    helpers.setTrialState("condition_id", conditionId);
    helpers.setTrialState("stimulus_type", stimulusType);
    helpers.setTrialState("rich_stimulus", richStimulus);
    helpers.setTrialState("reward_due", rewardDue);
    helpers.setTrialState("reward_role", condition.reward_role);
    helpers.setTrialState("response_key", finalOutcome.response_key);
    helpers.setTrialState("response_raw_key", finalOutcome.response_raw_key);
    helpers.setTrialState("response_correct", finalOutcome.response_correct);
    helpers.setTrialState("choice_timeout", finalOutcome.choice_timeout);
    helpers.setTrialState("choice_forced", finalOutcome.choice_forced);
    helpers.setTrialState("choice_rt", finalOutcome.choice_rt);
    helpers.setTrialState("reward_delivered", finalOutcome.reward_delivered);
    helpers.setTrialState("reward_delta", finalOutcome.reward_delta);
    helpers.setTrialState("total_score", finalOutcome.total_score);
    helpers.setTrialState("pending_before", finalOutcome.pending_before);
    helpers.setTrialState("pending_after", finalOutcome.pending_after);
    helpers.setTrialState("correct_key", finalOutcome.correct_key);
  });

  return trial;
}

export { runTrial as run_trial };

export default runTrial;
