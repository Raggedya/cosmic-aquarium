'use client';

import { useEffect, useRef } from 'react';
import { awakeningDurationMs } from '@/src/features/spectrum/awakening';

interface SpectrumCanvasProps {
  point: { x: number; y: number };
  active: boolean;
  awakening: boolean;
}

const vertexShader = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentShader = `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uTime;
uniform float uActive;
uniform float uAwakening;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.04 + vec2(4.7, 8.3);
    amplitude *= 0.48;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv.y = 1.0 - uv.y;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 centred = (uv - 0.5) * aspect;

  float slowTime = uTime * 0.045;
  float current = fbm(centred * 3.1 + vec2(slowTime, -slowTime * 0.7));
  float fine = fbm(centred * 7.0 + vec2(-slowTime * 0.8, slowTime));
  float depth = smoothstep(-0.24, 0.78, current * 0.72 + fine * 0.28);

  vec3 abyss = vec3(0.002, 0.006, 0.018);
  vec3 midnight = vec3(0.005, 0.027, 0.085);
  vec3 colour = mix(abyss, midnight, depth * 0.78);
  colour += vec3(0.0, 0.012, 0.042) * smoothstep(0.35, 0.88, fine);

  vec2 pointerDelta = (uv - uPointer) * aspect;
  float pointerDistance = length(pointerDelta);
  float rippleOne = sin(pointerDistance * 118.0 - uTime * 9.4);
  float rippleTwo = sin(pointerDistance * 71.0 - uTime * 6.8 + 1.2);
  float envelope = exp(-pointerDistance * 8.0) * smoothstep(0.34, 0.015, pointerDistance);
  float rings = (rippleOne * 0.62 + rippleTwo * 0.38) * envelope * uActive;
  float crest = max(0.0, rings);
  float trough = max(0.0, -rings);
  float fingertip = exp(-pointerDistance * 34.0) * uActive;

  colour += vec3(0.035, 0.19, 0.52) * crest * 0.62;
  colour -= vec3(0.0, 0.012, 0.035) * trough * 0.55;
  colour += vec3(0.22, 0.58, 1.0) * fingertip * 0.28;

  float awakeningProgress = clamp(uAwakening, 0.0, 1.0);
  float awakeningRadius = mix(0.012, 0.74, awakeningProgress);
  float awakeningEnvelope = 1.0 - smoothstep(0.62, 1.0, awakeningProgress);
  float awakeningRing = exp(-abs(pointerDistance - awakeningRadius) * 48.0) * awakeningEnvelope;
  float awakeningWake = exp(-pointerDistance * 3.7) * sin(pointerDistance * 68.0 - awakeningProgress * 17.0);
  colour += vec3(0.045, 0.24, 0.68) * awakeningRing * 0.82;
  colour += vec3(0.018, 0.095, 0.28) * max(0.0, awakeningWake) * awakeningEnvelope * 0.25;

  float edge = smoothstep(0.36, 0.78, length((uv - 0.5) * vec2(0.82, 1.0)));
  colour *= 1.0 - edge * 0.42;
  float grain = hash(gl_FragCoord.xy + floor(uTime * 12.0)) - 0.5;
  colour += grain * 0.007;
  gl_FragColor = vec4(max(colour, 0.0), 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function SpectrumCanvas({ point, active, awakening }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointRef = useRef(point);
  const activeRef = useRef(active);
  const awakeningRef = useRef(awakening);
  const awakeningStartedAtRef = useRef(0);
  const redrawRef = useRef<() => void>(() => undefined);

  useEffect(() => { pointRef.current = point; redrawRef.current(); }, [point]);
  useEffect(() => { activeRef.current = active; redrawRef.current(); }, [active]);
  useEffect(() => {
    if (awakening && !awakeningRef.current) awakeningStartedAtRef.current = performance.now();
    awakeningRef.current = awakening;
    redrawRef.current();
  }, [awakening]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, 'aPosition');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const resolution = gl.getUniformLocation(program, 'uResolution');
    const pointer = gl.getUniformLocation(program, 'uPointer');
    const time = gl.getUniformLocation(program, 'uTime');
    const activeUniform = gl.getUniformLocation(program, 'uActive');
    const awakeningUniform = gl.getUniformLocation(program, 'uAwakening');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let visible = document.visibilityState === 'visible';

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const draw = (now: number) => {
      resize();
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform2f(pointer, pointRef.current.x, pointRef.current.y);
      gl.uniform1f(time, reducedMotion.matches ? 0 : now / 1000);
      gl.uniform1f(activeUniform, activeRef.current ? 1 : 0);
      const awakeningProgress = awakeningRef.current
        ? (reducedMotion.matches ? .24 : Math.min(1, (now - awakeningStartedAtRef.current) / awakeningDurationMs))
        : 2;
      gl.uniform1f(awakeningUniform, awakeningProgress);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible && !reducedMotion.matches) frame = window.requestAnimationFrame(draw);
    };

    const restart = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    };
    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      if (visible) restart();
      else window.cancelAnimationFrame(frame);
    };
    redrawRef.current = restart;
    reducedMotion.addEventListener('change', restart);
    document.addEventListener('visibilitychange', onVisibility);
    restart();

    return () => {
      window.cancelAnimationFrame(frame);
      redrawRef.current = () => undefined;
      reducedMotion.removeEventListener('change', restart);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, []);

  return <canvas ref={canvasRef} className="spectrum-canvas" aria-hidden="true" />;
}
