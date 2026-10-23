"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type Side = "left" | "right";
type Placement = { side: Side; vertical: number };
type Geometry = { width: number; height: number; viewportWidth: number; viewportHeight: number };
type Drag = { x: number; y: number };
type DragStart = { pointerId: number; offsetX: number; offsetY: number };

const STORAGE_KEY = "atlas:dock-position-v1";
const EDGE_GAP = 24;
const TOP_GAP = 96;
const BOTTOM_GAP = 22;
const INITIAL_PLACEMENT: Placement = { side: "left", vertical: 0.5 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function topBounds(viewportHeight: number, dockHeight: number) {
  const min = Math.min(TOP_GAP, Math.max(12, viewportHeight - dockHeight - BOTTOM_GAP));
  return { min, max: Math.max(min, viewportHeight - dockHeight - BOTTOM_GAP) };
}

function positionTop(vertical: number, viewportHeight: number, dockHeight: number) {
  const { min, max } = topBounds(viewportHeight, dockHeight);
  return min + (max - min) * vertical;
}

function readPlacement(): Placement | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (!saved || typeof saved !== "object") return null;
    const candidate = saved as Partial<Placement>;
    if ((candidate.side !== "left" && candidate.side !== "right") ||
        typeof candidate.vertical !== "number" || !Number.isFinite(candidate.vertical)) return null;
    return { side: candidate.side, vertical: clamp(candidate.vertical, 0, 1) };
  } catch {
    return null;
  }
}

function storePlacement(placement: Placement) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placement)); } catch {
    // Private browsing or blocked storage should not prevent navigation.
  }
}

export function useFloatingDock() {
  const dockRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragStart | null>(null);
  const dragPointRef = useRef<Drag | null>(null);
  const [placement, setPlacement] = useState<Placement>(INITIAL_PLACEMENT);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [dragPoint, setDragPoint] = useState<Drag | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const restored = readPlacement();
      if (restored) setPlacement(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const measure = () => {
      const rect = dock.getBoundingClientRect();
      setGeometry({
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(dock);
    window.addEventListener("resize", measure);
    const frame = window.requestAnimationFrame(measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  const getDockSize = () => {
    const rect = dockRef.current?.getBoundingClientRect();
    return {
      width: rect?.width ?? geometry?.width ?? 68,
      height: rect?.height ?? geometry?.height ?? 480,
    };
  };

  const projectedStyle: CSSProperties = (() => {
    if (dragPoint) return { position: "fixed", left: dragPoint.x, top: dragPoint.y, right: "auto", transform: "none" };
    if (!geometry) return {};
    const left = placement.side === "left" ? EDGE_GAP :
      Math.max(EDGE_GAP, geometry.viewportWidth - geometry.width - EDGE_GAP);
    return {
      position: "fixed",
      left,
      right: "auto",
      top: positionTop(placement.vertical, geometry.viewportHeight, geometry.height),
      transform: "none",
    };
  })();

  const movePointer = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== event.pointerId || window.innerWidth <= 760) return;
    const { width, height } = getDockSize();
    const { min, max } = topBounds(window.innerHeight, height);
    const point = {
      x: clamp(event.clientX - start.offsetX, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
      y: clamp(event.clientY - start.offsetY, min, max),
    };
    dragPointRef.current = point;
    setDragPoint(point);
  };

  const stopPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const point = dragPointRef.current;
    dragRef.current = null;
    dragPointRef.current = null;
    setDragPoint(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!point || event.type === "pointercancel") return;
    const { width, height } = getDockSize();
    const { min, max } = topBounds(window.innerHeight, height);
    const next: Placement = {
      side: point.x + width / 2 >= window.innerWidth / 2 ? "right" : "left",
      vertical: max > min ? clamp((point.y - min) / (max - min), 0, 1) : 0.5,
    };
    setPlacement(next);
    storePlacement(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || window.innerWidth <= 760) return;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    const point = { x: rect.left, y: rect.top };
    dragPointRef.current = point;
    setDragPoint(point);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleKeyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.2 : 0.08;
    let next: Placement | null = null;
    if (event.key === "ArrowLeft") next = { ...placement, side: "left" };
    if (event.key === "ArrowRight") next = { ...placement, side: "right" };
    if (event.key === "ArrowUp") next = { ...placement, vertical: clamp(placement.vertical - step, 0, 1) };
    if (event.key === "ArrowDown") next = { ...placement, vertical: clamp(placement.vertical + step, 0, 1) };
    if (event.key === "Home") next = { ...placement, vertical: 0 };
    if (event.key === "End") next = { ...placement, vertical: 1 };
    if (!next) return;
    event.preventDefault();
    setPlacement(next);
    storePlacement(next);
  };

  const resetPosition = () => {
    setPlacement(INITIAL_PLACEMENT);
    storePlacement(INITIAL_PLACEMENT);
  };

  return {
    dockRef,
    side: placement.side,
    dragging: dragPoint !== null,
    dockStyle: projectedStyle,
    handlePointerDown,
    handlePointerMove: movePointer,
    handlePointerUp: stopPointer,
    handlePointerCancel: stopPointer,
    handleKeyboardMove,
    resetPosition,
  };
}
