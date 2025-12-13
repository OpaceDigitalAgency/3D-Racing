import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Track } from "./Track";

export type RampInfo = {
  position: Vector3;
  rotation: number;
  width: number;
  length: number;
  height: number;
};

export class RampSystem {
  readonly ramps: RampInfo[] = [];
  private rampMaterial: PBRMaterial;
  private sideMaterial: PBRMaterial;

  constructor(private scene: Scene, private shadowGen?: ShadowGenerator) {
    // Create shared ramp materials - dark asphalt look
    this.rampMaterial = new PBRMaterial("rampMat", scene);
    this.rampMaterial.albedoColor = new Color3(0.15, 0.15, 0.18);
    this.rampMaterial.roughness = 0.7;
    this.rampMaterial.metallic = 0.0;

    // Side barrier material (red/white hazard stripes)
    this.sideMaterial = new PBRMaterial("rampSideMat", scene);
    this.sideMaterial.albedoColor = new Color3(0.9, 0.2, 0.1);
    this.sideMaterial.roughness = 0.5;
    this.sideMaterial.metallic = 0.0;
  }

  // Add ramp at a position along the track centerline
  addRampOnTrack(track: Track, trackProgress: number, width: number = 8, length: number = 14, height: number = 1.2) {
    // Find position and direction on track at this progress (0-1)
    const totalLen = track.totalLength;
    const targetDist = trackProgress * totalLen;

    let accum = 0;
    let rampPos = track.centerline[0].clone();
    let rampDir = new Vector3(0, 0, 1);

    for (let i = 0; i < track.centerline.length - 1; i++) {
      const a = track.centerline[i];
      const b = track.centerline[i + 1];
      const segLen = Vector3.Distance(a, b);

      if (accum + segLen >= targetDist) {
        const t = (targetDist - accum) / segLen;
        rampPos = Vector3.Lerp(a, b, t);
        rampDir = b.subtract(a).normalize();
        break;
      }
      accum += segLen;
    }

    const rotation = Math.atan2(rampDir.x, rampDir.z);

    const rampInfo: RampInfo = {
      position: rampPos.clone(),
      rotation,
      width,
      length,
      height
    };
    this.ramps.push(rampInfo);

    // Create the ramp mesh
    this.createRampMesh(rampInfo);

    return rampInfo;
  }

  private createRampMesh(info: RampInfo): Mesh {
    const { width, length, height } = info;
    const hw = width / 2;
    const hl = length / 2;

    // Create wedge geometry - ramp goes from back (y=0) rising to front (y=height)
    // Use more vertices for smooth appearance
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Calculate slope normal
    const slopeAngle = Math.atan2(height, length);
    const slopeNy = Math.cos(slopeAngle);
    const slopeNz = -Math.sin(slopeAngle);

    // TOP SLOPE FACE with subdivisions for better lighting
    const subdivs = 8;
    for (let i = 0; i <= subdivs; i++) {
      for (let j = 0; j <= subdivs; j++) {
        const u = i / subdivs;
        const v = j / subdivs;
        const x = -hw + u * width;
        const z = -hl + v * length;
        const y = v * height; // Height increases along length

        positions.push(x, y, z);
        normals.push(0, slopeNy, slopeNz);
        uvs.push(u, v);
      }
    }

    // Generate indices for top face
    for (let i = 0; i < subdivs; i++) {
      for (let j = 0; j < subdivs; j++) {
        const a = i * (subdivs + 1) + j;
        const b = a + 1;
        const c = a + subdivs + 1;
        const d = c + 1;
        indices.push(a, c, b);
        indices.push(b, c, d);
      }
    }

    // FRONT FACE - vertical drop
    const frontStart = positions.length / 3;
    positions.push(
      -hw, 0, hl,         // bottom-left
      hw, 0, hl,          // bottom-right
      hw, height, hl,     // top-right
      -hw, height, hl     // top-left
    );
    for (let i = 0; i < 4; i++) normals.push(0, 0, 1);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(frontStart, frontStart + 2, frontStart + 1);
    indices.push(frontStart, frontStart + 3, frontStart + 2);

    // BACK FACE
    const backStart = positions.length / 3;
    positions.push(
      hw, 0, -hl,
      -hw, 0, -hl,
      -hw, 0.05, -hl,
      hw, 0.05, -hl
    );
    for (let i = 0; i < 4; i++) normals.push(0, 0, -1);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(backStart, backStart + 2, backStart + 1);
    indices.push(backStart, backStart + 3, backStart + 2);

    // BOTTOM FACE
    const bottomStart = positions.length / 3;
    positions.push(-hw, 0, -hl, hw, 0, -hl, hw, 0, hl, -hw, 0, hl);
    for (let i = 0; i < 4; i++) normals.push(0, -1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(bottomStart, bottomStart + 1, bottomStart + 2);
    indices.push(bottomStart, bottomStart + 2, bottomStart + 3);

    // LEFT SIDE
    const leftStart = positions.length / 3;
    positions.push(-hw, 0, -hl, -hw, 0, hl, -hw, height, hl);
    for (let i = 0; i < 3; i++) normals.push(-1, 0, 0);
    uvs.push(0, 0, 1, 0, 0.5, 1);
    indices.push(leftStart, leftStart + 1, leftStart + 2);

    // RIGHT SIDE
    const rightStart = positions.length / 3;
    positions.push(hw, 0, -hl, hw, height, hl, hw, 0, hl);
    for (let i = 0; i < 3; i++) normals.push(1, 0, 0);
    uvs.push(0, 0, 0.5, 1, 1, 0);
    indices.push(rightStart, rightStart + 1, rightStart + 2);

    const ramp = new Mesh("ramp", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;

    vertexData.applyToMesh(ramp);
    ramp.material = this.rampMaterial;
    ramp.receiveShadows = true;
    ramp.position.copyFrom(info.position);
    ramp.position.y = 0.02;
    ramp.rotation.y = info.rotation;

    if (this.shadowGen) {
      this.shadowGen.addShadowCaster(ramp);
    }

    // Add side barriers with hazard stripes
    const barrierHeight = 0.5;
    const barrierWidth = 0.2;

    // Left barrier - angled to follow ramp slope
    const leftBarrier = CreateBox("leftBarrier", {
      width: barrierWidth,
      height: barrierHeight,
      depth: length * 1.02
    }, this.scene);
    leftBarrier.position.set(-hw - barrierWidth / 2, height / 2 + barrierHeight / 2, 0);
    leftBarrier.rotation.x = -slopeAngle;
    leftBarrier.material = this.sideMaterial;
    leftBarrier.parent = ramp;
    leftBarrier.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftBarrier);

    // Right barrier
    const rightBarrier = CreateBox("rightBarrier", {
      width: barrierWidth,
      height: barrierHeight,
      depth: length * 1.02
    }, this.scene);
    rightBarrier.position.set(hw + barrierWidth / 2, height / 2 + barrierHeight / 2, 0);
    rightBarrier.rotation.x = -slopeAngle;
    rightBarrier.material = this.sideMaterial;
    rightBarrier.parent = ramp;
    rightBarrier.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightBarrier);

    return ramp;
  }

  // Get height at a position (for physics) - car must approach from correct direction
  getHeightAt(pos: Vector3, carYaw: number): { height: number; normal: Vector3; onRamp: boolean; sideCollision: boolean; atRampEdge: boolean; rampDirection: Vector3; rampAngle: number } {
    for (const ramp of this.ramps) {
      const dx = pos.x - ramp.position.x;
      const dz = pos.z - ramp.position.z;

      // Rotate to ramp local space
      const cos = Math.cos(-ramp.rotation);
      const sin = Math.sin(-ramp.rotation);
      const localX = dx * cos - dz * sin;
      const localZ = dx * sin + dz * cos;

      const hw = ramp.width / 2;
      const hl = ramp.length / 2;

      // Check if within ramp bounds (including side barriers)
      const withinLength = localZ >= -hl && localZ <= hl;
      const withinWidth = Math.abs(localX) <= hw;
      const hittingSide = withinLength && Math.abs(localX) > hw && Math.abs(localX) <= hw + 0.5;

      if (hittingSide) {
        // Hitting side barrier
        return {
          height: 0,
          normal: new Vector3(localX > 0 ? 1 : -1, 0, 0),
          onRamp: false,
          sideCollision: true,
          atRampEdge: false,
          rampDirection: new Vector3(0, 0, 1),
          rampAngle: 0
        };
      }

      if (withinWidth && withinLength) {
        // Calculate height based on position along ramp (back=0, front=height)
        const t = (localZ + hl) / ramp.length;
        const height = t * ramp.height;

        // Check if car is approaching from correct angle (within ~60 degrees of ramp direction)
        const carDir = carYaw - ramp.rotation;
        const normalizedDir = ((carDir % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const approachingCorrectly = normalizedDir < Math.PI / 3 || normalizedDir > Math.PI * 5 / 3;

        // If approaching from front/side (wrong way), treat as collision
        if (localZ > 0 && !approachingCorrectly && t > 0.5) {
          return {
            height: 0,
            normal: new Vector3(0, 0, 1),
            onRamp: false,
            sideCollision: true,
            atRampEdge: false,
            rampDirection: new Vector3(0, 0, 1),
            rampAngle: 0
          };
        }

        // Normal points up and back along the slope
        const slopeAngle = Math.atan2(ramp.height, ramp.length);
        const ny = Math.cos(slopeAngle);
        const nzLocal = -Math.sin(slopeAngle);

        // Rotate normal back to world space
        const worldNx = nzLocal * Math.sin(ramp.rotation);
        const worldNz = nzLocal * Math.cos(ramp.rotation);

        // Check if at the launch edge of the ramp (top 15% of ramp)
        const atRampEdge = t > 0.85 && approachingCorrectly;

        // Calculate ramp direction in world space
        const rampDirection = new Vector3(
          Math.sin(ramp.rotation),
          0,
          Math.cos(ramp.rotation)
        );

        return {
          height,
          normal: new Vector3(worldNx, ny, worldNz).normalize(),
          onRamp: true,
          sideCollision: false,
          atRampEdge,
          rampDirection,
          rampAngle: slopeAngle
        };
      }
    }

    return {
      height: 0,
      normal: new Vector3(0, 1, 0),
      onRamp: false,
      sideCollision: false,
      atRampEdge: false,
      rampDirection: new Vector3(0, 0, 1),
      rampAngle: 0
    };
  }
}

