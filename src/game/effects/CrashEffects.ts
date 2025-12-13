import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// Damage state for the car
export class DamageSystem {
  private _damageLevel = 0;
  private readonly maxDamage = 100;
  
  get damageLevel() { return this._damageLevel; }
  get damagePercent() { return this._damageLevel / this.maxDamage; }
  get isDestroyed() { return this._damageLevel >= this.maxDamage; }
  
  addDamage(amount: number) {
    this._damageLevel = Math.min(this.maxDamage, this._damageLevel + amount);
    return this._damageLevel;
  }
  
  reset() {
    this._damageLevel = 0;
  }
}

// Crash particle effect
export function createCrashParticles(scene: Scene): ParticleSystem {
  const particleSystem = new ParticleSystem("crashParticles", 200, scene);
  
  // Create a simple spark texture
  const sparkCanvas = document.createElement("canvas");
  sparkCanvas.width = 32;
  sparkCanvas.height = 32;
  const ctx = sparkCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, "rgba(255, 200, 100, 1)");
  gradient.addColorStop(0.3, "rgba(255, 150, 50, 0.8)");
  gradient.addColorStop(0.7, "rgba(200, 80, 20, 0.4)");
  gradient.addColorStop(1, "rgba(100, 40, 10, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  
  const sparkTexture = new Texture(sparkCanvas.toDataURL(), scene);
  particleSystem.particleTexture = sparkTexture;
  
  particleSystem.emitter = Vector3.Zero();
  particleSystem.minEmitBox = new Vector3(-0.5, 0, -0.5);
  particleSystem.maxEmitBox = new Vector3(0.5, 0.5, 0.5);
  
  particleSystem.color1 = new Color4(1, 0.8, 0.3, 1);
  particleSystem.color2 = new Color4(1, 0.5, 0.1, 1);
  particleSystem.colorDead = new Color4(0.3, 0.1, 0, 0);
  
  particleSystem.minSize = 0.1;
  particleSystem.maxSize = 0.4;
  particleSystem.minLifeTime = 0.2;
  particleSystem.maxLifeTime = 0.6;
  
  particleSystem.emitRate = 0;
  particleSystem.blendMode = ParticleSystem.BLENDMODE_ADD;
  
  particleSystem.gravity = new Vector3(0, -9.8, 0);
  particleSystem.direction1 = new Vector3(-3, 3, -3);
  particleSystem.direction2 = new Vector3(3, 6, 3);
  
  particleSystem.minEmitPower = 5;
  particleSystem.maxEmitPower = 15;
  particleSystem.updateSpeed = 0.02;
  
  particleSystem.start();
  
  return particleSystem;
}

// Trigger crash effect at position
export function triggerCrashEffect(
  particleSystem: ParticleSystem,
  position: Vector3,
  intensity: number
) {
  particleSystem.emitter = position.clone();
  particleSystem.emitRate = Math.min(500, intensity * 50);
  
  // Burst of particles
  particleSystem.manualEmitCount = Math.floor(intensity * 20);
  
  // Stop emission after a short time
  setTimeout(() => {
    particleSystem.emitRate = 0;
  }, 100);
}

// Apply visual damage to car mesh
export function applyVisualDamage(carMesh: Mesh, damagePercent: number) {
  // Get all child meshes of the car (excluding invisible physics meshes)
  const children = carMesh.getChildMeshes();

  children.forEach(child => {
    // Skip invisible meshes (like physics bounds)
    if (!child.isVisible) return;

    if (child.material && 'albedoColor' in child.material) {
      const mat = child.material as any;
      // Darken and add scratches as damage increases
      const darkening = 1 - damagePercent * 0.3;
      if (mat._originalColor === undefined) {
        mat._originalColor = mat.albedoColor?.clone();
      }
      if (mat._originalColor) {
        mat.albedoColor = mat._originalColor.scale(darkening);
      }
      // Increase roughness to simulate scratches
      if (mat._originalRoughness === undefined) {
        mat._originalRoughness = mat.roughness;
      }
      mat.roughness = mat._originalRoughness + damagePercent * 0.4;
    }
  });

  // Ensure the parent mesh (bounding box) stays invisible
  carMesh.isVisible = false;
}

// Smoke effect for heavy damage
export function createSmokeParticles(scene: Scene): ParticleSystem {
  const smokeSystem = new ParticleSystem("smokeParticles", 100, scene);
  
  const smokeCanvas = document.createElement("canvas");
  smokeCanvas.width = 64;
  smokeCanvas.height = 64;
  const ctx = smokeCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(60, 60, 60, 0.6)");
  gradient.addColorStop(0.5, "rgba(40, 40, 40, 0.3)");
  gradient.addColorStop(1, "rgba(20, 20, 20, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  smokeSystem.particleTexture = new Texture(smokeCanvas.toDataURL(), scene);
  smokeSystem.emitter = Vector3.Zero();
  
  smokeSystem.color1 = new Color4(0.3, 0.3, 0.3, 0.4);
  smokeSystem.color2 = new Color4(0.2, 0.2, 0.2, 0.3);
  smokeSystem.colorDead = new Color4(0.1, 0.1, 0.1, 0);
  
  smokeSystem.minSize = 0.5;
  smokeSystem.maxSize = 2.0;
  smokeSystem.minLifeTime = 1;
  smokeSystem.maxLifeTime = 3;
  
  smokeSystem.emitRate = 0;
  smokeSystem.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  
  smokeSystem.gravity = new Vector3(0, 2, 0);
  smokeSystem.direction1 = new Vector3(-0.5, 2, -0.5);
  smokeSystem.direction2 = new Vector3(0.5, 4, 0.5);
  
  smokeSystem.minEmitPower = 0.5;
  smokeSystem.maxEmitPower = 2;
  
  smokeSystem.start();
  
  return smokeSystem;
}

