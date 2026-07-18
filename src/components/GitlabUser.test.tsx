import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabUser } from "./GitlabUser";

const user = {
  id: 101,
  username: "jdoe",
  name: "Jane Doe",
  webUrl: "https://x/jdoe",
  avatarUrl: "/gitlab-assets/jdoe.png",
  jobTitle: "Senior Developer",
  organization: "ACME",
  location: "Paris",
  bio: "Docs enthusiast",
  followers: 12,
  following: 34,
  createdAt: "2020-01-15T00:00:00Z",
};

describe("GitlabUser", () => {
  it("renders identity and the default profile sections", () => {
    const { container } = render(<GitlabUser data={user as any} />);
    expect(screen.getByRole("img", { name: "Jane Doe" })).toHaveAttribute("src", "/gitlab-assets/jdoe.png");
    expect(screen.getByRole("link", { name: "@jdoe" })).toHaveAttribute("href", "https://x/jdoe");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText(/Senior Developer · ACME/)).toBeInTheDocument();
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
    expect(screen.getByText(/Docs enthusiast/)).toBeInTheDocument();
    expect(screen.getByText(/12 followers · 34 following/)).toBeInTheDocument();
    expect(screen.getByText(/Member since /)).toBeInTheDocument();
    // profile sections live in a right-hand info block
    expect(container.querySelector(".gitlab-user-info")).toBeInTheDocument();
  });

  it("prefixes every info line with a decorative emoji", () => {
    render(<GitlabUser data={user as any} />);
    for (const emoji of ["💼", "📍", "📝", "👥", "📅"]) {
      const marker = screen.getByText(emoji);
      expect(marker).toHaveClass("gitlab-user-emoji");
      expect(marker).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("show narrows the sections", () => {
    render(<GitlabUser data={user as any} show="bio" />);
    expect(screen.getByText(/Docs enthusiast/)).toBeInTheDocument();
    expect(screen.queryByText(/Paris/)).not.toBeInTheDocument();
    expect(screen.queryByText(/followers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Member since/)).not.toBeInTheDocument();
  });

  it("skips sections whose profile field is empty and the avatar when null", () => {
    render(<GitlabUser data={{ ...user, avatarUrl: null, bio: null, followers: null, following: null } as any} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText(/Docs enthusiast/)).not.toBeInTheDocument();
    expect(screen.queryByText(/followers/)).not.toBeInTheDocument();
    expect(screen.getByText(/Paris/)).toBeInTheDocument();
  });

  it("renders partial follower counts when only one side is known", () => {
    render(<GitlabUser data={{ ...user, following: null } as any} show="counts" />);
    expect(screen.getByText(/12 followers/)).toBeInTheDocument();
  });

  it("renders nothing without data", () => {
    const { container } = render(<GitlabUser />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the Fallback on error", () => {
    render(<GitlabUser error={{ message: 'user "nope" not found', project: "nope" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("not found");
  });
});
