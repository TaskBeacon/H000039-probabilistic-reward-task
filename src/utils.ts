export type StimulusType = "short" | "long";
export type RewardRole = "rich" | "lean" | "none" | "practice";

export type CounterbalanceAssignment = {
  short_key: string;
  long_key: string;
  rich_stimulus: StimulusType;
  counterbalance_id: number;
};

export type PRTScheduleRow = {
  block_idx: number;
  trial_idx: number;
  stimulus_type: StimulusType;
  rich_stimulus: StimulusType;
  reward_due: boolean;
  reward_role: RewardRole;
};

export type RewardOutcome = {
  reward_delivered: boolean;
  reward_delta: number;
  total_score: number;
  pending_before: number;
  pending_after: number;
};

export type PRTTrialSummary = {
  rich_correct: number;
  rich_incorrect: number;
  lean_correct: number;
  lean_incorrect: number;
  accuracy: number;
  reward_total: number;
  log_b: number;
  log_d: number;
};

function makeSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function sampleWithoutReplacement<T>(items: T[], count: number, rng: () => number): T[] {
  if (count <= 0 || items.length === 0) {
    return [];
  }
  if (count >= items.length) {
    return shuffle(items, rng);
  }
  return shuffle(items, rng).slice(0, count);
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clonePending(state: Record<StimulusType, number>): Record<StimulusType, number> {
  return {
    short: Number(state.short ?? 0),
    long: Number(state.long ?? 0)
  };
}

function formatConditionId(stimulusType: StimulusType, richStimulus: StimulusType, rewardDue: boolean): string {
  return `${stimulusType}_${stimulusType === richStimulus ? "rich" : "lean"}_${rewardDue ? "due" : "standard"}`;
}

export function normalize_stimulus_type(value: unknown): StimulusType {
  const token = String(value ?? "").trim().toLowerCase();
  if (token === "short" || token === "s" || token === "left") {
    return "short";
  }
  if (token === "long" || token === "l" || token === "right") {
    return "long";
  }
  throw new Error(`Unsupported stimulus type: ${String(value)}`);
}

export function build_condition_id(
  stimulusType: unknown,
  richStimulus: unknown,
  rewardDue: boolean
): string {
  return formatConditionId(
    normalize_stimulus_type(stimulusType),
    normalize_stimulus_type(richStimulus),
    rewardDue
  );
}

export function resolve_counterbalance(subject_id: number): CounterbalanceAssignment {
  const code = Number(subject_id) % 4;
  const short_key = code === 0 || code === 2 ? "f" : "j";
  const long_key = code === 0 || code === 2 ? "j" : "f";
  const rich_stimulus = code === 0 || code === 1 ? "short" : "long";
  return {
    short_key,
    long_key,
    rich_stimulus,
    counterbalance_id: code
  };
}

export function get_correct_key(stimulusType: unknown, short_key: string, long_key: string): string {
  return normalize_stimulus_type(stimulusType) === "short" ? short_key : long_key;
}

export function get_fallback_response_key(
  policy: string,
  short_key: string,
  long_key: string,
  rng?: () => number
): string {
  const normalized = String(policy ?? "").trim().toLowerCase();
  if (normalized === "short" || normalized === "left" || normalized === "f") {
    return short_key;
  }
  if (normalized === "long" || normalized === "right" || normalized === "j") {
    return long_key;
  }
  const draw = rng ? rng() : Math.random();
  return draw < 0.5 ? short_key : long_key;
}

export function generate_prt_schedule(options: {
  block_idx: number;
  n_trials: number;
  seed: number;
  rich_stimulus: StimulusType;
  rich_reward_trials: number;
  lean_reward_trials: number;
}): PRTScheduleRow[] {
  const trialCount = Math.max(0, Math.floor(Number(options.n_trials ?? 0)));
  if (trialCount === 0) {
    return [];
  }
  if (trialCount % 2 !== 0) {
    throw new Error("PRT blocks require an even number of trials so short/long counts stay balanced.");
  }

  const richStimulus = normalize_stimulus_type(options.rich_stimulus);
  const leanStimulus = richStimulus === "short" ? "long" : "short";
  const rng = makeSeededRandom(normalizeNumber(options.seed, 0) + Number(options.block_idx ?? 0) * 10007);
  const stimuli = shuffle(
    [...new Array(trialCount / 2).fill(richStimulus), ...new Array(trialCount / 2).fill(leanStimulus)],
    rng
  );

  const richIndices = stimuli.flatMap((stimulus, index) => (stimulus === richStimulus ? [index] : []));
  const leanIndices = stimuli.flatMap((stimulus, index) => (stimulus === leanStimulus ? [index] : []));
  const richSampleCount = Math.min(Math.max(0, Math.floor(Number(options.rich_reward_trials ?? 0))), richIndices.length);
  const leanSampleCount = Math.min(Math.max(0, Math.floor(Number(options.lean_reward_trials ?? 0))), leanIndices.length);
  const richDue = new Set(sampleWithoutReplacement(richIndices, richSampleCount, rng));
  const leanDue = new Set(sampleWithoutReplacement(leanIndices, leanSampleCount, rng));

  return stimuli.map((stimulusType, zeroBasedIdx) => {
    const rewardDue = richDue.has(zeroBasedIdx) || leanDue.has(zeroBasedIdx);
    const rewardRole = richDue.has(zeroBasedIdx) ? "rich" : leanDue.has(zeroBasedIdx) ? "lean" : "none";
    return {
      block_idx: Number(options.block_idx ?? 0),
      trial_idx: zeroBasedIdx + 1,
      stimulus_type: stimulusType,
      rich_stimulus: richStimulus,
      reward_due: rewardDue,
      reward_role: rewardRole
    };
  });
}

export class RewardTracker {
  private score: number;
  private pendingRewards: Record<StimulusType, number>;
  private blockRewardDue: Record<StimulusType, number>;
  private blockRewardDelivered: Record<StimulusType, number>;

  constructor(initialReward = 0) {
    this.score = Number.isFinite(initialReward) ? Number(initialReward) : 0;
    this.pendingRewards = { short: 0, long: 0 };
    this.blockRewardDue = { short: 0, long: 0 };
    this.blockRewardDelivered = { short: 0, long: 0 };
  }

  peek(): number {
    return this.score;
  }

  begin_block(): void {
    this.pendingRewards = { short: 0, long: 0 };
    this.blockRewardDue = { short: 0, long: 0 };
    this.blockRewardDelivered = { short: 0, long: 0 };
  }

  preview_trial(options: {
    stimulus_type: unknown;
    reward_due: boolean;
    is_correct: boolean;
    reward_win: number;
    reward_loss: number;
  }): RewardOutcome {
    return this.simulate_trial(this.pendingRewards, options, false).outcome;
  }

  update_trial(options: {
    stimulus_type: unknown;
    reward_due: boolean;
    is_correct: boolean;
    reward_win: number;
    reward_loss: number;
  }): RewardOutcome {
    const simulated = this.simulate_trial(this.pendingRewards, options, true);
    this.pendingRewards = simulated.next_pending;
    this.score = simulated.outcome.total_score;
    return simulated.outcome;
  }

  private simulate_trial(
    pendingState: Record<StimulusType, number>,
    options: {
      stimulus_type: unknown;
      reward_due: boolean;
      is_correct: boolean;
      reward_win: number;
      reward_loss: number;
    },
    commit: boolean
  ): {
    outcome: RewardOutcome;
    next_pending: Record<StimulusType, number>;
  } {
    const stimulusType = normalize_stimulus_type(options.stimulus_type);
    const nextPending = clonePending(pendingState);
    const pendingBefore = Number(nextPending[stimulusType] ?? 0);

    if (options.reward_due) {
      nextPending[stimulusType] = pendingBefore + 1;
      if (commit) {
        this.blockRewardDue[stimulusType] += 1;
      }
    }

    let rewardDelivered = false;
    let rewardDelta = Number(options.reward_loss) || 0;
    if (options.is_correct && nextPending[stimulusType] > 0) {
      nextPending[stimulusType] -= 1;
      rewardDelivered = true;
      rewardDelta = Number(options.reward_win) || 0;
      if (commit) {
        this.blockRewardDelivered[stimulusType] += 1;
      }
    }

    const totalScore = this.score + rewardDelta;
    return {
      outcome: {
        reward_delivered: rewardDelivered,
        reward_delta: rewardDelta,
        total_score: totalScore,
        pending_before: pendingBefore,
        pending_after: Number(nextPending[stimulusType] ?? 0)
      },
      next_pending: nextPending
    };
  }
}

export function compute_signal_detection_metrics(
  trials: Array<Record<string, unknown>>,
  rich_stimulus: unknown
): PRTTrialSummary {
  const rich = normalize_stimulus_type(rich_stimulus);
  const lean = rich === "short" ? "long" : "short";
  const list = [...trials];

  const count = (stimulus: StimulusType, correct: boolean): number =>
    list.filter(
      (trial) =>
        normalize_stimulus_type(trial.stimulus_type) === stimulus &&
        Boolean(trial.response_correct ?? false) === correct &&
        !Boolean(trial.choice_timeout ?? false)
    ).length;

  const richCorrect = count(rich, true);
  const richIncorrect = count(rich, false);
  const leanCorrect = count(lean, true);
  const leanIncorrect = count(lean, false);
  const total = Math.max(1, list.length);
  const rewardTotal = list.reduce((sum, trial) => sum + Number(trial.reward_delta ?? 0), 0);
  const accuracy = list.reduce((sum, trial) => sum + (Boolean(trial.response_correct ?? false) ? 1 : 0), 0) / total;

  const log_b = 0.5 * Math.log(
    ((richCorrect + 0.5) / (richIncorrect + 0.5)) * ((leanIncorrect + 0.5) / (leanCorrect + 0.5))
  );
  const log_d = 0.5 * Math.log(
    ((richCorrect + 0.5) / (richIncorrect + 0.5)) * ((leanCorrect + 0.5) / (leanIncorrect + 0.5))
  );

  return {
    rich_correct: richCorrect,
    rich_incorrect: richIncorrect,
    lean_correct: leanCorrect,
    lean_incorrect: leanIncorrect,
    accuracy,
    reward_total: rewardTotal,
    log_b,
    log_d
  };
}

export default {
  RewardTracker,
  build_condition_id,
  compute_signal_detection_metrics,
  generate_prt_schedule,
  get_correct_key,
  get_fallback_response_key,
  normalize_stimulus_type,
  resolve_counterbalance
};
