import type { ParsedPatch, PatchOperation, PatchOperationKind } from "./types";

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";
const ADD_FILE_PREFIX = "*** Add File:";
const UPDATE_FILE_PREFIX = "*** Update File:";
const DELETE_FILE_PREFIX = "*** Delete File:";

export function parsePatch(raw: string): ParsedPatch {
  const errors: string[] = [];
  const operations: PatchOperation[] = [];

  const beginIdx = raw.indexOf(BEGIN_MARKER);
  if (beginIdx === -1) {
    errors.push(`Missing "${BEGIN_MARKER}" marker.`);
    return { operations, errors };
  }

  const endIdx = raw.indexOf(END_MARKER, beginIdx);
  if (endIdx === -1) {
    errors.push(`Missing "${END_MARKER}" marker.`);
    return { operations, errors };
  }

  if (endIdx <= beginIdx) {
    errors.push(`"${END_MARKER}" appears before "${BEGIN_MARKER}".`);
    return { operations, errors };
  }

  const body = raw.slice(beginIdx + BEGIN_MARKER.length, endIdx);
  const lines = body.split("\n");

  let currentKind: PatchOperationKind | null = null;
  let currentPath: string | null = null;
  const currentLines: string[] = [];

  function flushOperation(): void {
    if (currentKind && currentPath) {
      operations.push({
        kind: currentKind,
        filePath: currentPath,
        content: currentLines.join("\n"),
      });
    }
    currentKind = null;
    currentPath = null;
    currentLines.length = 0;
  }

  for (const line of lines) {
    if (line.startsWith(ADD_FILE_PREFIX)) {
      flushOperation();
      currentKind = "add";
      const rawPath = line.slice(ADD_FILE_PREFIX.length).trim();
      if (!rawPath) {
        errors.push("Add File operation missing path.");
        currentKind = null;
      } else {
        currentPath = rawPath;
      }
    } else if (line.startsWith(UPDATE_FILE_PREFIX)) {
      flushOperation();
      currentKind = "update";
      const rawPath = line.slice(UPDATE_FILE_PREFIX.length).trim();
      if (!rawPath) {
        errors.push("Update File operation missing path.");
        currentKind = null;
      } else {
        currentPath = rawPath;
      }
    } else if (line.startsWith(DELETE_FILE_PREFIX)) {
      flushOperation();
      currentKind = "delete";
      const rawPath = line.slice(DELETE_FILE_PREFIX.length).trim();
      if (!rawPath) {
        errors.push("Delete File operation missing path.");
        currentKind = null;
      } else {
        currentPath = rawPath;
        operations.push({
          kind: "delete",
          filePath: rawPath,
          content: "",
        });
        currentKind = null;
        currentPath = null;
      }
    } else if (currentKind) {
      currentLines.push(line);
    }
  }

  flushOperation();

  if (operations.length === 0 && errors.length === 0) {
    errors.push("No file operations found in patch.");
  }

  return { operations, errors };
}
