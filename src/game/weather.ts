import * as THREE from 'three';

export interface WeatherSystemHandle {
  group: THREE.Group;
  update: (centerX: number, centerY: number, centerZ: number, dt: number, intensity: number) => void;
  dispose: () => void;
}

export function createWeatherSystem(): WeatherSystemHandle {
  const group = new THREE.Group();
  group.name = 'CityWeatherRain';

  // Single-draw-call 3D falling rain volume centered around the player car
  const dropCount = 900;
  const areaW = 54;
  const areaH = 26;
  const positions = new Float32Array(dropCount * 2 * 3);
  const offsets = new Float32Array(dropCount * 3);

  for (let i = 0; i < dropCount; i++) {
    const x = (Math.random() - 0.5) * areaW;
    const y = Math.random() * areaH;
    const z = (Math.random() - 0.5) * areaW;
    offsets[i * 3] = x;
    offsets[i * 3 + 1] = y;
    offsets[i * 3 + 2] = z;

    const vIdx = i * 6;
    positions[vIdx] = x;
    positions[vIdx + 1] = y;
    positions[vIdx + 2] = z;
    positions[vIdx + 3] = x - 0.14;
    positions[vIdx + 4] = y - 1.35;
    positions[vIdx + 5] = z - 0.08;
  }

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);

  const material = new THREE.LineBasicMaterial({
    color: 0xcbe7ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  const rainLines = new THREE.LineSegments(geometry, material);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  group.add(rainLines);

  return {
    group,
    update: (centerX: number, centerY: number, centerZ: number, dt: number, intensity: number) => {
      if (intensity <= 0.02) {
        rainLines.visible = false;
        material.opacity = 0;
        return;
      }

      rainLines.visible = true;
      material.opacity = 0.42 * intensity;
      group.position.set(centerX, centerY, centerZ);

      const fallSpeed = 34.0;
      const windX = -3.8;
      for (let i = 0; i < dropCount; i++) {
        let x = offsets[i * 3] + windX * dt;
        let y = offsets[i * 3 + 1] - fallSpeed * dt;
        const z = offsets[i * 3 + 2];

        if (y < -1) {
          y += areaH;
          x = (Math.random() - 0.5) * areaW;
        }
        if (x < -areaW * 0.5) x += areaW;

        offsets[i * 3] = x;
        offsets[i * 3 + 1] = y;

        const vIdx = i * 6;
        positions[vIdx] = x;
        positions[vIdx + 1] = y;
        positions[vIdx + 2] = z;
        positions[vIdx + 3] = x - 0.16;
        positions[vIdx + 4] = y - 1.45;
        positions[vIdx + 5] = z - 0.08;
      }
      posAttr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
