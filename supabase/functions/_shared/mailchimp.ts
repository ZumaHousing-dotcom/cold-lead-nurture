import { createHash } from "node:crypto";
import type { Lead, Mailchimp } from "./types.ts";

export const TAG_STARTED = "form-started";
export const TAG_COMPLETED = "form-completed";
export const TAG_ABANDONED = "form-abandoned";

export const subscriberHash = (email: string) =>
  createHash("md5").update(email.trim().toLowerCase()).digest("hex");

export function createMailchimp(
  apiKey: string, listId: string, statusIfNew = "subscribed",
  fetchFn: typeof fetch = fetch,
): Mailchimp {
  if (!apiKey.includes("-")) throw new Error("MAILCHIMP_API_KEY must end with its datacenter suffix, e.g. -us17");
  const base = `https://${apiKey.split("-").pop()}.api.mailchimp.com/3.0`;
  const auth = "Basic " + btoa(`zuma:${apiKey}`);

  async function call(method: string, url: string, body: unknown) {
    const res = await fetchFn(url, {
      method, body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Authorization: auth },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Mailchimp ${method} responded ${res.status}`);
  }

  const memberUrl = (email: string) => `${base}/lists/${listId}/members/${subscriberHash(email)}`;

  async function upsertMember(email: string, merge: Record<string, string>) {
    // PUT = create-or-update. Empty merge fields are omitted so we never blank existing data.
    const merge_fields = Object.fromEntries(Object.entries(merge).filter(([, v]) => v));
    await call("PUT", memberUrl(email), {
      email_address: email.toLowerCase(), status_if_new: statusIfNew,
      ...(Object.keys(merge_fields).length ? { merge_fields } : {}),
    });
  }

  async function setTags(email: string, active: string[], inactive: string[] = []) {
    const tags = [
      ...active.map((name) => ({ name, status: "active" })),
      ...inactive.map((name) => ({ name, status: "inactive" })),
    ];
    if (tags.length) await call("POST", memberUrl(email) + "/tags", { tags });
  }

  return {
    async syncLead(lead: Lead) {
      await upsertMember(lead.email, {
        FNAME: lead.first_name ?? "", ROOM: lead.room_interest ?? "",
        STEP: lead.step ?? "", SOURCE: lead.source ?? "",
      });
      if (lead.status === "completed") await setTags(lead.email, [TAG_COMPLETED], [TAG_STARTED, TAG_ABANDONED]);
      else await setTags(lead.email, [TAG_STARTED]);
    },
    async tagAbandoned(email: string, nudgeLine: string) {
      await upsertMember(email, { NUDGELINE: nudgeLine.slice(0, 240) });
      await setTags(email, [TAG_ABANDONED]);
    },
  };
}
