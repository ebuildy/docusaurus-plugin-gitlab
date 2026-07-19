import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabUsers } from "./GitlabUsers";

const users = [
  {
    id: 101, username: "jdoe", name: "Jane Doe", webUrl: "https://x/jdoe", avatarUrl: null, role: "owner",
    jobTitle: null, organization: null, location: null, bio: null, followers: null, following: null, createdAt: null,
  },
  {
    id: 102, username: "bob", name: "Bob Martin", webUrl: "https://x/bob", avatarUrl: null, role: "developer",
    jobTitle: "Dev", organization: "ACME", location: null, bio: null, followers: 2, following: 3, createdAt: null,
  },
];

describe("GitlabUsers", () => {
  it("renders one card per member with a role badge by default", () => {
    render(<GitlabUsers data={users as any} />);
    expect(screen.getByRole("link", { name: "@jdoe" })).toHaveAttribute("href", "https://x/jdoe");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Bob Martin")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("developer")).toBeInTheDocument();
    // default list card is identity + role only
    expect(screen.queryByText(/Dev · ACME/)).not.toBeInTheDocument();
  });

  it("adds profile sections to every card via show", () => {
    render(<GitlabUsers data={users as any} show="role,org,counts" />);
    expect(screen.getByText(/Dev · ACME/)).toBeInTheDocument();
    expect(screen.getByText(/2 followers · 3 following/)).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
  });

  it("uses a responsive auto-fill grid with a 260px default min width", () => {
    const { container } = render(<GitlabUsers data={users as any} />);
    expect(container.querySelector(".gitlab-user-cards")).toHaveStyle({
      gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    });
  });

  it("lets cardColumns and gap tune the grid (ComponentLayout)", () => {
    const { container } = render(<GitlabUsers data={users as any} cardColumns={3} gap="1.5rem" />);
    expect(container.querySelector(".gitlab-user-cards")).toHaveStyle({
      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
      gap: "1.5rem",
    });
  });

  it("renders an empty grid for an empty member list", () => {
    const { container } = render(<GitlabUsers data={[] as any} />);
    expect(container.querySelector(".gitlab-user-cards")).toBeEmptyDOMElement();
  });

  it("renders the Fallback on error", () => {
    render(<GitlabUsers error={{ message: "boom", project: "my-group" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
