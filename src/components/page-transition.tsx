"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"

const variants = {
  hidden: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0 },
}

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="enter"
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
