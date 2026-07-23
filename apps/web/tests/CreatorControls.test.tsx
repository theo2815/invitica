import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CalendarPicker } from "../src/components/forms/CalendarPicker";
import { Select } from "../src/components/forms/Select";

afterEach(cleanup);

describe("creator form controls", () => {
  it("supports arrow-key selection and exposes the selected form value", () => {
    const onChange = vi.fn();
    function SelectHarness() {
      const [value, setValue] = useState("all");
      return (
        <Select
          id="occasion"
          label="Occasion"
          name="occasion"
          onChange={(nextValue) => {
            setValue(nextValue);
            onChange(nextValue);
          }}
          options={[
            { label: "All occasions", value: "all" },
            { label: "Wedding", value: "wedding" },
            { label: "Debut", value: "debut" },
          ]}
          value={value}
        />
      );
    }
    const { container } = render(<SelectHarness />);

    const trigger = screen.getByRole("combobox", { name: /Occasion/ });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("wedding");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector<HTMLInputElement>('input[name="occasion"]')?.value).toBe(
      "wedding",
    );
  });

  it("opens the calendar, chooses a date, and restores focus after Escape", () => {
    const onChange = vi.fn();
    render(
      <CalendarPicker
        displayFormat="long"
        id="display-date"
        label="Display date"
        onChange={onChange}
        value="2027-01-17"
      />,
    );

    expect(screen.getByLabelText("Display date")).toHaveProperty("value", "January 17, 2027");
    const trigger = screen.getByRole("button", { name: "Open Display date calendar" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "January 2027" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /January 24, 2027/ }));
    expect(onChange).toHaveBeenCalledWith("2027-01-24");

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps manual entry available and rejects impossible dates", () => {
    const onChange = vi.fn();
    render(<CalendarPicker id="rsvp-date" label="RSVP deadline" onChange={onChange} value="" />);

    const input = screen.getByLabelText("RSVP deadline");
    fireEvent.change(input, { target: { value: "2027-02-30" } });
    expect(screen.getByRole("alert").textContent).toContain("YYYY-MM-DD");
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "2027-02-28" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onChange).toHaveBeenCalledWith("2027-02-28");
  });
});
