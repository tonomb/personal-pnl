import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, params, ...props }: any) => (
    <a href={params?.tagId ? `/tags/${params.tagId}` : String(to)} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tags: {
      list: {
        useQuery: vi.fn()
      }
    }
  }
}));

import { trpc } from "@/lib/trpc";
import { TagsIndexPage } from "./TagsIndexPage";

const mockListQuery = trpc.tags.list.useQuery as ReturnType<typeof vi.fn>;

const aTag = {
  id: "tag-1",
  name: "NY Trip",
  color: "#3B82F6",
  createdAt: "2026-01-15T12:00:00.000Z",
  transactionCount: 7
};

describe("TagsIndexPage", () => {
  it("shows 6 skeleton cards while loading", () => {
    mockListQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<TagsIndexPage />);
    expect(screen.getAllByTestId("tag-skeleton")).toHaveLength(6);
  });

  it("shows empty state when there are no tags", () => {
    mockListQuery.mockReturnValue({ data: [], isLoading: false });
    render(<TagsIndexPage />);
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to categorize/i })).toHaveAttribute("href", "/categorize");
  });

  it("renders a card for each tag with name and transaction count", () => {
    const tags = [
      { ...aTag, id: "tag-1", name: "NY Trip", transactionCount: 7 },
      { ...aTag, id: "tag-2", name: "Home Reno", transactionCount: 1 }
    ];
    mockListQuery.mockReturnValue({ data: tags, isLoading: false });
    render(<TagsIndexPage />);
    expect(screen.getByText("NY Trip")).toBeInTheDocument();
    expect(screen.getByText("7 transactions")).toBeInTheDocument();
    expect(screen.getByText("Home Reno")).toBeInTheDocument();
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
  });

  it("uses singular 'transaction' for count of 1", () => {
    mockListQuery.mockReturnValue({ data: [{ ...aTag, transactionCount: 1 }], isLoading: false });
    render(<TagsIndexPage />);
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    expect(screen.queryByText("1 transactions")).toBeNull();
  });

  it("each tag card links to the tag detail page", () => {
    mockListQuery.mockReturnValue({ data: [{ ...aTag, id: "abc-123" }], isLoading: false });
    render(<TagsIndexPage />);
    const link = screen.getByRole("link", { name: /ny trip/i });
    expect(link).toHaveAttribute("href", "/tags/abc-123");
  });
});
