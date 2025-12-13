import type { InputState } from "./InputState";

export function attachGamepad(input: InputState) {
  const poll = () => {
    const pads = navigator.getGamepads?.() ?? [];
    const gp = pads.find(Boolean);
    if (gp) {
      const steer = gp.axes?.[0] ?? 0;
      const brake = gp.buttons?.[6]?.value ?? 0;
      const throttle = gp.buttons?.[7]?.value ?? 0;
      const reset = gp.buttons?.[0]?.pressed ?? false;

      const deadzone = 0.08;
      const use = Math.abs(steer) > deadzone || brake > 0.05 || throttle > 0.05;
      if (use) {
        input.steer = Math.abs(steer) < deadzone ? 0 : steer;
        input.brake = brake;
        input.throttle = throttle;
        input.handbrake = gp.buttons?.[1]?.value ?? 0; // B
      }

      if (reset) input.resetPressed = true;
    }
    requestAnimationFrame(poll);
  };

  poll();
}

