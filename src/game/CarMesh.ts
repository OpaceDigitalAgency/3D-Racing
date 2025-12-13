import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
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

  // Main body - lower section
  const bodyLower = CreateBox("bodyLower", { width: 1.85, height: 0.35, depth: 4.4 }, scene);
  bodyLower.position.y = 0.25;
  bodyLower.material = paintMat;
  bodyLower.parent = carRoot;

  // Main body - upper cabin
  const cabin = CreateBox("cabin", { width: 1.7, height: 0.45, depth: 2.0 }, scene);
  cabin.position = new Vector3(0, 0.65, -0.3);
  cabin.material = paintMat;
  cabin.parent = carRoot;

  // Front hood (sloped)
  const hood = CreateBox("hood", { width: 1.75, height: 0.2, depth: 1.2 }, scene);
  hood.position = new Vector3(0, 0.5, 1.4);
  hood.rotation.x = -0.15;
  hood.material = paintMat;
  hood.parent = carRoot;

  // Rear trunk
  const trunk = CreateBox("trunk", { width: 1.75, height: 0.25, depth: 0.9 }, scene);
  trunk.position = new Vector3(0, 0.52, -1.6);
  trunk.rotation.x = 0.12;
  trunk.material = paintMat;
  trunk.parent = carRoot;

  // Windscreen
  const windscreen = CreateBox("windscreen", { width: 1.5, height: 0.02, depth: 1.0 }, scene);
  windscreen.position = new Vector3(0, 0.75, 0.55);
  windscreen.rotation.x = -0.6;
  windscreen.material = glassMat;
  windscreen.parent = carRoot;

  // Rear window
  const rearWindow = CreateBox("rearWindow", { width: 1.4, height: 0.02, depth: 0.8 }, scene);
  rearWindow.position = new Vector3(0, 0.72, -1.1);
  rearWindow.rotation.x = 0.55;
  rearWindow.material = glassMat;
  rearWindow.parent = carRoot;

  // Side windows
  const sideWindowL = CreateBox("sideWindowL", { width: 0.02, height: 0.35, depth: 1.2 }, scene);
  sideWindowL.position = new Vector3(-0.85, 0.68, -0.25);
  sideWindowL.material = glassMat;
  sideWindowL.parent = carRoot;

  const sideWindowR = sideWindowL.clone("sideWindowR");
  sideWindowR.position.x = 0.85;
  sideWindowR.parent = carRoot;

  // Wheels
  const createWheel = (name: string, x: number, z: number) => {
    const wheelGroup = new TransformNode(name, scene);
    wheelGroup.parent = carRoot;
    wheelGroup.position = new Vector3(x, 0.32, z);

    // Tyre
    const tyre = CreateCylinder(`${name}_tyre`, { height: 0.28, diameter: 0.68 }, scene);
    tyre.rotation.z = Math.PI / 2;
    tyre.material = rubberMat;
    tyre.parent = wheelGroup;

    // Rim
    const rim = CreateCylinder(`${name}_rim`, { height: 0.22, diameter: 0.45 }, scene);
    rim.rotation.z = Math.PI / 2;
    rim.material = rimMat;
    rim.parent = wheelGroup;

    return wheelGroup;
  };

  createWheel("wheelFL", -0.82, 1.35);
  createWheel("wheelFR", 0.82, 1.35);
  createWheel("wheelRL", -0.82, -1.25);
  createWheel("wheelRR", 0.82, -1.25);

  // Headlights
  const headlightL = CreateBox("headlightL", { width: 0.35, height: 0.12, depth: 0.05 }, scene);
  headlightL.position = new Vector3(-0.55, 0.38, 2.18);
  headlightL.material = headlightMat;
  headlightL.parent = carRoot;

  const headlightR = headlightL.clone("headlightR");
  headlightR.position.x = 0.55;
  headlightR.parent = carRoot;

  // Tail lights
  const taillightL = CreateBox("taillightL", { width: 0.4, height: 0.1, depth: 0.05 }, scene);
  taillightL.position = new Vector3(-0.6, 0.4, -2.18);
  taillightL.material = lightMat;
  taillightL.parent = carRoot;

  const taillightR = taillightL.clone("taillightR");
  taillightR.position.x = 0.6;
  taillightR.parent = carRoot;

  // Front grille
  const grille = CreateBox("grille", { width: 1.2, height: 0.2, depth: 0.05 }, scene);
  grille.position = new Vector3(0, 0.22, 2.2);
  grille.material = chromeMat;
  grille.parent = carRoot;

  // Side mirrors
  const mirrorL = CreateBox("mirrorL", { width: 0.12, height: 0.08, depth: 0.15 }, scene);
  mirrorL.position = new Vector3(-1.0, 0.58, 0.6);
  mirrorL.material = paintMat;
  mirrorL.parent = carRoot;

  const mirrorR = mirrorL.clone("mirrorR");
  mirrorR.position.x = 1.0;
  mirrorR.parent = carRoot;

  // Merge all meshes into one for performance
  const allMeshes: Mesh[] = [];
  carRoot.getChildMeshes().forEach(m => {
    if (m instanceof Mesh) allMeshes.push(m);
  });

  // Create a simple bounding box as the main mesh for physics/position reference
  const carMesh = CreateBox("car", { width: 1.9, height: 0.8, depth: 4.5 }, scene);
  carMesh.position = new Vector3(0, 0.55, 0);
  carMesh.rotationQuaternion = Quaternion.Identity();
  carMesh.isVisible = false; // Hide the physics box

  // Parent all car parts to the main mesh
  carRoot.parent = carMesh;
  carRoot.position = new Vector3(0, -0.1, 0);

  // Add shadow casters
  allMeshes.forEach(m => {
    shadowGen.addShadowCaster(m);
    m.receiveShadows = true;
  });

  return carMesh;
}

