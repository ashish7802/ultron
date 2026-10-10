"use client";

import dynamic from "next/dynamic";

const JarvisOrb = dynamic(() => import("@/components/JarvisOrb"), {
  ssr: false,
});

export default function Home() {
  return <JarvisOrb />;
}
