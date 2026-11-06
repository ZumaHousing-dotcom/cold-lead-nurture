import { createClient } from "npm:@supabase/supabase-js@2";
import type { Lead, Store } from "./types.ts";

export function createSupabaseStore(url: string, serviceKey: string): Store {
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const check = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  return {
    async upsertLead(a) {
      return check(await db.rpc("upsert_lead", {
        p_email: a.email, p_first_name: a.first_name, p_room_interest: a.room_interest,
        p_step: a.step, p_completed: a.completed, p_source: a.source,
      })) as Lead;
    },
    async markSynced(email, version) {
      check(await db.from("leads").update({ synced_version: version }).eq("email", email).lt("synced_version", version));
    },
    async unsynced() {
      return (check(await db.rpc("unsynced_leads", { p_limit: 100 })) ?? []) as Lead[];
    },
    async abandonedCandidates(afterMin) {
      return (check(await db.rpc("abandoned_candidates", { p_after_min: afterMin, p_limit: 100 })) ?? []) as Lead[];
    },
    async saveNudgeLine(email, line) {
      check(await db.from("leads").update({ nudge_line: line }).eq("email", email));
    },
    async markAbandoned(email) {
      // Only if still 'started': a lead that completed meanwhile must not be tagged.
      check(await db.from("leads").update({ abandoned_at: new Date().toISOString() }).eq("email", email).eq("status", "started"));
    },
  };
}
