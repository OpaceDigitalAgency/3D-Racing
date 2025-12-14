import "./style.css";
import "@babylonjs/core/Legacy/legacy";
import { createGame } from "./game/Game";
import { mountUI } from "./ui/mountUI";

function showFatal(err: unknown) {
  const el = document.createElement("pre");
  el.style.position = "fixed";
  el.style.inset = "12px";
  el.style.padding = "12px";
  el.style.margin = "0";
  el.style.background = "rgba(0,0,0,0.85)";
  el.style.border = "1px solid rgba(255,255,255,0.18)";
  el.style.borderRadius = "12px";
  el.style.color = "rgba(255,255,255,0.92)";
  el.style.font = "12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  el.style.whiteSpace = "pre-wrap";
  el.textContent = `Startup error:\n\n${err instanceof Error ? err.stack ?? err.message : String(err)}`;
  document.body.appendChild(el);
}

async function boot() {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root");

  const uiRoot = document.getElementById("ui-root");
  if (!uiRoot) throw new Error("Missing #ui-root");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "APEX//WEB canvas");
  root.appendChild(canvas);
  canvas.addEventListener("pointerdown", () => canvas.focus());

  const isTypingTarget = (t: EventTarget | null) => {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") return true;
    return t.isContentEditable;
  };

  const isDriveKey = (code: string) =>
    code === "KeyW" ||
    code === "KeyA" ||
    code === "KeyS" ||
    code === "KeyD" ||
    code === "ArrowUp" ||
    code === "ArrowDown" ||
    code === "ArrowLeft" ||
    code === "ArrowRight" ||
    code === "Space" ||
    code === "KeyR";

  // If focus is stuck on a control, pull focus back to the canvas when a drive key is pressed.
  window.addEventListener(
    "keydown",
    (e) => {
      if (isTypingTarget(e.target)) return;
      if (!isDriveKey(e.code)) return;
      if (document.activeElement !== canvas) canvas.focus();
    },
    true
  );

  const game = await createGame({ canvas });
  mountUI({ game, mountEl: uiRoot });

  game.start();
  window.addEventListener("resize", () => game.resize());
}

boot().catch((e) => {
  console.error(e);
  showFatal(e);
});
