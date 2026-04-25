import { v4 as uuidv4 } from "uuid";

import { FloorPlan, SceneFile, SceneObject, UseCaseCategory } from "../../types/scene";
import { normalizeSceneFile } from "../scene-validation";

export function runAgent3(params: {
  floorplan: FloorPlan;
  objects: SceneObject[];
  useCaseCategory: UseCaseCategory;
  placementNotes: string;
  useCase: string;
  floorplanImageUrl?: string;
}): SceneFile {
  const { floorplan, objects, useCaseCategory, placementNotes, useCase, floorplanImageUrl } = params;

  const validatedObjects = objects.map((obj) => ({
    ...obj,
    x: Math.max(obj.width / 2, Math.min(floorplan.width - obj.width / 2, obj.x)),
    y: Math.max(obj.depth / 2, Math.min(floorplan.depth - obj.depth / 2, obj.y)),
    z: Math.max(0, obj.z),
    rotation: ((obj.rotation % 360) + 360) % 360,
  }));

  const sceneFile = {
    version: '1.0' as const,
    sceneId: uuidv4(),
    createdAt: new Date().toISOString(),
    floorplan,
    configuration: {
      useCase,
      useCaseCategory,
      objects: validatedObjects,
      placementNotes,
    },
    ...(floorplanImageUrl ? { floorplanImageUrl } : {}),
  };

  return normalizeSceneFile(sceneFile);
}
