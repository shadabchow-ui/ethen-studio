"use client";

/**
 * CHAT_A1 — truthful responsive review geometry for the Chat Lab.
 *
 * A specimen labelled 390px must BE 390px. CSS viewport queries resolve
 * against the browser window, so a 390px-wide div inside a 1440px window
 * still reports 1440px to every `@media` rule — which is exactly how a lab
 * starts telling comfortable lies about its own breakpoints. Each frame
 * therefore renders its specimen in its own document, through an iframe sized
 * to the declared width.
 *
 * When the declared width exceeds the space available, the frame is scaled
 * DOWN for display only. The inner viewport keeps its full declared width, so
 * behaviour stays truthful, and the scale is stated on the frame so a reviewer
 * is never misled about what they are looking at.
 */
import * as React from "react";
import styles from "./chat-viewport-frame.module.css";

export type ChatViewport = Readonly<{ id: string; label: string; width: number; height: number }>;

/** Every width the responsive certification names, plus nothing else. */
export const CHAT_VIEWPORTS: readonly ChatViewport[] = [
  { id: "w320", label: "320", width: 320, height: 720 },
  { id: "w390", label: "390", width: 390, height: 844 },
  { id: "w768", label: "768", width: 768, height: 1024 },
  { id: "w1024", label: "1024", width: 1024, height: 768 },
  { id: "w1280", label: "1280", width: 1280, height: 800 },
  { id: "w1440", label: "1440", width: 1440, height: 900 },
  { id: "w2560", label: "2560", width: 2560, height: 1080 },
];

export function chatViewport(id: string): ChatViewport {
  const found = CHAT_VIEWPORTS.find((viewport) => viewport.id === id);
  if (!found) throw new Error(`Unknown Chat Lab viewport: ${id}`);
  return found;
}

/**
 * The application CSP sets `frame-ancestors 'none'` (proxy.ts), which blocks
 * same-origin framing too. That is a REPOSITORY-WIDE condition — the D16.2 lab
 * at /dev/ethen-design-lab is affected identically — and relaxing production
 * CSP for a design lab is not a trade this job gets to make. So the frame
 * detects the block and degrades to a direct link at the same declared width,
 * rather than presenting the reviewer with a silent black rectangle.
 */
function frameIsBlocked(frame: HTMLIFrameElement): boolean {
  try {
    const doc = frame.contentDocument;
    return !doc || !doc.body || doc.body.childElementCount === 0;
  } catch {
    // A cross-origin throw means something is genuinely loaded in there.
    return false;
  }
}

export function ChatViewportFrame({
  specimen,
  width,
  height,
  label,
  theme = "system",
}: {
  specimen: string;
  width: number;
  height: number;
  label?: string;
  theme?: ChatViewportTheme;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  const [scale, setScale] = React.useState(1);
  const [blocked, setBlocked] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const frame = frameRef.current;
      if (frame) setBlocked(frameIsBlocked(frame));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const available = host.clientWidth;
      if (available <= 0) return;
      setScale(Math.min(1, available / width));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [width]);

  const percent = Math.round(scale * 100);
  const src = `/dev/ethen-chat-lab/specimen/${specimen}?theme=${theme}`;

  return (
    <div className={styles.frame}>
      <p className={styles.caption}>
        <span className={styles.captionLabel}>{label ?? specimen}</span>
        <span className={styles.captionGeometry}>
          {width} × {height} real viewport
          {percent < 100 ? ` · shown at ${percent}% (display scale only)` : " · shown 1:1"}
        </span>
        <a className={styles.captionLink} href={src} target="_blank" rel="noreferrer">
          Open
        </a>
      </p>
      <div className={styles.host} ref={hostRef}>
        {blocked ? (
          <div className={styles.blocked}>
            <p>
              This browser refused to frame the specimen: the application CSP sets{" "}
              <code>frame-ancestors &apos;none&apos;</code>, which blocks same-origin framing as well.
              It is a repository-wide condition and affects /dev/ethen-design-lab identically; production
              CSP is deliberately not relaxed for a design lab.
            </p>
            <a href={src} target="_blank" rel="noreferrer">
              Open {label ?? specimen} in its own tab, then size the window to {width}px ↗
            </a>
          </div>
        ) : (
          <div className={styles.stage} style={{ height: height * scale }}>
            <iframe
              ref={frameRef}
              className={styles.viewport}
              title={`${label ?? specimen} at ${width}px`}
              src={src}
              style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export type ChatViewportTheme = "system" | "light" | "dark";
