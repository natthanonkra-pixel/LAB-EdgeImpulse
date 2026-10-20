const WINDOW_MS = 8_000;
const AXES = [
  { key: 'acc_x', colorToken: '--dashboard-chart-x' },
  { key: 'acc_y', colorToken: '--dashboard-chart-y' },
  { key: 'acc_z', colorToken: '--dashboard-chart-z' },
];

export class AccelerationChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    this.colors = Object.fromEntries(
      AXES.map((axis) => [axis.key, styles.getPropertyValue(axis.colorToken).trim()])
    );
    this.gridColor = styles.getPropertyValue('--dashboard-chart-grid').trim();
    this.labelColor = styles.getPropertyValue('--dashboard-chart-label').trim();
    this.fontSize = styles.getPropertyValue('--dashboard-chart-font-size').trim();
    this.fontFamily = styles.getPropertyValue('--dashboard-chart-font-family').trim();
    this.points = [];
    this.animationFrame = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.animate = this.animate.bind(this);
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  addSample(timestamp, values) {
    let sample = this.points.find((point) => point.timestamp === timestamp);
    if (!sample) {
      sample = { timestamp, values: {} };
      this.points.push(sample);
      this.points.sort((left, right) => left.timestamp - right.timestamp);
    }

    for (const axis of AXES) {
      if (Number.isFinite(values[axis.key])) {
        sample.values[axis.key] = values[axis.key];
      }
    }

    this.prune(Date.now());
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(bounds.width * pixelRatio);
    this.canvas.height = Math.round(bounds.height * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.draw(Date.now());
  }

  prune(now) {
    const cutoff = now - WINDOW_MS;
    this.points = this.points.filter((point) => point.timestamp >= cutoff && point.timestamp <= now);
  }

  draw(now) {
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }

    this.prune(now);
    const context = this.context;
    const width = bounds.width;
    const height = bounds.height;
    const plot = {
      left: 2.5 * 16,
      right: width - 12,
      top: 12,
      bottom: height - 22,
    };
    const plotWidth = Math.max(0, plot.right - plot.left);
    const plotHeight = Math.max(0, plot.bottom - plot.top);

    context.clearRect(0, 0, width, height);
    context.font = `${this.fontSize} ${this.fontFamily}`;
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.lineWidth = 1;

    for (const value of [16, 8, 0, -8, -16]) {
      const y = plot.top + ((16 - value) / 32) * plotHeight;
      context.beginPath();
      context.strokeStyle = this.gridColor;
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = this.labelColor;
      context.fillText(String(value), plot.left - 7, y);
    }

    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = this.labelColor;
    context.fillText('-8 s', plot.left, height - 5);
    context.textAlign = 'right';
    context.fillText('now', plot.right, height - 5);

    for (const axis of AXES) {
      context.beginPath();
      context.strokeStyle = this.colors[axis.key];
      context.lineWidth = 2;
      context.lineJoin = 'round';
      context.lineCap = 'round';
      let started = false;

      for (const point of this.points) {
        const value = point.values[axis.key];
        if (!Number.isFinite(value)) {
          started = false;
          continue;
        }

        const x = plot.left + ((point.timestamp - (now - WINDOW_MS)) / WINDOW_MS) * plotWidth;
        const y = plot.top + ((16 - value) / 32) * plotHeight;
        if (started) {
          context.lineTo(x, y);
        } else {
          context.moveTo(x, y);
          started = true;
        }
      }

      context.stroke();
    }
  }

  animate() {
    this.draw(Date.now());
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.points = [];
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}