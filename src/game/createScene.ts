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

export type SceneBits = {
  scene: Scene;
  camera: ArcRotateCamera;
  shadowGen: ShadowGenerator;
  pipeline: DefaultRenderingPipeline;
  carMesh: Mesh;
  track: Track;
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

  // Improved lighting for realism
  const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.35;
  hemi.groundColor = new Color3(0.15, 0.12, 0.1);
  hemi.diffuse = new Color3(0.85, 0.92, 1.0);

  const sun = new DirectionalLight("sun", new Vector3(-0.35, -0.85, -0.2).normalize(), scene);
  sun.position = new Vector3(100, 150, 100);
  sun.intensity = 2.8;
  sun.diffuse = new Color3(1.0, 0.98, 0.92);
  sun.specular = new Color3(1.0, 0.95, 0.85);

  const shadowGen = new ShadowGenerator(4096, sun);
  shadowGen.useBlurExponentialShadowMap = true;
  shadowGen.blurKernel = 32;
  shadowGen.bias = 0.00005;
  shadowGen.normalBias = 0.015;
  shadowGen.darkness = 0.35;

  // HDR environment for realistic reflections
  const env = CubeTexture.CreateFromPrefilteredData("/env/environmentSpecular.env", scene);
  scene.environmentTexture = env;
  scene.environmentIntensity = 1.2;

  // Create skybox from environment texture
  const skybox = MeshBuilder.CreateBox("skyBox", { size: 1000 }, scene);
  const skyboxMat = new PBRMaterial("skyBoxMat", scene);
  skyboxMat.backFaceCulling = false;
  skyboxMat.reflectionTexture = env.clone();
  skyboxMat.reflectionTexture!.coordinatesMode = Texture.SKYBOX_MODE;
  skyboxMat.microSurface = 1.0;
  skyboxMat.disableLighting = true;
  skyboxMat.twoSidedLighting = true;
  skybox.material = skyboxMat;
  skybox.infiniteDistance = true;

  // Enhanced image processing for photorealistic look
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 1.0;
  scene.imageProcessingConfiguration.contrast = 1.15;
  scene.imageProcessingConfiguration.vignetteEnabled = true;
  scene.imageProcessingConfiguration.vignetteWeight = 1.5;
  scene.imageProcessingConfiguration.vignetteStretch = 0.5;
  scene.imageProcessingConfiguration.vignetteColor = new Color4(0, 0, 0, 0);
  scene.imageProcessingConfiguration.vignetteCameraFov = 0.5;

  // Enhanced post-processing pipeline
  const pipeline = new DefaultRenderingPipeline("pipe", true, scene, [camera]);
  pipeline.samples = 4;
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomWeight = 0.15;
  pipeline.bloomThreshold = 0.8;
  pipeline.bloomKernel = 64;
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 15;
  pipeline.chromaticAberration.radialIntensity = 0.8;
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 8;
  pipeline.grain.animated = true;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.25;
  pipeline.sharpen.colorAmount = 0.8;
  pipeline.depthOfFieldEnabled = false;
  pipeline.imageProcessingEnabled = true;

  // Create track with improved materials
  const { track } = Track.createDefault(scene, shadowGen);

  // Create realistic car mesh
  const carMesh = createCarMesh(scene, shadowGen);

  // Create water puddles on track
  createWater(scene, track);

  return { scene, camera, shadowGen, pipeline, carMesh, track };
}
