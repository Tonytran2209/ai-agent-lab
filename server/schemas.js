import { z } from "zod";
export const layers = ["design", "backend", "database", "cross-layer"];
export const relativePath = z.string().min(1).max(240).refine(p =>
  !p.startsWith("/") && !p.includes("\\") && !p.includes("..") && !p.includes("*") &&
  !p.includes(":") && /^[a-zA-Z0-9_.\/-]+$/.test(p) &&
  !/(^|\/)(\.env(?:\.|$)|\.git(?:\/|$)|node_modules(?:\/|$))/.test(p),
  "Chỉ cho phép đường dẫn file cụ thể trong repo; không glob, secrets hoặc traversal.");
export const draftSchema = z.object({
  title: z.string().min(5).max(180),
  problem: z.string().min(10).max(6000),
  layer: z.enum(layers),
  module: z.string().min(2).max(100),
  allowedPaths: z.array(relativePath).min(1).max(20),
  acceptanceCriteria: z.array(z.string().min(5).max(1000)).min(1).max(12),
  assumptions: z.array(z.string().min(3).max(1000)).max(8).default([]),
  questions: z.array(z.string().min(3).max(500)).max(8).default([]),
  risk: z.enum(["low", "medium", "high"]),
  migrationNotes: z.string().max(4000).default(""),
});
export const feedbackSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/).optional(),
  feedback: z.string().min(10).max(10000),
  screen: z.string().max(300).default(""),
  reproduction: z.string().max(4000).default(""),
  expected: z.string().max(3000).default(""),
});
export const completionSchema = z.object({
  browserVerification: z.enum(["ci"]).optional(),
  summary: z.string().min(10).max(6000),
  changedPaths: z.array(relativePath).min(1).max(20),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  artifactUrl: z.string().url().max(1000).optional(),
  localArtifact: z.object({ branch: z.string().regex(/^lab\/[A-Za-z0-9_-]+$/) }).optional(),
  checks: z.array(z.object({ command: z.string().max(200), passed: z.boolean(), output: z.string().max(4000) })).min(1).max(10),
}).refine(v => Boolean(v.artifactUrl) !== Boolean(v.localArtifact), "Cần đúng một artifact: URL GitHub hoặc commit cục bộ.");
export function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }

