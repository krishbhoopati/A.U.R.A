import {
  FloorPlan,
  Room,
  RoomType,
  SceneFile,
  SceneObject,
  UseCaseCategory,
  ObjectType,
  Wall,
  StaircaseLocation,
} from "@/types/scene";

const ROOM_TYPES = [
  "main_hall",
  "corridor",
  "bathroom",
  "storage",
  "kitchen",
  "office",
  "entrance",
  "unknown",
] as const satisfies readonly RoomType[];

const OBJECT_TYPES = [
  "table",
  "chair",
  "stage",
  "booth",
  "desk",
  "podium",
  "screen",
  "workstation",
  "shelf",
  "counter",
  "equipment",
  "plant",
  "divider",
  "entrance_marker",
  "staircase",
] as const satisfies readonly ObjectType[];

const USE_CASE_CATEGORIES = [
  "event",
  "hackathon",
  "office",
  "factory",
  "classroom",
  "retail",
  "other",
] as const satisfies readonly UseCaseCategory[];

type UnknownRecord = Record<string, unknown>;

export function cleanGeminiJsonResponse(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
}

export function parseGeminiJsonResponse(text: string): unknown {
  const cleaned = cleanGeminiJsonResponse(text);

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.substring(0, 500)}`);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, field: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`${field} must be an object`);
  }

  return value;
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error(`${field} must be a finite number`);
}

function readPositiveNumber(value: unknown, field: string): number {
  const parsed = readFiniteNumber(value, field);
  if (parsed <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }

  return parsed;
}

function readString(
  value: unknown,
  field: string,
  options?: { allowEmpty?: boolean; defaultValue?: string },
): string {
  if (typeof value !== "string") {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new Error(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!options?.allowEmpty && trimmed.length === 0) {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new Error(`${field} must not be empty`);
  }

  return options?.allowEmpty ? value : trimmed;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  options?: { defaultValue?: T },
): T {
  if (value === undefined || value === null) {
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (allowed.includes(trimmed as T)) {
      return trimmed as T;
    }
    // Try lowercased + underscored normalization for tolerance.
    const normalized = trimmed.toLowerCase().replace(/[\s-]+/g, "_");
    if (allowed.includes(normalized as T)) {
      return normalized as T;
    }
    if (options?.defaultValue !== undefined) {
      return options.defaultValue;
    }
    throw new Error(`${field} must be one of: ${allowed.join(", ")} (got: ${trimmed})`);
  }

  if (options?.defaultValue !== undefined) {
    return options.defaultValue;
  }
  throw new Error(`${field} must be one of: ${allowed.join(", ")}`);
}

function clampConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function buildBoundingWalls(width: number, depth: number, height = 3): Wall[] {
  return [
    { x1: 0, y1: 0, x2: width, y2: 0, height },
    { x1: width, y1: 0, x2: width, y2: depth, height },
    { x1: width, y1: depth, x2: 0, y2: depth, height },
    { x1: 0, y1: depth, x2: 0, y2: 0, height },
  ];
}

function normalizeRoom(value: unknown, index: number): Room {
  const room = expectRecord(value, `floorplan.rooms[${index}]`);
  const polygon = Array.isArray(room.polygon)
    ? (room.polygon as unknown[])
        .filter(
          (pt) =>
            isRecord(pt) &&
            typeof (pt as Record<string, unknown>).x === "number" &&
            typeof (pt as Record<string, unknown>).y === "number",
        )
        .map((pt) => ({
          x: (pt as Record<string, unknown>).x as number,
          y: (pt as Record<string, unknown>).y as number,
        }))
    : undefined;

  return {
    id: readString(room.id, `floorplan.rooms[${index}].id`, { defaultValue: `room_${index + 1}` }),
    name: readString(room.name, `floorplan.rooms[${index}].name`, { defaultValue: `Room ${index + 1}` }),
    x: readFiniteNumber(room.x, `floorplan.rooms[${index}].x`),
    y: readFiniteNumber(room.y, `floorplan.rooms[${index}].y`),
    width: readPositiveNumber(room.width, `floorplan.rooms[${index}].width`),
    height: readPositiveNumber(room.height, `floorplan.rooms[${index}].height`),
    type: readEnumValue(room.type, `floorplan.rooms[${index}].type`, ROOM_TYPES, { defaultValue: "unknown" }),
    ...(polygon && polygon.length >= 3 ? { polygon } : {}),
  };
}

function normalizeWall(value: unknown, index: number): Wall {
  const wall = expectRecord(value, `floorplan.walls[${index}]`);
  return {
    x1: readFiniteNumber(wall.x1, `floorplan.walls[${index}].x1`),
    y1: readFiniteNumber(wall.y1, `floorplan.walls[${index}].y1`),
    x2: readFiniteNumber(wall.x2, `floorplan.walls[${index}].x2`),
    y2: readFiniteNumber(wall.y2, `floorplan.walls[${index}].y2`),
    height: wall.height === undefined ? 3 : readPositiveNumber(wall.height, `floorplan.walls[${index}].height`),
  };
}

export function normalizeFloorPlan(input: unknown): FloorPlan {
  const floorplan = expectRecord(input, "floorplan");
  const width = readPositiveNumber(floorplan.width, "floorplan.width");
  const depth = readPositiveNumber(floorplan.depth, "floorplan.depth");

  if (!Array.isArray(floorplan.rooms) || floorplan.rooms.length === 0) {
    throw new Error("Agent 1 detected no rooms in the floor plan");
  }

  const rooms = floorplan.rooms.map((room, index) => normalizeRoom(room, index));
  const walls =
    Array.isArray(floorplan.walls) && floorplan.walls.length > 0
      ? floorplan.walls.map((wall, index) => normalizeWall(wall, index))
      : buildBoundingWalls(width, depth);

  return {
    width,
    depth,
    rooms,
    walls,
    scale:
      floorplan.scale === undefined
        ? 10
        : (() => {
            try {
              return readPositiveNumber(floorplan.scale, "floorplan.scale");
            } catch {
              return 10;
            }
          })(),
    confidence: clampConfidence(floorplan.confidence),
    notes: readString(floorplan.notes, "floorplan.notes", { allowEmpty: true, defaultValue: "" }),
    staircases: Array.isArray(floorplan.staircases)
      ? (floorplan.staircases as StaircaseLocation[]).filter(
          (s) =>
            typeof s.x === "number" &&
            typeof s.y === "number" &&
            typeof s.width === "number" &&
            typeof s.depth === "number" &&
            typeof s.rotation === "number",
        )
      : [],
  };
}

function normalizeSceneObject(
  value: unknown,
  index: number,
  roomIds: Set<string>,
  fieldPrefix: string,
): SceneObject {
  const object = expectRecord(value, `${fieldPrefix}[${index}]`);
  const roomIdRaw = readString(object.roomId, `${fieldPrefix}[${index}].roomId`, { defaultValue: "" });
  const roomId = roomIds.has(roomIdRaw) ? roomIdRaw : Array.from(roomIds)[0];

  return {
    id: readString(object.id, `${fieldPrefix}[${index}].id`, { defaultValue: `obj_${index + 1}` }),
    type: readEnumValue(object.type, `${fieldPrefix}[${index}].type`, OBJECT_TYPES),
    roomId,
    x: readFiniteNumber(object.x, `${fieldPrefix}[${index}].x`),
    y: readFiniteNumber(object.y, `${fieldPrefix}[${index}].y`),
    z: readFiniteNumber(object.z ?? 0, `${fieldPrefix}[${index}].z`),
    width: readPositiveNumber(object.width, `${fieldPrefix}[${index}].width`),
    depth: readPositiveNumber(object.depth, `${fieldPrefix}[${index}].depth`),
    height: readPositiveNumber(object.height, `${fieldPrefix}[${index}].height`),
    rotation: readFiniteNumber(object.rotation ?? 0, `${fieldPrefix}[${index}].rotation`),
    label: readString(object.label, `${fieldPrefix}[${index}].label`),
    color: readOptionalString(object.color),
  };
}

function normalizeSceneObjects(
  value: unknown,
  roomIds: Set<string>,
  field: string,
): SceneObject[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must contain at least one object`);
  }

  return value.map((object, index) => normalizeSceneObject(object, index, roomIds, field));
}

export function normalizeAgent2Output(
  input: unknown,
  floorplan: FloorPlan,
): { objects: SceneObject[]; useCaseCategory: UseCaseCategory; placementNotes: string } {
  const payload = expectRecord(input, "agent2");
  const roomIds = new Set(floorplan.rooms.map((room) => room.id));

  return {
    useCaseCategory: readEnumValue(
      payload.useCaseCategory,
      "agent2.useCaseCategory",
      USE_CASE_CATEGORIES,
    ),
    objects: normalizeSceneObjects(payload.objects, roomIds, "agent2.objects"),
    placementNotes: readString(payload.placementNotes, "agent2.placementNotes", {
      allowEmpty: true,
      defaultValue: "",
    }),
  };
}

export function normalizeSceneFile(input: unknown): SceneFile {
  const payload = expectRecord(input, "sceneFile");
  const floorplan = normalizeFloorPlan(payload.floorplan);
  const configuration = expectRecord(payload.configuration, "sceneFile.configuration");
  const roomIds = new Set(floorplan.rooms.map((room) => room.id));
  const version = readString(payload.version, "sceneFile.version");
  const createdAt = readString(payload.createdAt, "sceneFile.createdAt");

  if (version !== "1.0") {
    throw new Error('sceneFile.version must be "1.0"');
  }

  if (Number.isNaN(Date.parse(createdAt))) {
    throw new Error("sceneFile.createdAt must be a valid ISO timestamp");
  }

  return {
    version: "1.0",
    sceneId: readString(payload.sceneId, "sceneFile.sceneId"),
    createdAt,
    floorplan,
    configuration: {
      useCase: readString(configuration.useCase, "sceneFile.configuration.useCase"),
      useCaseCategory: readEnumValue(
        configuration.useCaseCategory,
        "sceneFile.configuration.useCaseCategory",
        USE_CASE_CATEGORIES,
      ),
      objects: normalizeSceneObjects(configuration.objects, roomIds, "sceneFile.configuration.objects"),
      placementNotes: readString(
        configuration.placementNotes,
        "sceneFile.configuration.placementNotes",
        { allowEmpty: true, defaultValue: "" },
      ),
    },
    ...(readOptionalString(payload.floorplanImageUrl)
      ? { floorplanImageUrl: readOptionalString(payload.floorplanImageUrl) }
      : {}),
  };
}
