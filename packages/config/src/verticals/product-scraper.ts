import "server-only";

import { getServerEnv } from "../env";
import { isMockModeAllowed } from "../env-contract";

export function getScrapeDoToken(): string | undefined {
  return getServerEnv("SCRAPE_DO_TOKEN");
}

export function isProductScraperMockMode(): boolean {
  return isMockModeAllowed() && process.env.PRODUCT_SCRAPER_MOCK_MODE === "true";
}
