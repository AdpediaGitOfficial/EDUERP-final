import { describe, expect, it } from "vitest";
import { gradeRank, isPromotion, isSameGrade } from "../src/common/grades";

describe("grade ranking + movement rules", () => {
  it("ranks grades in order (pre-primary < 1 < … < 12)", () => {
    expect(gradeRank("Nursery")).toBeLessThan(gradeRank("KG")!);
    expect(gradeRank("KG")).toBeLessThan(gradeRank("Grade 1")!);
    expect(gradeRank("Grade 1")).toBe(1);
    expect(gradeRank("Grade 9")).toBeLessThan(gradeRank("Grade 10")!);
    expect(gradeRank("Grade 10")).toBe(10);
    expect(gradeRank("Grade 12")).toBe(12);
    // section/stream in the name doesn't change the grade
    expect(gradeRank("Grade 10")).toBe(gradeRank("Grade 10"));
  });

  it("returns null for unknown grades", () => {
    expect(gradeRank("Robotics Club")).toBeNull();
    expect(gradeRank("")).toBeNull();
    expect(gradeRank(null)).toBeNull();
  });

  it("promotion = strictly higher grade only", () => {
    expect(isPromotion("Grade 1", "Grade 2")).toBe(true);
    expect(isPromotion("Grade 9", "Grade 10")).toBe(true);
    expect(isPromotion("KG", "Grade 1")).toBe(true);
    // same grade
    expect(isPromotion("Grade 10", "Grade 10")).toBe(false);
    // lower grade
    expect(isPromotion("Grade 10", "Grade 1")).toBe(false);
    expect(isPromotion("Grade 5", "Grade 3")).toBe(false);
    // unknown → cannot validate → not a promotion
    expect(isPromotion("Grade 10", "Robotics")).toBe(false);
    expect(isPromotion(null, "Grade 2")).toBe(false);
  });

  it("transfer = same grade only", () => {
    expect(isSameGrade("Grade 10", "Grade 10")).toBe(true); // section/stream change
    expect(isSameGrade("Grade 8", "Grade 8")).toBe(true);
    expect(isSameGrade("Grade 8", "Grade 9")).toBe(false);
    expect(isSameGrade("Grade 10", "Grade 7")).toBe(false);
    expect(isSameGrade("Grade 5", "Grade 3")).toBe(false);
  });
});
