import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Effect } from "@babylonjs/core/Materials/effect";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

// Grass blade vertex shader with wind animation
Effect.ShadersStore["grassVertexShader"] = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute vec4 color;

uniform mat4 world;
uniform mat4 viewProjection;
uniform float time;
uniform float windStrength;

varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying float vHeight;

void main() {
    vec3 pos = position;
    vHeight = uv.y;
    
    // Wind animation - stronger at top of blade
    float windInfluence = uv.y * uv.y;
    float windX = sin(time * 2.0 + pos.x * 0.5 + pos.z * 0.3) * windStrength * windInfluence;
    float windZ = cos(time * 1.7 + pos.x * 0.3 + pos.z * 0.5) * windStrength * windInfluence * 0.7;
    
    pos.x += windX;
    pos.z += windZ;
    
    vec4 worldPos = world * vec4(pos, 1.0);
    gl_Position = viewProjection * worldPos;
    
    vNormal = (world * vec4(normal, 0.0)).xyz;
    vUV = uv;
    vColor = color;
}
`;

// Grass blade fragment shader
Effect.ShadersStore["grassFragmentShader"] = `
precision highp float;
varying vec3 vNormal;
varying vec2 vUV;
varying vec4 vColor;
varying float vHeight;

void main() {
    // Gradient from dark at base to bright at tip
    vec3 baseColor = vec3(0.08, 0.2, 0.05);
    vec3 tipColor = vec3(0.3, 0.55, 0.15);
    vec3 grassColor = mix(baseColor, tipColor, vHeight) * vColor.rgb;
    
    // Simple lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));
    float diffuse = max(0.4, dot(normalize(vNormal), lightDir));
    
    // Subsurface scattering simulation
    float sss = pow(max(0.0, dot(normalize(vNormal), -lightDir)), 2.0) * 0.3;
    
    vec3 finalColor = grassColor * (diffuse + sss);
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export function createGrassField(scene: Scene, shadowGen: ShadowGenerator | null): Mesh {
  // Create grass blade geometry
  const bladeCount = 25000;
  const fieldRadius = 120;
  const innerClearRadius = 15; // Clear area around track centre
  
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  
  let vertexIndex = 0;
  
  for (let i = 0; i < bladeCount; i++) {
    // Random position in field
    const angle = Math.random() * Math.PI * 2;
    const radius = innerClearRadius + Math.random() * (fieldRadius - innerClearRadius);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    
    // Skip if too close to track centre area
    if (Math.abs(x) < 85 && Math.abs(z) < 60 && Math.abs(x) > 10 && Math.abs(z) > 10) {
      // This is roughly the track area - still place some grass here
      if (Math.random() > 0.3) continue;
    }
    
    // Grass blade properties
    const bladeHeight = 0.3 + Math.random() * 0.4;
    const bladeWidth = 0.04 + Math.random() * 0.03;
    const rotation = Math.random() * Math.PI * 2;
    const tilt = (Math.random() - 0.5) * 0.3;
    
    // Colour variation
    const colorVar = 0.7 + Math.random() * 0.6;
    const r = colorVar;
    const g = colorVar;
    const b = colorVar;
    
    // Create blade quad (2 triangles)
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    
    // Bottom left
    positions.push(x - bladeWidth * cos, 0, z - bladeWidth * sin);
    normals.push(sin + tilt, 0.8, -cos);
    uvs.push(0, 0);
    colors.push(r * 0.6, g * 0.6, b * 0.6, 1);
    
    // Bottom right
    positions.push(x + bladeWidth * cos, 0, z + bladeWidth * sin);
    normals.push(sin + tilt, 0.8, -cos);
    uvs.push(1, 0);
    colors.push(r * 0.6, g * 0.6, b * 0.6, 1);
    
    // Top middle
    positions.push(x + tilt * bladeHeight, bladeHeight, z);
    normals.push(sin, 0.9, -cos);
    uvs.push(0.5, 1);
    colors.push(r, g, b, 1);
    
    // Triangle
    indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
    vertexIndex += 3;
  }
  
  // Create mesh
  const grassMesh = new Mesh("grassField", scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.uvs = uvs;
  vertexData.colors = colors;
  vertexData.indices = indices;
  vertexData.applyToMesh(grassMesh);
  
  // Create shader material
  const grassMat = new ShaderMaterial("grassMat", scene, {
    vertex: "grass",
    fragment: "grass"
  }, {
    attributes: ["position", "normal", "uv", "color"],
    uniforms: ["world", "viewProjection", "time", "windStrength"]
  });
  
  grassMat.backFaceCulling = false;
  grassMesh.material = grassMat;
  
  // Animate wind
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += scene.getEngine().getDeltaTime() * 0.001;
    grassMat.setFloat("time", time);
    grassMat.setFloat("windStrength", 0.15);
  });
  
  return grassMesh;
}

