import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

export type BridgeInfo = {
  start: Vector3;
  end: Vector3;
  width: number;
  height: number;
  rampLength: number;
  direction: Vector3;
  rotation: number;
};

export class BridgeSystem {
  readonly bridges: BridgeInfo[] = [];

  constructor(private scene: Scene, private shadowGen?: ShadowGenerator) {}

  // Add a bridge connecting two points with proper ramps
  addBridge(startX: number, startZ: number, endX: number, endZ: number, width: number = 10, height: number = 3) {
    const start = new Vector3(startX, 0, startZ);
    const end = new Vector3(endX, 0, endZ);
    const dir = end.subtract(start).normalize();
    const rotation = Math.atan2(dir.x, dir.z);
    const rampLength = height * 4;  // Gentle slope - 4:1 ratio

    const bridgeInfo: BridgeInfo = { start, end, width, height, rampLength, direction: dir, rotation };
    this.bridges.push(bridgeInfo);

    this.createBridgeMesh(bridgeInfo);

    return bridgeInfo;
  }

  private createBridgeMesh(info: BridgeInfo) {
    const { start, end, width, height, rampLength, rotation } = info;

    // Calculate bridge direction and length
    const dir = end.subtract(start);
    const deckLength = dir.length();
    const midpoint = start.add(end).scale(0.5);

    // Bridge deck material - dark asphalt for driving surface
    const deckMat = new PBRMaterial("bridgeDeckMat", this.scene);
    deckMat.albedoColor = new Color3(0.2, 0.2, 0.22);
    deckMat.roughness = 0.8;
    deckMat.metallic = 0.05;

    // Bridge support material - steel
    const steelMat = new PBRMaterial("bridgeSteelMat", this.scene);
    steelMat.albedoColor = new Color3(0.4, 0.42, 0.45);
    steelMat.roughness = 0.4;
    steelMat.metallic = 0.7;

    // Railing material - red/white safety
    const railMat = new PBRMaterial("bridgeRailMat", this.scene);
    railMat.albedoColor = new Color3(0.9, 0.2, 0.15);
    railMat.roughness = 0.5;
    railMat.metallic = 0.2;

    // Create flat bridge deck
    const deck = CreateBox("bridgeDeck", { width, height: 0.3, depth: deckLength }, this.scene);
    deck.position = midpoint.clone();
    deck.position.y = height;
    deck.rotation.y = rotation;
    deck.material = deckMat;
    deck.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(deck);

    // Create proper wedge ramps using custom geometry
    const slopeAngle = Math.atan2(height, rampLength);

    // Start ramp (going up)
    const startRamp = this.createRampMesh(width, rampLength, height, deckMat);
    // Position ramp so it starts on the ground and connects to deck
    const rampDir = info.direction;
    const rampStartPos = start.subtract(rampDir.scale(rampLength / 2));
    startRamp.position = rampStartPos;
    startRamp.position.y = 0.02;
    startRamp.rotation.y = rotation;
    if (this.shadowGen) this.shadowGen.addShadowCaster(startRamp);

    // End ramp (going down) - rotated 180 degrees
    const endRamp = this.createRampMesh(width, rampLength, height, deckMat);
    const rampEndPos = end.add(rampDir.scale(rampLength / 2));
    endRamp.position = rampEndPos;
    endRamp.position.y = 0.02;
    endRamp.rotation.y = rotation + Math.PI;
    if (this.shadowGen) this.shadowGen.addShadowCaster(endRamp);

    // Support pillars at deck start/end
    const pillarRadius = 0.5;
    const pillarHeight = height;
    // Keep pillars out of the driving line when the bridge runs over the road.
    const pillarOffsetFromCenter = width / 2 + 6;

    for (const pos of [start, end]) {
      for (const side of [-1, 1]) {
        const pillar = CreateCylinder("pillar", { height: pillarHeight, diameter: pillarRadius * 2 }, this.scene);
        pillar.position = pos.clone();
        pillar.position.x += Math.cos(rotation) * pillarOffsetFromCenter * side;
        pillar.position.z -= Math.sin(rotation) * pillarOffsetFromCenter * side;
        pillar.position.y = pillarHeight / 2;
        pillar.material = steelMat;
        if (this.shadowGen) this.shadowGen.addShadowCaster(pillar);
      }
    }

    // Side railings on deck
    const railHeight = 0.6;
    for (const side of [-1, 1]) {
      const rail = CreateBox("rail", { width: 0.08, height: railHeight, depth: deckLength + 0.5 }, this.scene);
      rail.parent = deck;
      rail.position.set((width / 2 - 0.08) * side, 0.15 + railHeight / 2, 0);
      rail.material = railMat;
      if (this.shadowGen) this.shadowGen.addShadowCaster(rail);
    }
  }

  // Ease-in-out curve for smooth ramp profile (starts flat, curves up, ends flat at top)
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  private createRampMesh(width: number, length: number, height: number, material: PBRMaterial): Mesh {
    const hw = width / 2;
    const hl = length / 2;

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    // Create curved ramp surface with many subdivisions for smooth curve
    const subdivsX = 4;
    const subdivsZ = 20;  // More subdivisions along length for smooth curve

    for (let i = 0; i <= subdivsX; i++) {
      for (let j = 0; j <= subdivsZ; j++) {
        const u = i / subdivsX;
        const v = j / subdivsZ;
        const x = -hw + u * width;
        const z = -hl + v * length;
        // Use ease-in-out curve for natural ramp shape - starts flat, curves up, flattens at top
        const y = this.easeInOutCubic(v) * height;
        positions.push(x, y, z);

        // Calculate normal based on curve derivative
        const dv = 0.01;
        const y1 = this.easeInOutCubic(Math.max(0, v - dv)) * height;
        const y2 = this.easeInOutCubic(Math.min(1, v + dv)) * height;
        const slope = (y2 - y1) / (dv * 2 * length);
        const ny = 1 / Math.sqrt(1 + slope * slope);
        const nz = -slope * ny;
        normals.push(0, ny, nz);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < subdivsX; i++) {
      for (let j = 0; j < subdivsZ; j++) {
        const a = i * (subdivsZ + 1) + j;
        const b = a + 1;
        const c = a + subdivsZ + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Side faces - create curved side walls
    const sideSubdivs = 10;
    for (const sideX of [-hw, hw]) {
      const sideStart = positions.length / 3;
      const sideNormal = sideX < 0 ? -1 : 1;

      // Bottom edge vertices
      for (let j = 0; j <= sideSubdivs; j++) {
        const v = j / sideSubdivs;
        const z = -hl + v * length;
        positions.push(sideX, 0, z);
        normals.push(sideNormal, 0, 0);
        uvs.push(v, 0);
      }
      // Top edge vertices (curved)
      for (let j = 0; j <= sideSubdivs; j++) {
        const v = j / sideSubdivs;
        const z = -hl + v * length;
        const y = this.easeInOutCubic(v) * height;
        positions.push(sideX, y, z);
        normals.push(sideNormal, 0, 0);
        uvs.push(v, 1);
      }

      // Connect bottom and top edges
      for (let j = 0; j < sideSubdivs; j++) {
        const bl = sideStart + j;
        const br = sideStart + j + 1;
        const tl = sideStart + sideSubdivs + 1 + j;
        const tr = sideStart + sideSubdivs + 2 + j;
        if (sideX < 0) {
          indices.push(bl, tl, br, br, tl, tr);
        } else {
          indices.push(bl, br, tl, tl, br, tr);
        }
      }
    }

    const ramp = new Mesh("bridgeRamp", this.scene);
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    vertexData.applyToMesh(ramp);
    ramp.material = material;
    ramp.receiveShadows = true;

    return ramp;
  }

  // Get height at a position (for physics) - includes ramps with eased curve
  getHeightAt(pos: Vector3): { height: number; onBridge: boolean } {
    for (const bridge of this.bridges) {
      const { start, end, width, height, rampLength, direction: dir } = bridge;
      const deckLength = Vector3.Distance(start, end);

      // Calculate perpendicular distance to the bridge line
      const toBridge = pos.subtract(start);
      const along = Vector3.Dot(toBridge, dir);
      const perp = new Vector3(-dir.z, 0, dir.x);
      const perpDist = Math.abs(Vector3.Dot(toBridge, perp));

      // Check if within bridge width
      if (perpDist > width / 2) continue;

      // Check different sections of the bridge
      // Start ramp: from -rampLength to 0 (relative to start point)
      if (along >= -rampLength && along < 0) {
        const t = (along + rampLength) / rampLength;  // 0 at ground, 1 at deck height
        // Use same eased curve as visual ramp for consistent physics
        const easedT = this.easeInOutCubic(t);
        return { height: easedT * height, onBridge: true };
      }

      // Main deck: from 0 to deckLength
      if (along >= 0 && along <= deckLength) {
        return { height: height, onBridge: true };
      }

      // End ramp: from deckLength to deckLength + rampLength
      if (along > deckLength && along <= deckLength + rampLength) {
        const t = (along - deckLength) / rampLength;  // 0 at deck, 1 at ground
        // Use inverse eased curve - t goes from 0 to 1 as we descend
        const easedT = this.easeInOutCubic(1 - t);
        return { height: easedT * height, onBridge: true };
      }
    }
    return { height: 0, onBridge: false };
  }
}
