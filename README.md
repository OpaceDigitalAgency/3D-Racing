# 3D-Racing

Advanced 3D racing game prototype (WebGPU when available, WebGL2 fallback).

## Run

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Controls

- Drive: `WASD` / Arrow keys
- Handbrake: `Space`
- Reset: `R` (or UI button)
- Camera: `C` to cycle views (Chase, Driver, Hood, Bumper, Orbit, Top)
- Mouse: Scroll to zoom, drag to rotate (in Orbit mode)
- Gamepad: left stick steer, triggers throttle/brake, `A` reset

## Features

- Futuristic car with PBR materials and LED lighting
- 3D grass with wind animation
- Water puddles with reflections and ripples
- HDR environment lighting with atmospheric fog
- Multiple camera views
- High quality post-processing (bloom, chromatic aberration, film grain)

## Notes

- Environment lighting uses `public/env/environmentSpecular.env` (Babylon environment map).
- No backend: time trial + best lap are local-only right now.
