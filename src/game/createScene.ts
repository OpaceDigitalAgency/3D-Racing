import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { CubeTexture } from "@babylonjs/core/Materials/Textures/cubeTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { TAARenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/taaRenderingPipeline";
import { MotionBlurPostProcess } from "@babylonjs/core/PostProcesses/motionBlurPostProcess";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";

import { Track } from "./track/Track";
import { createCarMesh } from "./CarMesh";
import { createWater } from "./Water";
import { createGrassField } from "./Grass";
import { RampSystem } from "./track/Ramps";
import { TrackProps } from "./track/TrackProps";
import { SpeedPadSystem } from "./track/SpeedPads";
import { BridgeSystem } from "./track/Bridge";
import { applyTerrainToGround } from "./track/Terrain";

export type SceneBits = {
  scene: Scene;
  camera: ArcRotateCamera;
  shadowGen: ShadowGenerator;
  pipeline: DefaultRenderingPipeline;
  taa: TAARenderingPipeline | null;
  ssao2: SSAO2RenderingPipeline | null;
  ssr: SSRRenderingPipeline | null;
  motionBlur: MotionBlurPostProcess | null;
  carMesh: Mesh;
  track: Track;
  ramps: RampSystem;
  speedPads: SpeedPadSystem;
  bridges: BridgeSystem;
};

export async function createScene(engine: AbstractEngine, canvas: HTMLCanvasElement): Promise<SceneBits> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.45, 0.65, 0.85, 1); // Sky blue fallback

  const camera = new ArcRotateCamera("cam", Math.PI, 1.0, 16, new Vector3(0, 1.2, 0), scene);

  // Enable mouse controls for zoom and angle adjustment
  camera.attachControl(canvas, true);
  camera.wheelDeltaPercentage = 0.01;
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 35;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = 1.5;
  camera.panningSensibility = 0;
  camera.inertia = 0.85;
  camera.angularSensibilityX = 800;
  camera.angularSensibilityY = 800;
  camera.fov = 0.9;
  camera.wheelPrecision = 15;
  camera.pinchPrecision = 50;
  // First-person/close cameras need a near clip plane well under 1m, otherwise the hood/bumper get clipped away.
  camera.minZ = 0.05;
  camera.maxZ = 5000;

  // Enhanced lighting for photorealistic look
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.45;
  hemi.groundColor = new Color3(0.2, 0.18, 0.15);
  hemi.diffuse = new Color3(0.9, 0.95, 1.0);

  // Main sun light - golden hour warm light
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -0.75, -0.3).normalize(), scene);
  sun.position = new Vector3(150, 200, 120);
  sun.intensity = 3.2;
  sun.diffuse = new Color3(1.0, 0.95, 0.85);
  sun.specular = new Color3(1.0, 0.98, 0.9);

  // Optimised shadows - start with medium quality for faster initial load
  // Quality preset system will adjust this based on user settings
  const shadowGen = new ShadowGenerator(2048, sun); // Reduced from 4096 for faster startup
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 24; // Reduced from 48 for faster startup
  shadowGen.bias = 0.00003;
  shadowGen.normalBias = 0.012;
  shadowGen.darkness = 0.3;
  shadowGen.useContactHardeningShadow = true;
  shadowGen.contactHardeningLightSizeUVRatio = 0.05;

  // HDR environment for realistic reflections
  // Load with error handling to prevent crashes on missing assets
  let env: CubeTexture | null = null;
  try {
    env = CubeTexture.CreateFromPrefilteredData("/env/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 1.5;
  } catch (error) {
    console.warn("Failed to load environment map, using fallback:", error);
    // Fallback: use scene clear colour as environment
    scene.environmentIntensity = 0.5;
  }

  // Create high quality skybox from environment texture
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000 }, scene);
  const skyboxMat = new PBRMaterial("skyBoxMat", scene);
  skyboxMat.backFaceCulling = false;

  if (env) {
    // Share the same texture reference instead of cloning (saves memory)
    skyboxMat.reflectionTexture = env;
    skyboxMat.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
  } else {
    // Fallback: solid colour skybox
    skyboxMat.albedoColor = new Color3(0.45, 0.65, 0.85);
  }

  skyboxMat.microSurface = 1.0;
  skyboxMat.disableLighting = true;
  skyboxMat.twoSidedLighting = true;
  skybox.material = skyboxMat;
  skybox.infiniteDistance = true;

  // Enable fog for atmospheric depth
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0008;
  scene.fogColor = new Color3(0.75, 0.82, 0.92);

  // Enhanced image processing for photorealistic look
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.1;
  scene.imageProcessingConfiguration.contrast = 1.2;
  scene.imageProcessingConfiguration.vignetteEnabled = true;
  scene.imageProcessingConfiguration.vignetteWeight = 2.0;
  scene.imageProcessingConfiguration.vignetteStretch = 0.6;
  scene.imageProcessingConfiguration.vignetteColor = new Color4(0, 0, 0, 0);
  scene.imageProcessingConfiguration.vignetteCameraFov = 0.4;

  // Optional pipelines (created early to preserve correct post-process ordering)
  let taa: TAARenderingPipeline | null = null;
  try {
    taa = new TAARenderingPipeline("taa", scene, [camera]);
    taa.samples = 8;
    taa.factor = 0.08;
    taa.disableOnCameraMove = true;
    taa.isEnabled = false;
  } catch (e) {
    console.warn("TAA pipeline init failed; continuing without it.", e);
    taa = null;
  }

  // Optimised post-processing pipeline - start with lighter settings
  const pipeline = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipeline.samples = 4; // Reduced from 8 for faster startup
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.15; // Reduced for better performance
  pipeline.bloomThreshold = 0.7;
  pipeline.bloomKernel = 64; // Reduced from 96 for better performance
  pipeline.bloomScale = 0.6;
  pipeline.chromaticAberrationEnabled = false; // Disabled initially for performance
  pipeline.grainEnabled = false; // Disabled initially for performance
  pipeline.sharpenEnabled = false; // Disabled initially for performance
  pipeline.depthOfFieldEnabled = false;
  pipeline.imageProcessingEnabled = true;

  let ssao2: SSAO2RenderingPipeline | null = null;
  try {
    ssao2 = new SSAO2RenderingPipeline("ssao2", scene, { ssaoRatio: 0.6, blurRatio: 1.0 }, [camera]);
    ssao2.radius = 2.2;
    ssao2.totalStrength = 0.9;
    ssao2.samples = 8;
    scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao2", camera);
  } catch (e) {
    console.warn("SSAO2 pipeline init failed; continuing without it.", e);
    ssao2 = null;
  }

  let ssr: SSRRenderingPipeline | null = null;
  try {
    ssr = new SSRRenderingPipeline("ssr", scene, [camera], false);
    ssr.strength = 0.8;
    ssr.maxSteps = 80;
    ssr.step = 1;
    ssr.blurDispersionStrength = 0.0;
    ssr.roughnessFactor = 0.15;
    ssr.isEnabled = false;
  } catch (e) {
    console.warn("SSR pipeline init failed; continuing without it.", e);
    ssr = null;
  }

  let motionBlur: MotionBlurPostProcess | null = null;
  try {
    motionBlur = new MotionBlurPostProcess("motionBlur", scene, 1.0, camera);
    motionBlur.motionStrength = 0.0;
    motionBlur.motionBlurSamples = 24;
    motionBlur.isObjectBased = false;
    try {
      camera.detachPostProcess(motionBlur);
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn("Motion blur init failed; continuing without it.", e);
    motionBlur = null;
  }

  // Create track with improved materials and get ground mesh
  const { track, ground } = Track.createDefault(scene, shadowGen);

  // Apply terrain hills to ground (smooth undulations)
  applyTerrainToGround(ground, track.centerline, track.halfWidth);

  // Create realistic car mesh
  const carMesh = createCarMesh(scene, shadowGen);

  // Create 3D grass field with wind animation
  createGrassField(scene, shadowGen);

  // Create water puddles on track
  createWater(scene, track);

  // Create ramps and jumps on the track
  const ramps = new RampSystem(scene, shadowGen);

  // Add ramps at strategic positions along the track centerline
  ramps.addRampOnTrack(track, 0.15, 8, 14, 1.5);  // First straight - bigger
  ramps.addRampOnTrack(track, 0.65, 8, 14, 1.5);  // Opposite straight - bigger

  // Create speed pads for nitro boost - spaced well away from water puddles
  const speedPads = new SpeedPadSystem(scene, track);
  speedPads.addPadOnTrack(0.05, 6, 10);   // After start - away from water
  speedPads.addPadOnTrack(0.28, 6, 10);   // Before first corner - away from water
  speedPads.addPadOnTrack(0.52, 6, 10);   // Mid opposite straight
  speedPads.addPadOnTrack(0.78, 6, 10);   // Before final corner

  // Curved on/off-ramp overpass route (realistic merge + rejoin).
  const bridges = new BridgeSystem(scene, shadowGen);
  // Use the right straight (x≈95) and peel into the infield, then rejoin later.
  bridges.addCurvedOverpass({
    startX: 90,
    startZ: -45,
    endX: 90,
    endZ: 45,
    deckX: 72,
    deckStartZ: -20,
    deckEndZ: 20,
    width: 10,
    height: 3
  });

  // Add sponsor banners and props around the track
  const props = new TrackProps(scene, track, shadowGen);

  // Add banners with Opace logos - alternating two approved versions, visible from both sides
  props.addBanner(0.05, 'right', '/logos/New-Opace-Logo---High-Quality new.png', 7, 12);
  props.addBanner(0.20, 'left', '/logos/website design agency logo.png', 7, 12);
  props.addBanner(0.35, 'right', '/logos/New-Opace-Logo---High-Quality new.png', 7, 12);
  props.addBanner(0.50, 'left', '/logos/website design agency logo.png', 7, 12);
  props.addBanner(0.65, 'right', '/logos/New-Opace-Logo---High-Quality new.png', 7, 12);
  props.addBanner(0.80, 'left', '/logos/website design agency logo.png', 7, 12);
  props.addBanner(0.95, 'right', '/logos/New-Opace-Logo---High-Quality new.png', 7, 12);

  // Add logo decal to car roof
  props.addCarDecal(carMesh, '/logos/New-Opace-Logo---High-Quality new.png');

  return { scene, camera, shadowGen, pipeline, taa, ssao2, ssr, motionBlur, carMesh, track, ramps, speedPads, bridges };
}
