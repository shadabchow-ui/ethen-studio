import type {
  MediaCanvasBoard,
  BoardCard,
  BoardSection,
  BoardType,
  CreateBoardInput,
} from "./types";

let boards: MediaCanvasBoard[] = [];
let nextId = 1;

function generateId(): string {
  return `mock-board-${nextId++}-${Date.now()}`;
}

function generateCardId(): string {
  return `mock-card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createBoard(input: CreateBoardInput): MediaCanvasBoard {
  const board: MediaCanvasBoard = {
    id: generateId(),
    title: input.title,
    type: input.type,
    projectId: input.projectId ?? null,
    assetIds: [],
    sections: [
      {
        id: `section-${Date.now()}-1`,
        title: "References",
        cards: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `section-${Date.now()}-2`,
        title: "Ideas",
        cards: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: `section-${Date.now()}-3`,
        title: "Outputs",
        cards: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    metadata: { mock: true, note: "In-memory board. Not persisted across sessions." },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  boards.push(board);
  return board;
}

export function getBoard(id: string): MediaCanvasBoard | null {
  return boards.find((b) => b.id === id) ?? null;
}

export function listBoards(): MediaCanvasBoard[] {
  return [...boards];
}

export function listBoardsByProject(projectId: string): MediaCanvasBoard[] {
  return boards.filter((b) => b.projectId === projectId);
}

export function listBoardsByType(type: BoardType): MediaCanvasBoard[] {
  return boards.filter((b) => b.type === type);
}

export function updateBoard(id: string, updates: Partial<MediaCanvasBoard>): MediaCanvasBoard | null {
  const board = boards.find((b) => b.id === id);
  if (!board) return null;
  Object.assign(board, updates, { updatedAt: new Date().toISOString() });
  return board;
}

export function deleteBoard(id: string): boolean {
  const index = boards.findIndex((b) => b.id === id);
  if (index === -1) return false;
  boards.splice(index, 1);
  return true;
}

export function addCardToSection(
  boardId: string,
  sectionId: string,
  card: Omit<BoardCard, "id" | "createdAt" | "updatedAt">,
): MediaCanvasBoard | null {
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  const section = board.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const newCard: BoardCard = {
    ...card,
    id: generateCardId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  section.cards.push(newCard);
  section.updatedAt = new Date().toISOString();
  board.updatedAt = new Date().toISOString();
  if (card.assetId && !board.assetIds.includes(card.assetId)) {
    board.assetIds.push(card.assetId);
  }
  return board;
}

export function removeCard(boardId: string, cardId: string): MediaCanvasBoard | null {
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  for (const section of board.sections) {
    const idx = section.cards.findIndex((c) => c.id === cardId);
    if (idx !== -1) {
      section.cards.splice(idx, 1);
      section.updatedAt = new Date().toISOString();
      board.updatedAt = new Date().toISOString();
      return board;
    }
  }
  return null;
}

export function addAssetToBoard(boardId: string, assetId: string): MediaCanvasBoard | null {
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  if (!board.assetIds.includes(assetId)) {
    board.assetIds.push(assetId);
    board.updatedAt = new Date().toISOString();
  }
  return board;
}

export function seedMockBoards(): MediaCanvasBoard[] {
  if (boards.length > 0) return boards;
  const moodboard = createBoard({ title: "Q3 Campaign Moodboard", type: "moodboard" });
  const storyboard = createBoard({ title: "Product Launch Storyboard", type: "storyboard" });
  const reference = createBoard({ title: "Visual References", type: "reference_board" });
  addCardToSection(moodboard.id, moodboard.sections[0].id, {
    type: "text",
    title: "Creative Direction",
    content: "Warm, premium, lifestyle-focused with natural lighting and clean composition.",
  });
  addCardToSection(storyboard.id, storyboard.sections[0].id, {
    type: "text",
    title: "Scene 1: Hook",
    content: "0-3s: Close-up product reveal with soft lighting and slow motion.",
  });
  addCardToSection(reference.id, reference.sections[0].id, {
    type: "reference",
    title: "Brand Palette Reference",
    content: "Cream, stone, warm silver — consistent with brand kit guidelines.",
  });
  return boards;
}

export function clearBoards(): void {
  boards = [];
  nextId = 1;
}
