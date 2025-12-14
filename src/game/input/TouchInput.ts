import type { InputState } from "./InputState";

export type TouchControlMode = "zones" | "dpad" | "off";

// Detect if device is mobile/tablet
export function isMobileDevice(): boolean {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    ("ontouchstart" in window) ||
    (navigator.maxTouchPoints > 0)
  );
}

export function attachTouchControls(
  input: InputState,
  canvas: HTMLCanvasElement,
  getControlMode: () => TouchControlMode
): () => void {
  const activeTouches = new Map<number, { startX: number; startY: number; currentX: number; currentY: number }>();
  const activePointers = new Map<number, { clientX: number; clientY: number }>();
  
  // Zone-based controls: left/right halves for steering, top/bottom for throttle/brake
  const processZoneTouch = (touch: Touch) => {
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // Horizontal position determines steering (0-0.4 = left, 0.6-1 = right, middle = neutral)
    const normX = x / width;
    if (normX < 0.35) {
      input.steer = -1;
    } else if (normX > 0.65) {
      input.steer = 1;
    }
    
    // Vertical position determines throttle/brake (top 40% = throttle, bottom 30% = brake)
    const normY = y / height;
    if (normY < 0.4) {
      input.throttle = 1;
      input.brake = 0;
    } else if (normY > 0.7) {
      input.throttle = 0;
      input.brake = 1;
    }
  };

  // D-pad style controls - virtual joystick in corner
  const processDpadTouch = (touch: Touch) => {
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;
    
    // Left side D-pad for steering (bottom left corner)
    const dpadCenterX = width * 0.15;
    const dpadCenterY = height * 0.75;
    const dpadRadius = Math.min(width, height) * 0.12;
    
    const dpadDx = x - dpadCenterX;
    const dpadDy = y - dpadCenterY;
    const dpadDist = Math.sqrt(dpadDx * dpadDx + dpadDy * dpadDy);
    
    if (dpadDist < dpadRadius * 2) {
      // Within steering zone
      input.steer = Math.max(-1, Math.min(1, dpadDx / dpadRadius));
    }
    
    // Right side controls for throttle/brake (bottom right corner)
    const throttleCenterX = width * 0.85;
    const throttleCenterY = height * 0.65;
    const brakeCenterY = height * 0.85;
    const buttonRadius = Math.min(width, height) * 0.08;
    
    // Check throttle button
    const throttleDist = Math.sqrt(
      Math.pow(x - throttleCenterX, 2) + Math.pow(y - throttleCenterY, 2)
    );
    if (throttleDist < buttonRadius) {
      input.throttle = 1;
    }
    
    // Check brake button
    const brakeDist = Math.sqrt(
      Math.pow(x - throttleCenterX, 2) + Math.pow(y - brakeCenterY, 2)
    );
    if (brakeDist < buttonRadius) {
      input.brake = 1;
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      activeTouches.set(touch.identifier, {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY
      });
    }

    // Recompute inputs from all active touches (prevents "sticky" steer if a new touch starts in neutral zones).
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      if (mode === "zones") processZoneTouch(touch);
      else if (mode === "dpad") processDpadTouch(touch);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Reset inputs before processing moves
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    
    for (let i = 0; i < e.touches.length; i++) {
      const touch = e.touches[i];
      const existing = activeTouches.get(touch.identifier);
      if (existing) {
        existing.currentX = touch.clientX;
        existing.currentY = touch.clientY;
      }
      
      if (mode === "zones") {
        processZoneTouch(touch);
      } else if (mode === "dpad") {
        processDpadTouch(touch);
      }
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    
    e.preventDefault();
    e.stopPropagation();
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      activeTouches.delete(touch.identifier);
    }
    
    // Reset inputs if no touches remain
    if (activeTouches.size === 0) {
      input.steer = 0;
      input.throttle = 0;
      input.brake = 0;
    } else {
      // Reprocess remaining touches
      input.steer = 0;
      input.throttle = 0;
      input.brake = 0;
      
      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (mode === "zones") {
          processZoneTouch(touch);
        } else if (mode === "dpad") {
          processDpadTouch(touch);
        }
      }
    }
  };

  // Always use Touch Events for real touch input.
  // (On iOS Safari, Pointer Events can still allow browser selection/gestures unless touch-action is fully honored.)
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  // Desktop/testing support: allow mouse/pen pointer to act like touch controls when selected.
  const toTouchLike = (clientX: number, clientY: number, identifier: number): Touch =>
    ({ identifier, clientX, clientY } as Touch);

  const onPointerDown = (e: PointerEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    if (e.pointerType === "touch") return; // handled by Touch Events above
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Recompute from all active pointers (mirrors touchstart behaviour).
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    activePointers.forEach((p, id) => {
      const t = toTouchLike(p.clientX, p.clientY, id);
      if (mode === "zones") processZoneTouch(t);
      else if (mode === "dpad") processDpadTouch(t);
    });
  };

  const onPointerMove = (e: PointerEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    if (e.pointerType === "touch") return;
    if (!activePointers.has(e.pointerId)) return;

    e.preventDefault();
    e.stopPropagation();

    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    // Reset inputs before processing moves
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;

    activePointers.forEach((p, id) => {
      const t = toTouchLike(p.clientX, p.clientY, id);
      if (mode === "zones") processZoneTouch(t);
      else if (mode === "dpad") processDpadTouch(t);
    });
  };

  const onPointerUpOrCancel = (e: PointerEvent) => {
    const mode = getControlMode();
    if (mode === "off") return;
    if (e.pointerType === "touch") return;

    e.preventDefault();
    e.stopPropagation();
    activePointers.delete(e.pointerId);
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointers.size === 0) {
      input.steer = 0;
      input.throttle = 0;
      input.brake = 0;
      return;
    }

    // Reprocess remaining pointers
    input.steer = 0;
    input.throttle = 0;
    input.brake = 0;
    activePointers.forEach((p, id) => {
      const t = toTouchLike(p.clientX, p.clientY, id);
      if (mode === "zones") processZoneTouch(t);
      else if (mode === "dpad") processDpadTouch(t);
    });
  };

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointermove", onPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onPointerUpOrCancel, { passive: false });
  canvas.addEventListener("pointercancel", onPointerUpOrCancel, { passive: false });

  return () => {
    canvas.removeEventListener("touchstart", onTouchStart);
    canvas.removeEventListener("touchmove", onTouchMove);
    canvas.removeEventListener("touchend", onTouchEnd);
    canvas.removeEventListener("touchcancel", onTouchEnd);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUpOrCancel);
    canvas.removeEventListener("pointercancel", onPointerUpOrCancel);
  };
}
