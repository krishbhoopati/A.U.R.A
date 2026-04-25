import { FloorPlan, ObjectType, Room, SceneObject, UseCaseCategory } from "@/types/scene";

const WALL_CLEARANCE = 1.5;

type ObjectTemplate = {
  type: ObjectType;
  width: number;
  depth: number;
  height: number;
};

const OBJECT_LIBRARY: Record<ObjectType, ObjectTemplate> = {
  table: { type: "table", width: 2.0, depth: 1.0, height: 0.75 },
  chair: { type: "chair", width: 0.5, depth: 0.5, height: 0.9 },
  stage: { type: "stage", width: 8.0, depth: 4.0, height: 0.5 },
  booth: { type: "booth", width: 2.0, depth: 2.0, height: 2.0 },
  desk: { type: "desk", width: 1.5, depth: 0.8, height: 0.75 },
  podium: { type: "podium", width: 0.6, depth: 0.6, height: 1.1 },
  screen: { type: "screen", width: 3.0, depth: 0.1, height: 2.0 },
  workstation: { type: "workstation", width: 2.0, depth: 1.5, height: 1.0 },
  shelf: { type: "shelf", width: 1.0, depth: 0.4, height: 2.0 },
  counter: { type: "counter", width: 2.0, depth: 0.8, height: 0.9 },
  equipment: { type: "equipment", width: 1.5, depth: 1.5, height: 1.2 },
  plant: { type: "plant", width: 0.8, depth: 0.8, height: 1.2 },
  divider: { type: "divider", width: 3.0, depth: 0.1, height: 1.8 },
  entrance_marker: { type: "entrance_marker", width: 1.0, depth: 1.0, height: 0.2 },
  staircase: { type: "staircase", width: 2.0, depth: 3.0, height: 3.0 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function findLargestRoom(floorplan: FloorPlan): Room {
  return [...floorplan.rooms].sort((a, b) => b.width * b.height - a.width * a.height)[0];
}

function createObject(
  index: number,
  roomId: string,
  type: ObjectType,
  x: number,
  y: number,
  label: string,
  overrides?: Partial<SceneObject>,
): SceneObject {
  const preset = OBJECT_LIBRARY[type];
  return {
    id: `obj_${index + 1}`,
    type,
    roomId,
    x: roundToTenth(x),
    y: roundToTenth(y),
    z: 0,
    width: preset.width,
    depth: preset.depth,
    height: preset.height,
    rotation: 0,
    label,
    ...overrides,
  };
}

function roomInsetBounds(room: Room) {
  return {
    minX: room.x + WALL_CLEARANCE,
    maxX: room.x + room.width - WALL_CLEARANCE,
    minY: room.y + WALL_CLEARANCE,
    maxY: room.y + room.height - WALL_CLEARANCE,
    centerX: room.x + room.width / 2,
    centerY: room.y + room.height / 2,
  };
}

function addGrid(
  objects: SceneObject[],
  room: Room,
  type: ObjectType,
  rows: number,
  columns: number,
  area: { minX: number; maxX: number; minY: number; maxY: number },
  labelPrefix: string,
) {
  if (rows <= 0 || columns <= 0) {
    return;
  }

  const xStep = columns === 1 ? 0 : (area.maxX - area.minX) / (columns - 1);
  const yStep = rows === 1 ? 0 : (area.maxY - area.minY) / (rows - 1);

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = objects.length;
      objects.push(
        createObject(
          index,
          room.id,
          type,
          area.minX + xStep * column,
          area.minY + yStep * row,
          `${labelPrefix} ${index + 1}`,
        ),
      );
    }
  }
}

function inferUseCaseCategory(useCase: string): UseCaseCategory {
  const normalized = useCase.toLowerCase();

  if (/(hackathon|hacking|sponsor|booth)/.test(normalized)) return "hackathon";
  if (/(gala|event|ceremony|wedding|dance|banquet|bar)/.test(normalized)) return "event";
  if (/(office|desk|meeting|lounge|workspace)/.test(normalized)) return "office";
  if (/(factory|assembly|forklift|workstation|industrial|storage)/.test(normalized)) return "factory";
  if (/(classroom|lecture|student|teacher|training)/.test(normalized)) return "classroom";
  if (/(retail|shop|store|cashier|display)/.test(normalized)) return "retail";

  return "other";
}

function buildHackathonLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];
  const stageWidth = clamp(room.width * 0.28, 6, 10);
  const boothColumns = room.width > 28 ? 3 : 2;

  objects.push(
    createObject(objects.length, room.id, "stage", bounds.centerX, bounds.minY + 2, "Ceremony Stage", {
      width: roundToTenth(stageWidth),
    }),
  );
  objects.push(
    createObject(objects.length, room.id, "screen", bounds.centerX, bounds.minY + 5.6, "Main Screen", {
      width: roundToTenth(clamp(room.width * 0.18, 3, 5)),
    }),
  );
  objects.push(
    createObject(objects.length, room.id, "podium", bounds.centerX + stageWidth / 2 - 1, bounds.minY + 5, "Speaker Podium"),
  );

  addGrid(
    objects,
    room,
    "booth",
    2,
    boothColumns,
    {
      minX: bounds.centerX - (boothColumns === 3 ? 4 : 2),
      maxX: bounds.centerX + (boothColumns === 3 ? 4 : 2),
      minY: bounds.centerY - 1,
      maxY: bounds.centerY + 2.5,
    },
    "Sponsor Booth",
  );

  const westPositions = [8, 12, 16, 20].map((offset) => room.y + offset).filter((y) => y < bounds.maxY - 1);
  const eastPositions = westPositions;
  westPositions.forEach((y, index) => {
    objects.push(createObject(objects.length, room.id, "table", bounds.minX + 1, y, `Hacking Station ${index + 1}`));
  });
  eastPositions.forEach((y, index) => {
    objects.push(
      createObject(objects.length, room.id, "table", bounds.maxX - 1, y, `Hacking Station ${index + westPositions.length + 1}`),
    );
  });

  const southColumns = room.width > 34 ? 4 : 3;
  addGrid(
    objects,
    room,
    "table",
    1,
    southColumns,
    {
      minX: bounds.centerX - (southColumns - 1) * 2,
      maxX: bounds.centerX + (southColumns - 1) * 2,
      minY: bounds.maxY - 1,
      maxY: bounds.maxY - 1,
    },
    "Hacking Station",
  );

  return objects;
}

function buildEventLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  objects.push(createObject(objects.length, room.id, "stage", bounds.centerX, bounds.minY + 2, "Presentation Stage"));
  objects.push(createObject(objects.length, room.id, "screen", bounds.centerX, bounds.minY + 5.4, "Projection Screen"));
  objects.push(createObject(objects.length, room.id, "counter", bounds.maxX - 1.2, bounds.centerY, "Bar Counter"));

  const rows = room.height > 24 ? 3 : 2;
  const columns = room.width > 30 ? 4 : 3;
  addGrid(
    objects,
    room,
    "table",
    rows,
    columns,
    {
      minX: bounds.minX + 3,
      maxX: bounds.maxX - 4,
      minY: bounds.centerY - 2,
      maxY: bounds.maxY - 3,
    },
    "Round Table",
  );

  objects.push(createObject(objects.length, room.id, "plant", bounds.minX + 1, bounds.maxY - 1, "Entry Plant"));
  objects.push(createObject(objects.length, room.id, "plant", bounds.maxX - 1, bounds.minY + 1, "Accent Plant"));

  return objects;
}

function buildOfficeLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  addGrid(
    objects,
    room,
    "desk",
    room.height > 24 ? 4 : 3,
    room.width > 28 ? 5 : 4,
    {
      minX: bounds.minX + 2,
      maxX: bounds.maxX - 2,
      minY: bounds.minY + 4,
      maxY: bounds.centerY + 3,
    },
    "Desk",
  );

  objects.push(createObject(objects.length, room.id, "divider", bounds.centerX, bounds.centerY + 5, "Meeting Divider"));
  objects.push(createObject(objects.length, room.id, "screen", bounds.centerX, bounds.minY + 1.6, "Presentation Screen"));
  objects.push(createObject(objects.length, room.id, "counter", bounds.minX + 1.4, bounds.maxY - 1, "Lounge Counter"));
  objects.push(createObject(objects.length, room.id, "plant", bounds.minX + 1, bounds.maxY - 3, "Lounge Plant"));
  objects.push(createObject(objects.length, room.id, "plant", bounds.maxX - 1, bounds.maxY - 3, "Lounge Plant 2"));

  return objects;
}

function buildFactoryLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  const stations = room.height > 24 ? 4 : 3;
  const yStep = (bounds.maxY - bounds.minY - 5) / (stations - 1);
  for (let index = 0; index < stations; index += 1) {
    objects.push(
      createObject(
        objects.length,
        room.id,
        "workstation",
        bounds.centerX,
        bounds.minY + 4 + yStep * index,
        `Workstation ${index + 1}`,
      ),
    );
  }

  [bounds.minX + 1, bounds.maxX - 1].forEach((x, columnIndex) => {
    for (let row = 0; row < 4; row += 1) {
      objects.push(
        createObject(
          objects.length,
          room.id,
          "shelf",
          x,
          bounds.minY + 4 + row * 3,
          `Storage Shelf ${columnIndex * 4 + row + 1}`,
        ),
      );
    }
  });

  objects.push(createObject(objects.length, room.id, "equipment", bounds.minX + 3.5, bounds.centerY, "Packaging Station"));
  objects.push(createObject(objects.length, room.id, "equipment", bounds.maxX - 3.5, bounds.centerY, "Inspection Station"));

  return objects;
}

function buildClassroomLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  objects.push(createObject(objects.length, room.id, "screen", bounds.centerX, bounds.minY + 1.4, "Classroom Screen"));
  objects.push(createObject(objects.length, room.id, "podium", bounds.centerX - 2, bounds.minY + 2.6, "Instructor Podium"));
  addGrid(
    objects,
    room,
    "table",
    room.height > 20 ? 4 : 3,
    room.width > 26 ? 4 : 3,
    {
      minX: bounds.minX + 2,
      maxX: bounds.maxX - 2,
      minY: bounds.minY + 6,
      maxY: bounds.maxY - 2,
    },
    "Student Table",
  );

  return objects;
}

function buildRetailLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  objects.push(createObject(objects.length, room.id, "counter", bounds.centerX, bounds.minY + 1.5, "Checkout Counter"));
  addGrid(
    objects,
    room,
    "shelf",
    3,
    room.width > 26 ? 4 : 3,
    {
      minX: bounds.minX + 2,
      maxX: bounds.maxX - 2,
      minY: bounds.minY + 5,
      maxY: bounds.centerY + 3,
    },
    "Display Shelf",
  );
  objects.push(createObject(objects.length, room.id, "plant", bounds.minX + 1, bounds.maxY - 1, "Accent Plant"));

  return objects;
}

function buildDefaultLayout(room: Room): SceneObject[] {
  const bounds = roomInsetBounds(room);
  const objects: SceneObject[] = [];

  addGrid(
    objects,
    room,
    "table",
    room.height > 20 ? 3 : 2,
    room.width > 26 ? 4 : 3,
    {
      minX: bounds.minX + 2,
      maxX: bounds.maxX - 2,
      minY: bounds.minY + 3,
      maxY: bounds.maxY - 2,
    },
    "Configured Table",
  );
  objects.push(createObject(objects.length, room.id, "screen", bounds.centerX, bounds.minY + 1.4, "Main Screen"));

  return objects;
}

export function buildFallbackPlacement(
  floorplan: FloorPlan,
  useCase: string,
): { objects: SceneObject[]; useCaseCategory: UseCaseCategory; placementNotes: string } {
  const room = findLargestRoom(floorplan);
  const useCaseCategory = inferUseCaseCategory(useCase);

  const objects =
    useCaseCategory === "hackathon"
      ? buildHackathonLayout(room)
      : useCaseCategory === "event"
        ? buildEventLayout(room)
        : useCaseCategory === "office"
          ? buildOfficeLayout(room)
          : useCaseCategory === "factory"
            ? buildFactoryLayout(room)
            : useCaseCategory === "classroom"
              ? buildClassroomLayout(room)
              : useCaseCategory === "retail"
                ? buildRetailLayout(room)
                : buildDefaultLayout(room);

  return {
    objects,
    useCaseCategory,
    placementNotes: `Rule-based planner used because Gemini was unavailable. The layout follows a ${useCaseCategory} arrangement inside the primary room while preserving clear paths from the room edges to the center.`,
  };
}

function parsePngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function parseJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const size = buffer.readUInt16BE(offset + 2);

    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + size;
  }

  return null;
}

function inferImageDimensions(buffer: Buffer, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    return parsePngDimensions(buffer);
  }

  if (mimeType === "image/jpeg") {
    return parseJpegDimensions(buffer);
  }

  return null;
}

export function buildFallbackFloorPlan(buffer: Buffer, mimeType: string): FloorPlan {
  const dimensions = inferImageDimensions(buffer, mimeType);
  const aspectRatio = dimensions ? dimensions.width / Math.max(dimensions.height, 1) : 4 / 3;
  const width = roundToTenth(clamp(aspectRatio >= 1 ? 40 : 28, 24, 48));
  const depth = roundToTenth(clamp(width / Math.max(aspectRatio, 0.5), 20, 36));

  return {
    width,
    depth,
    rooms: [
      {
        id: "room_1",
        name: "Configured Space",
        x: 0,
        y: 0,
        width,
        height: depth,
        type: "main_hall",
      },
    ],
    walls: [
      { x1: 0, y1: 0, x2: width, y2: 0, height: 4 },
      { x1: width, y1: 0, x2: width, y2: depth, height: 4 },
      { x1: width, y1: depth, x2: 0, y2: depth, height: 4 },
      { x1: 0, y1: depth, x2: 0, y2: 0, height: 4 },
    ],
    scale: 10,
    confidence: 0.22,
    notes: "Fallback geometry used because Gemini was unavailable. The layout is approximated as a single primary hall using the uploaded image aspect ratio.",
    staircases: [
      {
        x: width - 2.5,
        y: 2.0,
        width: 2.0,
        depth: 3.0,
        rotation: 0,
      },
    ],
  };
}
