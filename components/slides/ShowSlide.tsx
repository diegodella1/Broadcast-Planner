"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import type { ShowSlideData } from "@/lib/slides/types"

export type ShowSlideProps = {
  data: ShowSlideData
}

export function ShowSlide({ data }: ShowSlideProps) {
  const { name, description, imageUrl, hostName, showDays, scheduleTimes } = data

  const hasOverlay =
    (name && name.trim() !== "Show") ||
    description ||
    hostName ||
    showDays ||
    scheduleTimes.length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full relative overflow-hidden bg-black"
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="100vw"
          unoptimized
          className="absolute inset-0 object-cover object-center"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-900 to-black" />
      )}

      {hasOverlay && (
        <div className="absolute inset-0 flex">
          <div className="w-[48%]" />
          <div className="w-[52%] flex flex-col justify-center px-8 py-8">
            {name && name.trim() !== "Show" && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="border-2 border-brand-gold px-5 py-3 mb-6"
                style={{ width: "fit-content", maxWidth: "95%" }}
              >
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight">
                  {name}
                </h1>
              </motion.div>
            )}

            {description && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-zinc-200 text-lg md:text-xl mb-6 max-w-[90%]"
              >
                {description}
              </motion.p>
            )}

            {hostName && (
              <>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-white text-2xl md:text-3xl mb-2"
                >
                  With
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 }}
                  className="border-2 border-brand-gold px-5 py-2 mb-8"
                  style={{ width: "fit-content", maxWidth: "95%" }}
                >
                  <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
                    {hostName}
                  </h2>
                </motion.div>
              </>
            )}

            {(showDays || scheduleTimes.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="border-2 border-brand-gold px-5 py-4"
                style={{ width: "fit-content", maxWidth: "95%" }}
              >
                {showDays && (
                  <p className="text-xl md:text-2xl font-bold text-white mb-2">{showDays}</p>
                )}
                {scheduleTimes.length > 0 && (
                  <div className="space-y-0.5">
                    {scheduleTimes.map((schedule, index) => (
                      <p key={index} className="text-lg md:text-xl text-zinc-200">
                        {schedule.time} {schedule.timezone}
                      </p>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}
