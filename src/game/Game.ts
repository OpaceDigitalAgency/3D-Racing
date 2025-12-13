import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { createEngine } from "./createEngine";
import { createScene } from "./createScene";
import { FixedTimestep } from "./loop/FixedTimestep";
import { InputState } from "./input/InputState";
import { attachKeyboard } from "./input/KeyboardInput";
import { attachGamepad } from "./input/GamepadInput";
import { CarSim } from "./sim/CarSim";
import { QUALITY_PRESETS, type QualityPresetId } from "../shared/qualityPresets";
import { CAMERA_VIEWS, type TelemetrySnapshot, type CameraViewId } from "../shared/telemetry";
import type { ProjectionRef } from "./track/Track";

type CreateGameArgs = { canvas: HTMLCanvasElement };

export type GameAPI = {
  start(): void;
  resize(): void;
  setQuality(id: QualityPresetId): void;
  setCameraView(id: CameraViewId): void;
  reset(): void;
  getTelemetry(): TelemetrySnapshot;
};

export async function createGame({ canvas }: CreateGameArgs): Promise<GameAPI> {
  const { engine, renderer } = await createEngine(canvas);
  const { scene, camera, shadowGen, pipeline, carMesh, track } = await createScene(engine, canvas);

  const input = new InputState();
  const detachKeyboard = attachKeyboard(input, canvas);
  attachGamepad(input);

  const sim = new CarSim({
    wheelbase: 2.65,
    maxSteerRad: 0.55,
    engineAccel: 21.5,
    brakeDecel: 34.0,
    drag: 0.012,
    rolling: 0.45,
    lateralGrip: 19.0,
    handbrakeGripScale: 0.35,
    offroadGripScale: 0.7,      // Increased from 0.55 - can still drive on grass
    offroadDragScale: 1.4,      // Reduced from 1.9 - less resistance on grass
    maxSpeed: 88
  });

  const fixed = new FixedTimestep(1 / 120);

  let quality: QualityPresetId = "high";
  const applyQuality = (id: QualityPresetId) => {
    const preset = QUALITY_PRESETS.find((p) => p.id === id) ?? QUALITY_PRESETS[2];
    quality = preset.id;
    engine.setHardwareScalingLevel(1 / preset.resolutionScale);

    // Avoid zero-sized shadow maps (can break WebGPU). Instead, keep a small map and set darkness to 0.
    shadowGen.mapSize = Math.max(256, preset.shadows.mapSize);
    shadowGen.blurKernel = preset.shadows.blurKernel;
    shadowGen.setDarkness(preset.shadows.enabled ? 0.42 : 0.0);

    pipeline.fxaaEnabled = preset.post.fxaa;
    pipeline.bloomEnabled = preset.post.bloom;
  };

  applyQuality(quality);

  // Camera view system
  let cameraView: CameraViewId = "chase";
  const setCameraView = (id: CameraViewId) => {
    cameraView = id;
    // Reset camera controls for orbit mode
    if (id === "orbit") {
      camera.attachControl(canvas, true);
    } else {
      camera.detachControl();
    }
  };

  // Set initial car position on track
  const startPos = track.centerline[0];
  const nextPos = track.centerline[1];
  const startYaw = Math.atan2(nextPos.x - startPos.x, nextPos.z - startPos.z);
  sim.position.set(startPos.x, 0.55, startPos.z);
  sim.yawRad = startYaw;

  // Time trial / lap detection using track progress wrap
  let lapStartMs = performance.now();
  let lastS = 0;
  let laps = 0;
  let bestLapSeconds: number | null = null;
  let lapTimeSeconds = 0;

  // Basic FPS estimation (stable enough for HUD)
  let fps = 60;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let fpsLastUpdate = performance.now();

  const updateTelemetry = (dt: number) => {
    fpsAcc += dt;
    fpsFrames += 1;
    const now = performance.now();
    if (now - fpsLastUpdate > 400) {
      fps = Math.round(fpsFrames / Math.max(0.001, fpsAcc));
      fpsAcc = 0;
      fpsFrames = 0;
      fpsLastUpdate = now;
    }
  };

  const projRef: ProjectionRef = { closest: new Vector3(), normal: new Vector3(), distance: 0, s: 0 };
  const tmpVec = new Vector3();
  const carRot = new Quaternion();

  const tickSim = (dt: number) => {
    const { projection, onTrack } = track.surfaceAtToRef(sim.position, projRef);

    const surface = onTrack
      ? { grip: 1.0, dragScale: 1.0 }
      : { grip: sim.params.offroadGripScale, dragScale: sim.params.offroadDragScale };

    sim.update(
      dt,
      { throttle: input.throttle, brake: input.brake, handbrake: input.handbrake, steer: input.steer },
      surface
    );

    // Soft constraint: allow driving on grass but push back if way too far outside
    const p = projection;
    const overflow = p.distance - track.halfWidth;
    const softMargin = 25; // Allow up to 25m off track before pushing back
    if (overflow > softMargin) {
      const pushStrength = Math.min(0.3, (overflow - softMargin) * 0.02);
      p.normal.scaleToRef(-pushStrength, tmpVec);
      sim.position.addInPlace(tmpVec);
      const vn = Vector3.Dot(sim.velocity, p.normal);
      if (vn > 0) {
        p.normal.scaleToRef(-vn * 0.3, tmpVec);
        sim.velocity.addInPlace(tmpVec);
      }
    }

    // Lap: wrap around track s coordinate while moving forward
    const s = projection.s;
    const wrappedForward = lastS > track.totalLength * 0.65 && s < track.totalLength * 0.35;
    const movingForward = sim.forwardSpeedMps > 4;
    if (wrappedForward && movingForward) {
      const now = performance.now();
      const lapSeconds = (now - lapStartMs) / 1000;
      if (lapSeconds > 5) {
        laps += 1;
        if (bestLapSeconds === null || lapSeconds < bestLapSeconds) bestLapSeconds = lapSeconds;
        lapStartMs = now;
      }
    }
    lastS = s;
    lapTimeSeconds = (performance.now() - lapStartMs) / 1000;

    // Reset
    if (input.resetPressed) {
      input.resetPressed = false;
      laps = 0;
      bestLapSeconds = null;
      lapStartMs = performance.now();
      lastS = 0;

      // Reset car to track starting position
      const startPos = track.centerline[0];
      const nextPos = track.centerline[1];
      const dx = nextPos.x - startPos.x;
      const dz = nextPos.z - startPos.z;
      const yaw = Math.atan2(dx, dz);

      sim.reset();
      sim.position.set(startPos.x, 0.55, startPos.z);
      sim.yawRad = yaw;
    }

    // Cycle camera view with C key
    if (input.cameraNextPressed) {
      input.cameraNextPressed = false;
      const currentIdx = CAMERA_VIEWS.findIndex(v => v.id === cameraView);
      const nextIdx = (currentIdx + 1) % CAMERA_VIEWS.length;
      setCameraView(CAMERA_VIEWS[nextIdx].id);
    }

    // Apply to visuals
    carMesh.position.copyFrom(sim.position);
    Quaternion.FromEulerAnglesToRef(0, sim.yawRad, 0, carRot);
    carMesh.rotationQuaternion?.copyFrom(carRot);

    // Camera positioning based on view mode
    const forward = sim.forwardVec;
    const right = sim.rightVec;
    const lerpFactor = 1 - Math.pow(0.0005, dt);

    switch (cameraView) {
      case "chase": {
        // Chase camera - behind and above the car
        const target = sim.position.add(forward.scale(4)).add(new Vector3(0, 0.8, 0));
        camera.target = Vector3.Lerp(camera.target, target, lerpFactor);
        const targetAlpha = Math.PI + sim.yawRad;
        const alphaDiff = targetAlpha - camera.alpha;
        const normDiff = Math.atan2(Math.sin(alphaDiff), Math.cos(alphaDiff));
        camera.alpha += normDiff * Math.min(1, 6 * dt);
        camera.beta = 1.15;
        camera.radius = 14;
        carMesh.isVisible = true;
        break;
      }
      case "driver": {
        // First person from driver seat
        const driverPos = sim.position.add(forward.scale(0.3)).add(new Vector3(0, 1.4, 0)).add(right.scale(-0.35));
        camera.target = driverPos.add(forward.scale(50));
        camera.position = Vector3.Lerp(camera.position, driverPos, lerpFactor * 2);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = Math.PI / 2;
        camera.radius = 0.01;
        carMesh.isVisible = false;
        break;
      }
      case "hood": {
        // Hood camera - front of car looking forward
        const hoodPos = sim.position.add(forward.scale(2.0)).add(new Vector3(0, 1.2, 0));
        camera.target = hoodPos.add(forward.scale(50));
        camera.position = Vector3.Lerp(camera.position, hoodPos, lerpFactor * 2);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = Math.PI / 2;
        camera.radius = 0.01;
        carMesh.isVisible = true;
        break;
      }
      case "bumper": {
        // Bumper camera - very low at front of car
        const bumperPos = sim.position.add(forward.scale(2.3)).add(new Vector3(0, 0.4, 0));
        camera.target = bumperPos.add(forward.scale(50));
        camera.position = Vector3.Lerp(camera.position, bumperPos, lerpFactor * 2);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = Math.PI / 2;
        camera.radius = 0.01;
        carMesh.isVisible = false;
        break;
      }
      case "orbit": {
        // Free orbit camera - user controlled with mouse
        camera.target = Vector3.Lerp(camera.target, sim.position.add(new Vector3(0, 1, 0)), lerpFactor * 0.5);
        carMesh.isVisible = true;
        break;
      }
      case "top": {
        // Top down view
        const topTarget = sim.position.add(new Vector3(0, 0.5, 0));
        camera.target = Vector3.Lerp(camera.target, topTarget, lerpFactor);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = 0.05;
        camera.radius = 35;
        carMesh.isVisible = true;
        break;
      }
    }
  };

  const onFrame = () => {
    const dt = engine.getDeltaTime() / 1000;
    fixed.step(dt, (step) => {
      tickSim(step);
      updateTelemetry(step);
    });
    scene.render();
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    engine.runRenderLoop(onFrame);
  };

  const resize = () => engine.resize();

  const reset = () => {
    input.resetPressed = true;
  };

  const getTelemetry = (): TelemetrySnapshot => ({
    fps,
    speedKph: Math.max(0, sim.speedMps) * 3.6,
    lapTimeSeconds,
    bestLapSeconds,
    laps,
    quality,
    renderer,
    cameraView,
    input: { throttle: input.throttle, brake: input.brake, steer: input.steer, handbrake: input.handbrake },
    focus: {
      hasDocumentFocus: document.hasFocus(),
      activeElementTag: (document.activeElement?.tagName ?? "NONE").toLowerCase()
    }
  });

  const setQuality = (id: QualityPresetId) => {
    try {
      applyQuality(id);
    } catch (e) {
      console.error("Quality change failed; keeping previous settings.", e);
    }
  };

  // keep a strong ref for devtools inspection
  void scene;
  (window as any).__apexGame = { engine, scene, sim, track };

  return { start, resize, setQuality, setCameraView, reset, getTelemetry };
}
