// Globals the page reads or provides.

/** The Claude Artifact runtime, present only when the page is shown inside claude.ai or the Claude app. */
interface ClaudeRuntime {
  /** Resolves the capability's namespace, or null when it is not served in this view (contract 0.2.92). */
  use?: (capability: string) => unknown;
}

interface Window {
  claude?: ClaudeRuntime;
  /** Set by src/main.js: the page's state and a few entry points, for tests and support. */
  readonly __tryon?: {
    S: typeof import('./state.js').S;
    goStep: typeof import('./steps.js').goStep;
    select: typeof import('./photos.js').select;
    sampleRecord: typeof import('./state.js').sampleRecord;
    render: typeof import('./render.js').render;
    idb: typeof import('./storage.js').idb;
  };
}

/** The app's version from package.json, put in by the build (vite.config.js `define`). */
declare const __APP_VERSION__: string;
