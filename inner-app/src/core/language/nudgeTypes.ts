export type IntentionId =
  | 'calm'
  | 'clarity'
  | 'grounding'
  | 'healing'
  | 'reawakening'
  | 'expansion'
  | 'mixed';

export type NudgeStage =
  | 'acknowledge'
  | 'reflect'
  | 'invite';

export type NudgeLibrary = {
  [key in IntentionId]: {
    [stage in NudgeStage]: string[];
  };
};