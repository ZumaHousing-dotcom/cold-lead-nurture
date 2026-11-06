export interface Lead {
  email: string;
  first_name: string | null;
  room_interest: string | null;
  step: string | null;
  source: string;
  status: "started" | "completed";
  abandoned_at: string | null;
  nudge_line: string | null;
  version: number;
  synced_version: number;
}

/** Storage operations the app needs. Implemented on Supabase in store.ts; faked in tests. */
export interface Store {
  upsertLead(a: {
    email: string; first_name: string; room_interest: string; step: string;
    completed: boolean; source: string;
  }): Promise<Lead>;
  markSynced(email: string, version: number): Promise<void>;
  unsynced(): Promise<Lead[]>;
  abandonedCandidates(afterMin: number): Promise<Lead[]>;
  saveNudgeLine(email: string, line: string): Promise<void>;
  markAbandoned(email: string): Promise<void>;
}

/** Mailchimp operations the app needs. Implemented in mailchimp.ts; faked in tests. */
export interface Mailchimp {
  syncLead(lead: Lead): Promise<void>;
  tagAbandoned(email: string, nudgeLine: string): Promise<void>;
}
