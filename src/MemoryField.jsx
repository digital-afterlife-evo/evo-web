import { useEffect, useRef } from 'react';

export default function MemoryField({ motion }) {
  const canvas = useRef(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element.getContext('2d');
    if (!context) return;
    let width = 0, height = 0, frame, last = 0, elapsed = 0, previous = '', visible = !document.hidden;
    // A fixed seed keeps the installation stable across resizes and scene changes.
    const points = Array.from({ length: 1500 }, (_, i) => ({ angle: i * 2.399963, radius: Math.sqrt((i + .5) / 1500), seed: (i * 137.508 % 100) / 100, loop: i / 1500 * Math.PI * 2 }));
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      element.width = width * ratio; element.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      previous = '';
    };
    const visibility = () => { visible = !document.hidden; last = 0; if (visible) frame = requestAnimationFrame(draw); else cancelAnimationFrame(frame); };
    const draw = now => {
      if (!visible) return;
      frame = requestAnimationFrame(draw);
      if (now - last < 30) return;
      const { progress, reduced, x, y, burst } = motion.current;
      const still = reduced;
      if (!still && last) elapsed += Math.min(now - last, 60) / 1000;
      last = now;
      // The typewriter scenes use film strips; retain particles only for the existing evolution chapter.
      if (progress < 1.5 || progress >= 2.5) {
        if (previous !== 'hidden') context.clearRect(0, 0, width, height);
        previous = 'hidden';
        return;
      }
      const signature = `${progress.toFixed(3)}:${width}:${height}`;
      if (still && signature === previous) return;
      previous = signature;
      context.clearRect(0, 0, width, height);
      const pale = progress > .5 && progress < 1.5;
      context.fillStyle = pale ? '#173bb6' : '#f5f2ea';
      const evolution = Math.max(0, 1 - Math.abs(progress - 2));
      const explosion = burst && !still ? Math.min(1, (now - burst) / 850) : 0;
      const centerX = width * (width < 768 ? .56 : .67) + x * 18;
      const centerY = height * (width < 768 ? (progress < .5 ? .4 : .32) : .49) + y * 18;
      const size = Math.min(width * (width < 768 ? .61 : .31), height * .47);
      const count = width < 768 ? 750 : points.length;
      for (let i = 0; i < count; i++) {
        const point = points[Math.floor(i / count * points.length)];
        const angle = point.angle + elapsed * (.065 + point.seed * .025) + progress * .8;
        const radius = size * (.62 + point.radius * .56) * (1 + explosion * 4);
        const turn = elapsed * .18 + x * .5;
        const tube = .16 + point.seed * .2;
        const loop = point.loop + elapsed * .08;
        const reach = 1.6 + .55 * Math.cos(loop * 3) + tube * Math.cos(point.angle);
        const knotX = reach * Math.cos(loop * 2);
        const knotY = reach * Math.sin(loop * 2);
        const knotZ = .8 * Math.sin(loop * 3) + tube * Math.sin(point.angle);
        const projectedX = knotX * Math.cos(turn) - knotZ * Math.sin(turn);
        const projectedZ = knotX * Math.sin(turn) + knotZ * Math.cos(turn);
        const perspective = 3.8 / (3.8 + projectedZ * .35);
        const ringX = Math.cos(angle) * radius;
        const ringY = Math.sin(angle) * radius * .74;
        const formX = projectedX * size * .47 * perspective;
        const formY = (knotY * .78 + projectedZ * .24) * size * .47 * perspective;
        const px = centerX + ringX * (1 - evolution) + formX * evolution;
        const py = centerY + ringY * (1 - evolution) + formY * evolution;
        const depth = (Math.sin(angle) + 1) / 2;
        context.globalAlpha = (.12 + depth * .6 + evolution * .2) * (1 - explosion);
        const dot = (.6 + point.seed * 1.8) * (1 + evolution * .5);
        context.fillRect(px, py, dot, dot);
        if (evolution > .4 && i % 19 === 0) {
          context.globalAlpha *= .22;
          context.fillRect(px, py, (centerX - px) * .24, .5);
        }
      }
      context.globalAlpha = 1;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element); resize();
    document.addEventListener('visibilitychange', visibility);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); };
  }, [motion]);
  return <canvas className="memory-field" ref={canvas} aria-hidden="true" />;
}
