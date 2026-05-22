"use client"

import type { WeatherSlideData } from "@/lib/slides/types"

export type WeatherSlideProps = {
  data: WeatherSlideData
}

export function WeatherSlide({ data }: WeatherSlideProps) {
  if (!data.available) {
    return (
      <section className="grid h-full w-full place-items-center bg-[#07130f] px-16 text-center text-white">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#76f7b5]">Weather</p>
          <h1 className="mt-5 text-5xl font-semibold">Weather data unavailable</h1>
          <p className="mt-4 max-w-2xl text-xl text-white/65">{data.reason}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="relative h-full w-full overflow-hidden bg-[#07130f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(118,247,181,0.22),transparent_28%),radial-gradient(circle_at_80%_8%,rgba(59,130,246,0.2),transparent_24%),linear-gradient(135deg,#07130f_0%,#0d1f24_52%,#05080a_100%)]" />
      <div className="relative z-10 grid h-full grid-rows-[auto_1fr_auto] gap-8 p-12">
        <header className="flex items-start justify-between gap-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.34em] text-[#76f7b5]">Weather</p>
            <h1 className="mt-3 text-6xl font-semibold tracking-normal">{data.locationName}</h1>
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 px-5 py-3 text-right backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-white/55">Updated</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatUpdateTime(data.updatedAt)}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-[1.1fr_0.9fr] items-center gap-10">
          <div>
            <p className="text-[9rem] font-semibold leading-none tracking-normal tabular-nums">
              {formatTemp(data.temperatureC)}
            </p>
            <p className="mt-4 text-4xl font-semibold">{data.description}</p>
            <p className="mt-3 text-2xl text-white/65">{data.condition}</p>
          </div>

          <div className="grid gap-4">
            <Metric label="Feels Like" value={formatTemp(data.feelsLikeC)} />
            <Metric
              label="Humidity"
              value={data.humidityPct !== null ? `${Math.round(data.humidityPct)}%` : "--"}
            />
            <Metric
              label="Wind"
              value={data.windKph !== null ? `${Math.round(data.windKph)} km/h` : "--"}
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {data.forecast.map((point) => (
            <div key={point.label} className="rounded-md border border-white/12 bg-white/10 p-4">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-white/55">
                {point.label}
              </p>
              <p className="mt-3 text-4xl font-semibold tabular-nums">
                {formatTemp(point.temperatureC)}
              </p>
              <p className="mt-2 text-lg text-white/80">{point.condition}</p>
              <p className="mt-1 text-sm text-white/55">
                Rain{" "}
                {point.precipitationProbability !== null
                  ? `${point.precipitationProbability}%`
                  : "--"}
              </p>
            </div>
          ))}
          {!data.forecast.length ? (
            <div className="col-span-4 rounded-md border border-white/12 bg-white/10 p-4 text-xl text-white/70">
              Forecast unavailable
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-white/12 bg-white/10 px-5 py-4">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-white/55">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function formatTemp(value: number | null) {
  return value !== null ? `${Math.round(value)}°C` : "--"
}

function formatUpdateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "--"
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}
