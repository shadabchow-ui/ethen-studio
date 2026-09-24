"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { isMockMode } from "@ethen/config/runtime-flags";

export interface EthenUser {
  id: string;
  email: string | undefined;
  name: string | undefined;
  firstName: string | undefined;
  lastName: string | undefined;
  imageUrl: string | undefined;
  isMock: boolean;
}

const MOCK_USER: EthenUser = {
  id: "mock-user",
  email: "demo@ethen.local",
  name: "Demo User",
  firstName: "Demo",
  lastName: "User",
  imageUrl: undefined,
  isMock: true,
};

export const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function getEthenUserDisplayName(user: EthenUser | null): string | null {
  if (!user) return null;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (user.name?.trim()) return user.name.trim();
  if (user.email?.trim()) return user.email.trim().split("@")[0] ?? null;
  return null;
}

export function getEthenUserInitials(user: EthenUser | null, fallback = "?"): string {
  const displayName = getEthenUserDisplayName(user);
  if (!displayName) return fallback;

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || fallback;
}

// The env constants are compile-time baked, so the conditional
// early return before hook calls is never dynamic at runtime.
export function useEthenUser(): {
  user: EthenUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  canManageAccount: boolean;
  openAccountProfile: (() => void) | null;
} {
  if (isMockMode) {
    return {
      user: MOCK_USER,
      isLoaded: true,
      isSignedIn: true,
      canManageAccount: false,
      openAccountProfile: null,
    };
  }

  if (!clerkConfigured) {
    return {
      user: null,
      isLoaded: true,
      isSignedIn: false,
      canManageAccount: false,
      openAccountProfile: null,
    };
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isLoaded: authLoaded, userId: clerkId } = useAuth();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { isLoaded: userLoaded, user: clerkUser } = useUser();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const clerk = useClerk();

  const isLoaded = authLoaded && userLoaded;

  if (!isLoaded) {
    return {
      user: null,
      isLoaded: false,
      isSignedIn: false,
      canManageAccount: false,
      openAccountProfile: null,
    };
  }

  if (!clerkId || !clerkUser) {
    return {
      user: null,
      isLoaded: true,
      isSignedIn: false,
      canManageAccount: false,
      openAccountProfile: null,
    };
  }

  return {
    user: {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      name: clerkUser.fullName ?? undefined,
      firstName: clerkUser.firstName ?? undefined,
      lastName: clerkUser.lastName ?? undefined,
      imageUrl: clerkUser.imageUrl,
      isMock: false,
    },
    isLoaded: true,
    isSignedIn: true,
    canManageAccount: typeof clerk.openUserProfile === "function",
    openAccountProfile:
      typeof clerk.openUserProfile === "function"
        ? () => clerk.openUserProfile()
        : null,
  };
}

export function getMockUserId(): string {
  return MOCK_USER.id;
}
