import type { Lead, Mailchimp, Store } from "./types.ts";

/** Push leads whose Mailchimp sync failed earlier. */
export async function syncPending(store: Store, mc: Mailchimp): Promise<number> {
  let done = 0;
  for (const lead of await store.unsynced()) {
    try {
      await mc.syncLead(lead);
      await store.markSynced(lead.email, lead.version);
      done++;
    } catch (err) {
      console.error("retry sync failed:", (err as Error).message);
    }
  }
  return done;
}

/** Tags idle leads form-abandoned. Failures stay eligible for the next run. */
export async function runAbandonJob(
  store: Store, mc: Mailchimp, makeNudge: (lead: Lead) => Promise<string>, afterMin: number,
): Promise<number> {
  await syncPending(store, mc);
  let tagged = 0;
  for (const lead of await store.abandonedCandidates(afterMin)) {
    try {
      let line = lead.nudge_line;
      if (!line) {
        line = await makeNudge(lead);
        await store.saveNudgeLine(lead.email, line);
      }
      await mc.tagAbandoned(lead.email, line);
      await store.markAbandoned(lead.email);
      tagged++;
    } catch (err) {
      console.error("abandon tagging failed; will retry next run:", (err as Error).message);
    }
  }
  console.log(`abandon job finished: ${tagged} tagged`);
  return tagged;
}
