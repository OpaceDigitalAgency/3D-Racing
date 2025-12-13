import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { Track } from "./Track";

export type SpeedPadInfo = {
  position: Vector3;
  rotation: number;
  width: number;
  length: number;
};

export class SpeedPadSystem {
  readonly pads: SpeedPadInfo[] = [];
  private glowTime = 0;
  private materials: PBRMaterial[] = [];

  constructor(private scene: Scene, private track: Track) {}

  // Add speed pad at a position along the track centerline
  addPadOnTrack(trackProgress: number, width: number = 6, length: number = 8) {
    const totalLen = this.track.totalLength;
    const targetDist = trackProgress * totalLen;

    let accum = 0;
    let padPos = this.track.centerline[0].clone();
    let padDir = new Vector3(0, 0, 1);

    for (let i = 0; i < this.track.centerline.length - 1; i++) {
      const a = this.track.centerline[i];
      const b = this.track.centerline[i + 1];
      const segLen = Vector3.Distance(a, b);

      if (accum + segLen >= targetDist) {
        const t = (targetDist - accum) / segLen;
        padPos = Vector3.Lerp(a, b, t);
        padDir = b.subtract(a).normalize();
        break;
      }
      accum += segLen;
    }

    const rotation = Math.atan2(padDir.x, padDir.z);

    const padInfo: SpeedPadInfo = {
      position: padPos.clone(),
      rotation,
      width,
      length
    };
    this.pads.push(padInfo);

    // Create the speed pad mesh with glowing arrows
    this.createPadMesh(padInfo);

    return padInfo;
  }

  private createPadMesh(info: SpeedPadInfo) {
    const { width, length } = info;

    // Base pad - glowing blue/green surface
    const padMat = new PBRMaterial("speedPadMat", this.scene);
    padMat.albedoColor = new Color3(0.0, 0.8, 0.9);
    padMat.roughness = 0.1;
    padMat.metallic = 0.5;
    padMat.emissiveColor = new Color3(0.0, 0.6, 0.8);
    padMat.alpha = 0.9;
    this.materials.push(padMat);

    const pad = MeshBuilder.CreateGround("speedPad", { width, height: length, subdivisions: 4 }, this.scene);
    pad.position.copyFrom(info.position);
    pad.position.y = 0.12;
    pad.rotation.y = info.rotation;
    pad.material = padMat;

    // Arrow chevrons to indicate direction
    const arrowMat = new PBRMaterial("arrowMat", this.scene);
    arrowMat.albedoColor = new Color3(0.2, 1, 0.4);
    arrowMat.roughness = 0.05;
    arrowMat.metallic = 0.8;
    arrowMat.emissiveColor = new Color3(0.1, 0.8, 0.3);
    this.materials.push(arrowMat);

    // Create 3 chevron arrows on the pad
    for (let i = 0; i < 3; i++) {
      const chevron = MeshBuilder.CreatePlane(`chevron${i}`, { width: width * 0.6, height: 1.5 }, this.scene);
      chevron.rotation.x = Math.PI / 2;
      chevron.position.set(0, 0.01, -length * 0.3 + i * length * 0.3);
      chevron.parent = pad;
      chevron.material = arrowMat;
    }
  }

  // Check if car is on a speed pad
  isOnSpeedPad(pos: Vector3): SpeedPadInfo | null {
    for (const pad of this.pads) {
      const dx = pos.x - pad.position.x;
      const dz = pos.z - pad.position.z;

      // Rotate to pad local space
      const cos = Math.cos(-pad.rotation);
      const sin = Math.sin(-pad.rotation);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hw = pad.width / 2;
      const hl = pad.length / 2;

      if (Math.abs(localX) <= hw && Math.abs(localZ) <= hl) {
        return pad;
      }
    }
    return null;
  }

  // Animate speed pad glow
  update(dt: number) {
    this.glowTime += dt;
    const pulse = 0.5 + Math.sin(this.glowTime * 4) * 0.3;
    for (const mat of this.materials) {
      mat.emissiveIntensity = pulse;
    }
  }
}

