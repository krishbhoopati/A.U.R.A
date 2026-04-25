import { FloorPlan } from "../../types/scene";

import { buildFallbackFloorPlan } from "./fallback";
import { callGemini, fetchImageData, imageBufferToPart, isGeminiServiceError } from "../gemini";
import { normalizeFloorPlan, parseGeminiJsonResponse } from "../scene-validation";

const AGENT1_PROMPT = `You are a floor plan analysis expert. You will receive an image of a floor plan.

Your task is to extract the physical geometry of the space and return it as structured JSON.

INSTRUCTIONS:
1. Identify all rooms, their approximate sizes, and their positions relative to each other.
2. If the image shows MULTIPLE floors (e.g., sections labeled "1st Floor", "2nd Floor", "Ground Floor", "Upper Floor", or similar, stacked vertically or side-by-side), focus ONLY on the FIRST/GROUND floor section. Extract only the rooms and walls visible in that section. Ignore all other floor sections entirely. Note the multi-floor layout in the "notes" field.
3. Identify ALL wall segments as line segments — including exterior walls, interior partition walls, corridor walls, and any angled or diagonal walls. Do NOT only output the 4 outer bounding walls. Every visible wall line in the image must appear in the "walls" array.
4. Estimate the real-world dimensions. If a scale is shown, use it. If not, estimate based on typical room sizes (a standard office room is about 4m x 4m, a large hall is 20m+ wide).
5. Assign a coordinate system where the top-left corner of the floor plan is (0, 0), x increases to the right, and y increases downward.
6. All measurements should be in METERS.
7. Classify each room using one of these types: main_hall, corridor, bathroom, storage, kitchen, office, entrance, unknown.
8. For each room, return a "polygon" field: an ordered array of {x, y} vertices tracing the room's floor boundary (clockwise or counter-clockwise). For a simple rectangle this is 4 points. For an L-shaped room this is 6 points. For a corridor or irregular room trace every corner. The polygon must be a closed shape (last point connects back to first).
9. Identify any staircases visible in the floor plan. Staircases typically appear as a series of parallel lines (representing steps/treads) within a rectangular or L-shaped region, often near walls or room edges. For each staircase found, estimate its center position, width (perpendicular to travel direction), depth (length of the run along travel direction), and rotation (direction the stairs travel: 0 = toward bottom of image, 90 = toward right, 180 = toward top, 270 = toward left). If no staircases are visible, return an empty array.

Return this exact structure:
{
  "width": <total width in meters as number>,
  "depth": <total depth in meters as number>,
  "rooms": [
    {
      "id": "room_1",
      "name": "<descriptive name>",
      "x": <bounding-box top-left x in meters>,
      "y": <bounding-box top-left y in meters>,
      "width": <bounding-box width in meters>,
      "height": <bounding-box depth in meters>,
      "type": "<room type>",
      "polygon": [
        { "x": <meters>, "y": <meters> },
        { "x": <meters>, "y": <meters> }
      ]
    }
  ],
  "walls": [
    { "x1": <meters>, "y1": <meters>, "x2": <meters>, "y2": <meters>, "height": 3.0 }
  ],
  "staircases": [
    {
      "x": <center x in meters>,
      "y": <center y in meters>,
      "width": <staircase width in meters, typically 1.2 to 2.5>,
      "depth": <run length in meters, typically 2.0 to 4.0>,
      "rotation": <0 to 360 degrees — direction stairs travel>
    }
  ],
  "scale": <your estimated pixels-per-meter ratio, or 10 if unknown>,
  "confidence": <0.0 to 1.0 how confident you are in the extraction>,
  "notes": "<any important observations about the floor plan>"
}

CRITICAL: Return ONLY a valid JSON object. No markdown, no explanation, no code fences. Just the raw JSON.`;

// NOTE: Agent 1 uses direct Gemini Vision API (not Backboard).
// Backboard's image attachment pipeline indexes images as text summaries (document RAG),
// so the underlying LLM never sees actual pixels. Real vision analysis requires the
// inlineData multimodal path that Gemini exposes natively.
export async function runAgent1(floorplanImageUrl: string): Promise<FloorPlan> {
  const { buffer, mimeType } = await fetchImageData(floorplanImageUrl);
  const imagePart = imageBufferToPart(buffer, mimeType);

  try {
    const rawResponse = await callGemini(AGENT1_PROMPT, [imagePart], {
      responseMimeType: "application/json",
    });
    return normalizeFloorPlan(parseGeminiJsonResponse(rawResponse));
  } catch (error) {
    if (isGeminiServiceError(error)) {
      console.warn("Gemini agent 1 failed, using rule-based fallback:", error);
      return buildFallbackFloorPlan(buffer, mimeType);
    }

    throw error;
  }
}
