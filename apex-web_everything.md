# APEX//WEB – Technical Design + Prototype Notes (Dec 2025 target)

Generated: 2025-12-13T15:35:42

---

## Technical design (Dec 2025): “looks real” + 60fps

Primary goal: ship a **client-side** 3D racing app where **rendering + simulation live entirely in the browser**, with a **thin backend only when you truly need it** (leaderboards, accounts, multiplayer signalling later).

### Architecture (best visuals + best performance)

1) **Client engine (hot path): TypeScript + Vite + Babylon.js (or Three.js)**
- Owns **render loop + simulation loop**, framework-free (no React in per-frame logic).
- Prefer **WebGPU**, fallback to **WebGL2**.
- Keeps performance predictable: minimal allocations per frame, data-oriented state, stable frame pacing.

2) **UI overlay (cold path): React (optional)**
- Use React for menus/settings/HUD/leaderboards/config only.
- React reads engine state at **10–20Hz telemetry** (not 60–120Hz), via a small engine API:
  - `game.setQuality(preset)`
  - `game.setAssistConfig(...)`
  - `game.setVoiceEnabled(boolean)`
  - `game.getTelemetry()` (rate-limited snapshot)
- UI is mounted to a separate DOM root layered over the canvas.

3) **Backend (only when needed): Node.js**
- Not required for MVP if you ship time trial + local ghost.
- Add later for leaderboards/multiplayer/analytics with a boring, scalable setup:
  - REST first, WebSocket/WebRTC signalling later
  - Postgres (or SQLite for earliest iterations)
  - Validate submissions (track id, car id, build hash, sanity limits) to filter obvious nonsense

Key performance rule: **do not store frame-by-frame game state in React**. Treat React as a control panel; the engine is the machine.

### Threading model (what actually scales in browsers)

- **Main thread:** rendering + input + minimal orchestration (keeps latency low).
- **Workers:** physics/AI, ghost recording/encoding, asset decoding/transcoding (KTX2/meshopt), path-trace accumulation (showroom mode), telemetry aggregation.
- **WASM + threads:** if you want top-end CPU perf (physics/AI), plan for `SharedArrayBuffer` which requires **cross-origin isolation** (COOP/COEP headers). Decide early because it affects hosting and asset loading rules.

### Rendering targets (two-mode plan)

**A) Performance Mode (default, competitive driving): WebGPU raster**
- Physically-based materials (PBR) + HDR image-based lighting (IBL) + ACES tonemapping.
- Modern reflections: **SSR** (cheap, view-dependent) + **reflection probes** (stable, off-screen) + planar reflections where justified.
- Shadows: cascaded sun shadows + contact shadows; aggressive filtering choices per quality tier.
- Post: TAA (or TSR-like temporal resolve), motion blur (camera + per-object if budget allows), bloom, color grading, lens dirt (subtle), chromatic aberration off by default.
- Performance scaling: dynamic resolution + optional temporal upscaler; quality presets that mainly trade **shadows/reflections/volumetrics**.

**B) Showroom Mode (optional “wow”): progressive path tracing**
- Use WebGPU compute-based path tracing for garage/replay/photo mode (not during competitive play).
- Progressive accumulation + denoise/temporal stabilization + clamp/firefly suppression.
- Keep it opt-in and clearly separated from the driving renderer so it never contaminates your perf budget.

### Scene/asset pipeline (where “realism” actually comes from)

- **Geometry:** glTF 2.0 (+ `meshopt` compression, Draco where needed). Author LODs and impostors for dense dressing.
- **Textures:** KTX2/BasisU (BC7/ASTC/ETC variants at runtime). Use resolution tiers per platform.
- **Track building:** split into:
  - driveable surface + collision meshes (clean, simple, stable)
  - visual dressing meshes (dense, instanced, aggressively LOD’d)
- **“Real place” dressing (optional):** Gaussian splats for non-colliding set dressing (grandstands, trees, rock walls). Treat it like a skybox: beautiful, cheap-ish, and never authoritative for gameplay.
- **Lighting:** precompute as much as you can for static track assets (lightmaps and/or probe volumes) and reserve expensive real-time lighting for cars, dynamic objects, and time-of-day changes.

### Engine structure (keeps you fast later)

- Fixed-timestep simulation (e.g. 120Hz) + render interpolation.
- Deterministic-ish input pipeline (command bus) to enable:
  - replays/ghosts
  - “sanity-check” leaderboard validation
  - eventual multiplayer reconciliation (if you go there)
- Data-oriented world state (ECS or ECS-lite): avoid deep object graphs in the hot path.

Recommended folder layout:

```
src/game/    # engine loop, rendering, physics, input, audio, asset streaming
src/ui/      # React app (menus, settings, HUD)
src/shared/  # types + config (quality presets, command grammar)
```

### “Best choice” stack (for APEX//WEB)

- Client: `Vite` + `TypeScript` + `Babylon.js` (strong batteries-included for PBR/post/WebGPU) or `Three.js` (excellent ecosystem; more DIY).
- Physics: `Rapier` (WASM) or a dedicated vehicle model with collision from a WASM physics core; keep vehicle dynamics separate from collision response.
- Audio: WebAudio + AudioWorklets for engine synthesis/filters; spatialized sources for replays.
- Voice: Web Speech API (push-to-talk by default); make privacy/offline limitations explicit in UX.
- Backend: none for `0.1`; add Node leaderboards after handling + content are fun.

---

## Appendix: original brief + prototype dump (verbatim content)

### User: Brief / spec
Ultra-realistic browser racing game (keyword-controlled)

Working title
APEX//WEB (rename later; it just sounds fast)

Goal
Create a browser-based racing game that looks modern and hyper-real, runs smoothly on mainstream machines, and can be controlled using spoken keywords (with keyboard/controller as fallback).

Target experience
• Gameplay: 60fps target on desktop; scalable down for laptops.
• Visual bar: PBR materials, HDR lighting, realistic reflections, high-quality post, dense trackside detail.
• “Showroom realism”: optional path-traced mode for menus/replays/photo mode (not required during competitive driving).

Platforms
• Desktop: Chrome / Edge / Firefox / Safari (WebGPU where available; fallback path required)
• Mobile: “nice if it runs”, not the main target for the first milestone.

Core features

1) Rendering & visuals

Rendering modes
1. Performance Mode (default): WebGPU raster pipeline (or WebGL2 fallback).
• PBR + IBL (HDR env maps)
• Cascaded shadows + contact shadows
• SSR (screen-space reflections) + reflection probes where needed
• TAA + dynamic resolution scaling
2. Showroom Mode (optional, “wow”): progressive path tracing for:
• Garage/showroom
• Replay viewer
• Photo mode
Reference implementations exist for in-browser GPU path tracing (Three.js / WebGPU compute approaches).

Asset formats
• glTF 2.0 for cars/props, KTX2/Basis for textures, Draco/meshopt as needed.

Track realism plan
• Driveable surface + barriers: classic mesh + collider-friendly geometry
• Trackside photoreal dressing: optional Gaussian Splatting set dressing (non-colliding) for “real place” impact

2) Physics & handling (arcade-sim hybrid)
• Fixed timestep physics
• Tyre grip model (simplified Pacejka-ish feel is fine for v1)
• Weight transfer, braking distance, traction loss, predictable recovery
• Damage model: cosmetic first (scratches/dents as decals), full deformation later

3) Audio
• Engine loop with granular pitch/volume based on RPM + load
• Tyre squeal, gravel, kerb hits, wind noise
• Spatial audio for replays

4) Controls

Standard
• Keyboard: WASD/arrows + handbrake + reset
• Gamepad: Xbox layout support
• Assist options: steering assist, braking assist

Keyword / voice control
• Use the Web Speech API SpeechRecognition where supported
• Design as “push-to-talk” by default (to avoid your mate Dave accidentally shouting “BRAKE!” and ruining your lap).

Important notes
• Browser support varies; plan a fallback path.
• In some browsers (notably Chrome), recognition may be server-based, meaning audio is sent to a service and won’t work offline. Make this explicit in the UX.

Keyword grammar (example)
• Driving:
• “accelerate”, “brake”, “handbrake”
• “left”, “right”, “straight”
• “nitro” / “boost”
• Utility:
• “reset car”
• “restart”
• “camera one / two / three”
• “pause”
• “photo mode”
• Accessibility:
• “increase sensitivity”, “decrease sensitivity”
• “turn assists on/off”

Implementation detail: map recognised phrases to a command bus that sets input state for N milliseconds (e.g., “brake” = brake=1.0 for 250ms, repeated while phrase is detected in continuous mode).

Game modes (MVP first)

MVP (release 0.1)
• 1 car, 1 track, time trial
• Ghost replay (local)
• Leaderboard stub (optional)

Next
• Race vs AI (simple spline-follow + overtake logic)
• Multiplayer later (WebRTC/WebSocket), if you want pain with your breakfast

Tech recommendations (pragmatic “best possible”)
• Engine: Babylon.js or Three.js (both viable; Babylon has a clear WebGPU status page; Three.js has a WebGPU renderer + fallback)
• Path tracing (optional):
• three-gpu-pathtracer style approach for showroom realism
• WebGPU compute tracer prototypes exist if you want to go deeper
• Build: Vite
• Physics: WASM-based physics library (Rapier is a common choice), or Ammo.js if you’re already in that lane.
• Quality scaling: dynamic resolution + toggles for shadows/reflections/post

Deliverables & milestones

Milestone 1 — “Looks real, drives fun”
• Drivable car with decent handling
• One short track with polished lighting/materials
• Performance Mode stable
• Keyboard + gamepad input working

Milestone 2 — Keyword control
• SpeechRecognition integration + permission UX
• Keyword mapping + command bus
• Clear fallback when unsupported
• Safety: push-to-talk + sensitivity slider + “mute mic” toggle

Milestone 3 — “Showroom wow” (optional)
• Path-traced garage scene or replay viewer
• Photo mode with accumulation + denoise/temporal smoothing (basic)

Acceptance criteria (non-negotiables)
• Loads fast, streams assets, no giant “wait 90 seconds” splash screen.
• Visual quality is scalable (high/medium/low presets).
• Voice control never blocks normal play; it’s an enhancement, not a hostage situation.
• Clear privacy note if speech recognition uses a remote service.


---

### Assistant: Build steps + code
Alright — here’s a working Milestone-1 + Milestone-2 starter build you can paste into a fresh project and run today. It gives you:

- Babylon.js renderer with WebGPU (when available) + WebGL2 fallback
- PBR + HDR environment lighting + shadows + basic post
- Fixed-timestep arcade-sim car handling (fun first, realism later)
- Keyboard + gamepad
- Push-to-talk keyword control using SpeechRecognition, with an explicit offline/privacy note

## 1) Create the project

```bash
mkdir apex-web
cd apex-web
npm init -y
npm i babylonjs babylonjs-loaders
npm i -D vite typescript
npx tsc --init
```

package.json (replace scripts block)

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

vite config (optional but helpful) — vite.config.ts

```ts
import { defineConfig } from "vite";
export default defineConfig({
  server: { port: 5173, host: true }
});
```

## 2) File tree

```
apex-web/
  index.html
  src/
    main.ts
    game/
      createEngine.ts
      createScene.ts
      input/
        inputState.ts
        keyboard.ts
        gamepad.ts
        voice.ts
        commandBus.ts
      sim/
        fixedTimestep.ts
        carController.ts
      ui/
        hud.ts
  public/
    env/
      env.env   (HDR env in Babylon “.env” format)
```

## 3) Core files

### index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>APEX//WEB</title>
    <style>
      html, body { margin:0; height:100%; background:#000; overflow:hidden; }
      #app { width:100%; height:100%; }
      canvas { width:100%; height:100%; display:block; touch-action:none; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### src/main.ts

```ts
import { createEngine } from "./game/createEngine";
import { createScene } from "./game/createScene";
import { createHUD } from "./game/ui/hud";

const app = document.getElementById("app")!;
const canvas = document.createElement("canvas");
app.appendChild(canvas);

(async () => {
  const engine = await createEngine(canvas);
  const scene = await createScene(engine, canvas);
  createHUD(scene, canvas);

  engine.runRenderLoop(() => scene.render());

  window.addEventListener("resize", () => engine.resize());
})();
```

## 4) WebGPU + WebGL2 fallback

### src/game/createEngine.ts

```ts
import { Engine, WebGPUEngine } from "babylonjs";

export async function createEngine(canvas: HTMLCanvasElement) {
  // Prefer WebGPU when available; fall back to WebGL2
  const hasWebGPU = "gpu" in navigator;

  if (hasWebGPU) {
    const webgpu = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
    await webgpu.initAsync();
    return webgpu;
  }

  return new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  });
}
```

## 5) Scene: “looks real enough” baseline

### src/game/createScene.ts

```ts
import {
  Scene, Vector3, HemisphericLight, DirectionalLight,
  MeshBuilder, StandardMaterial, Color3, PBRMaterial,
  ShadowGenerator, CubeTexture, Texture, ImageProcessingConfiguration,
  DefaultRenderingPipeline, FreeCamera
} from "babylonjs";

import { InputState } from "./input/inputState";
import { attachKeyboard } from "./input/keyboard";
import { attachGamepad } from "./input/gamepad";
import { attachVoice } from "./input/voice";
import { CommandBus } from "./input/commandBus";
import { FixedTimestep } from "./sim/fixedTimestep";
import { CarController } from "./sim/carController";

export async function createScene(engine: any, canvas: HTMLCanvasElement) {
  const scene = new Scene(engine);

  // Camera (chase handled by controller)
  const camera = new FreeCamera("cam", new Vector3(0, 3, -8), scene);
  camera.setTarget(Vector3.Zero());
  camera.attachControl(canvas, true);

  // Lighting
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.25;

  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.2), scene);
  sun.position = new Vector3(40, 80, 40);
  sun.intensity = 3.0;

  const shadowGen = new ShadowGenerator(2048, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 32;

  // HDR environment (IBL)
  // Put env.env in /public/env/env.env
  const envTex = CubeTexture.CreateFromPrefilteredData("/env/env.env", scene);
  scene.environmentTexture = envTex;
  scene.environmentIntensity = 1.0;

  // Tonemapping/exposure
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.2;
  scene.imageProcessingConfiguration.contrast = 1.1;

  // Post pipeline (very lightweight baseline)
  const pipeline = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipeline.samples = 1;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.15;
  pipeline.chromaticAberrationEnabled = false;

  // Track plane
  const ground = MeshBuilder.CreateGround("ground", { width: 400, height: 400, subdivisions: 2 }, scene);
  const groundMat = new PBRMaterial("groundMat", scene);
  groundMat.roughness = 0.95;
  groundMat.metallic = 0.0;
  groundMat.albedoColor = new Color3(0.12, 0.12, 0.13);
  ground.material = groundMat;
  ground.receiveShadows = true;

  // Simple barriers (placeholder)
  const barrierMat = new StandardMaterial("barrierMat", scene);
  barrierMat.diffuseColor = new Color3(0.3, 0.3, 0.32);

  const mkBarrier = (x: number, z: number, sx: number, sz: number) => {
    const b = MeshBuilder.CreateBox("barrier", { width: sx, height: 1.2, depth: sz }, scene);
    b.position = new Vector3(x, 0.6, z);
    b.material = barrierMat;
    b.receiveShadows = true;
    shadowGen.addShadowCaster(b);
    return b;
  };

  // A simple “loop” corridor
  mkBarrier(0, 60, 80, 1);
  mkBarrier(0, -60, 80, 1);
  mkBarrier(60, 0, 1, 80);
  mkBarrier(-60, 0, 1, 80);

  // Car mesh (placeholder)
  const car = MeshBuilder.CreateBox("car", { width: 1.9, height: 0.6, depth: 4.2 }, scene);
  car.position = new Vector3(0, 0.5, 0);
  const carMat = new PBRMaterial("carMat", scene);
  carMat.metallic = 1.0;
  carMat.roughness = 0.25;
  carMat.albedoColor = new Color3(0.05, 0.3, 0.95);
  car.material = carMat;
  shadowGen.addShadowCaster(car);

  // Input + command bus
  const input = new InputState();
  const bus = new CommandBus(input);

  attachKeyboard(input, bus, canvas);
  attachGamepad(input);
  attachVoice(bus); // push-to-talk voice (optional)

  // Fixed timestep simulation
  const fixed = new FixedTimestep(1 / 120); // 120Hz sim, render 60+
  const controller = new CarController(car, camera, input);

  scene.onBeforeRenderObservable.add(() => {
    fixed.step(engine.getDeltaTime() / 1000, (dt) => controller.update(dt));
  });

  // Basic scalable perf: dynamic resolution toggle hooks live in HUD
  // (default 1.0 scaling)
  engine.setHardwareScalingLevel(1.0);

  return scene;
}
```

## 6) Fixed timestep

### src/game/sim/fixedTimestep.ts

```ts
export class FixedTimestep {
  private acc = 0;
  constructor(private readonly stepSize: number) {}

  step(deltaSeconds: number, tick: (dt: number) => void) {
    this.acc += Math.min(deltaSeconds, 0.1);
    while (this.acc >= this.stepSize) {
      tick(this.stepSize);
      this.acc -= this.stepSize;
    }
  }
}
```

## 7) Car controller (arcade-sim hybrid)

### src/game/sim/carController.ts

```ts
import { AbstractMesh, FreeCamera, Vector3, Quaternion } from "babylonjs";
import { InputState } from "../input/inputState";

export class CarController {
  private vel = 0;              // forward speed (m/s-ish)
  private yaw = 0;              // heading
  private steer = 0;            // -1..1
  private readonly up = Vector3.Up();

  constructor(
    private car: AbstractMesh,
    private camera: FreeCamera,
    private input: InputState
  ) {
    this.yaw = 0;
    this.car.rotationQuaternion = Quaternion.Identity();
  }

  update(dt: number) {
    // Inputs
    const throttle = this.input.throttle;    // 0..1
    const brake = this.input.brake;          // 0..1
    const handbrake = this.input.handbrake;  // 0..1
    const steerTarget = this.input.steer;    // -1..1

    // Steering smoothing
    const steerRate = 8.0;
    this.steer += (steerTarget - this.steer) * Math.min(1, steerRate * dt);

    // Longitudinal dynamics
    const engineForce = 28.0;
    const brakeForce = 44.0;
    const drag = 0.8;

    this.vel += throttle * engineForce * dt;
    this.vel -= brake * brakeForce * dt;

    // Handbrake: kills speed and reduces grip (simplified)
    const hb = Math.min(1, handbrake);
    this.vel *= 1 - hb * 0.12;

    // Natural drag
    this.vel -= this.vel * drag * dt;

    // Clamp speed
    const maxFwd = 70;
    const maxRev = 10;
    this.vel = Math.max(-maxRev, Math.min(maxFwd, this.vel));

    // Yaw: steering effectiveness scales with speed
    const speedFactor = Math.min(1, Math.abs(this.vel) / 20);
    const turnStrength = 1.9;

    const grip = 1 - hb * 0.65; // handbrake reduces grip
    this.yaw += this.steer * turnStrength * speedFactor * grip * dt * Math.sign(this.vel || 1);

    // Move in heading direction
    const forward = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const pos = this.car.position.add(forward.scale(this.vel * dt));

    // “Stick to ground” for now
    pos.y = 0.5;
    this.car.position.copyFrom(pos);

    // Rotate car
    this.car.rotationQuaternion = Quaternion.FromEulerAngles(0, this.yaw, 0);

    // Camera chase
    const camBack = forward.scale(-9);
    const camPos = this.car.position.add(camBack).add(new Vector3(0, 3.5, 0));
    this.camera.position = Vector3.Lerp(this.camera.position, camPos, 1 - Math.pow(0.001, dt));
    this.camera.setTarget(Vector3.Lerp(this.camera.getTarget(), this.car.position.add(forward.scale(6)), 1 - Math.pow(0.001, dt)));

    // Reset
    if (this.input.resetPressed) {
      this.vel = 0;
      this.yaw = 0;
      this.car.position.set(0, 0.5, 0);
      this.input.resetPressed = false;
    }
  }
}
```

## 8) Input system

### src/game/input/inputState.ts

```ts
export class InputState {
  throttle = 0;     // 0..1
  brake = 0;        // 0..1
  handbrake = 0;    // 0..1
  steer = 0;        // -1..1
  resetPressed = false;

  // Voice UX
  voiceEnabled = false;
  voiceListening = false;
  micMuted = false;
}
```

### src/game/input/commandBus.ts

```ts
import { InputState } from "./inputState";

type Cmd =
  | "accelerate" | "brake" | "handbrake"
  | "left" | "right" | "straight"
  | "reset";

export class CommandBus {
  private timers = new Map<Cmd, number>();

  constructor(private input: InputState) {}

  // Apply command for N milliseconds
  fire(cmd: Cmd, ms = 250) {
    const until = performance.now() + ms;
    this.timers.set(cmd, until);
    this.apply();
  }

  // Called each frame or on new voice result
  apply() {
    const now = performance.now();

    const active = (c: Cmd) => (this.timers.get(c) ?? 0) > now;

    // translate commands into input state
    if (active("accelerate")) this.input.throttle = 1.0;
    if (active("brake")) this.input.brake = 1.0;
    if (active("handbrake")) this.input.handbrake = 1.0;

    if (active("left")) this.input.steer = -1.0;
    else if (active("right")) this.input.steer = 1.0;
    else if (active("straight")) this.input.steer = 0;

    if (active("reset")) this.input.resetPressed = true;
  }

  clearDriving() {
    this.input.throttle = 0;
    this.input.brake = 0;
    this.input.handbrake = 0;
    this.input.steer = 0;
  }
}
```

### src/game/input/keyboard.ts

```ts
import { InputState } from "./inputState";
import { CommandBus } from "./commandBus";

export function attachKeyboard(input: InputState, bus: CommandBus, canvas: HTMLCanvasElement) {
  const down = new Set<string>();

  window.addEventListener("keydown", (e) => {
    down.add(e.code);

    if (e.code === "KeyR") input.resetPressed = true;
    if (e.code === "KeyV") input.voiceListening = true; // push-to-talk
  });

  window.addEventListener("keyup", (e) => {
    down.delete(e.code);
    if (e.code === "KeyV") input.voiceListening = false;
  });

  // Per-frame mapping (scene loop will call bus.apply for voice; keyboard updates continuously)
  const update = () => {
    // If voice is actively steering/braking, keyboard still works as override.
    input.throttle = down.has("KeyW") || down.has("ArrowUp") ? 1 : 0;
    input.brake = down.has("KeyS") || down.has("ArrowDown") ? 1 : 0;
    input.handbrake = down.has("Space") ? 1 : 0;

    const left = down.has("KeyA") || down.has("ArrowLeft");
    const right = down.has("KeyD") || down.has("ArrowRight");

    input.steer = left && !right ? -1 : right && !left ? 1 : 0;

    requestAnimationFrame(update);
  };

  update();
  canvas.tabIndex = 0;
  canvas.focus();
}
```

### src/game/input/gamepad.ts

```ts
import { InputState } from "./inputState";

export function attachGamepad(input: InputState) {
  const poll = () => {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find(Boolean);
    if (gp) {
      // Xbox-style: triggers (0..1), left stick X
      const steer = gp.axes?.[0] ?? 0;
      const lt = gp.buttons?.[6]?.value ?? 0; // brake
      const rt = gp.buttons?.[7]?.value ?? 0; // throttle
      const a = gp.buttons?.[0]?.pressed ?? false;

      // Only apply if user is actually using pad (deadzone)
      if (Math.abs(steer) > 0.08 || lt > 0.05 || rt > 0.05) {
        input.steer = steer;
        input.brake = lt;
        input.throttle = rt;
      }

      if (a) input.resetPressed = true;
    }

    requestAnimationFrame(poll);
  };

  poll();
}
```

## 9) Voice control (push-to-talk, keyword grammar)

### src/game/input/voice.ts

```ts
import { CommandBus } from "./commandBus";

type SpeechRecognitionType = typeof SpeechRecognition;

export function attachVoice(bus: CommandBus) {
  const SpeechRecognitionCtor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionCtor) {
    // Not supported; HUD will show fallback
    return;
  }

  const rec = new SpeechRecognitionCtor() as InstanceType<SpeechRecognitionType>;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-GB";

  let running = false;

  const start = () => {
    if (running) return;
    try {
      rec.start();
      running = true;
    } catch {
      // start() can throw if called too quickly
    }
  };

  const stop = () => {
    if (!running) return;
    try {
      rec.stop();
    } catch {}
    running = false;
  };

  // Push-to-talk is controlled by KeyV via HUD (we read it there and call start/stop)
  (window as any).__apexVoiceStart = start;
  (window as any).__apexVoiceStop = stop;

  const fireFromText = (textRaw: string) => {
    const text = textRaw.trim().toLowerCase();

    // driving
    if (text.includes("accelerate") || text.includes("throttle")) bus.fire("accelerate", 180);
    if (text.includes("brake")) bus.fire("brake", 220);
    if (text.includes("handbrake")) bus.fire("handbrake", 240);

    if (text.includes("left")) bus.fire("left", 220);
    if (text.includes("right")) bus.fire("right", 220);
    if (text.includes("straight")) bus.fire("straight", 220);

    // utility
    if (text.includes("reset car") || text === "reset") bus.fire("reset", 50);
  };

  rec.onresult = (event: SpeechRecognitionEvent) => {
    // Use latest result only
    const last = event.results[event.results.length - 1];
    if (!last) return;
    const phrase = last[0]?.transcript ?? "";
    fireFromText(phrase);
    bus.apply();
  };

  rec.onerror = () => {
    // Keep it non-blocking: fail silently; HUD will show unsupported/offline note
    stop();
  };
}
```

## 10) HUD (perf toggles + voice privacy notice)

### src/game/ui/hud.ts

```ts
import { Scene } from "babylonjs";

export function createHUD(scene: Scene, canvas: HTMLCanvasElement) {
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "12px";
  wrap.style.top = "12px";
  wrap.style.color = "white";
  wrap.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
  wrap.style.fontSize = "13px";
  wrap.style.background = "rgba(0,0,0,0.45)";
  wrap.style.border = "1px solid rgba(255,255,255,0.12)";
  wrap.style.padding = "10px 12px";
  wrap.style.borderRadius = "10px";
  wrap.style.maxWidth = "360px";
  wrap.style.userSelect = "none";

  const voiceSupported = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  wrap.innerHTML = `
    <div style="font-weight:700; letter-spacing:0.5px;">APEX//WEB</div>
    <div style="opacity:0.9; margin-top:6px;">
      <div><b>Drive:</b> WASD / Arrows, Space = handbrake, R = reset</div>
      <div><b>Voice:</b> Hold <b>V</b> to talk (push-to-talk)</div>
      <div style="margin-top:6px; opacity:0.85;">
        ${voiceSupported
          ? "Privacy: some browsers may send audio to a remote recognition service; voice may not work offline."
          : "Voice not supported in this browser; keyboard/gamepad still works."}
      </div>
      <div style="margin-top:8px;">
        <label>Resolution scale:
          <select id="scaleSel">
            <option value="1">100%</option>
            <option value="1.25">80%</option>
            <option value="1.67">60%</option>
            <option value="2">50%</option>
          </select>
        </label>
      </div>
    </div>
  `;

  document.body.appendChild(wrap);

  const engine = scene.getEngine() as any;
  const sel = wrap.querySelector("#scaleSel") as HTMLSelectElement;
  sel.addEventListener("change", () => {
    const v = Number(sel.value);
    engine.setHardwareScalingLevel(v);
  });

  // Push-to-talk control for SpeechRecognition
  let wasDown = false;
  const tick = () => {
    const isDown = (window as any).__apexKeyVDown === true;
    if (voiceSupported) {
      if (isDown && !wasDown) (window as any).__apexVoiceStart?.();
      if (!isDown && wasDown) (window as any).__apexVoiceStop?.();
    }
    wasDown = isDown;
    requestAnimationFrame(tick);
  };

  // Track KeyV state globally (simple + reliable)
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyV") (window as any).__apexKeyVDown = true;
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "KeyV") (window as any).__apexKeyVDown = false;
  });

  tick();
}
```

## 11) Run it

```bash
npm run dev
```
