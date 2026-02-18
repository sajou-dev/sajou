import { defineConfig } from "vitepress";

export default defineConfig({
  title: "sajou",
  description: "A visual choreographer for AI agents",
  lang: "en-US",

  // Build into docs/.vitepress/dist (gitignored)
  outDir: ".vitepress/dist",

  // Don't treat existing docs dirs as VitePress pages
  srcExclude: [
    "backlog/**",
    "active/**",
    "done/**",
    "decisions/**",
    "adr/**",
    "archive/**",
    "marketing/**",
    "brand/**",
    "specs/**",
    "sajou-mcp-server-design.md",
  ],

  head: [
    ["link", { rel: "icon", href: "/sajou-favicon.svg", type: "image/svg+xml" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap",
      },
    ],
  ],

  themeConfig: {
    logo: "/sajou-favicon.svg",
    siteTitle: "sajou",

    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Reference", link: "/reference/signal-protocol", activeMatch: "/reference/" },
    ],

    sidebar: {
      "/guide/": [
        {
          text: "Getting Started",
          items: [
            { text: "Architecture", link: "/guide/" },
          ],
        },
        {
          text: "Systems",
          items: [
            { text: "Signal Flow", link: "/guide/signal-flow" },
            { text: "Wiring & Filters", link: "/guide/wiring-patchbay" },
            { text: "Choreographer Pipeline", link: "/guide/choreographer-pipeline" },
            { text: "Run Mode", link: "/guide/run-mode" },
            { text: "Shader System", link: "/guide/shader-system" },
            { text: "Persistence", link: "/guide/persistence" },
            { text: "Local Discovery", link: "/guide/local-discovery" },
          ],
        },
      ],
      "/reference/": [
        {
          text: "Reference",
          items: [
            { text: "Signal Protocol", link: "/reference/signal-protocol" },
            { text: "Scene Format", link: "/reference/scene-format" },
            { text: "Shader Annotations", link: "/reference/shader-annotations" },
            { text: "Signal Filters", link: "/reference/filter-types" },
            { text: "Keyboard Shortcuts", link: "/reference/keyboard-shortcuts" },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com/synoul415/sajou" },
    ],

    search: {
      provider: "local",
    },

    outline: {
      level: [2, 3],
    },
  },
});
