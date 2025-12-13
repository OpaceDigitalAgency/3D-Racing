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
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";

import "@babylonjs/core/Materials/Textures/Loaders/envTextureLoader";

import { Track } from "./track/Track";
import { createCarMesh } from "./CarMesh";
import { createWater } from "./Water";
import { createGrassField } from "./Grass";
import { RampSystem } from "./track/Ramps";
import { TrackProps } from "./track/TrackProps";

export type SceneBits = {
  scene: Scene;
  camera: ArcRotateCamera;
  shadowGen: ShadowGenerator;
  pipeline: DefaultRenderingPipeline;
  carMesh: Mesh;
  track: Track;
  ramps: RampSystem;
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
  pipeline.chromaticAberration.aberrationAmount = 12;
  pipeline.chromaticAberration.radialIntensity = 0.6;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 5;
  pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.35;
  pipeline.sharpen.colorAmount = 0.9;
  pipeline.depthOfFieldEnabled = false;
  pipeline.imageProcessingEnabled = true;

  // Create track with improved materials
  const { track } = Track.createDefault(scene, shadowGen);

  // Create realistic car mesh
  const carMesh = createCarMesh(scene, shadowGen);

  // Create 3D grass field with wind animation
  createGrassField(scene, shadowGen);

  // Create water puddles on track
  createWater(scene, track);

  // Create ramps and jumps on the track
  const ramps = new RampSystem(scene, shadowGen);

  // Add ramps at strategic positions along the track centerline
  // trackProgress is 0-1 representing position along track
  ramps.addRampOnTrack(track, 0.15, 8, 14, 1.2);  // First straight
  ramps.addRampOnTrack(track, 0.65, 8, 14, 1.2);  // Opposite straight

  // Add sponsor banners and props around the track
  const props = new TrackProps(scene, track, shadowGen);

  // Add banners with company logos at various positions
  props.addBanner(0.05, 'right', 'logos/transparent logo small.png', 4, 5);
  props.addBanner(0.25, 'left', 'logos/New-Opace-Logo---High-Quality new.png', 3.5, 5);
  props.addBanner(0.45, 'right', 'logos/website design agency logo.png', 4, 6);
  props.addBanner(0.55, 'left', 'logos/transparent logo small.png', 4, 5);
  props.addBanner(0.75, 'right', 'logos/New-Opace-Logo---High-Quality new.png', 3.5, 5);
  props.addBanner(0.95, 'left', 'logos/Logo - Vector.png', 4, 5);

  // Add logo decal to car roof
  props.addCarDecal(carMesh, 'logos/transparent logo small.png');

  return { scene, camera, shadowGen, pipeline, carMesh, track, ramps };
}
