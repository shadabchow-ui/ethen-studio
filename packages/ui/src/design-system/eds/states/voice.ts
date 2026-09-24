/**
 * EDS voice — the canonical rewrites for the machine-voice strings that
 * actually exist in this repository.
 *
 * This is a lookup, not a lint rule: it gives every surface one place to find
 * the approved sentence for a failure the product already knows how to
 * produce. A route that shows "Approval failed." is not missing a translation
 * layer — it is missing this table.
 *
 * The pattern in every entry is the same four clauses:
 *   what stopped · why · what state you are in now · what you can do
 *
 * Ethen speaks in the first person about its own actions, never about the
 * reader's, and never with a bare adjective as the whole message.
 */
export const ETHEN_VOICE_REWRITES: Readonly<Record<string, string>> = {
  "Approval failed.": "I couldn't record your decision. The approval is still open — try again.",
  "Decision failed.": "Your decision didn't save. Nothing has been approved or run.",
  "Command failed": "The command stopped before it finished. Nothing was changed.",
  "Access denied.": "I don't have access to this. You can grant it once, or change the rule.",
  "Action denied.": "I stopped before doing this — it needs an approval I don't have.",
  "Authorization denied": "This needs authority I wasn't granted. Nothing ran.",
  "Apply failed": "I couldn't apply the patch. Your changes are still saved.",
  "Dry-run failed": "The rehearsal didn't complete, so I haven't touched anything real.",
  "Answer generation failed.": "The model stopped before finishing. Your question and sources are kept.",
  "Connection failed.": "The connection dropped. I'll keep what I had.",
};

/**
 * Returns the Ethen-voice sentence for a known machine string, or null when
 * there is no approved rewrite. Null is deliberate: inventing a sentence for
 * an unlisted failure would put unreviewed copy in front of a person at the
 * exact moment copy matters most.
 */
export function edsVoiceRewrite(machineString: string): string | null {
  return ETHEN_VOICE_REWRITES[machineString] ?? null;
}
