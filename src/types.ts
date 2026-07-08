export interface Email {
  id: string;
  subject: string;
  sender: string;
  body: string;
  processed?: boolean;
  isCustom?: boolean;
  archived?: boolean;
}

export interface AnalysisResult {
  id: string;
  original_email: Email;
  analysis: {
    step1: {
      action_needed: boolean;
      reason: string;
    };
    step2: {
      category: 'REPLY_NEEDED' | 'MEETING_REQUEST' | 'DEADLINE_TASK' | 'APPROVAL_NEEDED' | 'NONE';
    };
    step3: {
      priority_score: number;
      urgency_reason: string;
    };
    step4: {
      tool_name: 'draft_reply' | 'create_reminder' | 'log_task' | null;
      tool_args: {
        email_summary?: string;
        suggested_reply?: string;
        title?: string;
        suggested_time?: string;
        notes?: string;
        task_description?: string;
        deadline?: string;
        priority_score?: number;
      };
    };
    step5: {
      one_line_summary: string;
    };
  };
}

export interface DraftReply {
  id: string;
  emailId: string;
  sender: string;
  subject: string;
  summary: string;
  reply: string;
  priority: number;
  sent: boolean;
}

export interface Reminder {
  id: string;
  emailId: string;
  title: string;
  suggestedTime: string;
  notes: string;
  priority: number;
  addedToCalendar: boolean;
}

export interface TaskItem {
  id: string;
  emailId: string;
  description: string;
  deadline: string;
  priority: number;
  completed: boolean;
}

export interface InstantAlert {
  id: string;
  emailId: string;
  subject: string;
  sender: string;
  oneLineSummary: string;
  priority: number;
  urgencyReason: string;
  category: string;
  timestamp: string;
  dismissed: boolean;
}

