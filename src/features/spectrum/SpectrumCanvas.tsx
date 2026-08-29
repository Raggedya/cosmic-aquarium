'use client';

import { useEffect, useRef } from 'react';

interface SpectrumCanvasProps {
  point: { x: number; y: number };
  active: boolean;
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
  float amplitude = 0.52;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(7.1, 3.7);
    amplitude *= 0.48;
  }
  return value;
}

vec3 palette(float t) {
  vec3 a = vec3(0.53, 0.47, 0.51);
  vec3 b = vec3(0.48, 0.46, 0.44);
  vec3 c = vec3(1.0);
  vec3 d = vec3(0.11, 0.30, 0.56);
  return a + b * cos(6.2831853 * (c * t + d));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  uv.y = 1.0 - uv.y;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 p = (uv - vec2(0.5, 0.53)) * aspect;
  float radius = length(p);
  float angle = atan(p.y, p.x) / 6.2831853 + 0.5;

  float drift = uTime * 0.018;
  float current = fbm(vec2(angle * 9.0 + drift, radius * 7.0 - drift * 1.6));
  float fine = fbm(p * 8.0 + vec2(-drift, drift));
  float warpedAngle = angle + (current - 0.5) * 0.095 + (fine - 0.5) * 0.028;
  vec3 colour = palette(warpedAngle + 0.07);
  colour *= 0.72 + current * 0.55;

  float core = smoothstep(0.055, 0.34, radius);
  core *= 0.91 + 0.09 * smoothstep(0.1, 0.7, fine);
  colour *= core;

  float outerLight = smoothstep(0.18, 0.69, radius);
  colour *= 0.72 + outerLight * 0.42;

  vec2 pointerDelta = (uv - uPointer) * aspect;
  float pointerDistance = length(pointerDelta);
  float lens = exp(-pointerDistance * 15.0);
  float halo = exp(-abs(pointerDistance - 0.055) * 92.0);
  colour += vec3(0.42, 0.48, 0.55) * lens * (0.12 + uActive * 0.28);
  colour += vec3(0.72, 0.82, 1.0) * halo * (0.035 + uActive * 0.07);

  float grain = hash(gl_FragCoord.xy + uTime) - 0.5;
  colour += grain * 0.018;
  colour *= 1.0 - smoothstep(0.38, 0.84, length((uv - 0.5) * vec2(0.78, 1.0))) * 0.16;
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

export function SpectrumCanvas({ point, active }: SpectrumCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointRef = useRef(point);
  const activeRef = useRef(active);

  useEffect(() => { pointRef.current = point; }, [point]);
  useEffect(() => { activeRef.current = active; }, [active]);

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
    reducedMotion.addEventListener('change', restart);
    document.addEventListener('visibilitychange', onVisibility);
    restart();

    return () => {
      window.cancelAnimationFrame(frame);
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
