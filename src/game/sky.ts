import * as THREE from 'three';

export interface SkyDomeHandle {
  mesh: THREE.Mesh;
  update: (elapsedTime: number) => void;
  setAtmosphere: (
    sunDir: THREE.Vector3,
    sunsetFactor: number,
    nightFactor: number,
    rainFactor: number
  ) => void;
  dispose: () => void;
}

export function createAnimeSkyDome(sunDirection: THREE.Vector3): SkyDomeHandle {
  const geometry = new THREE.SphereGeometry(480, 36, 24);

  const dayZenith = new THREE.Color(0x1b68d6);
  const dayMid = new THREE.Color(0x5fb4fa);
  const dayHorizon = new THREE.Color(0xd6efff);

  const sunsetZenith = new THREE.Color(0x283475);
  const sunsetMid = new THREE.Color(0xe06b76);
  const sunsetHorizon = new THREE.Color(0xffb878);

  const nightZenith = new THREE.Color(0x050a1b);
  const nightMid = new THREE.Color(0x0f1c3d);
  const nightHorizon = new THREE.Color(0x1b2b52);

  const rainTint = new THREE.Color(0x5f7087);

  const uniforms = {
    uSunDir: { value: sunDirection.clone().normalize() },
    uTime: { value: 0 },
    uNightFactor: { value: 0 },
    uRainFactor: { value: 0 },
    uSunsetFactor: { value: 0 },
    uZenithColor: { value: dayZenith.clone() },
    uMidSkyColor: { value: dayMid.clone() },
    uHorizonColor: { value: dayHorizon.clone() },
    uSunGlowColor: { value: new THREE.Color(0xfff4d6) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uNightFactor;
      uniform float uRainFactor;
      uniform float uSunsetFactor;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;

      varying vec3 vWorldDir;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        vec3 sky = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.26, h));
        sky = mix(sky, uZenithColor, smoothstep(0.22, 0.88, h));

        // Crisp sun disc + atmospheric Mie halo
        vec3 sDir = normalize(uSunDir);
        float sunDot = max(dot(dir, sDir), 0.0);
        float dayVisibility = (1.0 - uNightFactor * 0.92) * (1.0 - uRainFactor * 0.78);
        vec3 glowCol = mix(uSunGlowColor, vec3(1.0, 0.65, 0.4), uSunsetFactor);
        sky += glowCol * pow(sunDot, 7.0) * 0.34 * dayVisibility;
        sky += vec3(1.0, 0.98, 0.93) * smoothstep(0.9965, 0.9994, sunDot) * 1.25 * dayVisibility;

        // Clear night starfield + soft moon glow
        if (uNightFactor > 0.12 && dir.y > 0.05) {
          vec2 starUv = floor(dir.xz / (dir.y + 0.32) * 125.0);
          float starVal = hash(starUv);
          if (starVal > 0.991) {
            float twinkle = 0.6 + 0.4 * sin(uTime * 2.4 + starVal * 110.0);
            sky += vec3(0.88, 0.94, 1.0) * uNightFactor * (1.0 - uRainFactor) * twinkle * smoothstep(0.05, 0.24, dir.y);
          }
        }

        // Layered high-definition anime cumulus & wispy cirrus clouds with sunlit silver-gold rims
        if (dir.y > 0.025) {
          vec2 baseUv = dir.xz / (dir.y + 0.20);
          float cirrus = fbm(baseUv * 2.4 + vec2(uTime * 0.003, -uTime * 0.0015));
          float cirrusMask = smoothstep(0.56, 0.78, cirrus) * smoothstep(0.05, 0.30, dir.y) * 0.28 * (1.0 - uNightFactor * 0.7);
          sky = mix(sky, mix(vec3(0.92, 0.97, 1.0), vec3(1.0, 0.86, 0.76), uSunsetFactor), cirrusMask);

          vec2 cloudUv = baseUv * 1.08 + vec2(uTime * 0.0055, uTime * 0.0025);
          float c = fbm(cloudUv);
          float cRim = fbm(cloudUv + sDir.xz * 0.08);
          float coverShift = uRainFactor * 0.18;
          float cloudMask = smoothstep(0.55 - coverShift, 0.70 - coverShift * 0.5, c) *
                            smoothstep(0.025, 0.16, dir.y) *
                            (0.84 + uRainFactor * 0.14);

          float rimHighlight = clamp((c - cRim) * 3.8 + 0.5, 0.0, 1.0);
          vec3 cloudShadowCol = mix(vec3(0.70, 0.82, 0.96), vec3(0.75, 0.54, 0.65), uSunsetFactor);
          vec3 cloudBrightCol = mix(vec3(1.0, 0.995, 0.98), vec3(1.0, 0.84, 0.68), uSunsetFactor);
          vec3 cloudDay = mix(cloudShadowCol, cloudBrightCol, smoothstep(0.35, 0.82, rimHighlight + sunDot * 0.25));
          vec3 cloudDark = mix(vec3(0.13, 0.18, 0.28), vec3(0.24, 0.30, 0.42), smoothstep(0.55, 0.76, c));
          vec3 cloudLit = mix(cloudDay, cloudDark, clamp(uNightFactor * 0.85 + uRainFactor * 0.68, 0.0, 1.0));
          sky = mix(sky, cloudLit, cloudMask);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;

  return {
    mesh,
    update: (elapsedTime: number) => {
      uniforms.uTime.value = elapsedTime;
    },
    setAtmosphere: (
      sunDir: THREE.Vector3,
      sunsetFactor: number,
      nightFactor: number,
      rainFactor: number
    ) => {
      uniforms.uSunDir.value.copy(sunDir).normalize();
      uniforms.uNightFactor.value = nightFactor;
      uniforms.uRainFactor.value = rainFactor;
      uniforms.uSunsetFactor.value = sunsetFactor;

      uniforms.uZenithColor.value
        .copy(dayZenith)
        .lerp(sunsetZenith, sunsetFactor)
        .lerp(nightZenith, nightFactor)
        .lerp(rainTint, rainFactor * 0.55);

      uniforms.uMidSkyColor.value
        .copy(dayMid)
        .lerp(sunsetMid, sunsetFactor)
        .lerp(nightMid, nightFactor)
        .lerp(rainTint, rainFactor * 0.62);

      uniforms.uHorizonColor.value
        .copy(dayHorizon)
        .lerp(sunsetHorizon, sunsetFactor)
        .lerp(nightHorizon, nightFactor)
        .lerp(rainTint, rainFactor * 0.68);
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
