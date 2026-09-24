const DEFAULT_MEDIA_BASE_URL =
  "https://pub-efc133d84c664ca8ace8be57ec3e4d65.r2.dev/ethen/videos";

export function getStudioShowcaseBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_ETHEN_STUDIO_MEDIA_BASE_URL ?? DEFAULT_MEDIA_BASE_URL
  ).replace(/\/$/, "");
}

export function getShowcaseAssetUrl(filename: string): string {
  return `${getStudioShowcaseBaseUrl()}/${filename}`;
}
