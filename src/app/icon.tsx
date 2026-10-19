import { ImageResponse } from "next/og";
import { IconMark } from "@/components/icon-mark";

export const dynamic = "force-static";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<IconMark size={512} />, { ...size });
}
