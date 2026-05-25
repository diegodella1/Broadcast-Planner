import { describe, expect, it } from "vitest"

import { parseMusicMetadataJson, sanitizeMusicMetadata } from "./music-metadata"

describe("sanitizeMusicMetadata", () => {
  it("keeps only supported music metadata fields", () => {
    expect(
      sanitizeMusicMetadata({
        music_title: "  Track title  ",
        artist: "Artist",
        album: "Album",
        year: "2026",
        track: "1",
        genre: "Ambient",
        ignored: "nope"
      })
    ).toEqual({
      music_title: "Track title",
      artist: "Artist",
      album: "Album",
      year: "2026",
      track: "1",
      genre: "Ambient"
    })
  })

  it("returns an empty object for invalid JSON", () => {
    expect(parseMusicMetadataJson("{bad json")).toEqual({})
  })
})
