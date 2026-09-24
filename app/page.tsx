import { redirect } from "next/navigation";

/**
 * Studio deployable root (V5 M1, Owner Lock A): no splash page. The canonical
 * product surface is `/studio`; the root sends visitors straight there.
 */
export default function StudioRootPage(): never {
  redirect("/studio");
}
