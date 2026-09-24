/**
 * M4-J02 — Worker health and metrics endpoint.
 *
 * Exposes liveness, readiness, claimed-job count, queue depth, oldest job age,
 * lease/heartbeat age, and dependency failures. Used by deploy/worker
 * health checks and by M5 dashboards.
 */

import http from "node:http";

export interface WorkerHealthSnapshot {
  workerId: string;
  status: "ok" | "degraded" | "unavailable";
  claimedJobs: number;
  queueDepth: number;
  oldestQueuedAgeMs: number | null;
  leaseAgeMs: number | null;
  lastHeartbeatMs: number | null;
  dependencies: {
    repository: "ok" | "unavailable";
    redis: "ok" | "unavailable" | "not_configured";
  };
  timestamp: string;
}

export interface WorkerHealthServer {
  url: string;
  close(): Promise<void>;
}

export function createWorkerHealthServer(
  getSnapshot: () => WorkerHealthSnapshot,
  port = 3001,
): WorkerHealthServer {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      const snapshot = getSnapshot();
      const code = snapshot.status === "ok" ? 200 : snapshot.status === "degraded" ? 200 : 503;
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(snapshot));
      return;
    }
    if (req.url === "/metrics") {
      const s = getSnapshot();
      const lines = [
        `# HELP ethen_worker_claimed_jobs Claimed jobs`,
        `# TYPE ethen_worker_claimed_jobs gauge`,
        `ethen_worker_claimed_jobs ${s.claimedJobs}`,
        `# HELP ethen_worker_queue_depth Queue depth`,
        `# TYPE ethen_worker_queue_depth gauge`,
        `ethen_worker_queue_depth ${s.queueDepth}`,
        `# HELP ethen_worker_oldest_queued_age_ms Oldest queued age`,
        `# TYPE ethen_worker_oldest_queued_age_ms gauge`,
        `ethen_worker_oldest_queued_age_ms ${s.oldestQueuedAgeMs ?? -1}`,
      ];
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(lines.join("\n"));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port);
  return {
    url: `http://localhost:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
