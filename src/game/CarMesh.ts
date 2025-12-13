import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

export function createCarMesh(scene: Scene, shadowGen: ShadowGenerator): Mesh {
  // Parent node for all car parts
  const carRoot = new TransformNode("carRoot", scene);
  
  // Car body paint material - metallic racing blue
  const paintMat = new PBRMaterial("carPaint", scene);
  paintMat.albedoColor = new Color3(0.02, 0.15, 0.75);
  paintMat.metallic = 0.95;
  paintMat.roughness = 0.12;
  paintMat.clearCoat.isEnabled = true;
  paintMat.clearCoat.intensity = 1.0;
  paintMat.clearCoat.roughness = 0.04;
  paintMat.sheen.isEnabled = true;
  paintMat.sheen.intensity = 0.15;
  paintMat.sheen.color = new Color3(0.3, 0.5, 1.0);

  // Glass material
  const glassMat = new PBRMaterial("glass", scene);
  glassMat.albedoColor = new Color3(0.1, 0.12, 0.15);
  glassMat.metallic = 0.0;
  glassMat.roughness = 0.0;
  glassMat.alpha = 0.4;
  glassMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  glassMat.subSurface.isRefractionEnabled = true;
  glassMat.subSurface.refractionIntensity = 0.9;
  glassMat.subSurface.indexOfRefraction = 1.5;

  // Chrome/metal trim
  const chromeMat = new PBRMaterial("chrome", scene);
  chromeMat.albedoColor = new Color3(0.95, 0.95, 0.95);
  chromeMat.metallic = 1.0;
  chromeMat.roughness = 0.05;

  // Rubber/tyre material
  const rubberMat = new PBRMaterial("rubber", scene);
  rubberMat.albedoColor = new Color3(0.03, 0.03, 0.03);
  rubberMat.metallic = 0.0;
  rubberMat.roughness = 0.85;

  // Wheel rim material
  const rimMat = new PBRMaterial("rim", scene);
  rimMat.albedoColor = new Color3(0.7, 0.7, 0.72);
  rimMat.metallic = 1.0;
  rimMat.roughness = 0.2;

  // Light material (emissive for brake/headlights)
  const lightMat = new PBRMaterial("lights", scene);
  lightMat.albedoColor = new Color3(1.0, 0.1, 0.1);
  lightMat.emissiveColor = new Color3(0.8, 0.05, 0.02);
  lightMat.metallic = 0.0;
  lightMat.roughness = 0.3;

  const headlightMat = new PBRMaterial("headlights", scene);
  headlightMat.albedoColor = new Color3(1.0, 0.98, 0.9);
  headlightMat.emissiveColor = new Color3(1.0, 0.95, 0.8);
  headlightMat.metallic = 0.0;
  headlightMat.roughness = 0.2;

  // Futuristic rounded body using capsule/sphere shapes
  // Main body - sleek elongated capsule base
  const bodyMain = CreateCapsule("bodyMain", { height: 4.0, radius: 0.55 }, scene);
  bodyMain.rotation.x = Math.PI / 2;
  bodyMain.scaling = new Vector3(1.7, 1.0, 0.65);
  bodyMain.position.y = 0.38;
  bodyMain.material = paintMat;
  bodyMain.parent = carRoot;

  // Cabin dome - smooth curved top
  const cabinDome = CreateSphere("cabinDome", { diameter: 2.2, segments: 24 }, scene);
  cabinDome.scaling = new Vector3(0.75, 0.35, 0.55);
  cabinDome.position = new Vector3(0, 0.68, -0.2);
  cabinDome.material = paintMat;
  cabinDome.parent = carRoot;

  // Front nose - aerodynamic pointed front
  const frontNose = CreateSphere("frontNose", { diameter: 1.4, segments: 16 }, scene);
  frontNose.scaling = new Vector3(1.2, 0.4, 1.5);
  frontNose.position = new Vector3(0, 0.32, 1.8);
  frontNose.material = paintMat;
  frontNose.parent = carRoot;

  // Rear diffuser/spoiler area
  const rearSection = CreateSphere("rearSection", { diameter: 1.6, segments: 16 }, scene);
  rearSection.scaling = new Vector3(1.1, 0.45, 0.8);
  rearSection.position = new Vector3(0, 0.35, -1.7);
  rearSection.material = paintMat;
  rearSection.parent = carRoot;

  // Side air intakes (left)
  const intakeL = CreateCapsule("intakeL", { height: 0.8, radius: 0.12 }, scene);
  intakeL.rotation.x = Math.PI / 2;
  intakeL.position = new Vector3(-0.9, 0.35, 0.3);
  intakeL.material = chromeMat;
  intakeL.parent = carRoot;

  // Side air intakes (right)
  const intakeR = intakeL.clone("intakeR");
  intakeR.position.x = 0.9;
  intakeR.parent = carRoot;

  // Cockpit canopy - curved glass
  const canopy = CreateSphere("canopy", { diameter: 1.8, segments: 24 }, scene);
  canopy.scaling = new Vector3(0.72, 0.25, 0.52);
  canopy.position = new Vector3(0, 0.82, -0.15);
  canopy.material = glassMat;
  canopy.parent = carRoot;

  // Front windscreen strip
  const windscreen = CreateSphere("windscreen", { diameter: 1.2, segments: 16 }, scene);
  windscreen.scaling = new Vector3(1.15, 0.08, 0.6);
  windscreen.position = new Vector3(0, 0.72, 0.6);
  windscreen.material = glassMat;
  windscreen.parent = carRoot;

  // Rear spoiler
  const spoiler = CreateBox("spoiler", { width: 1.6, height: 0.04, depth: 0.25 }, scene);
  spoiler.position = new Vector3(0, 0.72, -2.0);
  spoiler.material = chromeMat;
  spoiler.parent = carRoot;

  // Spoiler supports
  const spoilerSupportL = CreateCylinder("spoilerSupportL", { height: 0.15, diameter: 0.06 }, scene);
  spoilerSupportL.position = new Vector3(-0.6, 0.62, -2.0);
  spoilerSupportL.material = chromeMat;
  spoilerSupportL.parent = carRoot;

  const spoilerSupportR = spoilerSupportL.clone("spoilerSupportR");
  spoilerSupportR.position.x = 0.6;
  spoilerSupportR.parent = carRoot;

  // Futuristic wheels with glowing rims
  const createWheel = (name: string, x: number, z: number) => {
    const wheelGroup = new TransformNode(name, scene);
    wheelGroup.parent = carRoot;
    wheelGroup.position = new Vector3(x, 0.28, z);

    // Tyre - wider, lower profile racing tyre
    const tyre = CreateCylinder(`${name}_tyre`, { height: 0.32, diameter: 0.58, tessellation: 32 }, scene);
    tyre.rotation.z = Math.PI / 2;
    tyre.material = rubberMat;
    tyre.parent = wheelGroup;

    // Multi-spoke futuristic rim
    const rim = CreateCylinder(`${name}_rim`, { height: 0.28, diameter: 0.42, tessellation: 24 }, scene);
    rim.rotation.z = Math.PI / 2;
    rim.material = rimMat;
    rim.parent = wheelGroup;

    // Glowing rim accent
    const rimGlow = MeshBuilder.CreateTorus(`${name}_glow`, { diameter: 0.45, thickness: 0.02, tessellation: 32 }, scene);
    rimGlow.rotation.z = Math.PI / 2;
    const glowMat = new PBRMaterial(`${name}_glowMat`, scene);
    glowMat.albedoColor = new Color3(0.0, 0.8, 1.0);
    glowMat.emissiveColor = new Color3(0.0, 0.5, 0.8);
    glowMat.metallic = 0.5;
    glowMat.roughness = 0.3;
    rimGlow.material = glowMat;
    rimGlow.parent = wheelGroup;

    return wheelGroup;
  };

  createWheel("wheelFL", -0.85, 1.35);
  createWheel("wheelFR", 0.85, 1.35);
  createWheel("wheelRL", -0.85, -1.30);
  createWheel("wheelRR", 0.85, -1.30);

  // LED headlight strips (futuristic)
  const headlightStrip = MeshBuilder.CreateTorus("headlightStrip", { diameter: 0.8, thickness: 0.04, tessellation: 32, arc: 0.5 }, scene);
  headlightStrip.rotation.y = Math.PI;
  headlightStrip.rotation.x = Math.PI / 2;
  headlightStrip.position = new Vector3(0, 0.35, 2.3);
  headlightStrip.material = headlightMat;
  headlightStrip.parent = carRoot;

  // Side headlight accents
  const headlightL = CreateSphere("headlightL", { diameter: 0.2, segments: 16 }, scene);
  headlightL.scaling = new Vector3(1.0, 0.6, 0.3);
  headlightL.position = new Vector3(-0.65, 0.32, 2.35);
  headlightL.material = headlightMat;
  headlightL.parent = carRoot;

  const headlightR = headlightL.clone("headlightR");
  headlightR.position.x = 0.65;
  headlightR.parent = carRoot;

  // LED tail light strip
  const taillightStrip = MeshBuilder.CreateTorus("taillightStrip", { diameter: 1.2, thickness: 0.05, tessellation: 32, arc: 0.4 }, scene);
  taillightStrip.rotation.x = Math.PI / 2;
  taillightStrip.position = new Vector3(0, 0.45, -2.15);
  taillightStrip.material = lightMat;
  taillightStrip.parent = carRoot;

  // Undercar LED glow
  const underGlow = MeshBuilder.CreatePlane("underGlow", { width: 1.6, height: 3.5 }, scene);
  underGlow.rotation.x = Math.PI / 2;
  underGlow.position = new Vector3(0, 0.05, 0);
  const underGlowMat = new PBRMaterial("underGlowMat", scene);
  underGlowMat.albedoColor = new Color3(0.0, 0.6, 1.0);
  underGlowMat.emissiveColor = new Color3(0.0, 0.3, 0.6);
  underGlowMat.alpha = 0.4;
  underGlowMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  underGlow.material = underGlowMat;
  underGlow.parent = carRoot;

  // Collect all meshes for shadows
  const allMeshes: Mesh[] = [];
  carRoot.getChildMeshes().forEach(m => {
    if (m instanceof Mesh) allMeshes.push(m);
  });

  // Create an empty mesh as the car anchor (no visible geometry)
  const carMesh = new Mesh("car", scene);
  carMesh.position = new Vector3(0, 0.45, 0);
  carMesh.rotationQuaternion = Quaternion.Identity();
  // This mesh has no geometry, so nothing to render

  // Parent all car parts to the anchor mesh
  carRoot.parent = carMesh;
  carRoot.position = Vector3.Zero();

  // Add shadow casters
  allMeshes.forEach(m => {
    shadowGen.addShadowCaster(m);
    m.receiveShadows = true;
  });

  return carMesh;
}

