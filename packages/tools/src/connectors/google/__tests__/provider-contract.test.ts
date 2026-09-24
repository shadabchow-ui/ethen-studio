import { MockGoogleProvider } from "../mock-provider";
import type { GoogleWorkspaceProvider } from "../types";
import { handleGmailSearch } from "../../gmail/handler";
import { handleSheetsGetMetadata } from "../../google-sheets/handler";
import { handleDriveSearch } from "../../google-drive/handler";
import { handleCalendarListEvents } from "../../google-calendar/handler";
import { handleDocsRead } from "../../google-docs/handler";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

async function run(): Promise<void> {
  const provider: GoogleWorkspaceProvider = new MockGoogleProvider();
  const results = await Promise.all([
    handleGmailSearch(provider, { query: "planning" }),
    handleSheetsGetMetadata(provider, "drive-file-003"),
    handleDriveSearch(provider, { query: "report" }),
    handleCalendarListEvents(provider),
    handleDocsRead(provider, "drive-file-002"),
  ]);
  assert(results.every((result) => result.meta.ok), "every native handler accepts the shared provider contract");
  console.log("Google Workspace provider-contract tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
