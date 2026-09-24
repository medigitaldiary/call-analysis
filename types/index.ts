export type CallStatus =
  | 'uploaded'
  | 'transcribing'
  | 'analysing'
  | 'generating'
  | 'ready'
  | 'sent'
  | 'error';

export interface Call {
  id: string;
  created_at: string;
  prospect_name: string;
  company: string;
  rep_name: string;
  call_type: string | null;
  recording_url: string | null;
  drive_url: string | null;
  duration_sec: number | null;
  stakeholders: string[];
  status: CallStatus;
  error_msg: string | null;
  session_id: string | null;
  has_transcript: boolean;
  user_id: string | null;
}

export interface ActionItem {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  task: string;
  owner: string;
  deadline: string;
}

export interface SentimentScore {
  overall: string;
  agent: string;
  customer: string;
}

export interface SpeakerBreakdown {
  description: string;
  language: string;
  agent_percentage: number;
  customer_percentage: number;
}

export interface Report {
  id: string;
  call_id: string;
  created_at: string;
  transcript: string | null;
  // metadata extracted by AI
  date_extracted: string | null;
  time_extracted: string | null;
  duration: string | null;
  phone: string | null;
  customer_name: string | null;
  outcome: string | null;
  call_quality: string | null;
  agent_performance: string | null;
  summary: string | null;
  sentiment: SentimentScore | null;
  speaker_breakdown: SpeakerBreakdown | null;
  keywords: string[] | null;
  topics: string[] | null;
  compliance: string | null;
  action_items: ActionItem[] | null;
  // storage
  doc_url: string | null;
  sheet_url: string | null;
  email_sent_at: string | null;
  email_recipients: string[] | null;
}

export interface CallWithReport extends Call {
  report?: Report;
}

export interface CallFormData {
  prospect_name: string;
  company: string;
  rep_name: string;
  call_type: string;
  stakeholders: string;
  file?: File;
  drive_url?: string;
}

export type PipelineStep =
  | 'idle'
  | 'uploading'
  | 'transcribing'
  | 'analysing'
  | 'generating'
  | 'ready'
  | 'error';

export interface RMReportOverview {
  total_calls: number;
  unique_customers: number;
  total_talk_time: string;
  rep_on_duty: string;
  deals_discussed: string;
}

export interface RMReportOutcome {
  outcome: string;
  count: number;
  percentage: string;
}

export interface RMReportHighlight {
  rank: string;
  call_number: number;
  customer_name: string;
  phone: string;
  duration: string;
  description: string;
}

export interface RMReportActionItem {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action: string;
  owner: string;
  deadline: string;
}

export interface RMReportAgentPerformance {
  agent: string;
  total_calls: number;
  follow_ups: number;
  avg_performance: string;
  best_call: string;
  summary: string;
}

export interface RMReportProduct {
  bond_issuer: string;
  yield: string;
  context: string;
}

export interface RMReportLanguage {
  language: string;
  calls: number;
  percentage: string;
}

export interface RMReportImprovementCallRef {
  call_number: number;
  customer_name: string | null;
  phone: string | null;
}

export interface RMReportImprovement {
  point: string;
  call_refs: RMReportImprovementCallRef[];
}

export interface RMReport {
  overview: RMReportOverview;
  outcomes: RMReportOutcome[];
  deals_discussed: {
    with_deals: number;
    without_deals: number;
    deal_calls: string;
  };
  highlights: RMReportHighlight[];
  action_items: RMReportActionItem[];
  improvements: RMReportImprovement[];
  agent_performance: RMReportAgentPerformance;
  products: RMReportProduct[];
  languages: RMReportLanguage[];
}

export interface BulkSession {
  id: string;
  created_at: string;
  rm_name: string;
  session_date: string;
  folder_url: string;
  total_files: number;
  processed_files: number;
  status: 'pending' | 'processing' | 'generating' | 'ready' | 'error';
  error_msg: string | null;
  rm_report: RMReport | null;
  doc_url: string | null;
  sheet_url: string | null;
  stakeholders: string[];
}

export interface DriveFileOwner {
  displayName: string;
  emailAddress: string;
  me: boolean;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  owners?: DriveFileOwner[];
}

export interface DriveOwnerGroup {
  ownerEmail: string;
  ownerDisplayName: string;
  suggestedRmName: string;
  files: DriveFile[];
}

// ── Day End Report ────────────────────────────────────────────────────────────

export interface DayReportAgentPerformance {
  agent: string;
  total_calls: number;
  follow_ups: number;
  avg_performance: string;
  best_call: string;
}

export interface DayReportImprovementCallRef {
  rm_name: string;
  call_number: number;
  customer_name: string | null;
  phone: string | null;
}

export interface DayReportImprovement {
  point: string;
  call_refs: DayReportImprovementCallRef[];
}

export interface DayReport {
  overview: {
    total_calls: number;
    unique_customers: number;
    total_talk_time: string;
    reps_on_duty: string[];
    deals_discussed: string;
  };
  outcomes: { outcome: string; count: number; percentage: string }[];
  deals_discussed: { with_deals: number; without_deals: number; deal_calls: string };
  highlights: {
    rank: string;
    call_number: number;
    customer_name: string;
    phone: string;
    duration: string;
    rep: string;
    description: string;
  }[];
  action_items: { priority: 'HIGH' | 'MEDIUM' | 'LOW'; action: string; owner: string; deadline: string }[];
  improvements: (DayReportImprovement | string)[];
  agent_performance: DayReportAgentPerformance[];
  products: { bond_issuer: string; yield: string; context: string }[];
  languages: { language: string; calls: number; percentage: string }[];
}
