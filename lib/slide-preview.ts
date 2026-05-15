export function slidePreviewHref(slideId: string) {
  const params = new URLSearchParams()
  if (process.env.OUTPUT_CAPTURE_TOKEN) params.set("token", process.env.OUTPUT_CAPTURE_TOKEN)
  const query = params.toString()
  return `/output/slide/${slideId}${query ? `?${query}` : ""}`
}
