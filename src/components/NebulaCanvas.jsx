import { useEffect, useRef } from 'react'

/* ═══════════════════════════════════════════════════════════════════════
   NebulaCanvas · WebGL 实时星云背景
   ─────────────────────────────────────────────────────────────────────
   轻量级 Fragment Shader，~4KB，不依赖 Three.js。
   渲染缓慢漂移的金色/青色/洋红能量星云，鼠标移动产生引力扭曲。
   不支持 WebGL 的设备静默回退（不渲染任何内容，由 CSS 背景兜底）。
   ═══════════════════════════════════════════════════════════════════════ */

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG = `
precision mediump float;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++){
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = uv * 3.0;
  float t = u_time * 0.06;

  vec2 mouseUV = u_mouse / u_res;
  float mouseDist = length(uv - mouseUV);
  float mouseGlow = exp(-mouseDist * 4.0) * 0.22;

  float n1 = fbm(p + vec2(t, t * 0.7));
  float n2 = fbm(p * 1.5 - vec2(t * 0.4, t * 0.3) + n1 * 0.4);
  float n3 = fbm(p * 0.6 + vec2(t * 0.2, -t * 0.4) + n2 * 0.3);

  float nebula = n1 * 0.45 + n2 * 0.35 + n3 * 0.2 + mouseGlow;

  vec3 col = vec3(0.025, 0.018, 0.038);

  vec3 gold = vec3(0.85, 0.55, 0.08);
  col = mix(col, gold * 0.5, smoothstep(0.35, 0.48, nebula));

  vec3 cyan = vec3(0.05, 0.75, 0.85);
  col = mix(col, cyan * 0.35, smoothstep(0.45, 0.58, nebula));

  vec3 magenta = vec3(0.75, 0.05, 0.45);
  col = mix(col, magenta * 0.3, smoothstep(0.55, 0.70, nebula));

  float star = pow(hash(gl_FragCoord.xy * 0.015 + floor(t * 0.1)), 60.0);
  col += vec3(star * 0.9);

  float vig = 1.0 - length(uv - 0.5) * 0.7;
  col *= vig;

  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[Nebula] shader compile:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export default function NebulaCanvas() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const targetMouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) {
      console.warn('[Nebula] WebGL not supported, using CSS fallback')
      return
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[Nebula] program link:', gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    // Full-screen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uTime = gl.getUniformLocation(program, 'u_time')
    const uRes = gl.getUniformLocation(program, 'u_res')
    const uMouse = gl.getUniformLocation(program, 'u_mouse')

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      targetMouseRef.current.x = e.clientX * dpr
      targetMouseRef.current.y = (window.innerHeight - e.clientY) * dpr
    }
    window.addEventListener('mousemove', onMove)

    // Touch support
    const onTouch = (e) => {
      if (e.touches.length > 0) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        targetMouseRef.current.x = e.touches[0].clientX * dpr
        targetMouseRef.current.y = (window.innerHeight - e.touches[0].clientY) * dpr
      }
    }
    window.addEventListener('touchmove', onTouch, { passive: true })

    const startTime = performance.now()

    function frame() {
      const t = (performance.now() - startTime) / 1000

      // Smooth mouse follow (lerp)
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.04
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.04

      gl.uniform1f(uTime, t)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uMouse, mouseRef.current.x, mouseRef.current.y)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouch)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  )
}
