export type BoardType =
  | "canvas"
  | "moodboard"
  | "storyboard"
  | "campaign_board"
  | "reference_board"
  | "product_shoot_board"
  | "ai_influencer_board"
  | "game_asset_board"
  | "before_after_chain";

export type BoardCardType =
  | "asset"
  | "text"
  | "prompt"
  | "reference"
  | "note";

export interface BoardCard {
  id: string;
  type: BoardCardType;
  title: string;
  content: string;
  assetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BoardSection {
  id: string;
  title: string;
  cards: BoardCard[];
  createdAt: string;
  updatedAt: string;
}

export interface MediaCanvasBoard {
  id: string;
  title: string;
  type: BoardType;
  projectId: string | null;
  assetIds: string[];
  sections: BoardSection[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBoardInput {
  title: string;
  type: BoardType;
  projectId?: string;
}

export interface AddCardInput {
  boardId: string;
  sectionId: string;
  card: Omit<BoardCard, "id" | "createdAt" | "updatedAt">;
}

export interface CanvasApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}
