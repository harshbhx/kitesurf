// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
// https://opensource.org/licenses/Apache-2.0

import { describe, expect, it } from "vitest";
import type { DispatchCtx } from "../src/cdp/dispatch.ts";
import { makeChildFrameState } from "../src/cdp/frames.ts";
import { emitOopifExecutionContext, handleRuntime } from "../src/cdp/runtime.ts";
import type { CdpRequest, TargetState } from "../src/cdp/types.ts";
import type { PageScriptStub } from "../src/eval/page-script.ts";

// Playwright and Puppeteer only treat a context as a frame's main world when the event says
// auxData.isDefault is true, as Chrome sends for every frame. Without it, evaluating in an iframe
// waits forever for a main world.

type Emitted = { method: string; params: { context: { id: number; auxData: unknown } } };

function setup() {
  const emitted: Emitted[] = [];
  const frame = makeChildFrameState({
    frameId: "CHILD",
    parentFrameId: "F",
    loaderId: "L2",
    url: "https://host.test/child.html",
    name: "f",
    ownerElementId: "f",
    ownerBackendNodeId: 1,
    isCrossOrigin: false,
    delaysLoadEvent: false,
  });
  // oxlint-disable-next-line kitesurf/no-chained-type-assertions -- the frame only needs a live page script.
  frame.pageScript = {} as unknown as PageScriptStub;
  frame.execContextId = 7;
  const target = {
    type: "page",
    targetId: "T",
    frameId: "F",
    loaderId: "L",
    browserContextId: "",
    url: "https://host.test/",
    frames: new Map([["CHILD", frame]]),
    sessions: new Set<string>(),
    navigateGeneration: 1,
    defaultContextId: 1,
  } as TargetState;
  // oxlint-disable-next-line kitesurf/no-chained-type-assertions -- only the fields these handlers read are set.
  const ctx = {
    env: {},
    emit: (e: Emitted) => emitted.push(e),
    browser: {
      targets: new Map([["T", target]]),
      contexts: new Map(),
      runtimeEnabledSessions: new Set<string>([""]),
    },
  } as unknown as DispatchCtx;
  return { ctx, frame, emitted };
}

const childContext = (emitted: Emitted[]) => emitted.find((e) => e.params.context.id === 7);

describe("an iframe's execution context", () => {
  it("is announced as the frame's main world when it is created", () => {
    const { ctx, frame, emitted } = setup();
    emitOopifExecutionContext(ctx, frame);
    expect(childContext(emitted)?.params.context.auxData).toEqual({
      isDefault: true,
      type: "default",
      frameId: "CHILD",
    });
  });

  it("is announced as the frame's main world when Runtime.enable replays contexts", async () => {
    const { ctx, emitted } = setup();
    const req: CdpRequest = { id: 1, method: "Runtime.enable" };
    await handleRuntime(ctx, req);
    expect(childContext(emitted)?.params.context.auxData).toEqual({
      isDefault: true,
      type: "default",
      frameId: "CHILD",
    });
  });
});
