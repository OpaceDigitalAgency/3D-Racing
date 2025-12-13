import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Track } from "./track/Track";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// Create procedural normal map for water ripples
function createWaterNormalTexture(scene: Scene, size: number = 512): Texture {
  const data = new Uint8Array(size * size * 4);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      
      // Generate multiple layers of ripples
      const scale1 = 0.02, scale2 = 0.05, scale3 = 0.1;
      
      let nx = 0, ny = 0;
      
      // Layer 1 - large waves
      nx += Math.sin(x * scale1 + y * scale1 * 0.5) * 0.3;
      ny += Math.cos(y * scale1 + x * scale1 * 0.3) * 0.3;
      
      // Layer 2 - medium ripples
      nx += Math.sin(x * scale2 * 1.3 - y * scale2) * 0.25;
      ny += Math.cos(y * scale2 * 1.2 + x * scale2 * 0.7) * 0.25;
      
      // Layer 3 - fine detail
      nx += Math.sin(x * scale3 + y * scale3 * 2.1) * 0.15;
      ny += Math.cos(y * scale3 * 1.8 - x * scale3) * 0.15;
      
      // Normalise and convert to 0-255 range
      const nz = Math.sqrt(1 - nx * nx - ny * ny);
      data[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  
  const texture = RawTexture.CreateRGBATexture(data, size, size, scene, true, false);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  return texture;
}

export function createWater(scene: Scene, track: Track): Mesh[] {
  const waterPuddles: Mesh[] = [];
  
  // Create water material with reflections
  const waterMat = new PBRMaterial("waterMat", scene);
  waterMat.albedoColor = new Color3(0.02, 0.04, 0.06);
  waterMat.metallic = 0.1;
  waterMat.roughness = 0.02;
  waterMat.alpha = 0.85;
  waterMat.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND;
  
  // Reflection settings
  waterMat.reflectivityColor = new Color3(0.95, 0.95, 0.95);
  waterMat.environmentIntensity = 2.0;
  
  // Subsurface scattering for depth effect
  waterMat.subSurface.isTranslucencyEnabled = true;
  waterMat.subSurface.translucencyIntensity = 0.3;
  waterMat.subSurface.tintColor = new Color3(0.1, 0.2, 0.3);
  
  // Create normal map for ripples
  const normalTex = createWaterNormalTexture(scene, 512);
  waterMat.bumpTexture = normalTex;
  waterMat.invertNormalMapX = true;
  waterMat.invertNormalMapY = true;
  
  // Create reflection texture
  const mirrorTexture = new MirrorTexture("waterMirror", 1024, scene, true);
  mirrorTexture.mirrorPlane = new Plane(0, -1, 0, 0.12);
  mirrorTexture.level = 0.6;
  mirrorTexture.adaptiveBlurKernel = 16;
  
  // Add all meshes to reflection (except water itself)
  scene.meshes.forEach(mesh => {
    if (mesh.name !== "water" && !mesh.name.startsWith("waterPuddle")) {
      mirrorTexture.renderList?.push(mesh);
    }
  });
  
  waterMat.reflectionTexture = mirrorTexture;
  
  // Create water puddles along the track
  const puddlePositions = [
    { x: 40, z: 0, width: 18, depth: 14 },
    { x: -30, z: 45, width: 15, depth: 12 },
    { x: 0, z: -55, width: 20, depth: 10 },
    { x: 70, z: 30, width: 12, depth: 16 },
    { x: -60, z: -20, width: 14, depth: 14 },
  ];
  
  puddlePositions.forEach((pos, i) => {
    const puddle = MeshBuilder.CreateGround(`waterPuddle${i}`, {
      width: pos.width,
      height: pos.depth,
      subdivisions: 32
    }, scene);
    puddle.position = new Vector3(pos.x, 0.1, pos.z);
    puddle.material = waterMat;
    puddle.receiveShadows = true;
    waterPuddles.push(puddle);
  });
  
  // Animate water ripples
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() * 0.001;
    
    // Animate UV offset for moving ripples
    if (waterMat.bumpTexture) {
      waterMat.bumpTexture.uOffset = Math.sin(time * 0.3) * 0.1;
      waterMat.bumpTexture.vOffset = Math.cos(time * 0.25) * 0.08;
    }
  });
  
  return waterPuddles;
}

