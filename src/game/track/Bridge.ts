import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

export type BridgeInfo = {
  start: Vector3;
  end: Vector3;
  width: number;
  height: number;
};

export class BridgeSystem {
  readonly bridges: BridgeInfo[] = [];
  
  constructor(private scene: Scene, private shadowGen?: ShadowGenerator) {}
  
  // Add a bridge connecting two points
  addBridge(startX: number, startZ: number, endX: number, endZ: number, width: number = 10, height: number = 4) {
    const start = new Vector3(startX, 0, startZ);
    const end = new Vector3(endX, 0, endZ);
    
    const bridgeInfo: BridgeInfo = { start, end, width, height };
    this.bridges.push(bridgeInfo);
    
    this.createBridgeMesh(bridgeInfo);
    
    return bridgeInfo;
  }
  
  private createBridgeMesh(info: BridgeInfo) {
    const { start, end, width, height } = info;
    
    // Calculate bridge direction and length
    const dir = end.subtract(start);
    const length = dir.length();
    const rotation = Math.atan2(dir.x, dir.z);
    const midpoint = start.add(end).scale(0.5);
    
    // Bridge deck material - concrete look
    const deckMat = new PBRMaterial("bridgeDeckMat", this.scene);
    deckMat.albedoColor = new Color3(0.35, 0.35, 0.38);
    deckMat.roughness = 0.75;
    deckMat.metallic = 0.1;
    
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
    
    // Create bridge deck
    const deck = CreateBox("bridgeDeck", { width, height: 0.4, depth: length }, this.scene);
    deck.position = midpoint.clone();
    deck.position.y = height;
    deck.rotation.y = rotation;
    deck.material = deckMat;
    deck.receiveShadows = true;
    if (this.shadowGen) this.shadowGen.addShadowCaster(deck);
    
    // Create ramp up at start
    const rampLength = 12;
    const rampStart = MeshBuilder.CreateGround("rampStart", { width, height: rampLength, subdivisions: 8 }, this.scene);
    rampStart.position = start.add(new Vector3(0, height / 2, 0));
    rampStart.rotation.y = rotation;
    rampStart.rotation.x = Math.atan2(height, rampLength);
    rampStart.material = deckMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rampStart);
    
    // Create ramp down at end
    const rampEnd = MeshBuilder.CreateGround("rampEnd", { width, height: rampLength, subdivisions: 8 }, this.scene);
    rampEnd.position = end.add(new Vector3(0, height / 2, 0));
    rampEnd.rotation.y = rotation + Math.PI;
    rampEnd.rotation.x = Math.atan2(height, rampLength);
    rampEnd.material = deckMat;
    if (this.shadowGen) this.shadowGen.addShadowCaster(rampEnd);
    
    // Support pillars
    const pillarRadius = 0.6;
    const pillarHeight = height;
    
    // Start pillars
    for (const side of [-1, 1]) {
      const pillar = CreateCylinder("pillar", { height: pillarHeight, diameter: pillarRadius * 2 }, this.scene);
      pillar.position = start.clone();
      pillar.position.x += Math.cos(rotation) * (width / 2 - 1) * side;
      pillar.position.z -= Math.sin(rotation) * (width / 2 - 1) * side;
      pillar.position.y = pillarHeight / 2;
      pillar.material = steelMat;
      if (this.shadowGen) this.shadowGen.addShadowCaster(pillar);
    }
    
    // End pillars
    for (const side of [-1, 1]) {
      const pillar = CreateCylinder("pillar", { height: pillarHeight, diameter: pillarRadius * 2 }, this.scene);
      pillar.position = end.clone();
      pillar.position.x += Math.cos(rotation) * (width / 2 - 1) * side;
      pillar.position.z -= Math.sin(rotation) * (width / 2 - 1) * side;
      pillar.position.y = pillarHeight / 2;
      pillar.material = steelMat;
      if (this.shadowGen) this.shadowGen.addShadowCaster(pillar);
    }
    
    // Side railings on deck
    const railHeight = 0.8;
    for (const side of [-1, 1]) {
      const rail = CreateBox("rail", { width: 0.1, height: railHeight, depth: length }, this.scene);
      rail.parent = deck;
      rail.position.set((width / 2 - 0.1) * side, 0.2 + railHeight / 2, 0);
      rail.material = railMat;
      if (this.shadowGen) this.shadowGen.addShadowCaster(rail);
    }
  }
  
  // Get height at a position (for physics)
  getHeightAt(pos: Vector3): { height: number; onBridge: boolean } {
    for (const bridge of this.bridges) {
      const dir = bridge.end.subtract(bridge.start).normalize();
      const toBridge = pos.subtract(bridge.start);
      
      // Project position onto bridge line
      const along = Vector3.Dot(toBridge, dir);
      const length = Vector3.Distance(bridge.start, bridge.end);
      
      if (along >= 0 && along <= length) {
        // Get perpendicular distance
        const perp = new Vector3(-dir.z, 0, dir.x);
        const perpDist = Math.abs(Vector3.Dot(toBridge, perp));
        
        if (perpDist <= bridge.width / 2) {
          return { height: bridge.height, onBridge: true };
        }
      }
    }
    return { height: 0, onBridge: false };
  }
}

