import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

// Simple noise function for terrain generation
function noise2D(x: number, z: number, seed: number = 0): number {
  const n = Math.sin(x * 0.1 + seed) * Math.cos(z * 0.12 + seed * 0.7) +
            Math.sin(x * 0.05 + z * 0.08 + seed * 1.3) * 0.5 +
            Math.sin(x * 0.02 + z * 0.03) * 0.3;
  return n;
}

// Hill definition
export type HillInfo = {
  x: number;
  z: number;
  radius: number;
  height: number;
};

// Predefined hills on the track
export const TERRAIN_HILLS: HillInfo[] = [
  // Hills along the straights
  { x: 40, z: 65, radius: 25, height: 2.5 },
  { x: -40, z: 65, radius: 20, height: 2.0 },
  { x: 70, z: 0, radius: 30, height: 3.0 },
  { x: -70, z: -20, radius: 25, height: 2.5 },
  { x: 0, z: -60, radius: 35, height: 2.8 },
  { x: 50, z: -55, radius: 22, height: 2.2 },
  // Smaller undulations
  { x: -30, z: 30, radius: 15, height: 1.2 },
  { x: 60, z: 40, radius: 18, height: 1.5 },
  { x: -60, z: 50, radius: 20, height: 1.8 },
  { x: 30, z: -30, radius: 16, height: 1.3 },
];

// Get terrain height at any position
export function getTerrainHeight(x: number, z: number, trackHalfWidth: number = 8): number {
  let height = 0;
  
  // Add hill contributions
  for (const hill of TERRAIN_HILLS) {
    const dx = x - hill.x;
    const dz = z - hill.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    if (dist < hill.radius) {
      // Smooth cosine falloff
      const t = dist / hill.radius;
      const contribution = hill.height * (Math.cos(t * Math.PI) + 1) * 0.5;
      height += contribution;
    }
  }
  
  // Add subtle noise variation
  height += noise2D(x, z, 42) * 0.3;
  
  return Math.max(0, height);
}

// Apply height map to existing ground mesh
export function applyTerrainToGround(ground: Mesh, trackCenterline: readonly Vector3[], trackHalfWidth: number) {
  const positions = ground.getVerticesData("position");
  const normals = ground.getVerticesData("normal");
  
  if (!positions || !normals) return;
  
  const newPositions = [...positions];
  const newNormals = [...normals];
  
  // Helper to check if point is on track
  const isOnTrack = (x: number, z: number): boolean => {
    for (let i = 0; i < trackCenterline.length - 1; i++) {
      const a = trackCenterline[i];
      const b = trackCenterline[i + 1];
      
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const apx = x - a.x;
      const apz = z - a.z;
      
      const abLen2 = abx * abx + abz * abz;
      const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / abLen2));
      
      const cx = a.x + abx * t;
      const cz = a.z + abz * t;
      const dx = x - cx;
      const dz = z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < trackHalfWidth + 3) return true;
    }
    return false;
  };
  
  // Apply heights
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    
    // Get base height
    let height = getTerrainHeight(x, z, trackHalfWidth);
    
    // Flatten near track - blend smoothly
    if (isOnTrack(x, z)) {
      height *= 0.1; // Mostly flat on track
    }
    
    newPositions[i + 1] = height;
  }
  
  // Recompute normals
  const vertexData = new VertexData();
  vertexData.positions = newPositions;
  
  // Simple normal recalculation
  const subdiv = Math.sqrt(positions.length / 3) - 1;
  const groundWidth = 500;
  const step = groundWidth / subdiv;
  
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    
    // Sample neighboring heights for normal calculation
    const hL = getTerrainHeight(x - step, z, trackHalfWidth);
    const hR = getTerrainHeight(x + step, z, trackHalfWidth);
    const hD = getTerrainHeight(x, z - step, trackHalfWidth);
    const hU = getTerrainHeight(x, z + step, trackHalfWidth);
    
    const nx = (hL - hR) / (2 * step);
    const nz = (hD - hU) / (2 * step);
    const ny = 1;
    
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    newNormals[i] = nx / len;
    newNormals[i + 1] = ny / len;
    newNormals[i + 2] = nz / len;
  }
  
  vertexData.normals = newNormals;
  ground.updateVerticesData("position", newPositions);
  ground.updateVerticesData("normal", newNormals);
}

