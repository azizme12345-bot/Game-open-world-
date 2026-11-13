import * as THREE from 'three';
import { createSkeletalHumanCharacter, type HumanPoseMode } from './humanCharacter';

export type { HumanPoseMode };

export interface PlayerCharacterHandle {
  group: THREE.Group;
  update: (
    elapsedTime: number,
    dt: number,
    moveSpeed: number,
    isRunning: boolean,
    jumpOffset: number,
    isArrested: boolean,
    poseMode?: HumanPoseMode,
    steerHint?: number
  ) => void;
  dispose: () => void;
}

export function createPlayerCharacter(contactShadowTex: THREE.Texture): PlayerCharacterHandle {
  const human = createSkeletalHumanCharacter({
    role: 'player',
    contactShadowTex,
    jacketColor: 0x0284c7,
    shirtColor: 0xf8fafc,
    pantsColor: 0x1e293b,
    skinColor: 0xf7d4b6,
    hairColor: 0x201815,
    eyeColor: 0x1d6fa5,
  });

  return {
    group: human.group,
    update: (
      elapsedTime: number,
      dt: number,
      moveSpeed: number,
      isRunning: boolean,
      jumpOffset: number,
      isArrested: boolean,
      poseMode?: HumanPoseMode,
      steerHint = 0
    ) => {
      const resolvedMode: HumanPoseMode = isArrested
        ? 'arrested'
        : poseMode ?? 'locomotion';
      human.update(elapsedTime, dt, moveSpeed, isRunning, jumpOffset, resolvedMode, steerHint);
    },
    dispose: () => {
      human.dispose();
    },
  };
}
