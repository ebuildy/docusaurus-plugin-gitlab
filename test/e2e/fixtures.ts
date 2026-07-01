import { createServer, type Server } from "node:http";

/** 1x1 transparent PNG, used to exercise real asset localization in the e2e test. */
const ONE_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAA1JREFUGFdjYGBg+A8AAQQBAHAgZQsAAAAASUVORK5CYII=",
  "base64",
);

/** Minimal GitLab REST v4 stub. Returns a base URL and a stop() fn. */
export async function startGitlabStub(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "";
    const send = (body: unknown, type = "application/json") => {
      res.writeHead(200, { "content-type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };
    const sendBinary = (buf: Buffer, type: string) => {
      res.writeHead(200, { "content-type": type });
      res.end(buf);
    };

    // Project raw file path (NOT under /api/v4) used by AssetManager to resolve
    // relative README image sources, e.g. ![logo](./logo.png).
    if (url.startsWith("/group/repo/-/raw/main/logo.png")) {
      return sendBinary(ONE_PX_PNG, "image/png");
    }

    if (url.startsWith("/api/v4/projects/group%2Frepo/releases")) {
      return send([
        { name: "v1.0", tag_name: "v1.0", released_at: "2026-01-01T00:00:00Z",
          description: "First release", upcoming_release: false, assets: { links: [] } },
      ]);
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo/issues")) {
      return send([
        { iid: 1, title: "A bug", state: "opened", web_url: "https://x/1", labels: ["bug"],
          author: { name: "Ann", web_url: "https://x/ann" }, created_at: "2026-01-01T00:00:00Z" },
      ]);
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo/labels")) {
      return send([
        { name: "bug", color: "#d9534f", text_color: "#ffffff", description: "Defect", archived: false },
        { name: "feature", color: "#5cb85c", text_color: "#1a1a1a", description: "New capability", archived: false },
      ]);
    }
    if (url.startsWith("/api/v4/topics")) {
      return send([
        { name: "docs", title: "Docs", total_projects_count: 4 },
        { name: "api", title: "API", total_projects_count: 9 },
      ]);
    }
    if (url.startsWith("/api/v4/groups/my-group/labels")) {
      return send([
        { name: "epic", color: "#8e44ad", text_color: "#ffffff", description: "Cross-project", archived: false },
      ]);
    }
    if (url.startsWith("/api/v4/groups/my-group")) {
      return send({ id: 42, web_url: "https://x/groups/my-group" });
    }
    if (url.includes("/repository/files/README.md/raw")) {
      return send(
        "# Hello\n\nReadme body.\n\n## Install\n\nsetup\n\n## Usage\n\ngo\n\n![logo](./logo.png)",
        "text/plain",
      );
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo")) {
      return send({
        id: 1, path_with_namespace: "group/repo", name: "Repo", description: "Desc",
        web_url: "https://x/group/repo", star_count: 5, forks_count: 2, topics: ["docs"],
        last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null, default_branch: "main",
      });
    }
    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((r) => server.listen(0, r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
