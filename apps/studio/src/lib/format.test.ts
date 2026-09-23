import { describe, expect, it } from "vitest"
import {
  SEPARATOR,
  count,
  duration,
  factor,
  fixed,
  groupedCount,
  orNone,
  param,
  plainUsd,
  signedCount,
  joinMeta,
  minutesClock,
  percentChange,
  playTime,
  ratio,
  runRef,
  score,
  seconds,
  signed,
  tokensPair,
  usd,
} from "./format"

describe("format", () => {
  it("formats plain numbers for tables, parameters and factors", () => {
    expect(groupedCount(2100)).toBe("2 100")
    expect(signedCount(3)).toBe("+3")
    expect(signedCount(0)).toBe("0")
    expect(param(0.9)).toBe("0.9")
    expect(param(1)).toBe("1.0")
    expect(factor(1.44)).toBe("×1.4")
    expect(plainUsd(0.1672)).toBe("0.1672")
    expect(fixed(1.4, 1)).toBe("1.4")
    expect(orNone("", "none")).toBe("none")
  })

  it("joins meta parts with the separator and drops empty parts", () => {
    expect(SEPARATOR).toBe(" · ")
    expect(joinMeta(["a", "", null, "b", undefined])).toBe("a · b")
  })

  it("formats usd from a cent up with two decimals", () => {
    expect(usd(0)).toBe("$0.00")
    expect(usd(0.01)).toBe("$0.01")
    expect(usd(0.11)).toBe("$0.11")
    expect(usd(0.4187)).toBe("$0.42")
    expect(usd(1.844)).toBe("$1.84")
    expect(usd(1234.5)).toBe("$1,234.50")
  })

  it("formats usd below a cent with two significant digits", () => {
    expect(usd(0.00096)).toBe("$0.00096")
    expect(usd(0.000184)).toBe("$0.00018")
    expect(usd(0.003)).toBe("$0.003")
    expect(usd(0.0099)).toBe("$0.0099")
    expect(usd(0.0000123)).toBe("$0.000012")
  })

  it("formats seconds with fixed digits", () => {
    expect(seconds(18.42, 2)).toBe("18.42 s")
    expect(seconds(2.4)).toBe("2.4 s")
  })

  it("formats durations with one to two fraction digits", () => {
    expect(duration(0.31)).toBe("0.31 s")
    expect(duration(0.8)).toBe("0.8 s")
    expect(duration(18.42)).toBe("18.42 s")
    expect(duration(0)).toBe("0.0 s")
  })

  it("formats scores and signed deltas", () => {
    expect(score(0.8)).toBe("0.80")
    expect(score(0.844)).toBe("0.844")
    expect(signed(0.004)).toBe("+0.004")
    expect(signed(0.13)).toBe("+0.13")
    expect(signed(-0.05)).toBe("-0.05")
  })

  it("groups counts and token pairs in en-US", () => {
    expect(count(34218)).toBe("34,218")
    expect(tokensPair(2104, 684)).toBe("2,104/684")
  })

  it("formats ratios spaced and compact", () => {
    expect(ratio({ passed: 44, total: 48 })).toBe("44 / 48")
    expect(ratio({ passed: 12, total: 12 }, false)).toBe("12/12")
  })

  it("formats the rounded percent change magnitude", () => {
    expect(percentChange(0.4187, 0.3102)).toBe("35 %")
    expect(percentChange(0.27, 0.3)).toBe("10 %")
  })

  it("references a run by the last six hex of its uuid", () => {
    expect(runRef("01a0b104-4658-70aa-b49b-7c2586b56d92")).toBe("#b56d92")
    expect(runRef("01a0b10f-c0bb-71b5-ab91-723388054f73")).toBe("#054f73")
  })

  it("formats minute clocks with zero padded minutes", () => {
    expect(minutesClock(192)).toBe("3 h 12 m")
    expect(minutesClock(65)).toBe("1 h 05 m")
  })

  it("formats play time as m:ss", () => {
    expect(playTime(4)).toBe("0:04")
    expect(playTime(72.6)).toBe("1:12")
  })
})
