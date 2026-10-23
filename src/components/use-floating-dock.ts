"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type Side = "left" | "right" | "top" | "bottom";
type Placement = { side: Side; vertical: number };
type Geometry = { width: number; height: number; viewportWidth: number; viewportHeight: number };
type Drag = { x: number; y: number };
type DragStart = { pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number };

const STORAGE_KEY = "atlas:dock-position-v1";
const EDGE_GAP = 24;
const TOP_GAP = 96;
const BOTTOM_GAP = 22;
const ARROW_STEP_PX = 48;
const MOVE_PANEL_WIDTH = 162;
const MOVE_PANEL_HEIGHT = 256;
const INITIAL_PLACEMENT: Placement = { side: "left", vertical: 0.5 };
// Browser-only session cache prevents the dock from jumping when navigating routes.
let clientPlacement: Placement | null = null;

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
    if ((candidate.side !== "left" && candidate.side !== "right" && candidate.side !== "top" && candidate.side !== "bottom") ||
        typeof candidate.vertical !== "number" || !Number.isFinite(candidate.vertical)) return null;
    return { side: candidate.side, vertical: clamp(candidate.vertical, 0, 1) };
  } catch {
    return null;
  }
}

function storePlacement(placement: Placement) {
  clientPlacement = placement;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(placement)); } catch {
    // Private browsing or blocked storage should not prevent navigation.
  }
}

export function useFloatingDock() {
  const dockRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragStart | null>(null);
  const dragPointRef = useRef<Drag | null>(null);
  const draggedClickRef = useRef(false);
  const [placement, setPlacement] = useState<Placement>(() => clientPlacement ?? INITIAL_PLACEMENT);
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [dragPoint, setDragPoint] = useState<Drag | null>(null);

  useEffect(() => {
    if (clientPlacement !== null) return;
    const frame = window.requestAnimationFrame(() => {
      const restored = readPlacement();
      clientPlacement = restored ?? INITIAL_PLACEMENT;
      if (restored) setPlacement(restored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const measure = () => {
      const rect = dock.getBoundingClientRect();
      const next = {
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
      // Route updates and identical ResizeObserver notifications must not
      // recalculate/repaint the dock when its actual geometry has not changed.
      setGeometry((previous) =>
        previous &&
        previous.width === next.width &&
        previous.height === next.height &&
        previous.viewportWidth === next.viewportWidth &&
        previous.viewportHeight === next.viewportHeight ? previous : next
      );
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
    // Horizontal docks have a stable CSS center anchor; measuring their new
    // width must never move their horizontal position.
    if (placement.side === "top" || placement.side === "bottom") return {};
    if (!geometry) return {};
    const left = placement.side === "left" ? EDGE_GAP :
      Math.max(EDGE_GAP, geometry.viewportWidth - geometry.width - EDGE_GAP);
    return {
      position: "fixed",
      left,
      right: "auto",
      // Position the *center* of the dock. The CSS fallback uses the same
      // center-based transform, so hydration never switches positioning models.
      top: positionTop(placement.vertical, geometry.viewportHeight, geometry.height) + geometry.height / 2,
      transform: "translateY(-50%)",
    };
  })();

  // Only a genuine drag moves the dock. Simple taps must not flash or reposition it.
  const movePointer = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragRef.current;
    if (!start || start.pointerId !== event.pointerId || window.innerWidth <= 760) return;
    const { width, height } = getDockSize();
    const { min, max } = topBounds(window.innerHeight, height);
    const point = {
      x: clamp(event.clientX - start.offsetX, EDGE_GAP, Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
      y: clamp(event.clientY - start.offsetY, min, max),
    };
    // The first few pixels are a click/tap, not a drag.
    if (!dragPointRef.current && Math.hypot(event.clientX - start.startX, event.clientY - start.startY) < 7) return;
    draggedClickRef.current = true;
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
    const horizontalSide: Side = point.x + width / 2 >= window.innerWidth / 2 ? "right" : "left";
    const centerY = point.y + height / 2;
    const distanceTop = Math.abs(centerY - TOP_GAP);
    const distanceBottom = Math.abs(window.innerHeight - BOTTOM_GAP - centerY);
    const distanceLeft = point.x;
    const distanceRight = window.innerWidth - point.x - width;
    const nearestHorizontalEdge = Math.min(distanceTop, distanceBottom);
    const nearestVerticalEdge = Math.min(distanceLeft, distanceRight);
    const side: Side = nearestHorizontalEdge < nearestVerticalEdge
      ? distanceTop < distanceBottom ? "top" : "bottom"
      : horizontalSide;
    const next: Placement = {
      side,
      vertical: side === "top" || side === "bottom"
        ? 0.5
        : max > min ? clamp((point.y - min) / (max - min), 0, 1) : 0.5,
    };
    setPlacement(next);
    storePlacement(next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || window.innerWidth <= 760) return;
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    draggedClickRef.current = false;
    dragPointRef.current = null;
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
    };
    // A tap never counts as a drag, which prevents position jumps on clicks.
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // Discard the synthetic click that browsers may dispatch after dragging.
  const consumeDragClick = () => {
    const wasDrag = draggedClickRef.current;
    draggedClickRef.current = false;
    return wasDrag;
  };

  // Arrow-pad actions snap horizontally and move vertically in fixed 48px steps.
  // Converting pixels to the normalized persisted position keeps behavior
  // consistent on large and small desktop viewports.
  const moveDock = (direction: "left" | "right" | "up" | "down") => {
    if (window.innerWidth <= 760) return; // Mobile dock is an anchored drawer.
    const { height } = getDockSize();
    const { min, max } = topBounds(window.innerHeight, height);
    const distance = max - min;
    setPlacement((current) => {
      const next: Placement =
        direction === "left" || direction === "right"
          ? { side: direction, vertical: current.side === "top" || current.side === "bottom" ? 0.5 : current.vertical }
          : { ...current, vertical: current.side === "top" || current.side === "bottom"
              ? 0.5
              : clamp(current.vertical + (direction === "up" ? -1 : 1) *
              (distance > 0 ? ARROW_STEP_PX / distance : 0), 0, 1) };
      if (next.side !== current.side || next.vertical !== current.vertical) storePlacement(next);
      return next;
    });
  };

  const placeDock = (side: Side) => {
    setPlacement((current) => {
      const next: Placement = { side, vertical: side === "top" || side === "bottom" ? 0.5 : current.vertical };
      if (next.side !== current.side || next.vertical !== current.vertical) storePlacement(next);
      return next;
    });
  };

  // Center on the current edge: horizontally for top/bottom (already anchored
  // at 50%), vertically for the left/right vertical dock.
  const centerDock = () => {
    setPlacement((current) => {
      const next: Placement = { ...current, vertical: 0.5 };
      if (next.vertical !== current.vertical) storePlacement(next);
      return next;
    });
  };

  // Position this popup OUTSIDE the dock's scrolling box, so opening it never
  // changes the dock's height/centering or hides any navigation links.
  const moveControlsStyle: CSSProperties = (() => {
    const width = geometry?.width ?? 68;
    const h = geometry?.height ?? 460;
    const vw = geometry?.viewportWidth ?? 1200;
    const vh = geometry?.viewportHeight ?? 800;
    if (placement.side === "top" || placement.side === "bottom") {
      return {
        position: "fixed",
        left: Math.max(12, (vw - MOVE_PANEL_WIDTH) / 2),
        top: placement.side === "top"
          ? Math.min(182, Math.max(76, vh - MOVE_PANEL_HEIGHT - 12))
          : Math.max(76, vh - MOVE_PANEL_HEIGHT - 106),
      };
    }
    const left = placement.side === "left" ? EDGE_GAP : Math.max(EDGE_GAP, vw - width - EDGE_GAP);
    const popupLeft = placement.side === "left" ? left + width + 12 : left - MOVE_PANEL_WIDTH - 12;
    return {
      position: "fixed",
      left: clamp(popupLeft, 12, Math.max(12, vw - MOVE_PANEL_WIDTH - 12)),
      top: clamp(positionTop(placement.vertical, vh, h), 76, Math.max(76, vh - MOVE_PANEL_HEIGHT - 12)),
    };
  })();

  // Use the last measured geometry: never read element refs during render.
  const bounds = geometry
    ? topBounds(geometry.viewportHeight, geometry.height)
    : { min: TOP_GAP, max: TOP_GAP + 1 };
  const isVertical = placement.side === "left" || placement.side === "right";
  const canMoveUp = isVertical && placement.vertical > 0.0001 && bounds.max > bounds.min;
  const canMoveDown = isVertical && placement.vertical < 0.9999 && bounds.max > bounds.min;

  const handleKeyboardMove = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.2 : 0.08;
    let next: Placement | null = null;
    if (event.key === "ArrowLeft") next = { ...placement, side: "left" };
    if (event.key === "ArrowRight") next = { ...placement, side: "right" };
    if (event.key === "ArrowUp") next = placement.side === "top" || placement.side === "bottom"
      ? { side: "top", vertical: 0.5 }
      : { ...placement, vertical: clamp(placement.vertical - step, 0, 1) };
    if (event.key === "ArrowDown") next = placement.side === "top" || placement.side === "bottom"
      ? { side: "bottom", vertical: 0.5 }
      : { ...placement, vertical: clamp(placement.vertical + step, 0, 1) };
    if (event.key === "Home") next = { ...placement, vertical: 0.5 };
    if (event.key === "End") next = INITIAL_PLACEMENT;
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
    moveDock,
    placeDock,
    centerDock,
    moveControlsStyle,
    canMoveUp,
    canMoveDown,
    consumeDragClick,
  };
}
