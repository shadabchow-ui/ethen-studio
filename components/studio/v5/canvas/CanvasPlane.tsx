/**
 * VISUAL-03 — Canvas spatial plane.
 *
 * Data-driven node graph: columns follow edge depth, edges draw only
 * from graph edges between known nodes, status comes only from the run
 * projection. No fake minimap, progress, or grouping. Pan via scroll,
 * zoom via discrete toolbar steps (no motion-dependent UI).
 */

"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasGraph, CanvasGraphNode } from "./types";
import { portTypeLabel } from "./toolbox-model";
import { STUDIO_FOCUS_RING_CLASS } from "../shell/tokens";

const COLUMN_WIDTH = 248;
const COLUMN_GAP = 80;

/** Depth columns from edges (longest path from roots; cycle-safe). */
export function canvasDepthColumns(graph: CanvasGraph): string[][] {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  for (const node of graph.nodes) incoming.set(node.id, []);
  for (const edge of graph.edges ?? []) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
    incoming.get(edge.to)?.push(edge.from);
  }
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const resolve = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let level = 0;
    for (const parent of incoming.get(id) ?? []) {
      level = Math.max(level, resolve(parent) + 1);
    }
    visiting.delete(id);
    depth.set(id, level);
    return level;
  };
  for (const node of graph.nodes) resolve(node.id);
  const columns: string[][] = [];
  for (const node of graph.nodes) {
    const level = depth.get(node.id) ?? 0;
    while (columns.length <= level) columns.push([]);
    columns[level]?.push(node.id);
  }
  return columns.filter((column) => column.length > 0);
}

export interface CanvasPlaneNodeState {
  statusLabel: string;
  failed: boolean;
}

function CompactNodeCard({
  node,
  statusLabel,
  failed,
  selected,
  onSelect,
  registerRef,
}: {
  node: CanvasGraphNode;
  statusLabel: string;
  failed: boolean;
  selected: boolean;
  onSelect: () => void;
  registerRef: (id: string, element: HTMLElement | null) => void;
}) {
  return (
    <button
      ref={(element) => registerRef(node.id, element)}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${node.label}, ${node.kind} node, ${statusLabel}`}
      data-testid={`canvas-node-${node.id}`}
      data-node-id={node.id}
      className={`w-full rounded-[12px] border p-3 text-left transition-colors ${STUDIO_FOCUS_RING_CLASS} ${
        selected
          ? "border-[var(--accent)] bg-[var(--bg-elevated)]"
          : "border-[var(--border-default)] bg-[var(--bg-elevated)] hover:border-[var(--border-strong)] hover:bg-[var(--studio-bg-selected)]"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{node.label}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            failed
              ? "bg-[var(--bg-inset)] text-[var(--text-primary)]"
              : "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          }`}
        >
          {statusLabel}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-tertiary)]">
        {node.kind}{node.task ? ` · ${node.task}` : ""}
      </span>
      <span className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <span>
          <span className="block font-medium text-[var(--text-tertiary)]">Inputs</span>
          <span className="mt-0.5 block space-y-0.5">
            {node.inputs.length === 0 ? <span className="block text-[var(--text-tertiary)]">None</span> : null}
            {node.inputs.map((port) => (
              <span key={port.name} className="block truncate text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{port.label}</span>{" "}
                <span>({portTypeLabel(port.mediaType, port.unit)}{port.required ? ", required" : ""})</span>
              </span>
            ))}
          </span>
        </span>
        <span>
          <span className="block font-medium text-[var(--text-tertiary)]">Outputs</span>
          <span className="mt-0.5 block space-y-0.5">
            {node.outputs.length === 0 ? <span className="block text-[var(--text-tertiary)]">None</span> : null}
            {node.outputs.map((port) => (
              <span key={port.name} className="block truncate text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">{port.label}</span>{" "}
                <span>({portTypeLabel(port.mediaType, port.unit)})</span>
              </span>
            ))}
          </span>
        </span>
      </span>
    </button>
  );
}

interface EdgePath {
  key: string;
  d: string;
}

function offsetWithin(element: HTMLElement, stop: HTMLElement): { x: number; y: number; width: number; height: number } {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  while (current && current !== stop) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

export function CanvasPlane({
  graph,
  nodeStatus,
  selectedNodeId,
  zoom,
  onSelect,
}: {
  graph: CanvasGraph;
  nodeStatus: (nodeId: string) => CanvasPlaneNodeState;
  selectedNodeId: string | null;
  zoom: number;
  onSelect: (nodeId: string) => void;
}) {
  const columns = useMemo(() => canvasDepthColumns(graph), [graph]);
  const planeRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement | null>());
  const [edges, setEdges] = useState<EdgePath[]>([]);
  const [planeSize, setPlaneSize] = useState({ width: 0, height: 0 });

  const registerRef = (id: string, element: HTMLElement | null) => {
    if (element) nodeRefs.current.set(id, element);
    else nodeRefs.current.delete(id);
  };

  useLayoutEffect(() => {
    const plane = planeRef.current;
    if (!plane) return;
    const paths: EdgePath[] = [];
    for (const edge of graph.edges ?? []) {
      const from = nodeRefs.current.get(edge.from);
      const to = nodeRefs.current.get(edge.to);
      if (!from || !to) continue;
      const a = offsetWithin(from, plane);
      const b = offsetWithin(to, plane);
      const x1 = a.x + a.width;
      const y1 = a.y + a.height / 2;
      const x2 = b.x;
      const y2 = b.y + b.height / 2;
      const dx = Math.max(24, (x2 - x1) / 2);
      paths.push({ key: `${edge.from}:${edge.fromPort}->${edge.to}:${edge.toPort}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` });
    }
    setEdges(paths);
    setPlaneSize({ width: plane.scrollWidth, height: plane.scrollHeight });
  }, [graph, columns]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of graph.nodes) map.set(node.id, node.label);
    return map;
  }, [graph]);

  return (
    <div data-testid="canvas-plane" className="overflow-auto rounded-[16px] border border-[var(--border-default)] bg-[var(--bg-surface)]" style={{ maxHeight: 560 }}>
      <div
        ref={planeRef}
        data-testid="canvas-node-grid"
        className="relative p-5"
        style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: "max-content", minWidth: "100%" }}
      >
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={planeSize.width || "100%"}
          height={planeSize.height || "100%"}
        >
          {edges.map((edge) => (
            <path key={edge.key} d={edge.d} fill="none" stroke="var(--text-tertiary)" strokeWidth={1.5} opacity={0.7} />
          ))}
        </svg>
        <div className="relative flex items-start" style={{ gap: COLUMN_GAP }}>
          {columns.map((column, index) => (
            <div key={index} className="flex flex-col gap-4" style={{ width: COLUMN_WIDTH }}>
              {column.map((nodeId) => {
                const node = graph.nodes.find((entry) => entry.id === nodeId);
                if (!node) return null;
                const state = nodeStatus(nodeId);
                return (
                  <CompactNodeCard
                    key={nodeId}
                    node={node}
                    statusLabel={state.statusLabel}
                    failed={state.failed}
                    selected={selectedNodeId === nodeId}
                    onSelect={() => onSelect(nodeId)}
                    registerRef={registerRef}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <ul className="sr-only" aria-label="Graph connections">
          {(graph.edges ?? []).map((edge, index) => (
            <li key={index}>
              {labelById.get(edge.from) ?? edge.from} {edge.fromPort} connects to {labelById.get(edge.to) ?? edge.to} {edge.toPort}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
