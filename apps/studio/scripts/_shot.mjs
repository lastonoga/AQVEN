import { readFile } from "node:fs/promises"
import { chromium } from "playwright-core"
const record = JSON.parse(await readFile(process.argv[2], "utf8"))
const browser = await chromium.launch({ channel: "chrome" })
const page = await browser.newPage({ viewport: { width: 1500, height: 300 } })
await page.goto(`${record.url}/?access_token=${record.token}`, { waitUntil: "networkidle" })
await page.waitForTimeout(2500)
await page.screenshot({ path: process.argv[3], clip: { x: 0, y: 0, width: 1500, height: 120 } })
console.log("served by", record.url)
await browser.close()
