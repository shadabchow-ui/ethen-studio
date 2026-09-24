/**
 * @ethen/auth — shared authentication boundary.
 *
 * Owns reusable server-side identity provisioning while applications retain
 * their own session, sign-in/out, and access-control adapters.
 */

export const PACKAGE_NAME = "@ethen/auth" as const;
export const EXTRACTION_STATUS = "active" as const;

export {
  provisionClerkIdentity,
  type IdentityEvent,
} from "./provisioning";
