export type WorkflowStage =
  | 'call_attempt'
  | 'qualification'
  | 'pitch_deal'
  | 'send_terms'
  | 'terms_review'
  | 'send_contracts'
  | 'contracts_signed'
  | 'converted'
  | 'dead';

export const WORKFLOW_STAGES: { key: WorkflowStage; label: string; color: string }[] = [
  { key: 'call_attempt', label: 'Call', color: 'bg-muted text-muted-foreground' },
  { key: 'qualification', label: 'Qualify', color: 'bg-blue-500/10 text-blue-600' },
  { key: 'pitch_deal', label: 'Pitch', color: 'bg-purple-500/10 text-purple-600' },
  { key: 'send_terms', label: 'Terms Sent', color: 'bg-orange-500/10 text-orange-600' },
  { key: 'terms_review', label: 'Review', color: 'bg-orange-500/10 text-orange-600' },
  { key: 'send_contracts', label: 'Contracts', color: 'bg-yellow-500/10 text-yellow-700' },
  { key: 'contracts_signed', label: 'Signed', color: 'bg-emerald-500/10 text-emerald-600' },
  { key: 'converted', label: 'Converted', color: 'bg-green-500/10 text-green-600' },
];

export const STAGE_INDEX: Record<string, number> = {};
WORKFLOW_STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

export const INTEREST_ICONS: Record<string, string> = {
  hot: '🔥',
  warm: '☀️',
  cold: '❄️',
};

export const STAGE_BADGE_COLORS: Record<string, string> = {
  call_attempt: 'bg-muted text-muted-foreground',
  qualification: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  pitch_deal: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  send_terms: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  terms_review: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  send_contracts: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  contracts_signed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  converted: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  dead: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};
