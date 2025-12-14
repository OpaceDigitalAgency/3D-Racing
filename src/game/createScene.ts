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

  // High quality shadows
  const shadowGen = new ShadowGenerator(4096, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 48;
  shadowGen.bias = 0.00003;
  shadowGen.normalBias = 0.012;
  shadowGen.darkness = 0.3;
  shadowGen.useContactHardeningShadow = true;
  shadowGen.contactHardeningLightSizeUVRatio = 0.05;

  // HDR environment for realistic reflections
  const env = CubeTexture.CreateFromPrefilteredData("/env/environmentSpecular.env", scene);
  scene.environmentTexture = env;
  scene.environmentIntensity = 1.5;

  // Create high quality skybox from environment texture
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 2000 }, scene);
  const skyboxMat = new PBRMaterial("skyBoxMat", scene);
  skyboxMat.backFaceCulling = false;
  skyboxMat.reflectionTexture = env.clone();
  skyboxMat.reflectionTexture!.coordinatesMode = Texture.SKYBOX_MODE;
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

  // High quality post-processing pipeline
  const pipeline = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipeline.samples = 8; // Higher MSAA for smoother edges
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.2;
  pipeline.bloomThreshold = 0.7;
  pipeline.bloomKernel = 96;
  pipeline.bloomScale = 0.6;
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 3.5;
  pipeline.chromaticAberration.radialIntensity = 0.6;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 1.4;
  pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.18;
  pipeline.sharpen.colorAmount = 0.65;
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

  // Create bridge/overpass that crosses the infield
  // The track is a rounded rectangle with halfX=95, halfZ=70, halfWidth=8
  // Bridge spans across the grass from left straight (x=-95) to right straight (x=95) at z=0
  // The ramps (length = height * 4) will connect the bridge deck to the track surface
  const bridges = new BridgeSystem(scene, shadowGen);
  // Overpass crossing the infield - ramps start on each side of the track
  bridges.addBridge(-83, 0, 83, 0, 10, 3);

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
