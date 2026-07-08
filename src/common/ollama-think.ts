import { z } from "zod/v4";

export const ollamaThinkLevelSchema = z.enum(["low", "medium", "high", "max"]);

export const ollamaThinkSchema = z.union([z.boolean(), ollamaThinkLevelSchema]);

export type OllamaThinkLevel = z.infer<typeof ollamaThinkLevelSchema>;
export type OllamaThink = z.infer<typeof ollamaThinkSchema>;
