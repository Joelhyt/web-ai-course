import { createCanvasRenderer } from "./render";
import { createInitialGameState } from "./state";

interface StrokeRectCall {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly strokeStyle: string | CanvasGradient | CanvasPattern;
  readonly lineWidth: number;
}

interface MockContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  imageSmoothingEnabled: boolean;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  readonly strokeRectCalls: StrokeRectCall[];
  fillRect: (x: number, y: number, width: number, height: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  fillText: (text: string, x: number, y: number) => void;
  strokeRect: (x: number, y: number, width: number, height: number) => void;
}

function createMockContext2D(): MockContext2D {
  const strokeRectCalls: StrokeRectCall[] = [];
  const context: MockContext2D = {
    fillStyle: "#000000",
    strokeStyle: "#000000",
    lineWidth: 1,
    imageSmoothingEnabled: true,
    font: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    strokeRectCalls,
    fillRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: () => {},
    strokeRect: (x, y, width, height) => {
      strokeRectCalls.push({
        x,
        y,
        width,
        height,
        strokeStyle: context.strokeStyle,
        lineWidth: context.lineWidth
      });
    }
  };

  return context;
}

function createMockCanvas(context: MockContext2D): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    dataset: {},
    getContext: () => context as unknown as CanvasRenderingContext2D
  } as unknown as HTMLCanvasElement;
}

describe("canvas renderer", () => {
  it("draws a purple snake outline while ghost is active", () => {
    const context = createMockContext2D();
    const canvas = createMockCanvas(context);
    const renderer = createCanvasRenderer(canvas, 24);
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 },
      activePowerUps: [{ type: "ghost", remainingSteps: 10 }]
    });

    renderer.render(state);

    expect(context.strokeRectCalls).toHaveLength(state.snake.length);
    expect(context.strokeRectCalls.every((call) => call.strokeStyle === "#8b5cf6")).toBe(
      true
    );
    expect(context.strokeRectCalls.every((call) => call.lineWidth === 2)).toBe(true);
  });

  it("does not draw a ghost outline when ghost is inactive", () => {
    const context = createMockContext2D();
    const canvas = createMockCanvas(context);
    const renderer = createCanvasRenderer(canvas, 24);
    const state = createInitialGameState({
      initialFood: { x: 0, y: 0 }
    });

    renderer.render(state);

    expect(context.strokeRectCalls).toHaveLength(0);
  });
});
