import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

import { createEngine } from "./createEngine";
import { createScene } from "./createScene";
import { FixedTimestep } from "./loop/FixedTimestep";
import { InputState } from "./input/InputState";
import { attachKeyboard } from "./input/KeyboardInput";
import { attachGamepad } from "./input/GamepadInput";
import { attachTouchControls, isMobileDevice, type TouchControlMode } from "./input/TouchInput";
import { CarSim } from "./sim/CarSim";
import { QUALITY_PRESETS, type QualityPresetId, detectOptimalQuality } from "../shared/qualityPresets";
import { CAMERA_VIEWS, type TelemetrySnapshot, type CameraViewId } from "../shared/telemetry";
import type { ProjectionRef } from "./track/Track";
import { DamageSystem, createCrashParticles, triggerCrashEffect, applyVisualDamage, createSmokeParticles } from "./effects/CrashEffects";
import { ExhaustFireSystem } from "./effects/ExhaustFire";
import { isInWater, createWaterSplash, triggerSplash, stopSplash } from "./Water";
import { getTerrainHeight } from "./track/Terrain";

type CreateGameArgs = { canvas: HTMLCanvasElement };

export type GameAPI = {
  start(): void;
  resize(): void;
  setQuality(id: QualityPresetId): void;
  setCameraView(id: CameraViewId): void;
  setTouchControlMode(mode: TouchControlMode): void;
  setSteeringSensitivity(value: number): void;
  setZoomLevel(value: number): void;
  reset(): void;
  getTelemetry(): TelemetrySnapshot;
};

export async function createGame({ canvas }: CreateGameArgs): Promise<GameAPI> {
  const { engine, renderer } = await createEngine(canvas);
  const { scene, camera, shadowGen, pipeline, taa, ssao2, ssr, motionBlur, carMesh, track, ramps, speedPads, bridges } = await createScene(engine, canvas);

  const input = new InputState();
  const detachKeyboard = attachKeyboard(input, canvas);
  attachGamepad(input);

  // Touch controls for mobile devices
  const isMobile = isMobileDevice();
  let touchControlMode: TouchControlMode = isMobile ? "zones" : "off";
  const getTouchControlMode = () => touchControlMode;
  const detachTouch = attachTouchControls(input, canvas, getTouchControlMode);

  // Control sensitivity (0.3 = smooth, 1.0 = responsive, default 0.7)
  let steeringSensitivity = 0.7;

  // Zoom level for camera (1.0 = normal, 0.2 = zoomed out to see whole track)
  let zoomLevel = 1.0;

  // Mouse wheel zoom handler
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.05 : -0.05;
    zoomLevel = Math.max(0.15, Math.min(1.5, zoomLevel + delta));
  };
  canvas.addEventListener("wheel", onWheel, { passive: false });

  const sim = new CarSim({
    wheelbase: 2.65,
    maxSteerRad: 0.55,
    engineAccel: 21.5,
    brakeDecel: 34.0,
    drag: 0.012,
    rolling: 0.45,
    lateralGrip: 19.0,
    handbrakeGripScale: 0.35,
    offroadGripScale: 0.85,     // Higher grip on grass - less likely to get stuck
    offroadDragScale: 1.2,      // Lower drag - easier to drive off-road
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
  let speedPadCooldown = 0;  // Prevent instant re-trigger

  // Auto-detect optimal quality based on device capabilities
  let quality: QualityPresetId = detectOptimalQuality();
  let ssaoAttached = false;
  let motionBlurAttached = false;

  // Performance monitoring for auto-adjustment

  const applyQuality = (id: QualityPresetId) => {
    const preset = QUALITY_PRESETS.find((p) => p.id === id) ?? QUALITY_PRESETS[2];
    quality = preset.id;
    // Babylon's `hardwareScalingLevel` is the inverse of pixel ratio: lower = sharper (more pixels).
    // Scale relative to devicePixelRatio so "Ultra" isn't unintentionally low-res on Retina/high-DPI.
    const devicePixelRatio = isMobile ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    let hardwareScalingLevel = 1 / (preset.resolutionScale * devicePixelRatio);

    // Mobile safety cap: avoid allocating huge render targets on high-res phones.
    // (Prevents iOS Safari GPU/process crashes while keeping desktop visuals unchanged.)
    if (isMobile) {
      const maxPixels = 1_400_000; // ~1536x912 equivalent
      const cw = Math.max(1, canvas.clientWidth || canvas.width || 1);
      const ch = Math.max(1, canvas.clientHeight || canvas.height || 1);
      const estPixels = (cw / hardwareScalingLevel) * (ch / hardwareScalingLevel);
      if (estPixels > maxPixels) {
        const minScaling = Math.sqrt((cw * ch) / maxPixels);
        hardwareScalingLevel = Math.max(hardwareScalingLevel, minScaling);
      }
    }
    engine.setHardwareScalingLevel(hardwareScalingLevel);

    // Debug logging to verify quality settings
    console.log(`[Quality] Applied: ${preset.id}`, {
      resolutionScale: preset.resolutionScale,
      devicePixelRatio,
      hardwareScalingLevel,
      shadowMapSize: preset.shadows.mapSize,
      renderWidth: engine.getRenderWidth(),
      renderHeight: engine.getRenderHeight()
    });

    // Avoid zero-sized shadow maps (can break WebGPU). Instead, keep a small map and set darkness to 0.
    shadowGen.mapSize = Math.max(256, preset.shadows.mapSize);
    shadowGen.blurKernel = preset.shadows.blurKernel;
    shadowGen.setDarkness(preset.shadows.enabled ? 0.42 : 0.0);

    const taaEnabled = Boolean(taa && preset.post.taa);
    if (taa) taa.isEnabled = preset.post.taa;
    // If TAA isn't available/enabled, force FXAA on as a safety net (otherwise "ultra" can look jaggy).
    pipeline.fxaaEnabled = preset.post.fxaa || !taaEnabled;
    pipeline.bloomEnabled = preset.post.bloom;

    pipeline.chromaticAberrationEnabled = !isMobile && (preset.id === "high" || preset.id === "ultra");
    pipeline.grainEnabled = !isMobile && preset.id !== "low";

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
  const orbitConfig = {
    inertia: camera.inertia,
    lowerBetaLimit: camera.lowerBetaLimit,
    upperBetaLimit: camera.upperBetaLimit,
    lowerRadiusLimit: camera.lowerRadiusLimit,
    upperRadiusLimit: camera.upperRadiusLimit,
  };
  const clearCameraInertia = () => {
    // Prevent residual pointer inertia from leaking into fixed views.
    camera.inertialAlphaOffset = 0;
    camera.inertialBetaOffset = 0;
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  };
  const setCameraView = (id: CameraViewId) => {
    cameraView = id;
    // Orbit mode: user controlled camera.
    if (id === "orbit") {
      camera.inertia = orbitConfig.inertia;
      camera.lowerBetaLimit = orbitConfig.lowerBetaLimit;
      camera.upperBetaLimit = orbitConfig.upperBetaLimit;
      camera.lowerRadiusLimit = orbitConfig.lowerRadiusLimit;
      camera.upperRadiusLimit = orbitConfig.upperRadiusLimit;
      clearCameraInertia();
      camera.attachControl(canvas, true);
      return;
    }

    // Fixed views: lock camera; no residual inertia; no beta clamping near horizontal.
    camera.detachControl();
    clearCameraInertia();
    camera.inertia = 0;
    camera.lowerBetaLimit = 0.01;
    camera.upperBetaLimit = Math.PI - 0.01;
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

  // Camera effects state
  let headBobTime = 0;
  let cameraShakeIntensity = 0;

  const tickSim = (dt: number) => {
    try {
      const { projection, onTrack } = track.surfaceAtToRef(sim.position, projRef);

      // Improved off-road surface - still driveable but with reduced performance
      const surface = onTrack
        ? { grip: 1.0, dragScale: 1.0 }
        : { grip: sim.params.offroadGripScale, dragScale: sim.params.offroadDragScale };

      // Get ramp height at current position
      const rampInfo = ramps.getHeightAt(sim.position, sim.yawRad);

      // Get bridge height at current position (pass car Y position for collision detection)
      const bridgeInfo = bridges.getHeightAt(sim.position, sim.position.y);

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

      // Handle side collision with bridge barriers (same behaviour as ramp barriers)
      if (bridgeInfo.sideCollision) {
        const impactSpeed = sim.speedMps * 3.6;
        const damageAmount = Math.max(0, (impactSpeed - 15) * 0.4);

        if (damageAmount > 0) {
          damageSystem.addDamage(damageAmount);
          triggerCrashEffect(crashParticles, sim.position, impactSpeed / 15);
          applyVisualDamage(carMesh, damageSystem.damagePercent);
        }

        // Bounce off the bridge barrier
        const bounceNormal = bridgeInfo.normal;
        const vn = Vector3.Dot(sim.velocity, bounceNormal);
        if (vn < 0) {
          sim.velocity.addInPlace(bounceNormal.scale(-vn * 1.5));
          sim.velocity.scaleInPlace(0.6);
        }
      }

      // Speed pad detection - trigger nitro boost
      if (speedPadCooldown > 0) {
        speedPadCooldown -= dt;
      } else {
        const onSpeedPad = speedPads.isOnSpeedPad(sim.position);
        if (onSpeedPad && sim.speedMps > 5) {
          // Activate 3x nitro boost for 2.5 seconds
          sim.activateNitroBoost(2.5, 3);
          exhaustFire.activateNitroBoost(2.5);
          speedPadCooldown = 3.0;  // Cooldown before can trigger again
        }
      }

      // Update speed pad visuals
      speedPads.update(dt);

      // Get terrain height at car position
      const terrainHeight = getTerrainHeight(sim.position.x, sim.position.z, track.halfWidth);

      // Determine ground height - take highest of terrain, ramp, or bridge
      const groundHeight = Math.max(terrainHeight, rampInfo.height, bridgeInfo.height);
      const onRampOrBridge = rampInfo.onRamp || bridgeInfo.onBridge;

      // Pass ground info to physics with ramp launch data
      const groundInfo = {
        height: groundHeight,
        normal: rampInfo.normal,
        onRamp: onRampOrBridge,
        atRampEdge: rampInfo.atRampEdge,
        rampDirection: rampInfo.rampDirection,
        rampAngle: rampInfo.rampAngle
      };

      // Apply steering sensitivity - lower values give smoother steering
      const adjustedSteer = input.steer * steeringSensitivity;

      sim.update(
        dt,
        { throttle: input.throttle, brake: input.brake, handbrake: input.handbrake, steer: adjustedSteer },
        surface,
        groundInfo
      );

    // Soft constraint: allow driving anywhere on the terrain but push back at world edges
    // The ground is 500x500, track center is at origin, so world edge is ~250m from center
    const worldLimit = 220; // Allow driving up to 220m from track centerline (almost full map)
    const p = projection;
    const overflow = p.distance - track.halfWidth;
    if (overflow > worldLimit) {
      const pushStrength = Math.min(0.5, (overflow - worldLimit) * 0.05);
      p.normal.scaleToRef(-pushStrength, tmpVec);
      sim.position.addInPlace(tmpVec);
      const vn = Vector3.Dot(sim.velocity, p.normal);
      if (vn > 0) {
        p.normal.scaleToRef(-vn * 0.5, tmpVec);
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

    // Update exhaust fire with dt for nitro boost timing
    exhaustFire.update(
      sim.position,
      sim.forwardVec,
      sim.rightVec,
      sim.yawRad,
      input.throttle,
      sim.speedMps,
      dt
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
      // Convert desired world-space pose (position + look-at) into ArcRotate alpha/beta/radius.
      // Babylon's ArcRotate uses alpha = atan2(z, x) and beta = acos(y / r) for offset = position - target.
      const offset = camPos.subtract(lookAt);
      const targetRadius = Math.max(0.001, offset.length());
      const targetAlpha = Math.atan2(offset.z, offset.x);
      const yOverR = Math.max(-1, Math.min(1, offset.y / targetRadius));
      const targetBeta = Math.acos(yOverR);

      if (smooth) {
        const alphaLerp = 1 - Math.pow(0.00001, dt);
        const alphaDiff = targetAlpha - camera.alpha;
        const normDiff = Math.atan2(Math.sin(alphaDiff), Math.cos(alphaDiff));
        camera.alpha += normDiff * alphaLerp;
        camera.beta += (targetBeta - camera.beta) * alphaLerp;
        camera.radius += (targetRadius - camera.radius) * alphaLerp;
        Vector3.LerpToRef(camera.target, lookAt, alphaLerp, camera.target);
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
        // Chase camera - behind and above the car, respects zoom level
        const target = sim.position.add(forward.scale(4)).add(new Vector3(0, 0.8, 0));
        camera.target = Vector3.Lerp(camera.target, target, lerpFactor);
        const targetAlpha = Math.PI + sim.yawRad;
        const alphaDiff = targetAlpha - camera.alpha;
        const normDiff = Math.atan2(Math.sin(alphaDiff), Math.cos(alphaDiff));
        camera.alpha += normDiff * Math.min(1, 6 * dt);
        camera.beta = 1.15 - (1 - zoomLevel) * 0.5; // More overhead when zoomed out
        // Zoom out allows seeing whole track (radius 14-250)
        camera.radius = 14 + (1 - zoomLevel) * 280;
        camera.fov = 0.9;
        setCarVisible(true);
        break;
      }
      case "driver": {
        // First person from driver seat - true cockpit view with head bob and steering feel
        // Update head bob based on speed and terrain
        headBobTime += dt * (4 + sim.speedMps * 0.15);
        const speedFactor = Math.min(1, sim.speedMps / 40);
        const bobAmountY = Math.sin(headBobTime) * 0.015 * speedFactor;
        const bobAmountX = Math.cos(headBobTime * 0.5) * 0.008 * speedFactor;

        // Subtle, *deterministic* camera shake from lateral acceleration (avoid per-frame randomness/jitter).
        const lateral01 = Math.max(0, Math.min(1, Math.abs(sim.accelLatMps2) / 14));
        const lateralShake = lateral01 * 0.01;
        const shakeX = Math.sin(headBobTime * 7.3) * lateralShake;
        const shakeY = Math.cos(headBobTime * 5.1) * lateralShake * 0.6;

        // Driver sits slightly left of centre, behind windscreen
        const driverPos = sim.position
          .add(forward.scale(0.25))
          .add(new Vector3(0, 0.92 + bobAmountY + shakeY, 0))
          .add(right.scale(-0.28 + bobAmountX + shakeX));

        // Look ahead with slight steering offset for more realistic feel
        const steerOffset = input.steer * 1.2; // world-space offset for a small look-into-turns angle
        const lookTarget = driverPos.add(forward.scale(30)).add(right.scale(steerOffset));

        // Wider FOV that increases with speed for sense of motion
        const dynamicFov = 0.75 + speedFactor * 0.15;
        setArcCameraFromPositionTarget(driverPos, lookTarget, dynamicFov, false);
        setCarVisible(false);
        break;
      }
      case "hood": {
        // Hood camera - mounted on bonnet, looking forward over the hood
        // Position camera low enough to see the bonnet and tilt slightly down.
        // Keep the camera above the body geometry (avoid sitting inside the mesh).
        const hoodPos = sim.position.add(forward.scale(1.05)).add(new Vector3(0, 1.05, 0));
        // Look fairly near and down to keep the bonnet in frame.
        const hoodTarget = hoodPos.add(forward.scale(18)).add(new Vector3(0, -0.7, 0));
        setArcCameraFromPositionTarget(hoodPos, hoodTarget, 0.95, false);
        // Show only front of car (hood visible, rest hidden would require mesh splitting)
        setCarVisible(true);
        break;
      }
      case "bumper": {
        // Bumper camera - low angle from front of car, seeing bonnet and road ahead
        // Place slightly behind the very front so some nose/bonnet stays in-frame, with a slight down tilt.
        // Raise above the nose geometry (front nose only reaches ~0.6m high).
        const bumperPos = sim.position.add(forward.scale(1.8)).add(new Vector3(0, 0.9, 0));
        const bumperTarget = bumperPos.add(forward.scale(18)).add(new Vector3(0, -0.8, 0));
        setArcCameraFromPositionTarget(bumperPos, bumperTarget, 0.98, false);
        // Show car - bonnet should be visible from this angle
        setCarVisible(true);
        break;
      }
      case "orbit": {
        // Free orbit camera - user controlled with mouse, respects zoom
        const orbitTarget = sim.position.add(new Vector3(0, 1, 0));
        // Safety check for valid target position
        if (isFinite(orbitTarget.x) && isFinite(orbitTarget.y) && isFinite(orbitTarget.z)) {
          camera.target = Vector3.Lerp(camera.target, orbitTarget, lerpFactor * 0.5);
        }
        // Apply zoom to orbit radius limits with sensible bounds
        const minRadius = Math.max(5, 5 + (1 - zoomLevel) * 50);
        const maxRadius = Math.max(minRadius + 10, 35 + (1 - zoomLevel) * 150);
        camera.lowerRadiusLimit = minRadius;
        camera.upperRadiusLimit = maxRadius;
        // Clamp actual radius to valid range
        if (camera.radius < minRadius) camera.radius = minRadius;
        if (camera.radius > maxRadius) camera.radius = maxRadius;
        camera.fov = 0.9;
        setCarVisible(true);
        break;
      }
      case "top": {
        // Top down view - respects zoom for track overview
        const topTarget = sim.position.add(new Vector3(0, 0.5, 0));
        camera.target = Vector3.Lerp(camera.target, topTarget, lerpFactor);
        camera.alpha = Math.PI + sim.yawRad;
        camera.beta = 0.05;
        // Zoom out allows seeing whole track (radius 35-350)
        camera.radius = 35 + (1 - zoomLevel) * 350;
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
    touchControlMode,
    steeringSensitivity,
    zoomLevel,
    isMobile,
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

  const setTouchControlMode = (mode: TouchControlMode) => {
    touchControlMode = mode;
  };

  const setSteeringSensitivity = (value: number) => {
    steeringSensitivity = Math.max(0.2, Math.min(1.5, value));
  };

  const setZoomLevel = (value: number) => {
    zoomLevel = Math.max(0.15, Math.min(1.5, value));
  };

  // Keep a strong ref for devtools inspection (dev mode only)
  void scene;
  if (import.meta.env.DEV) {
    (window as any).__apexGame = { engine, scene, sim, track };
  }

  return {
    start,
    resize,
    setQuality,
    setCameraView,
    setTouchControlMode,
    setSteeringSensitivity,
    setZoomLevel,
    reset,
    getTelemetry
  };
}
