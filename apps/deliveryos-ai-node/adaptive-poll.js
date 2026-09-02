'use strict';

class AdaptivePollSchedule {
  constructor(options = {}) {
    this.minimum = Number(options.minimum || 750);
    this.maximum = Number(options.maximum || 15_000);
    this.factor = Number(options.factor || 1.8);
    this.jitterRatio = Number(options.jitterRatio || 0.15);
    this.random = options.random || Math.random;
    this.current = this.minimum;
  }

  next(hadWork) {
    this.current = hadWork ? this.minimum : Math.min(this.maximum, Math.max(this.minimum, this.current * this.factor));
    const jitter = (this.random() * 2 - 1) * this.jitterRatio;
    return Math.max(this.minimum, Math.round(this.current * (1 + jitter)));
  }

  reset() { this.current = this.minimum; }
}

module.exports = { AdaptivePollSchedule };
