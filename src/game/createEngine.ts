import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";

export type CreatedEngine = { engine: AbstractEngine; renderer: "webgpu" | "webgl2" };

export async function createEngine(canvas: HTMLCanvasElement): Promise<CreatedEngine> {
  const webgpuSupported = await WebGPUEngine.IsSupportedAsync;
  if (webgpuSupported) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, adaptToDeviceRatio: true });
      await engine.initAsync();
      return { engine, renderer: "webgpu" };
    } catch (e) {
      console.warn("WebGPU init failed; falling back to WebGL2.", e);
    }
  }

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    disableWebGL2Support: false
  });
  return { engine, renderer: "webgl2" };
}
