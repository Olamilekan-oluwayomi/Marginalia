import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Citation } from "@/components/research/Citation";

/**
 * `Citation` toggles an inline source card and drives a flash highlight on a
 * margin note elsewhere in the document. Both behaviours are user-visible
 * regressions, so they are pinned here.
 */
describe("Citation", () => {
  it("shows the marker number and starts collapsed", () => {
    render(<Citation index={3} sourceName="A Study" excerpt="Findings." />);

    const button = screen.getByRole("button", { name: /Citation 3/i });
    expect(button).toHaveTextContent("3");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Findings.")).not.toBeInTheDocument();
  });

  it("expands and collapses the source card on click", async () => {
    render(<Citation index={1} sourceName="A Study" excerpt="Findings." />);

    const button = screen.getByRole("button", { name: /Citation 1/i });

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("A Study")).toBeInTheDocument();
    expect(screen.getByText("Findings.")).toBeInTheDocument();

    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Findings.")).not.toBeInTheDocument();
  });

  it("renders the source name as a safe external link when a url is given", async () => {
    render(
      <Citation
        index={1}
        sourceName="A Study"
        url="https://example.com/study"
        excerpt="Findings."
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Citation 1/i }));

    const link = screen.getByRole("link", { name: "A Study" });
    expect(link).toHaveAttribute("href", "https://example.com/study");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("flashes the referenced margin note and focuses it", async () => {
    render(
      <>
        <div id="citation-note-1" tabIndex={-1} />
        <Citation index={1} sourceName="A Study" targetId="note-1" />
      </>,
    );

    const note = document.getElementById("citation-note-1");
    expect(note).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Citation 1/i }));

    // The highlight is added immediately when the target is already in view.
    expect(note).toHaveClass("citation-flash");
    expect(note).toHaveFocus();
  });

  it("clears the highlight after the flash duration", () => {
    vi.useFakeTimers();

    try {
      render(
        <>
          <div id="citation-note-1" tabIndex={-1} />
          <Citation index={1} sourceName="A Study" targetId="note-1" />
        </>,
      );

      const note = document.getElementById("citation-note-1");
      fireEvent.click(screen.getByRole("button", { name: /Citation 1/i }));
      expect(note).toHaveClass("citation-flash");

      vi.advanceTimersByTime(1_500);
      expect(note).not.toHaveClass("citation-flash");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still expands when the citation has no margin-note target", () => {
    render(<Citation index={2} sourceName="A Study" excerpt="Findings." />);

    const button = screen.getByRole("button", { name: /Citation 2/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Findings.")).toBeInTheDocument();
  });
});
