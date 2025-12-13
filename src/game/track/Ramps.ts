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
    // Vertices laid out for proper face rendering
    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    // Calculate slope normal
    const slopeAngle = Math.atan2(height, length);
    const slopeNy = Math.cos(slopeAngle);
    const slopeNz = -Math.sin(slopeAngle);

    // TOP SLOPE FACE (4 vertices, 2 triangles)
    const topStart = positions.length / 3;
    positions.push(
      -hw, 0, -hl,        // back-left
      hw, 0, -hl,         // back-right
      hw, height, hl,     // front-right (top)
      -hw, height, hl     // front-left (top)
    );
    for (let i = 0; i < 4; i++) normals.push(0, slopeNy, slopeNz);
    indices.push(topStart, topStart + 2, topStart + 1);
    indices.push(topStart, topStart + 3, topStart + 2);

    // FRONT FACE - vertical drop (4 vertices)
    const frontStart = positions.length / 3;
    positions.push(
      -hw, 0, hl,         // bottom-left
      hw, 0, hl,          // bottom-right
      hw, height, hl,     // top-right
      -hw, height, hl     // top-left
    );
    for (let i = 0; i < 4; i++) normals.push(0, 0, 1);
    indices.push(frontStart, frontStart + 2, frontStart + 1);
    indices.push(frontStart, frontStart + 3, frontStart + 2);

    // BACK FACE (just the edge at ground level - 4 vertices for a thin strip)
    const backStart = positions.length / 3;
    positions.push(
      -hw, 0, -hl,
      hw, 0, -hl,
      hw, 0.01, -hl,
      -hw, 0.01, -hl
    );
    for (let i = 0; i < 4; i++) normals.push(0, 0, -1);
    indices.push(backStart, backStart + 1, backStart + 2);
    indices.push(backStart, backStart + 2, backStart + 3);

    // BOTTOM FACE (4 vertices)
    const bottomStart = positions.length / 3;
    positions.push(
      -hw, 0, -hl,
      hw, 0, -hl,
      hw, 0, hl,
      -hw, 0, hl
    );
    for (let i = 0; i < 4; i++) normals.push(0, -1, 0);
    indices.push(bottomStart, bottomStart + 1, bottomStart + 2);
    indices.push(bottomStart, bottomStart + 2, bottomStart + 3);

    // LEFT SIDE TRIANGLE (3 vertices)
    const leftStart = positions.length / 3;
    positions.push(
      -hw, 0, -hl,
      -hw, 0, hl,
      -hw, height, hl
    );
    for (let i = 0; i < 3; i++) normals.push(-1, 0, 0);
    indices.push(leftStart, leftStart + 1, leftStart + 2);

    // RIGHT SIDE TRIANGLE (3 vertices)
    const rightStart = positions.length / 3;
    positions.push(
      hw, 0, -hl,
      hw, height, hl,
      hw, 0, hl
    );
    for (let i = 0; i < 3; i++) normals.push(1, 0, 0);
    indices.push(rightStart, rightStart + 1, rightStart + 2);

    const ramp = new Mesh("ramp", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;

    vertexData.applyToMesh(ramp);
    ramp.material = this.rampMaterial;
    ramp.receiveShadows = true;
    ramp.position.copyFrom(info.position);
    ramp.position.y = 0.01; // Slightly above ground
    ramp.rotation.y = info.rotation;

    if (this.shadowGen) {
      this.shadowGen.addShadowCaster(ramp);
    }

    // Add small side rails (not full height barriers)
    const railHeight = 0.25;
    const railWidth = 0.12;

    // Left rail
    const leftRail = CreateBox("leftRail", {
      width: railWidth,
      height: railHeight,
      depth: length
    }, this.scene);
    leftRail.position.set(-hw - railWidth/2, railHeight/2 + height * 0.3, 0);
    leftRail.material = this.sideMaterial;
    leftRail.parent = ramp;
    leftRail.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(leftRail);

    // Right rail
    const rightRail = CreateBox("rightRail", {
      width: railWidth,
      height: railHeight,
      depth: length
    }, this.scene);
    rightRail.position.set(hw + railWidth/2, railHeight/2 + height * 0.3, 0);
    rightRail.material = this.sideMaterial;
    rightRail.parent = ramp;
    rightRail.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rightRail);

    return ramp;
  }

  // Get height at a position (for physics) - car must approach from correct direction
  getHeightAt(pos: Vector3, carYaw: number): { height: number; normal: Vector3; onRamp: boolean; sideCollision: boolean } {
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
          sideCollision: true
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
            sideCollision: true
          };
        }

        // Normal points up and back along the slope
        const slopeAngle = Math.atan2(ramp.height, ramp.length);
        const ny = Math.cos(slopeAngle);
        const nzLocal = -Math.sin(slopeAngle);

        // Rotate normal back to world space
        const worldNx = nzLocal * Math.sin(ramp.rotation);
        const worldNz = nzLocal * Math.cos(ramp.rotation);

        return {
          height,
          normal: new Vector3(worldNx, ny, worldNz).normalize(),
          onRamp: true,
          sideCollision: false
        };
      }
    }

    return { height: 0, normal: new Vector3(0, 1, 0), onRamp: false, sideCollision: false };
  }
}

