/**
 * PR-ST-03: Canvas editing graph with reproducible node history.
 *
 * Each canvas action (add card, remove card, reorder, update) produces a graph
 * node. Replaying the nodes in order reproduces the exact canvas state.
 * This enables: undo/redo, collaborative editing, audit trails, and
 * deterministic regeneration.
 */
import type { BoardCard, BoardSection, MediaCanvasBoard } from "./types";

// ── Graph Node Types ───────────────────────────────────────────────────────

export type GraphNodeKind =
  | "board_created"
  | "card_added"
  | "card_removed"
  | "card_updated"
  | "section_added"
  | "section_removed"
  | "board_metadata_updated";

export interface CanvasGraphNode {
  id: string;
  boardId: string;
  kind: GraphNodeKind;
  /** The actor who performed the action. */
  actor: string;
  /** Data needed to reproduce this action. */
  data: Record<string, unknown>;
  /** Hash of the parent node (enables chain verification). */
  parentHash: string;
  /** Hash of this node (SHA-256-like fingerprint). */
  hash: string;
  createdAt: string;
}

export interface CanvasGraph {
  boardId: string;
  nodes: CanvasGraphNode[];
  headHash: string;
}

// ── Simple hash function (deterministic, not cryptographic) ────────────────

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `hash_${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function computeNodeHash(node: Omit<CanvasGraphNode, "hash">): string {
  const canonical = JSON.stringify({
    id: node.id,
    boardId: node.boardId,
    kind: node.kind,
    actor: node.actor,
    data: node.data,
    parentHash: node.parentHash,
    createdAt: node.createdAt,
  });
  return simpleHash(canonical);
}

// ── Graph Store ────────────────────────────────────────────────────────────

const graphs = new Map<string, CanvasGraph>();
let nodeCounter = 0;

function generateNodeId(): string {
  nodeCounter++;
  return `gn_${Date.now()}_${nodeCounter}`;
}

// ── Graph Operations ───────────────────────────────────────────────────────

export function createCanvasGraph(boardId: string, actor: string): CanvasGraph {
  const now = new Date().toISOString();
  const genesisNode: Omit<CanvasGraphNode, "hash"> = {
    id: generateNodeId(),
    boardId,
    kind: "board_created",
    actor,
    data: { boardId },
    parentHash: "genesis",
    createdAt: now,
  };

  const hash = computeNodeHash(genesisNode);
  const node: CanvasGraphNode = { ...genesisNode, hash };

  const graph: CanvasGraph = {
    boardId,
    nodes: [node],
    headHash: hash,
  };
  graphs.set(boardId, graph);
  return { ...graph, nodes: [...graph.nodes] };
}

export function appendGraphNode(
  boardId: string,
  kind: GraphNodeKind,
  actor: string,
  data: Record<string, unknown>,
): CanvasGraphNode | null {
  const graph = graphs.get(boardId);
  if (!graph) return null;

  const now = new Date().toISOString();
  const nodeMeta: Omit<CanvasGraphNode, "hash"> = {
    id: generateNodeId(),
    boardId,
    kind,
    actor,
    data,
    parentHash: graph.headHash,
    createdAt: now,
  };

  const hash = computeNodeHash(nodeMeta);
  const node: CanvasGraphNode = { ...nodeMeta, hash };

  graph.nodes.push(node);
  graph.headHash = hash;
  return { ...node };
}

export function getCanvasGraph(boardId: string): CanvasGraph | null {
  const graph = graphs.get(boardId);
  if (!graph) return null;
  return { ...graph, nodes: [...graph.nodes] };
}

/**
 * Replay the canvas graph from genesis to produce the current board state.
 * Returns the board that results from applying every node in order.
 * Throws if the chain has a hash integrity violation.
 */
export function replayGraph(
  initialBoard: MediaCanvasBoard,
  graph: CanvasGraph,
): MediaCanvasBoard {
  let board = JSON.parse(JSON.stringify(initialBoard)) as MediaCanvasBoard;
  let previousHash = "genesis";

  for (const node of graph.nodes) {
    // Verify hash chain integrity
    const expectedHash = computeNodeHash({
      id: node.id,
      boardId: node.boardId,
      kind: node.kind,
      actor: node.actor,
      data: node.data,
      parentHash: node.parentHash,
      createdAt: node.createdAt,
    });
    if (expectedHash !== node.hash) {
      throw new Error(
        `Hash chain integrity violation at node ${node.id}: expected ${expectedHash}, got ${node.hash}`,
      );
    }
    if (node.parentHash !== previousHash) {
      throw new Error(
        `Parent hash mismatch at node ${node.id}: expected ${previousHash}, got ${node.parentHash}`,
      );
    }

    // Apply the action
    board = applyNodeAction(board, node);
    previousHash = node.hash;
  }

  board.updatedAt = new Date().toISOString();
  return board;
}

function applyNodeAction(board: MediaCanvasBoard, node: CanvasGraphNode): MediaCanvasBoard {
  switch (node.kind) {
    case "board_created":
      // Board already exists — nothing to apply
      break;

    case "card_added": {
      const sectionId = node.data.sectionId as string;
      const card = node.data.card as BoardCard;
      const section = board.sections.find((s) => s.id === sectionId);
      if (section) {
        section.cards.push({ ...card });
        section.updatedAt = new Date().toISOString();
        if (card.assetId && !board.assetIds.includes(card.assetId)) {
          board.assetIds.push(card.assetId);
        }
      }
      break;
    }

    case "card_removed": {
      const cardId = node.data.cardId as string;
      for (const section of board.sections) {
        const idx = section.cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          section.cards.splice(idx, 1);
          section.updatedAt = new Date().toISOString();
          break;
        }
      }
      break;
    }

    case "card_updated": {
      const cardId2 = node.data.cardId as string;
      const updates = node.data.updates as Partial<BoardCard>;
      for (const section of board.sections) {
        const card = section.cards.find((c) => c.id === cardId2);
        if (card) {
          Object.assign(card, updates, { updatedAt: new Date().toISOString() });
          section.updatedAt = new Date().toISOString();
          break;
        }
      }
      break;
    }

    case "section_added": {
      const section2 = node.data.section as BoardSection;
      board.sections.push({ ...section2 });
      break;
    }

    case "section_removed": {
      const sectionId2 = node.data.sectionId as string;
      board.sections = board.sections.filter((s) => s.id !== sectionId2);
      break;
    }

    case "board_metadata_updated": {
      const meta = node.data.metadata as Record<string, unknown>;
      board.metadata = { ...board.metadata, ...meta };
      break;
    }
  }

  return board;
}

/**
 * Verify the integrity of a canvas graph's hash chain.
 * Returns true if all hashes are consistent.
 */
export function verifyGraphIntegrity(graph: CanvasGraph): boolean {
  let previousHash = "genesis";
  for (const node of graph.nodes) {
    const expectedHash = computeNodeHash({
      id: node.id,
      boardId: node.boardId,
      kind: node.kind,
      actor: node.actor,
      data: node.data,
      parentHash: node.parentHash,
      createdAt: node.createdAt,
    });
    if (expectedHash !== node.hash) return false;
    if (node.parentHash !== previousHash) return false;
    previousHash = node.hash;
  }
  return true;
}

// ── Reset (for testing) ────────────────────────────────────────────────────

export function resetCanvasGraphs(): void {
  graphs.clear();
  nodeCounter = 0;
}
