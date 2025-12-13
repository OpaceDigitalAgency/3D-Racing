import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

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
import { DamageSystem, createCrashParticles, triggerCrashEffect, applyVisualDamage, createSmokeParticles } from "./effects/CrashEffects";
import { ExhaustFireSystem } from "./effects/ExhaustFire";
import { isInWater, createWaterSplash, triggerSplash, stopSplash } from "./Water";

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
  const { scene, camera, shadowGen, pipeline, taa, ssao2, ssr, motionBlur, carMesh, track, ramps } = await createScene(engine, canvas);

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

  // Damage and effects systems
  const damageSystem = new DamageSystem();
  const crashParticles = createCrashParticles(scene);
  const smokeParticles = createSmokeParticles(scene);
  const exhaustFire = new ExhaustFireSystem(scene, carMesh);
  const waterSplash = createWaterSplash(scene);

  // Collision cooldown to prevent rapid damage
  let collisionCooldown = 0;
  let wasInWater = false;

  let quality: QualityPresetId = "high";
  let ssaoAttached = false;
  let motionBlurAttached = false;
  const applyQuality = (id: QualityPresetId) => {
    const preset = QUALITY_PRESETS.find((p) => p.id === id) ?? QUALITY_PRESETS[2];
    quality = preset.id;
    engine.setHardwareScalingLevel(1 / preset.resolutionScale);

    // Avoid zero-sized shadow maps (can break WebGPU). Instead, keep a small map and set darkness to 0.
    shadowGen.mapSize = Math.max(256, preset.shadows.mapSize);
    shadowGen.blurKernel = preset.shadows.blurKernel;
    shadowGen.setDarkness(preset.shadows.enabled ? 0.42 : 0.0);

    if (taa) taa.isEnabled = preset.post.taa;
    pipeline.fxaaEnabled = preset.post.fxaa && !preset.post.taa;
    pipeline.bloomEnabled = preset.post.bloom;

    pipeline.chromaticAberrationEnabled = preset.id === "high" || preset.id === "ultra";
    pipeline.grainEnabled = preset.id !== "low";

    if (ssr) ssr.isEnabled = preset.post.ssr;
    if (motionBlur) {
      const want = preset.post.motionBlur;
      try {
        if (want && !motionBlurAttached) {
          camera.attachPostProcess(motionBlur);
          motionBlurAttached = true;
        } else if (!want && motionBlurAttached) {
          camera.detachPostProcess(motionBlur);
          motionBlurAttached = false;
        }
      } catch (e) {
        console.warn("Motion blur toggle failed; disabling motion blur.", e);
        try {
          camera.detachPostProcess(motionBlur);
        } catch {
          // ignore
        }
        motionBlurAttached = false;
      }
    }

    if (ssao2) {
      const mgr = scene.postProcessRenderPipelineManager;
      const want = preset.post.ssao;
      try {
        if (want && !ssaoAttached) {
          mgr.attachCamerasToRenderPipeline("ssao2", camera);
          ssaoAttached = true;
        } else if (!want && ssaoAttached) {
          mgr.detachCamerasFromRenderPipeline("ssao2", camera);
          ssaoAttached = false;
        }
      } catch (e) {
        console.warn("SSAO pipeline toggle failed; disabling SSAO.", e);
        try {
          mgr.detachCamerasFromRenderPipeline("ssao2", camera);
        } catch {
          // ignore
        }
        ssaoAttached = false;
      }
    }
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
  const carParts = carMesh.getChildMeshes();
  const setCarVisible = (visible: boolean) => {
    const v = visible ? 1 : 0;
    carParts.forEach((m) => {
      m.visibility = v;
    });
  };
  setCameraView(cameraView);

  const tickSim = (dt: number) => {
    try {
      const { projection, onTrack } = track.surfaceAtToRef(sim.position, projRef);

      const surface = onTrack
        ? { grip: 1.0, dragScale: 1.0 }
        : { grip: sim.params.offroadGripScale, dragScale: sim.params.offroadDragScale };

      // Get ramp height at current position
      const rampInfo = ramps.getHeightAt(sim.position, sim.yawRad);

      // Handle side collision with ramp barriers
      if (rampInfo.sideCollision) {
        const impactSpeed = sim.speedMps * 3.6;
        const damageAmount = Math.max(0, (impactSpeed - 15) * 0.4);

        if (damageAmount > 0) {
          damageSystem.addDamage(damageAmount);
          triggerCrashEffect(crashParticles, sim.position, impactSpeed / 15);
          applyVisualDamage(carMesh, damageSystem.damagePercent);
        }

        // Bounce off the side
        const bounceNormal = rampInfo.normal;
        const vn = Vector3.Dot(sim.velocity, bounceNormal);
        if (vn < 0) {
          sim.velocity.addInPlace(bounceNormal.scale(-vn * 1.5));
          sim.velocity.scaleInPlace(0.6);
        }
      }

      // Pass ground info to physics
      const groundInfo = {
        height: rampInfo.height,
        normal: rampInfo.normal,
        onRamp: rampInfo.onRamp
      };

      sim.update(
        dt,
        { throttle: input.throttle, brake: input.brake, handbrake: input.handbrake, steer: input.steer },
        surface,
        groundInfo
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

    // Barrier collision detection
    if (collisionCooldown > 0) {
      collisionCooldown -= dt;
    } else {
      const collision = track.checkBarrierCollision(sim.position, sim.yawRad, sim.velocity);
      if (collision.collided) {
        // Calculate impact damage based on speed
        const impactSpeed = collision.impactSpeed * 3.6; // Convert to km/h
        const damageAmount = Math.max(0, (impactSpeed - 10) * 0.5); // No damage below 10 km/h

        if (damageAmount > 0) {
          damageSystem.addDamage(damageAmount);

          // Trigger crash particles
          const crashPos = sim.position.add(collision.normal.scale(-1.5));
          triggerCrashEffect(crashParticles, crashPos, impactSpeed / 10);

          // Apply visual damage to car
          applyVisualDamage(carMesh, damageSystem.damagePercent);
        }

        // Push car out of barrier
        sim.position.addInPlace(collision.normal.scale(collision.penetration + 0.1));

        // Bounce velocity off barrier (with energy loss)
        const bounceAmount = Vector3.Dot(sim.velocity, collision.normal);
        if (bounceAmount < 0) {
          const restitution = 0.3; // Bounce factor
          const friction = 0.7; // Friction on impact
          collision.normal.scaleToRef(-bounceAmount * (1 + restitution), tmpVec);
          sim.velocity.addInPlace(tmpVec);
          sim.velocity.scaleInPlace(friction);
        }

        collisionCooldown = 0.15; // Prevent rapid collisions
      }
    }

    // Update smoke for heavy damage
    if (damageSystem.damagePercent > 0.5) {
      const smokePos = sim.position.add(sim.forwardVec.scale(1.5)).add(new Vector3(0, 0.8, 0));
      smokeParticles.emitter = smokePos;
      smokeParticles.emitRate = damageSystem.damagePercent * 30;
    } else {
      smokeParticles.emitRate = 0;
    }

    // Update exhaust fire
    exhaustFire.update(
      sim.position,
      sim.forwardVec,
      sim.rightVec,
      sim.yawRad,
      input.throttle,
      sim.speedMps
    );

    // Water splash effects
    const inWater = isInWater(sim.position);
    if (inWater && sim.speedMps > 2) {
      // Trigger splash when in water and moving
      const splashPos = sim.position.add(new Vector3(0, 0.15, 0));
      triggerSplash(waterSplash, splashPos, sim.velocity, sim.speedMps);
      wasInWater = true;
    } else if (wasInWater) {
      // Stop splash when leaving water
      stopSplash(waterSplash);
      wasInWater = false;
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

      // Reset damage
      damageSystem.reset();
      applyVisualDamage(carMesh, 0);
      smokeParticles.emitRate = 0;
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
      // Apply both yaw and pitch rotation for ramps/jumps
      Quaternion.FromEulerAnglesToRef(sim.pitchRad, sim.yawRad, 0, carRot);
    carMesh.rotationQuaternion?.copyFrom(carRot);

    // Camera positioning based on view mode
    const forward = sim.forwardVec;
    const right = sim.rightVec;
    const lerpFactor = 1 - Math.pow(0.0005, dt);

    // Helper to compute ArcRotateCamera params from desired position and target
    const setArcCameraFromPositionTarget = (
      camPos: Vector3,
      lookAt: Vector3,
      fov: number,
      smooth: boolean = true
    ) => {
      const dir = lookAt.subtract(camPos);
      const targetRadius = dir.length();
      const targetAlpha = Math.atan2(dir.x, dir.z);
      const targetBeta = Math.acos(dir.y / targetRadius);

      if (smooth) {
        const alphaLerp = 1 - Math.pow(0.00001, dt);
        const alphaDiff = targetAlpha - camera.alpha;
        const normDiff = Math.atan2(Math.sin(alphaDiff), Math.cos(alphaDiff));
        camera.alpha += normDiff * alphaLerp;
        camera.beta += (targetBeta - camera.beta) * alphaLerp;
        camera.radius += (targetRadius - camera.radius) * alphaLerp;
        camera.target = Vector3.Lerp(camera.target, lookAt, alphaLerp);
      } else {
        camera.alpha = targetAlpha;
        camera.beta = targetBeta;
        camera.radius = targetRadius;
        camera.target.copyFrom(lookAt);
      }
      camera.fov = fov;
    };

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
        camera.fov = 0.9;
        setCarVisible(true);
        break;
      }
      case "driver": {
        // First person from driver seat - position camera inside car cockpit
        // Camera is at driver position, looking far ahead along forward vector
        const driverPos = sim.position.add(forward.scale(-0.3)).add(new Vector3(0, 1.0, 0)).add(right.scale(-0.25));
        const lookTarget = driverPos.add(forward.scale(50));
        setArcCameraFromPositionTarget(driverPos, lookTarget, 0.85);
        setCarVisible(false);
        break;
      }
      case "hood": {
        // Hood camera - on the bonnet looking forward
        const hoodPos = sim.position.add(forward.scale(1.6)).add(new Vector3(0, 0.85, 0));
        const hoodTarget = hoodPos.add(forward.scale(50));
        setArcCameraFromPositionTarget(hoodPos, hoodTarget, 0.92);
        setCarVisible(true);
        break;
      }
      case "bumper": {
        // Bumper camera - very low at front of car
        const bumperPos = sim.position.add(forward.scale(2.0)).add(new Vector3(0, 0.3, 0));
        const bumperTarget = bumperPos.add(forward.scale(50));
        setArcCameraFromPositionTarget(bumperPos, bumperTarget, 0.95);
        setCarVisible(false);
        break;
      }
      case "orbit": {
        // Free orbit camera - user controlled with mouse
        camera.target = Vector3.Lerp(camera.target, sim.position.add(new Vector3(0, 1, 0)), lerpFactor * 0.5);
        camera.fov = 0.9;
        setCarVisible(true);
        break;
      }
      case "top": {
        // Top down view
        const topTarget = sim.position.add(new Vector3(0, 0.5, 0));
        camera.target = Vector3.Lerp(camera.target, topTarget, lerpFactor);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = 0.05;
        camera.radius = 35;
        camera.fov = 0.8;
        setCarVisible(true);
        break;
      }
    }

    // Motion blur strength from speed (when enabled).
    if (motionBlur && motionBlurAttached) {
      const speed01 = Math.max(0, Math.min(1, sim.speedMps / 55));
      motionBlur.motionStrength = 0.15 + 0.75 * speed01;
    }
    } catch (e) {
      console.error("tickSim error (continuing):", e);
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
