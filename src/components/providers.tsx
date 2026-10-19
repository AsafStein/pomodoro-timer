"use client";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <DirectionProvider direction="rtl">{children}</DirectionProvider>;
}
