import candidateTypography from "./eds-typography-candidate.json";

export type TypographyScaleToken = keyof typeof candidateTypography.scale;
export type TypographyFamilyKey = keyof typeof candidateTypography.families;
export type TypographyRegisterKey = keyof typeof candidateTypography.registers;

export interface TypographyTokenSpec {
  family: TypographyFamilyKey;
  fontSize: number;
  lineHeight: number;
  weight: number;
  tracking: string;
  role: string;
}

export const EDS_TYPOGRAPHY_METRICS = candidateTypography;

export function getScaleToken(name: TypographyScaleToken): TypographyTokenSpec {
  return candidateTypography.scale[name] as TypographyTokenSpec;
}

export function formatTypeRole(token: TypographyScaleToken): string {
  const spec = getScaleToken(token);
  return `${spec.fontSize}/${spec.lineHeight} · ${spec.role}`;
}
