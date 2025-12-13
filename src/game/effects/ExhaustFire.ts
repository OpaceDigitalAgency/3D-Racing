import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export class ExhaustFireSystem {
  private leftExhaust: ParticleSystem;
  private rightExhaust: ParticleSystem;
  private scene: Scene;
  private nitroBoostActive = false;
  private nitroBoostTime = 0;

  constructor(scene: Scene, carMesh: Mesh) {
    this.scene = scene;

    // Create fire texture
    const fireTexture = this.createFireTexture();

    // Left exhaust
    this.leftExhaust = this.createExhaustParticles("leftExhaust", fireTexture);
    this.rightExhaust = this.createExhaustParticles("rightExhaust", fireTexture);

    this.leftExhaust.start();
    this.rightExhaust.start();
  }

  private createFireTexture(): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    // Create flame-like gradient
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 200, 1)");
    gradient.addColorStop(0.2, "rgba(255, 200, 50, 1)");
    gradient.addColorStop(0.4, "rgba(255, 120, 20, 0.9)");
    gradient.addColorStop(0.6, "rgba(200, 50, 10, 0.6)");
    gradient.addColorStop(0.8, "rgba(100, 20, 5, 0.3)");
    gradient.addColorStop(1, "rgba(50, 10, 0, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    return new Texture(canvas.toDataURL(), this.scene);
  }

  // Activate nitro boost - blue/green flames
  activateNitroBoost(duration: number = 2.5) {
    this.nitroBoostActive = true;
    this.nitroBoostTime = duration;
  }

  isNitroActive(): boolean {
    return this.nitroBoostActive;
  }

  getNitroTimeRemaining(): number {
    return this.nitroBoostTime;
  }
  
  private createExhaustParticles(name: string, texture: Texture): ParticleSystem {
    const particles = new ParticleSystem(name, 150, this.scene);
    particles.particleTexture = texture;
    
    particles.emitter = Vector3.Zero();
    particles.minEmitBox = new Vector3(-0.02, -0.02, 0);
    particles.maxEmitBox = new Vector3(0.02, 0.02, 0);
    
    // Fire colours
    particles.color1 = new Color4(1, 0.9, 0.5, 1);
    particles.color2 = new Color4(1, 0.5, 0.1, 1);
    particles.colorDead = new Color4(0.5, 0.1, 0, 0);
    
    particles.minSize = 0.08;
    particles.maxSize = 0.25;
    particles.minLifeTime = 0.03;
    particles.maxLifeTime = 0.12;
    
    particles.emitRate = 0;
    particles.blendMode = ParticleSystem.BLENDMODE_ADD;
    
    particles.gravity = new Vector3(0, 0.5, 0);
    particles.direction1 = new Vector3(0, 0, -1);
    particles.direction2 = new Vector3(0, 0.3, -1);
    
    particles.minEmitPower = 8;
    particles.maxEmitPower = 15;
    particles.updateSpeed = 0.005;
    
    // Scale over lifetime - starts bigger, shrinks
    particles.addSizeGradient(0, 0.2, 0.3);
    particles.addSizeGradient(0.5, 0.15, 0.2);
    particles.addSizeGradient(1.0, 0.02, 0.05);
    
    return particles;
  }
  
  update(
    carPosition: Vector3,
    forward: Vector3,
    right: Vector3,
    yawRad: number,
    throttle: number,
    speed: number,
    dt: number
  ) {
    // Update nitro boost timer
    if (this.nitroBoostActive) {
      this.nitroBoostTime -= dt;
      if (this.nitroBoostTime <= 0) {
        this.nitroBoostActive = false;
        this.nitroBoostTime = 0;
      }
    }

    // Position exhausts at back of car
    const exhaustOffset = -2.2; // Behind car
    const exhaustY = 0.35;
    const exhaustSpacing = 0.35;

    const basePos = carPosition.add(forward.scale(exhaustOffset)).add(new Vector3(0, exhaustY, 0));
    const leftPos = basePos.add(right.scale(-exhaustSpacing));
    const rightPos = basePos.add(right.scale(exhaustSpacing));

    this.leftExhaust.emitter = leftPos;
    this.rightExhaust.emitter = rightPos;

    // Direction is opposite to forward (backwards)
    const exhaustDir = forward.scale(-1);
    this.leftExhaust.direction1 = exhaustDir.add(new Vector3(0, 0.2, 0)).scale(1);
    this.leftExhaust.direction2 = exhaustDir.add(new Vector3(0, 0.4, 0)).scale(1);
    this.rightExhaust.direction1 = exhaustDir.add(new Vector3(0, 0.2, 0)).scale(1);
    this.rightExhaust.direction2 = exhaustDir.add(new Vector3(0, 0.4, 0)).scale(1);

    // Fire intensity based on throttle and speed
    const intensity = throttle * (0.3 + speed / 30);
    let emitRate = throttle > 0.1 ? intensity * 300 : 0;

    // Nitro boost - change colours to blue/green and increase intensity
    if (this.nitroBoostActive) {
      // Blue-green nitro flames
      this.leftExhaust.color1 = new Color4(0.3, 1, 0.9, 1);
      this.leftExhaust.color2 = new Color4(0.1, 0.7, 1, 1);
      this.leftExhaust.colorDead = new Color4(0.0, 0.3, 0.5, 0);
      this.rightExhaust.color1 = new Color4(0.3, 1, 0.9, 1);
      this.rightExhaust.color2 = new Color4(0.1, 0.7, 1, 1);
      this.rightExhaust.colorDead = new Color4(0.0, 0.3, 0.5, 0);

      // Bigger flames during nitro
      emitRate = Math.max(emitRate, 350);
    } else {
      // Normal orange/red flames
      this.leftExhaust.color1 = new Color4(1, 0.9, 0.5, 1);
      this.leftExhaust.color2 = new Color4(1, 0.5, 0.1, 1);
      this.leftExhaust.colorDead = new Color4(0.5, 0.1, 0, 0);
      this.rightExhaust.color1 = new Color4(1, 0.9, 0.5, 1);
      this.rightExhaust.color2 = new Color4(1, 0.5, 0.1, 1);
      this.rightExhaust.colorDead = new Color4(0.5, 0.1, 0, 0);
    }

    this.leftExhaust.emitRate = emitRate;
    this.rightExhaust.emitRate = emitRate;

    // Bigger flames at higher throttle/speed, extra big during nitro
    const nitroMult = this.nitroBoostActive ? 2.5 : 1;
    const sizeMultiplier = (1 + intensity * 0.5) * nitroMult;
    this.leftExhaust.minSize = 0.08 * sizeMultiplier;
    this.leftExhaust.maxSize = 0.25 * sizeMultiplier;
    this.rightExhaust.minSize = 0.08 * sizeMultiplier;
    this.rightExhaust.maxSize = 0.25 * sizeMultiplier;

    // More power at higher throttle
    const power = (8 + throttle * 10 + speed * 0.2) * (this.nitroBoostActive ? 1.8 : 1);
    this.leftExhaust.minEmitPower = power * 0.8;
    this.leftExhaust.maxEmitPower = power * 1.2;
    this.rightExhaust.minEmitPower = power * 0.8;
    this.rightExhaust.maxEmitPower = power * 1.2;
  }

  dispose() {
    this.leftExhaust.dispose();
    this.rightExhaust.dispose();
  }
}

