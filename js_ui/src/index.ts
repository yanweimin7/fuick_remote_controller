import { initApp } from "./app";

// Mount initApp to global scope for Flutter to call proactively
(globalThis as any).initApp = initApp;

// Also attempt to initialize immediately
initApp();
