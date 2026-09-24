import { bearerContext } from "../http-harness";
const token = (sub: string) => `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url")}.`;
const first = bearerContext(token("user-a"), "project-a"); const second = bearerContext(token("user-b"), "project-b");
if (first.actorId === second.actorId || first.projectId === second.projectId) throw new Error("JWT harness failed to isolate contexts");
let expired = false; try { bearerContext(`x.${Buffer.from(JSON.stringify({ sub: "user-a", exp: 1 })).toString("base64url")}.x`, "project-a"); } catch { expired = true; }
if (!expired) throw new Error("Expired JWT accepted");
console.log("HTTP harness self-test passed: distinct JWTs produce distinct authorized contexts.");
