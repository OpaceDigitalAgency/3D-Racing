import type { InputState } from "./InputState";

export function attachKeyboard(input: InputState, canvas: HTMLCanvasElement) {
  const down = new Set<string>();

  const isTypingTarget = (t: EventTarget | null) => {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    return t.isContentEditable;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    down.add(e.code);
    if (e.code === "KeyR") input.resetPressed = true;
    if (e.code === "KeyC") input.cameraNextPressed = true;

    // Prevent default for game controls to avoid page scrolling
    if (e.code.startsWith("Arrow") || e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    down.delete(e.code);
    if (e.code.startsWith("Arrow") || e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Clear all keys when window loses focus to prevent stuck keys
  const onBlur = () => {
    down.clear();
    input.throttle = 0;
    input.brake = 0;
    input.handbrake = 0;
    input.steer = 0;
  };

  // Capture phase so we still receive events even if another handler stops propagation.
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", onBlur);

  // Also listen directly on document for maximum compatibility
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);

  const update = () => {
    const w = down.has("KeyW") || down.has("ArrowUp");
    const s = down.has("KeyS") || down.has("ArrowDown");
    const a = down.has("KeyA") || down.has("ArrowLeft");
    const d = down.has("KeyD") || down.has("ArrowRight");

    input.throttle = w && !s ? 1 : 0;
    input.brake = s ? 1 : 0;
    input.handbrake = down.has("Space") ? 1 : 0;
    input.steer = a && !d ? -1 : d && !a ? 1 : 0;

    requestAnimationFrame(update);
  };

  // Make canvas focusable and focus it
  canvas.tabIndex = 0;
  canvas.style.outline = "none";

  // Focus canvas on click anywhere in the game area
  canvas.addEventListener("click", () => canvas.focus());
  canvas.addEventListener("pointerdown", () => canvas.focus());

  // Initial focus with a small delay to ensure DOM is ready
  requestAnimationFrame(() => {
    canvas.focus();
  });

  update();

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keyup", onKeyUp, true);
  };
}
