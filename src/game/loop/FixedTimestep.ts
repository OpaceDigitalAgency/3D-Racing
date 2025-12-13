export class FixedTimestep {
  private accumulator = 0;
  constructor(private readonly stepSizeSeconds: number) {}

  step(deltaSeconds: number, tick: (dt: number) => void) {
    this.accumulator += Math.min(deltaSeconds, 0.1);
    while (this.accumulator >= this.stepSizeSeconds) {
      tick(this.stepSizeSeconds);
      this.accumulator -= this.stepSizeSeconds;
    }
  }
}

