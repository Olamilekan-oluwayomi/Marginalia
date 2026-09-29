import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextInput } from "@/components/ui/TextInput";

describe("TextInput", () => {
  it("renders the input with the shared form treatment", () => {
    render(<TextInput id="email" type="email" defaultValue="a@b.co" />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveClass("w-full", "rounded-md", "focus:border-pine");
  });

  it("is not marked invalid and describes nothing when there is no error", () => {
    render(<TextInput id="email" type="email" />);

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks the input invalid and points aria-describedby at the message", () => {
    render(
      <>
        <label htmlFor="email">Email</label>
        <TextInput
          id="email"
          type="email"
          error="Enter a valid email address."
        />
      </>,
    );

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const message = screen.getByText("Enter a valid email address.");
    expect(message).toHaveAttribute("id", "email-error");
    // The wiring is the point of the primitive: the described element must be
    // the message that is actually on screen.
    expect(input).toHaveAttribute("aria-describedby", "email-error");
  });

  it("applies the error border only while the error is present", () => {
    const { rerender } = render(
      <TextInput id="email" type="email" error="Required." />,
    );
    expect(screen.getByRole("textbox")).toHaveClass("border-error");

    rerender(<TextInput id="email" type="email" />);
    expect(screen.getByRole("textbox")).toHaveClass("border-rule");
  });

  it("forwards readOnly and keeps it disabled from editing", async () => {
    const onChange = vi.fn();
    render(
      <TextInput
        id="email"
        type="email"
        readOnly
        onChange={onChange}
        defaultValue="fixed@example.com"
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveClass("opacity-70", "cursor-default");

    await userEvent.type(input, "nope");
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("fixed@example.com");
  });

  it("forwards native input props such as name, required, and maxLength", () => {
    render(
      <TextInput
        id="title"
        name="title"
        type="text"
        required
        maxLength={200}
      />,
    );

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("name", "title");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("maxLength", "200");
  });
});
