const argv = require("yargs/yargs")(process.argv.slice(2)).option("input", { alias: "i", description: "入力ファイル(csv)", demandOption: true }).option("config", { alias: "c", description: "定義ファイル(json)", default: "./config.json" }).help().argv;

import fs from "fs";
import path from "path";
import puppeteer, { devices } from "puppeteer";

import { parse } from "csv-parse/sync";

import { exit } from "process";
import sleep from "./lib/sleep";

const Mustache = require("mustache");

type DeviceConfigType = {
  width?: number;
  height?: number;
  emulate?: string;
  name: string;
  quality: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
  fullPage?: boolean;
};
type ConfigType = {
  outputDir: string;
  devices: { [key: string]: DeviceConfigType };
};
type CsvLine = {
  key: string;
  url: string;
  wait_ms_after_loaded?: string;
};
const config: ConfigType = JSON.parse(fs.readFileSync(argv.config, "utf8")) as ConfigType;
const input = fs.readFileSync(argv.input);
const wannaCapture = parse(input, { columns: true, skip_empty_lines: true }) as CsvLine[];

wannaCapture.length === 0 && exit();

(async () => {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: null });
  try {
    const page = await browser.newPage();

    let url: string | undefined;
    for (const cap of wannaCapture) {
      for (const device of Object.keys(config.devices)) {
        const setting = config.devices[device];

        let deviceSetting: puppeteer.Device;
        if (setting.emulate) {
          if (!puppeteer.devices[setting.emulate]) {
            throw new Error(`emulate "${setting.emulate}" is not found.`);
          }
          deviceSetting = puppeteer.devices[setting.emulate];
          await page.emulate(deviceSetting);
        } else {
          if (setting.width && setting.height) {
            deviceSetting = {
              name: device,
              userAgent: device,
              viewport: {
                width: setting.width,
                height: setting.height,
                deviceScaleFactor: setting.deviceScaleFactor || 1,
                isMobile: setting.isMobile || false,
                hasTouch: setting.hasTouch || false,
                isLandscape: false,
              },
            };
            await page.setViewport(deviceSetting.viewport);
          } else {
            throw new Error(`device ${device} does not have width nor height.`);
          }
        }

        await page.goto(cap.url, { waitUntil: ["load", "networkidle2"] });

        if (setting.fullPage) {
          const height = await page.evaluate(() => document.body.clientHeight);
          deviceSetting.viewport.height = height;
          await page.setViewport(deviceSetting.viewport);
        }
        await page.evaluate(() => window.scrollTo(0, 0));

        if (cap.wait_ms_after_loaded) {
          await sleep(Number(cap.wait_ms_after_loaded));
        }

        const file = `${config.outputDir}/${Mustache.render(setting.name as string, { key: cap.key })}`;
        fs.mkdirSync(path.dirname(file), { recursive: true });

        await page.screenshot({ path: file, quality: setting.quality || 80 });
        url = cap.url;
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    await browser.close();
  }
})()
  .then(() => console.log("done"))
  .catch((e) => console.error(e));
