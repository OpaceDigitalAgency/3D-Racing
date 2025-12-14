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

    for (const pos of [start, end]) {
      for (const side of [-1, 1]) {
        const pillar = CreateCylinder("pillar", { height: pillarHeight, diameter: pillarRadius * 2 }, this.scene);
        pillar.position = pos.clone();
        pillar.position.x += Math.cos(rotation) * (width / 2 - 0.8) * side;
        pillar.position.z -= Math.sin(rotation) * (width / 2 - 0.8) * side;
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

  private createRampMesh(width: number, length: number, height: number, material: PBRMaterial): Mesh {
    const hw = width / 2;
    const hl = length / 2;

    const positions: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];

    const slopeAngle = Math.atan2(height, length);
    const slopeNy = Math.cos(slopeAngle);
    const slopeNz = -Math.sin(slopeAngle);

    // Top slope face with subdivisions
    const subdivs = 6;
    for (let i = 0; i <= subdivs; i++) {
      for (let j = 0; j <= subdivs; j++) {
        const u = i / subdivs;
        const v = j / subdivs;
        const x = -hw + u * width;
        const z = -hl + v * length;
        const y = v * height;
        positions.push(x, y, z);
        normals.push(0, slopeNy, slopeNz);
        uvs.push(u, v);
      }
    }

    for (let i = 0; i < subdivs; i++) {
      for (let j = 0; j < subdivs; j++) {
        const a = i * (subdivs + 1) + j;
        const b = a + 1;
        const c = a + subdivs + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    // Side faces
    const leftStart = positions.length / 3;
    positions.push(-hw, 0, -hl, -hw, 0, hl, -hw, height, hl);
    for (let i = 0; i < 3; i++) normals.push(-1, 0, 0);
    uvs.push(0, 0, 1, 0, 0.5, 1);
    indices.push(leftStart, leftStart + 1, leftStart + 2);

    const rightStart = positions.length / 3;
    positions.push(hw, 0, -hl, hw, height, hl, hw, 0, hl);
    for (let i = 0; i < 3; i++) normals.push(1, 0, 0);
    uvs.push(0, 0, 0.5, 1, 1, 0);
    indices.push(rightStart, rightStart + 1, rightStart + 2);

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

  // Get height at a position (for physics) - includes ramps
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
        return { height: t * height, onBridge: true };
      }

      // Main deck: from 0 to deckLength
      if (along >= 0 && along <= deckLength) {
        return { height: height, onBridge: true };
      }

      // End ramp: from deckLength to deckLength + rampLength
      if (along > deckLength && along <= deckLength + rampLength) {
        const t = 1 - (along - deckLength) / rampLength;  // 1 at deck, 0 at ground
        return { height: t * height, onBridge: true };
      }
    }
    return { height: 0, onBridge: false };
  }
}

