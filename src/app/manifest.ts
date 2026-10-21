import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ריכוז — פומודורו אישי",
    short_name: "ריכוז",
    description: "טיימר פומודורו אישי לריכוז, משימות ודוחות זמן.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1c1612",
    theme_color: "#1c1612",
    lang: "he",
    dir: "rtl",
    categories: ["productivity"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
