import { defineCloudflareConfig } from "@opennextjs/cloudflare"

// Minimal Cloudflare Workers configuration for roxom-playout-manager.
//
// The OpenNext Cloudflare adapter bundles the Next.js App Router app into a
// single Worker file (.open-next/worker.js) and serves static assets from
// .open-next/assets via the ASSETS binding. It does NOT use Next.js's own
// `output: "standalone"` mode — the adapter runs its own bundler on top of
// the standard Next.js build output.
//
// NOTE: next.config.mjs currently has `output: "standalone"`. The OpenNext
// adapter ignores that option during its own build pass. No change to
// next.config.mjs is needed for CF Workers deployment; Docker/standalone
// deploys continue to use the standalone output unchanged.
//
// Upgrade path — ISR cache backed by R2:
//   1. Create a Cloudflare R2 bucket: wrangler r2 bucket create roxom-playout-manager-cache
//   2. Add to wrangler.jsonc under the root object:
//        "r2_buckets": [{ "binding": "NEXT_CACHE_R2_BUCKET", "bucket_name": "roxom-playout-manager-cache" }]
//   3. Replace the import + export below with:
//        import { defineCloudflareConfig } from "@opennextjs/cloudflare"
//        import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache"
//        export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache })

export default defineCloudflareConfig({})
