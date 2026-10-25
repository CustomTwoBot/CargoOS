/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai from "../ai.js";
import type * as cases from "../cases.js";
import type * as demoCases from "../demoCases.js";
import type * as drafts from "../drafts.js";
import type * as files from "../files.js";
import type * as learnedRules from "../learnedRules.js";
import type * as pipeline from "../pipeline.js";
import type * as seed from "../seed.js";
import type * as uploads from "../uploads.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ai: typeof ai;
  cases: typeof cases;
  demoCases: typeof demoCases;
  drafts: typeof drafts;
  files: typeof files;
  learnedRules: typeof learnedRules;
  pipeline: typeof pipeline;
  seed: typeof seed;
  uploads: typeof uploads;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
