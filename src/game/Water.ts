import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { MirrorTexture } from "@babylonjs/core/Materials/Textures/mirrorTexture";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Track } from "./track/Track";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// Puddle position data for collision detection
export type PuddleInfo = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

// Puddles placed on the track surface - positioned away from speed pads
export const PUDDLE_POSITIONS: PuddleInfo[] = [
  // On straightaways - offset from centre to avoid speed pads
  { x: 15, z: 60, width: 10, depth: 8 },    // Top straight - offset right
  { x: -15, z: -55, width: 12, depth: 8 },  // Bottom straight - offset left
  { x: 90, z: 20, width: 8, depth: 10 },    // Right straight - offset forward
  { x: -90, z: -20, width: 8, depth: 10 },  // Left straight - offset back
  // In corners - deeper into corners, away from any pads
  { x: 65, z: 58, width: 8, depth: 8 },     // Top-right corner - more into corner
  { x: -65, z: 58, width: 8, depth: 8 },    // Top-left corner - more into corner
  { x: 68, z: -58, width: 8, depth: 8 },    // Bottom-right corner
  { x: -68, z: -55, width: 8, depth: 8 },   // Bottom-left corner
];

// Check if a position is inside any water puddle
export function isInWater(pos: Vector3): PuddleInfo | null {
  for (const puddle of PUDDLE_POSITIONS) {
    const dx = Math.abs(pos.x - puddle.x);
    const dz = Math.abs(pos.z - puddle.z);
    if (dx < puddle.width / 2 && dz < puddle.depth / 2) {
      return puddle;
    }
  }
  return null;
}

// Create water splash particle system
export function createWaterSplash(scene: Scene): ParticleSystem {
  const splash = new ParticleSystem("waterSplash", 300, scene);

  // Create water droplet texture
  const dropCanvas = document.createElement("canvas");
  dropCanvas.width = 32;
  dropCanvas.height = 32;
  const ctx = dropCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(180, 220, 255, 0.9)");
  gradient.addColorStop(0.3, "rgba(150, 200, 255, 0.7)");
  gradient.addColorStop(0.6, "rgba(120, 180, 255, 0.4)");
  gradient.addColorStop(1, "rgba(100, 160, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  splash.particleTexture = new Texture(dropCanvas.toDataURL(), scene);
  splash.emitter = Vector3.Zero();
  splash.minEmitBox = new Vector3(-1.5, 0, -1.5);
  splash.maxEmitBox = new Vector3(1.5, 0.2, 1.5);

  // Water colours - blue-white
  splash.color1 = new Color4(0.8, 0.9, 1, 0.9);
  splash.color2 = new Color4(0.6, 0.8, 1, 0.8);
  splash.colorDead = new Color4(0.5, 0.7, 0.9, 0);

  splash.minSize = 0.08;
  splash.maxSize = 0.25;
  splash.minLifeTime = 0.3;
  splash.maxLifeTime = 0.8;

  splash.emitRate = 0;
  splash.blendMode = ParticleSystem.BLENDMODE_ADD;

  splash.gravity = new Vector3(0, -12, 0);
  splash.direction1 = new Vector3(-3, 6, -3);
  splash.direction2 = new Vector3(3, 10, 3);

  splash.minEmitPower = 4;
  splash.maxEmitPower = 10;
  splash.updateSpeed = 0.02;

  splash.start();

  return splash;
}

// Trigger splash effect
export function triggerSplash(
  splashSystem: ParticleSystem,
  position: Vector3,
  velocity: Vector3,
  speed: number
) {
  splashSystem.emitter = position.clone();

  // Scale effect with speed
  const intensity = Math.min(1, speed / 25);
  splashSystem.emitRate = 100 + intensity * 200;
  splashSystem.minEmitPower = 3 + intensity * 4;
  splashSystem.maxEmitPower = 6 + intensity * 8;

  // Spray in direction of travel
  const dir = velocity.normalize().scale(2);
  splashSystem.direction1 = new Vector3(-2 + dir.x, 4, -2 + dir.z);
  splashSystem.direction2 = new Vector3(2 + dir.x, 10, 2 + dir.z);
}

// Stop splash effect
export function stopSplash(splashSystem: ParticleSystem) {
  splashSystem.emitRate = 0;
}

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
  
  // Create water puddles along the track using shared positions
  PUDDLE_POSITIONS.forEach((pos, i) => {
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
    const bump = waterMat.bumpTexture;
    if (bump && bump instanceof Texture) {
      bump.uOffset = Math.sin(time * 0.3) * 0.1;
      bump.vOffset = Math.cos(time * 0.25) * 0.08;
    }
  });
  
  return waterPuddles;
}
