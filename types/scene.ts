// types/scene.ts — shared across the entire codebase

export interface Wall {
  x1: number;  // start x coordinate in meters
  y1: number;  // start y coordinate in meters
  x2: number;  // end x coordinate in meters
  y2: number;  // end y coordinate in meters
  height: number; // wall height in meters, default 3.0
}

export interface Room {
  id: string;        // unique identifier e.g. "room_1"
  name: string;      // human readable e.g. "Main Hall"
  x: number;         // top-left x coordinate in meters
  y: number;         // top-left y coordinate in meters
  width: number;     // room width in meters
  height: number;    // room depth in meters
  type: RoomType;    // classification
  polygon?: Array<{ x: number; y: number }>; // ordered vertices for non-rectangular rooms; absent means use x/y/width/height rectangle
}

export type RoomType =
  | "main_hall"
  | "corridor"
  | "bathroom"
  | "storage"
  | "kitchen"
  | "office"
  | "entrance"
  | "unknown";

export interface SceneObject {
  id: string;          // unique identifier e.g. "obj_1"
  type: ObjectType;    // determines shape and color
  roomId: string;      // which room this object belongs to
  x: number;           // center x coordinate in meters
  y: number;           // center y coordinate in meters (depth)
  z: number;           // height off floor in meters, usually 0
  width: number;       // x-axis size in meters
  depth: number;       // y-axis size in meters
  height: number;      // z-axis size in meters
  rotation: number;    // rotation in degrees around y-axis (0-360)
  label: string;       // display label shown in 3D above object
  color?: string;      // optional hex override e.g. "#FF5733"
}

export type ObjectType =
  | "table"           // flat rectangular surface
  | "chair"           // small cube
  | "stage"           // raised rectangular platform
  | "booth"           // tall rectangular structure
  | "desk"            // office desk
  | "podium"          // single speaking podium
  | "screen"          // vertical flat panel
  | "workstation"     // industrial work surface
  | "shelf"           // storage shelf unit
  | "counter"         // counter/bar surface
  | "equipment"       // generic industrial equipment block
  | "plant"           // decorative cylinder
  | "divider"         // room divider panel
  | "entrance_marker" // arrow pointing to entrance
  | "staircase";      // stepped structure connecting floor levels

export interface StaircaseLocation {
  x: number;        // center x coordinate in meters
  y: number;        // center y coordinate in meters
  width: number;    // staircase width in meters (perpendicular to travel direction)
  depth: number;    // staircase depth in meters (along travel direction / run length)
  rotation: number; // degrees — direction stairs travel (0 = toward +y, 90 = toward +x)
}

export interface FloorPlan {
  width: number;       // total floor plan width in meters
  depth: number;       // total floor plan depth in meters
  rooms: Room[];
  walls: Wall[];
  scale: number;       // pixels per meter ratio from original image
  confidence: number;  // 0-1, how confident Gemini was in extraction
  notes: string;       // any extraction caveats from Gemini
  staircases: StaircaseLocation[]; // detected staircase regions (empty array if none found)
}

export interface Configuration {
  useCase: string;           // the raw user input text
  useCaseCategory: UseCaseCategory;
  objects: SceneObject[];
  placementNotes: string;    // reasoning from Agent 2
}

export type UseCaseCategory =
  | "event"
  | "hackathon"
  | "office"
  | "factory"
  | "classroom"
  | "retail"
  | "other";

export interface SceneFile {
  version: "1.0";
  sceneId: string;           // uuid
  createdAt: string;         // ISO timestamp
  floorplan: FloorPlan;
  configuration: Configuration;
  floorplanImageUrl?: string; // public URL of the original uploaded floor plan image
}
